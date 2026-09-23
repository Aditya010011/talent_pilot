"""Map ai-resume-parser + hiring-agent output to Inluwa candidate JSON."""

from __future__ import annotations

from typing import Any

from evaluator import compute_overall_score
from jd_scoring import compute_jd_weighted_score
from models import EvaluationData


def _months_to_work_experience(months: int | None) -> str | None:
    if months is None:
        return None
    if months < 12:
        return "Less than one year"
    if months < 36:
        return "1 - 3 years"
    if months < 60:
        return "3 - 5 years"
    if months < 120:
        return "5 - 10 years"
    return "More than 10 years"


def _map_education_level(degrees: list[dict[str, Any]]) -> str | None:
    if not degrees:
        return None
    text = " ".join(
        f"{d.get('degree', '')} {d.get('field_of_study', '')}".lower()
        for d in degrees
    )
    if any(k in text for k in ("phd", "doctor", "doctorate")):
        return "PhD"
    if any(k in text for k in ("master", "msc", "m.s", "mba", "m.b.a")):
        return "Master" if "mba" not in text else "MBA"
    if any(k in text for k in ("bachelor", "b.s", "bsc", "ba ", "undergraduate")):
        return "Bachelor"
    if any(k in text for k in ("associate", "diploma", "college")):
        return "College"
    return "Other"


def _verdict_from_score(score_100: int) -> str:
    if score_100 >= 70:
        return "High potential"
    if score_100 >= 40:
        return "To consider"
    return "Move aside"


def _summary_fragment(text: str) -> str:
    """Strip trailing punctuation so we don't get '..' when joining sentences."""
    return text.strip().rstrip(".,;:!?")


def _join_summary_parts(items: list[str], limit: int) -> str:
    parts = [_summary_fragment(s) for s in items[:limit] if s and s.strip()]
    return "; ".join(parts)


def _criterion_name(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("name") or item.get("label") or "").strip()
    return str(item or "").strip()


def _criterion_description(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("description") or "").strip()
    return ""


def _build_description_lookup(criteria: list | None) -> dict[str, str]:
    lookup: dict[str, str] = {}
    if not criteria:
        return lookup
    for item in criteria:
        name = _criterion_name(item)
        if not name:
            continue
        desc = _criterion_description(item)
        if desc:
            lookup[name.lower()] = desc
    return lookup


def _score_factor_label(name: str) -> str:
    """Preserve short multi-word labels; title-case underscore keys only."""
    raw = (name or "").strip()
    if not raw:
        return "Criterion"
    if " " in raw:
        return raw
    return raw.replace("_", " ").title()


def _names_match(a: str, b: str) -> bool:
    na = (a or "").strip().lower()
    nb = (b or "").strip().lower()
    if not na or not nb:
        return False
    return na == nb or na in nb or nb in na


def _ensure_all_jd_rows(
    matching_matrix: list[dict[str, Any]],
    cv_jd_alignment_criteria: list | None,
    jd_desc: dict[str, str],
) -> list[dict[str, Any]]:
    """Pad matching matrix so every configured JD criterion appears (missing → No / 0)."""
    if not cv_jd_alignment_criteria:
        return matching_matrix

    result: list[dict[str, Any]] = []
    used: set[int] = set()

    for item in cv_jd_alignment_criteria:
        name = _criterion_name(item)
        if not name:
            continue
        desc = _criterion_description(item) or jd_desc.get(name.lower()) or ""
        hit_idx = next(
            (
                i
                for i, row in enumerate(matching_matrix)
                if i not in used
                and (
                    _names_match(str(row.get("label") or ""), name)
                    or _names_match(str(row.get("requirement") or ""), name)
                )
            ),
            None,
        )
        if hit_idx is not None:
            used.add(hit_idx)
            row = dict(matching_matrix[hit_idx])
            row["label"] = name
            if desc and not row.get("description"):
                row["description"] = desc
            result.append(row)
        else:
            result.append(
                {
                    "label": name,
                    "requirement": desc or name,
                    "evidence": "No evidence found in CV analysis.",
                    "coverage": "No",
                    "description": desc,
                }
            )
    return result


def _ensure_all_assessment_rows(
    score_breakdown: list[dict[str, Any]],
    cv_assessment_criteria: list | None,
    rubric_desc: dict[str, str],
) -> list[dict[str, Any]]:
    """Ensure every configured assessment criterion appears in scoreBreakdown (missing → 0)."""
    if not cv_assessment_criteria:
        return score_breakdown

    # Keep meta rows (weights / bonus / deductions) at the front; pad criterion rows after.
    meta_rows: list[dict[str, Any]] = []
    scored_rows: list[dict[str, Any]] = []
    for row in score_breakdown:
        label = str(row.get("factor") or "").lower()
        if "weight)" in label or "deduction" in label or "bonus" in label:
            meta_rows.append(row)
        else:
            scored_rows.append(row)

    result = list(meta_rows)
    used: set[int] = set()
    for item in cv_assessment_criteria:
        name = _criterion_name(item)
        if not name:
            continue
        desc = _criterion_description(item) or rubric_desc.get(name.lower()) or ""
        hit_idx = next(
            (
                i
                for i, row in enumerate(scored_rows)
                if i not in used and _names_match(str(row.get("factor") or ""), name)
            ),
            None,
        )
        if hit_idx is not None:
            used.add(hit_idx)
            row = dict(scored_rows[hit_idx])
            row["factor"] = name
            if desc and not row.get("description"):
                row["description"] = desc
            result.append(row)
        else:
            result.append(
                {
                    "factor": name,
                    "points": 0,
                    "reason": "No evidence found in CV analysis.",
                    "description": desc,
                }
            )
    return result


def build_candidate_response(
    parsed: dict[str, Any],
    evaluation: EvaluationData,
    *,
    parsing_time_seconds: float | None = None,
    job_description: str | None = None,
    cv_assessment_criteria: list | None = None,
    cv_jd_alignment_criteria: list | None = None,
) -> dict[str, Any]:
    contact = parsed.get("contact_info") or {}
    education_list = parsed.get("education") or []
    months = parsed.get("total_experience_months")

    rubric_desc = _build_description_lookup(cv_assessment_criteria)
    jd_desc = _build_description_lookup(cv_jd_alignment_criteria)

    raw_total = compute_overall_score(evaluation)
    overall_score, jd_breakdown, ordered_jd_rows = compute_jd_weighted_score(
        evaluation,
        job_description=job_description,
        candidate_months=months,
        hiring_agent_score=raw_total,
    )

    score_breakdown: list[dict[str, Any]] = list(jd_breakdown)
    for name, cat in evaluation.scores.items():
        label = _score_factor_label(name)
        score_breakdown.append(
            {
                "factor": label,
                "points": int(min(cat.score, cat.max)),
                "reason": cat.evidence,
                "description": rubric_desc.get(label.lower())
                or rubric_desc.get(name.lower())
                or "",
            }
        )
    if evaluation.bonus_points.total > 0:
        score_breakdown.append(
            {
                "factor": "Bonus points",
                "points": int(evaluation.bonus_points.total),
                "reason": evaluation.bonus_points.breakdown,
            }
        )
    if evaluation.deductions.total > 0:
        score_breakdown.append(
            {
                "factor": "Deductions",
                "points": -int(evaluation.deductions.total),
                "reason": evaluation.deductions.reasons,
            }
        )

    matching_matrix = []
    rows_for_matrix = ordered_jd_rows if ordered_jd_rows else (evaluation.jd_matching or [])
    for row in rows_for_matrix:
        label = getattr(row, "label", "Requirement")
        matching_matrix.append(
            {
                "label": label,
                "requirement": row.requirement,
                "evidence": row.evidence,
                "coverage": row.coverage,
                "description": jd_desc.get(str(label).lower()) or row.requirement or "",
            }
        )

    # Always emit every configured JD criterion (LLM sometimes omits unmatched rows).
    matching_matrix = _ensure_all_jd_rows(matching_matrix, cv_jd_alignment_criteria, jd_desc)

    # Always emit every configured assessment criterion (missing → 0 points).
    score_breakdown = _ensure_all_assessment_rows(
        score_breakdown, cv_assessment_criteria, rubric_desc
    )

    latest_edu = education_list[0] if education_list else {}
    strengths = _join_summary_parts(evaluation.key_strengths, 3)
    improvements = _join_summary_parts(evaluation.areas_for_improvement, 2)

    display_months = (
        evaluation.domain_experience.relevant_experience_months
        if evaluation.domain_experience and evaluation.domain_experience.relevant_experience_months is not None
        else months
    )

    candidate = {
        "name": contact.get("full_name") or "Unknown",
        "email": contact.get("email"),
        "phone": contact.get("phone"),
        "gender": None,
        "birthday": None,
        "education": _map_education_level(education_list),
        "school": latest_edu.get("institution"),
        "major": latest_edu.get("field_of_study") or latest_edu.get("degree"),
        "graduationYear": latest_edu.get("graduation_year"),
        "workExperience": _months_to_work_experience(display_months),
        "notes": parsed.get("professional_summary")
        or (evaluation.key_strengths[0] if evaluation.key_strengths else None),
        "cvAnalysis": {
            "trustScore": 85 if parsing_time_seconds else 80,
            "trustReasoning": "Based on resume content matched to the role requirements.",
            "overallScore": overall_score,
            "overallSummary": (
                f"Overall fit {overall_score}/100. "
                f"Strengths: {strengths}. Gaps: {improvements}."
                if strengths or improvements
                else f"Overall fit {overall_score}/100."
            ),
            "estimatedSeniority": parsed.get("seniority_level") or "Unknown",
            "verdict": _verdict_from_score(overall_score),
            "matchingMatrix": matching_matrix,
            "areasToValidate": evaluation.areas_for_improvement[:3],
            "scoreBreakdown": score_breakdown,
            "domainExperience": evaluation.domain_experience.model_dump() if evaluation.domain_experience else None,
            "hiringAgentEvaluation": {
                "rawScore": raw_total,
                "maxScore": 120,
                "scores": {k: v.model_dump() for k, v in evaluation.scores.items()},
                "bonus_points": evaluation.bonus_points.model_dump(),
                "deductions": evaluation.deductions.model_dump(),
                "key_strengths": evaluation.key_strengths,
                "areas_for_improvement": evaluation.areas_for_improvement,
            },
        },
    }
    return candidate
