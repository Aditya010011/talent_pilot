"""OCR fallback for image-only / scanned PDFs."""

from __future__ import annotations

import logging

log = logging.getLogger("resume.pdf_ocr")

OCR_DPI = 200


def ocr_pdf_bytes(pdf_bytes: bytes) -> str:
    """Render each PDF page and run Tesseract when embedded text is empty."""
    import fitz  # PyMuPDF — bundled with ai-resume-parser
    import pytesseract
    from PIL import Image

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    parts: list[str] = []

    try:
        zoom = OCR_DPI / 72
        matrix = fitz.Matrix(zoom, zoom)

        for i, page in enumerate(doc):
            embedded = page.get_text("text") or ""
            if embedded.strip():
                parts.append(embedded.strip())
                continue

            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            ocr_text = pytesseract.image_to_string(img, lang="eng")
            if ocr_text.strip():
                parts.append(ocr_text.strip())
                log.info("OCR page %d: %d chars", i + 1, len(ocr_text.strip()))
    finally:
        doc.close()

    return "\n\n".join(parts)


def is_scanned_pdf_error(message: str | None) -> bool:
    if not message:
        return False
    lower = message.lower()
    return (
        "no readable text" in lower
        or "image-only pdf" in lower
        or "ocr" in lower and "pdf" in lower
    )
