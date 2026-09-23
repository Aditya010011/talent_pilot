"""Convert ai-resume-parser output to text for hiring-agent evaluation."""

from __future__ import annotations

from typing import Any


def _safe(value: Any, fallback: str = "Not provided") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def parsed_resume_to_text(parsed: dict[str, Any]) -> str:
    """Build markdown-like resume text from ResumeParserPro model_dump()."""
    parts: list[str] = []

    contact = parsed.get("contact_info") or {}
    parts.append("=== BASIC INFORMATION ===")
    parts.append(f"Name: {_safe(contact.get('full_name'))}")
    parts.append(f"Email: {_safe(contact.get('email'))}")
    parts.append(f"Phone: {_safe(contact.get('phone'))}")
    parts.append(f"Location: {_safe(contact.get('location'))}")
    if contact.get("linkedin"):
        parts.append(f"LinkedIn: {contact['linkedin']}")
    if contact.get("github"):
        parts.append(f"GitHub: {contact['github']}")

    summary = parsed.get("professional_summary")
    if summary:
        parts.append(f"Summary: {summary}")

    if parsed.get("total_experience_months") is not None:
        parts.append(f"Total Experience: {parsed['total_experience_months']} months")
    if parsed.get("industry"):
        parts.append(f"Industry: {parsed['industry']}")
    if parsed.get("seniority_level"):
        parts.append(f"Seniority: {parsed['seniority_level']}")

    work = parsed.get("work_experience") or []
    if work:
        parts.append("\n=== WORK EXPERIENCE ===")
        for i, item in enumerate(work, 1):
            parts.append(f"{i}. {_safe(item.get('job_title'))} at {_safe(item.get('company'))}")
            parts.append(
                f"   Period: {_safe(item.get('start_date'))} - {_safe(item.get('end_date'), 'Present')}"
            )
            if item.get("duration_months") is not None:
                parts.append(f"   Duration: {item['duration_months']} months")
            if item.get("description"):
                parts.append(f"   Description: {item['description']}")
            for achievement in item.get("achievements") or []:
                parts.append(f"   • {achievement}")

    education = parsed.get("education") or []
    if education:
        parts.append("\n=== EDUCATION ===")
        for i, item in enumerate(education, 1):
            parts.append(
                f"{i}. {_safe(item.get('degree'))} — {_safe(item.get('institution'))}"
            )
            if item.get("field_of_study"):
                parts.append(f"   Field: {item['field_of_study']}")
            if item.get("graduation_year"):
                parts.append(f"   Graduation: {item['graduation_year']}")

    skills = parsed.get("skills") or []
    if skills:
        parts.append("\n=== SKILLS ===")
        for group in skills:
            category = group.get("category") or "Skills"
            skill_list = group.get("skills") or []
            if skill_list:
                parts.append(f"• {category}: {', '.join(skill_list)}")

    projects = parsed.get("projects") or []
    if projects:
        parts.append("\n=== PROJECTS ===")
        for i, item in enumerate(projects, 1):
            parts.append(f"{i}. {_safe(item.get('name'))}")
            if item.get("description"):
                parts.append(f"   Description: {item['description']}")
            if item.get("technologies"):
                parts.append(f"   Technologies: {', '.join(item['technologies'])}")
            if item.get("url"):
                parts.append(f"   URL: {item['url']}")

    certs = parsed.get("certifications") or []
    if certs:
        parts.append("\n=== CERTIFICATIONS ===")
        for cert in certs:
            parts.append(f"• {_safe(cert.get('name'))} ({_safe(cert.get('issuer'))})")

    return "\n".join(parts)
