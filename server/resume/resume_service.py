"""
Resume parse + score microservice for Inluwa.

Parsing: ai-resume-parser (ResumeParserPro)
Scoring: interviewstreet/hiring-agent evaluator rubric
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool

from evaluator import ResumeEvaluator
from mapper import build_candidate_response
from parser_client import parse_resume_bytes
from resume_text import parsed_resume_to_text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s  [resume] %(message)s",
)
log = logging.getLogger("resume")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Resume service ready (ai-resume-parser + hiring-agent scoring)")
    yield


app = FastAPI(title="Inluwa Resume Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "parser": "ai-resume-parser", "scorer": "hiring-agent"}


@app.post("/parse-and-score")
async def parse_and_score(
    file: UploadFile = File(...),
    interviewContext: str | None = Form(default=None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File must be under 5MB")

    ctx: dict[str, Any] = {}
    if interviewContext:
        try:
            ctx = json.loads(interviewContext)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid interviewContext JSON")

    job_title = ctx.get("title")
    job_description = ctx.get("jobDescription")
    assessment_criteria = ctx.get("assessmentCriteria")
    cv_assessment_criteria = ctx.get("cvAssessmentCriteria")  # list[str] | None
    cv_jd_alignment_criteria = ctx.get("cvJdAlignmentCriteria")  # list[str] | None
    criteria_text = (
        json.dumps(assessment_criteria, indent=2)
        if assessment_criteria
        else None
    )

    try:
        def _process_resume():
            _parse_result = parse_resume_bytes(file_bytes, file.filename)
            _parsed = _parse_result["resume_data"]
            _resume_text = parsed_resume_to_text(_parsed)

            _evaluator = ResumeEvaluator()
            _evaluation = _evaluator.evaluate_resume(
                _resume_text,
                job_title=job_title,
                job_description=job_description,
                assessment_criteria=criteria_text,
                cv_assessment_criteria=cv_assessment_criteria,
                cv_jd_alignment_criteria=cv_jd_alignment_criteria,
            )

            _candidate = build_candidate_response(
                _parsed,
                _evaluation,
                parsing_time_seconds=_parse_result.get("parsing_time_seconds"),
                job_description=job_description,
                cv_assessment_criteria=cv_assessment_criteria,
                cv_jd_alignment_criteria=cv_jd_alignment_criteria,
            )
            return _parse_result, _resume_text, _candidate

        parse_result, resume_text, candidate = await run_in_threadpool(_process_resume)

        return {
            "success": True,
            "candidate": candidate,
            "resumeTextLength": len(resume_text),
            "resumePreview": resume_text[:1200],
            "parsingTimeSeconds": parse_result.get("parsing_time_seconds"),
        }
    except Exception as exc:
        log.exception("parse-and-score failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/convert-slides")
async def convert_slides(file: UploadFile = File(...), ppi: int = Form(150)):
    """
    Convert a PPTX / PPT / PDF file to a list of base64 PNG slide images.
    Uses LibreOffice (headless) for PPTX→PDF, then pdftoppm for PDF→PNG.

    Args:
        ppi: Output DPI/quality for pdftoppm. Lower values are faster and produce smaller thumbnails.
    """
    import subprocess, tempfile, os, base64
    from io import BytesIO
    from PIL import Image
    from pathlib import Path

    file_bytes = await file.read()
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in (".pptx", ".ppt", ".pdf"):
        raise HTTPException(status_code=400, detail="Only .pptx, .ppt, or .pdf files are supported")

    images: list[str] = []

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, f"input{ext}")
        with open(input_path, "wb") as f:
            f.write(file_bytes)

        pdf_path = input_path if ext == ".pdf" else None

        if ext in (".pptx", ".ppt"):
            try:
                subprocess.run(
                    ["soffice", "--headless", "--convert-to", "pdf", "--outdir", tmpdir, input_path],
                    timeout=180, check=True, capture_output=True,
                )
                pdfs = list(Path(tmpdir).glob("*.pdf"))
                if pdfs:
                    pdf_path = str(pdfs[0])
            except Exception as e:
                log.error(f"LibreOffice conversion failed: {e}")
                raise HTTPException(status_code=500, detail=f"PPTX→PDF conversion failed: {e}")

        if not pdf_path or not os.path.exists(pdf_path):
            raise HTTPException(status_code=500, detail="PDF not produced")

        try:
            out_prefix = os.path.join(tmpdir, "slide")
            # Clamp to a sane range to avoid accidental extreme values.
            if ppi < 40:
                ppi = 40
            if ppi > 300:
                ppi = 300

            subprocess.run(
                ["pdftoppm", "-png", "-r", str(ppi), pdf_path, out_prefix],
                timeout=120, check=True, capture_output=True,
            )
            png_files = sorted(Path(tmpdir).glob("slide-*.png"))
            # Return images at their native aspect ratio — the frontend handles
            # dynamic aspect ratio rendering (no forced 16:9 canvas padding).
            for png in png_files:
                with Image.open(png) as im:
                    buf = BytesIO()
                    im.convert("RGB").save(buf, format="PNG")
                    data = base64.b64encode(buf.getvalue()).decode()
                    images.append(f"data:image/png;base64,{data}")
        except Exception as e:
            log.error(f"pdftoppm failed: {e}")
            raise HTTPException(status_code=500, detail=f"PDF→image conversion failed: {e}")

    return {"images": images, "count": len(images)}


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8091"))
    uvicorn.run(app, host=host, port=port, log_level="info")
