"""Pydantic models adapted from interviewstreet/hiring-agent."""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class CategoryScore(BaseModel):
    score: float = Field(ge=0, description="Score achieved in this category")
    max: int = Field(gt=0, description="Maximum possible score")
    evidence: str = Field(default="No evidence provided.", description="Evidence supporting the score")


# Removing the hardcoded Scores class to allow dynamic evaluation criteria

class BonusPoints(BaseModel):
    total: float = Field(default=0.0, ge=0, le=20, description="Total bonus points")
    breakdown: str = Field(default="No bonus points awarded.", description="Breakdown of bonus points")


class Deductions(BaseModel):
    total: float = Field(
        default=0.0,
        ge=0,
        description="Total deduction points (stored as positive, applied as negative)",
    )
    reasons: str = Field(default="No deductions.", description="Reasons for deductions")


class JdMatchRow(BaseModel):
    label: str = Field(default="Requirement", description="A short max-2-word label for this requirement (e.g. 'SAP Skills', 'CPA License')")
    requirement: str
    evidence: str
    coverage: str


class DomainExperience(BaseModel):
    target_role_domain: str = Field(
        description="The primary domain of the job role (e.g., Software Engineering, Marketing, Sales, etc.)"
    )
    relevant_experience_months: int = Field(
        default=0,
        description="Total months of experience the candidate has specifically in the target/relevant role domain"
    )
    irrelevant_experience_months: int = Field(
        default=0,
        description="Total months of experience the candidate has in other, irrelevant domains"
    )
    explanation: str = Field(
        default="",
        description="Clear breakdown of how relevant and irrelevant experience months were calculated from each work history entry"
    )


class EvaluationData(BaseModel):
    scores: Dict[str, CategoryScore]
    bonus_points: BonusPoints = Field(default_factory=lambda: BonusPoints(total=0.0, breakdown="No bonus points awarded."))
    deductions: Deductions = Field(default_factory=lambda: Deductions(total=0.0, reasons="No deductions."))
    key_strengths: List[str] = Field(default_factory=lambda: ["No key strengths identified."])
    areas_for_improvement: List[str] = Field(default_factory=lambda: ["No areas for improvement identified."])
    jd_matching: Optional[List[JdMatchRow]] = None
    domain_experience: Optional[DomainExperience] = None

