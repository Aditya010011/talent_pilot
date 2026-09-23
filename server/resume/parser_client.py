"""ai-resume-parser (ResumeParserPro) integration — Gemini by default."""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from pdf_ocr import is_scanned_pdf_error, ocr_pdf_bytes

log = logging.getLogger("resume.parser")

GEMINI_FLASH_MODEL = os.environ.get("GEMINI_FLASH_MODEL", "gemini-3.5-flash").strip() or "gemini-3.5-flash"


def _build_parser():
    from resumeparser_pro import ResumeParserPro

    google_api_key = os.environ.get("GOOGLE_API_KEY")
    if google_api_key:
        model = os.environ.get("RESUME_MODEL") or GEMINI_FLASH_MODEL
        # ResumeParserPro uses langchain init_chat_model("openai:…");
        # point OpenAI client at Gemini's OpenAI-compatible endpoint.
        gemini_base = "https://generativelanguage.googleapis.com/v1beta/openai/"
        os.environ["OPENAI_API_BASE"] = gemini_base
        os.environ["OPENAI_BASE_URL"] = gemini_base
        log.info("Resume parser using Gemini OpenAI-compat / %s", model)
        return ResumeParserPro(
            provider="openai",
            model_name=model,
            api_key=google_api_key,
            temperature=0.0,
        )

    # ── Azure OpenAI / OpenAI (DISABLED — Gemini migration) ────────────────
    # endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    # api_key = os.environ.get("AZURE_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    # model = (
    #     os.environ.get("AZURE_OPENAI_DEPLOYMENT_CHAT")
    #     or os.environ.get("AZURE_OPENAI_DEPLOYMENT")
    #     or os.environ.get("RESUME_MODEL")
    #     or "gpt-4o"
    # )
    # if endpoint and api_key:
    #     os.environ.setdefault("AZURE_OPENAI_ENDPOINT", endpoint.rstrip("/"))
    #     os.environ.setdefault("AZURE_OPENAI_API_KEY", api_key)
    #     os.environ.setdefault(
    #         "OPENAI_API_VERSION",
    #         os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-01-preview"),
    #     )
    #     return ResumeParserPro(
    #         provider="azure_openai",
    #         model_name=model,
    #         api_key=api_key,
    #         temperature=0.0,
    #     )
    # return ResumeParserPro(
    #     provider="openai",
    #     model_name=model,
    #     api_key=api_key or "",
    #     temperature=0.0,
    # )

    raise RuntimeError(
        "GOOGLE_API_KEY is required for resume parsing (gemini-3.5-flash). "
        "Azure OpenAI path is disabled."
    )


def _parse_file(parser, path: str):
    return parser.parse_resume(path)


def parse_resume_bytes(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Parse resume file using ai-resume-parser. OCR fallback for scanned PDFs."""
    suffix = Path(filename).suffix.lower() or ".pdf"
    parser = _build_parser()

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    ocr_tmp_path: str | None = None

    try:
        log.info("Parsing resume with ai-resume-parser: %s", filename)
        result = _parse_file(parser, tmp_path)

        if not result.success and suffix == ".pdf" and is_scanned_pdf_error(result.error_message):
            log.info("PDF text extraction failed — running OCR fallback for %s", filename)
            ocr_text = ocr_pdf_bytes(file_bytes)
            if len(ocr_text.strip()) < 50:
                raise ValueError(
                    "Could not extract sufficient text from this PDF even with OCR. "
                    "Try a text-based PDF or DOCX."
                )

            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".txt", delete=False, encoding="utf-8"
            ) as ocr_tmp:
                ocr_tmp.write(ocr_text)
                ocr_tmp_path = ocr_tmp.name

            log.info("OCR extracted %d chars, re-parsing via ai-resume-parser", len(ocr_text))
            result = _parse_file(parser, ocr_tmp_path)

        if not result.success:
            raise ValueError(result.error_message or "Resume parsing failed")

        data = result.resume_data.model_dump()
        return {
            "resume_data": data,
            "parsing_time_seconds": result.parsing_time_seconds,
            "success": True,
            "ocr_used": ocr_tmp_path is not None,
        }
    finally:
        for path in (tmp_path, ocr_tmp_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass
