"""JD-weighted scoring: experience first when mentioned in the job description."""

from __future__ import annotations

import re
from typing import Any

from models import EvaluationData, JdMatchRow

# Boss rule: when JD mentions experience, it dominates the overall score.
EXPERIENCE_WEIGHT = 0.55
OTHER_JD_WEIGHT = 0.30
TECHNICAL_RUBRIC_WEIGHT = 0.15

# When JD has no experience requirement, split between JD criteria and rubric.
JD_ONLY_WEIGHT = 0.60
RUBRIC_ONLY_WEIGHT = 0.40

EXPERIENCE_KEYWORDS = re.compile(
    r"\b(experience|years?\s+of|yrs?\.?|tenure|seniority|minimum\s+\d|"
    r"\d+\s*\+\s*years?|\d+\s*-\s*\d+\s*years?)\b",
    re.I,
)

EXPERIENCE_REQ_PATTERNS = [
    re.compile(r"(\d+)\s*\+\s*years?", re.I),
    re.compile(r"(\d+)\s*-\s*(\d+)\s*years?", re.I),
    re.compile(r"minimum\s+(?:of\s+)?(\d+)\s*years?", re.I),
    re.compile(r"at\s+least\s+(\d+)\s*years?", re.I),
    re.compile(r"(\d+)\s*years?\s+(?:of\s+)?(?:relevant\s+)?experience", re.I),
    re.compile(r"(\d+)\s*years?\s+experience", re.I),
]


def jd_mentions_experience(job_description: str | None) -> bool:
    if not job_description:
        return False
    return bool(EXPERIENCE_KEYWORDS.search(job_description))


def parse_required_years(job_description: str) -> float | None:
    """Extract minimum years of experience from JD text."""
    for pattern in EXPERIENCE_REQ_PATTERNS:
        match = pattern.search(job_description)
        if not match:
            continue
        groups = match.groups()
        if len(groups) == 2 and groups[1]:
            # Range like "3-5 years" — use lower bound as minimum
            return float(groups[0])
        return float(groups[0])
    return None


def is_experience_requirement(row: JdMatchRow) -> bool:
    if getattr(row, "label", None) == "Experience Fit":
        return True
    text = row.requirement.lower()
    return any(
        k in text
        for k in (
            "experience",
            "years",
            "yrs",
            "tenure",
            "senior",
            "minimum",
            "year of",
        )
    )


def coverage_to_points(coverage: str) -> int:
    c = coverage.strip().lower()
    if c == "yes":
        return 100
    if c == "partial":
        return 55
    return 0


def experience_fit_from_months(
    candidate_months: int | None,
    required_years: float | None,
    *,
    jd_row: JdMatchRow | None = None,
    total_candidate_months: int | None = None,
    target_domain: str | None = None,
) -> tuple[int, str]:
    """Return 0-100 experience fit and human-readable reason.

    If required_years is present, score relative to it.
    Otherwise score purely on candidate's raw tenure.
    """
    if candidate_months is None and required_years is not None:
        return 0, "No relevant experience found, but JD requires experience."
    if candidate_months is None:
        return 50, "Experience requirement or candidate tenure could not be fully verified."

    req_months = (required_years or 0) * 12
    relevant_months = candidate_months if candidate_months is not None else 0
    relevant_years = relevant_months / 12
    total_years = (total_candidate_months / 12) if total_candidate_months else relevant_years

    domain_label = target_domain or "relevant domain"

    # Build a rich, human-readable context string
    if total_candidate_months is not None and total_candidate_months != relevant_months:
        context = (
            f"Candidate has {total_years:.1f} years of total experience, "
            f"but only {relevant_years:.1f} years of relevant {domain_label} experience"
        )
    else:
        context = f"Candidate has {relevant_years:.1f} years of {domain_label} experience"

    if required_years is not None:
        req_label = f"{required_years:g}+ years of {domain_label} experience"
        if relevant_months >= req_months:
            pts = 100
            desc = f"{context}. JD requires {req_label} — MEETS requirement."
        elif relevant_months >= req_months * 0.85:
            pts = 75
            desc = f"{context}. JD requires {req_label} — close to requirement."
        elif relevant_months >= req_months * 0.5:
            pts = 45
            desc = f"{context}. JD requires {req_label} — below requirement."
        else:
            pts = 15
            desc = f"{context}. JD requires {req_label} — significantly below requirement."
    else:
        pts = 100 if relevant_months >= 36 else 55 if relevant_months >= 12 else 15
        desc = f"{context}."

    # Append the LLM's own evidence for additional detail (but skip if it just repeats our text)
    if jd_row and jd_row.evidence and jd_row.evidence.strip():
        llm_evidence = jd_row.evidence.strip()
        desc = f"{desc} Additional detail: {llm_evidence}"

    return pts, desc


def _avg_jd_points(rows: list[JdMatchRow]) -> int:
    pts = [coverage_to_points(r.coverage) for r in rows]
    return int(sum(pts) / len(pts)) if pts else 100


def compute_jd_weighted_score(
    evaluation: EvaluationData,
    *,
    job_description: str | None,
    candidate_months: int | None,
    hiring_agent_score: float,
) -> tuple[int, list[dict[str, Any]], list[JdMatchRow]]:
    """
    Compute overall 0-100 score with experience as top priority when JD mentions it.
    Returns (score, score_breakdown additions, reordered jd_matching rows).
    """
    # Override candidate_months with LLM target-domain-specific calculations if available
    if evaluation.domain_experience and evaluation.domain_experience.relevant_experience_months is not None:
        candidate_months = evaluation.domain_experience.relevant_experience_months

    rubric_normalized = min(100, max(0, round((hiring_agent_score / 120) * 100)))
    jd_rows = list(evaluation.jd_matching or [])
    required_years = parse_required_years(job_description) if job_description else None
    has_exp_in_jd = jd_mentions_experience(job_description)

    exp_rows = [r for r in jd_rows if is_experience_requirement(r)]
    other_rows = [r for r in jd_rows if not is_experience_requirement(r)]

    breakdown: list[dict[str, Any]] = []

    if has_exp_in_jd:
        # Use relevant experience months; also track total and domain info for rich display
        total_candidate_months_raw = None
        target_domain_name = None
        if evaluation.domain_experience:
            dom = evaluation.domain_experience
            total_candidate_months_raw = (
                (dom.relevant_experience_months or 0)
                + (dom.irrelevant_experience_months or 0)
            )
            target_domain_name = dom.target_role_domain or None

        exp_row = exp_rows[0] if exp_rows else None
        exp_pts, exp_reason = experience_fit_from_months(
            candidate_months,
            required_years,
            jd_row=exp_row,
            total_candidate_months=total_candidate_months_raw,
            target_domain=target_domain_name,
        )

        if exp_row is None:
            jd_req_years = required_years if required_years else 0
            cov = "Yes" if exp_pts >= 85 else "Partial" if exp_pts >= 45 else "No"
            exp_row = JdMatchRow(
                label="Experience Fit",
                requirement=f"Experience fit against {jd_req_years}+ years target",
                evidence=f"Candidate has {candidate_months // 12} years total experience.",
                coverage=cov
            )
        else:
            coverage = "Yes" if exp_pts >= 85 else "Partial" if exp_pts >= 45 else "No"
            exp_row.coverage = coverage
            exp_row.evidence = exp_reason

        ordered_rows = [exp_row] + other_rows

        other_pts = _avg_jd_points(other_rows) if other_rows else 100
        
        # Grading based purely on JD criteria
        if other_rows:
            overall = round(
                exp_pts * 0.55
                + other_pts * 0.45
            )
            breakdown.append(
                {
                    "factor": "JD experience match (55% weight)",
                    "points": exp_pts,
                    "reason": exp_reason,
                }
            )
            breakdown.append(
                {
                    "factor": "Other JD requirements (45% weight)",
                    "points": other_pts,
                    "reason": f"Avg fit across {len(other_rows)} JD criteria (skills, responsibilities, etc.).",
                }
            )
        else:
            overall = exp_pts
            breakdown.append(
                {
                    "factor": "JD experience match (100% weight)",
                    "points": exp_pts,
                    "reason": exp_reason,
                }
            )

        return min(100, max(0, overall)), breakdown, ordered_rows

    # No experience emphasis in JD but other JD criteria exist
    if jd_rows:
        jd_pts = _avg_jd_points(jd_rows)
        overall = jd_pts
        breakdown.append(
            {
                "factor": "JD requirements (100% weight)",
                "points": jd_pts,
                "reason": f"Avg fit across {len(jd_rows)} job requirements.",
            }
        )
        return min(100, max(0, overall)), breakdown, jd_rows

    # Fallback to general rubric if there are absolutely no JD requirements or description
    breakdown.append(
        {
            "factor": "Technical profile (100% weight)",
            "points": rubric_normalized,
            "reason": f"hiring-agent rubric score {hiring_agent_score}/120.",
        }
    )
    return rubric_normalized, breakdown, jd_rows

