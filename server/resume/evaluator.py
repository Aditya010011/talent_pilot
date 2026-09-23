"""hiring-agent ResumeEvaluator adapted for Inluwa."""

from __future__ import annotations

import logging

from llm_utils import chat_json
from models import EvaluationData
from prompts.template_manager import TemplateManager

log = logging.getLogger("resume.evaluator")


class ResumeEvaluator:
    def __init__(self) -> None:
        self.template_manager = TemplateManager()

    def evaluate_resume(
        self,
        resume_text: str,
        *,
        job_title: str | None = None,
        job_description: str | None = None,
        assessment_criteria: str | None = None,
        cv_assessment_criteria: list | None = None,
        cv_jd_alignment_criteria: list | None = None,
    ) -> EvaluationData:
        criteria = self.template_manager.render_template(
            "resume_evaluation_criteria",
            text_content=resume_text,
            job_title=job_title,
            job_description=job_description,
            assessment_criteria=assessment_criteria,
            cv_assessment_criteria=cv_assessment_criteria,
            cv_jd_alignment_criteria=cv_jd_alignment_criteria,
        )
        system_message = self.template_manager.render_template(
            "resume_evaluation_system_message"
        )

        log.info("Running hiring-agent evaluation (text length=%d)", len(resume_text))
        evaluation_dict = chat_json(
            system_message=system_message,
            user_message=criteria,
            temperature=0.2,
            max_tokens=4096,
        )

        # Normalize jd_matching null
        if evaluation_dict.get("jd_matching") is None:
            evaluation_dict.pop("jd_matching", None)
            
        # Ensure all required top-level fields are present to prevent Pydantic validation errors
        # on truncated Gemini responses, since default_factory alone isn't always triggered.
        if "bonus_points" not in evaluation_dict:
            evaluation_dict["bonus_points"] = {"total": 0.0, "breakdown": "No bonus points awarded."}
        if "deductions" not in evaluation_dict:
            evaluation_dict["deductions"] = {"total": 0.0, "reasons": "No deductions."}
        if "key_strengths" not in evaluation_dict:
            evaluation_dict["key_strengths"] = ["No key strengths identified."]
        if "areas_for_improvement" not in evaluation_dict:
            evaluation_dict["areas_for_improvement"] = ["No areas for improvement identified."]
            
        return EvaluationData(**evaluation_dict)


def compute_overall_score(evaluation: EvaluationData) -> float:
    """hiring-agent score.py formula: categories + bonus - deductions, max 120."""
    total = 0.0
    max_score = 0
    for category_score in evaluation.scores.values():
        capped = min(float(category_score.score), int(category_score.max))
        total += capped
        max_score += int(category_score.max)

    total += float(evaluation.bonus_points.total)
    total -= float(evaluation.deductions.total)

    max_possible = max_score + 20  # 100 category + 20 bonus cap
    if total > max_possible:
        total = max_possible
    if total < 0:
        total = 0
    return round(total, 1)
