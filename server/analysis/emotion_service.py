"""
Emotion Detection Microservice for Kimiyi AI AI Interview Platform
Uses DeepFace for facial emotion recognition from screenshots.
"""

import io
import logging
from contextlib import asynccontextmanager

import numpy as np
from deepface import DeepFace
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s  [analysis] %(message)s")
log = logging.getLogger("analysis")

# ── Warm up model on startup ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up DeepFace model on startup to avoid cold-start latency."""
    log.info("Warming up DeepFace emotion model...")
    try:
        # Create a small dummy image to trigger model download + load
        dummy = np.zeros((48, 48, 3), dtype=np.uint8)
        DeepFace.analyze(dummy, actions=["emotion"], enforce_detection=False, silent=True)
        log.info("DeepFace emotion model ready ✅")
    except Exception as e:
        log.warning(f"DeepFace warmup failed (will retry on first request): {e}")
    yield

app = FastAPI(
    title="Kimiyi AI Emotion Analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow requests from the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


# ── Emotion Detection Endpoint ────────────────────────────────────────────

@app.post("/analyze")
def analyze_emotion(file: UploadFile = File(...)):
    """
    Accepts a JPEG/PNG image and returns emotion analysis.

    Returns:
        {
            "dominant_emotion": "happy",
            "emotions": { "happy": 95.2, "neutral": 3.1, ... },
            "face_detected": true
        }
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        contents = file.file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        img_array = np.array(image)

        results = DeepFace.analyze(
            img_array,
            actions=["emotion"],
            enforce_detection=False,  # Don't fail if no face found
            silent=True,
            detector_backend="opencv",  # Fast, lightweight detector
        )

        if not results:
            return {
                "face_detected": False,
                "dominant_emotion": None,
                "emotions": {},
            }

        # DeepFace returns a list (one entry per face); take the first
        result = results[0] if isinstance(results, list) else results
        face_count = len(results) if isinstance(results, list) else 1

        emotions = result.get("emotion", {})
        dominant = result.get("dominant_emotion", "unknown")

        log.info(f"Emotion detected: {dominant} (confidence: {emotions.get(dominant, 0):.1f}%)")

        return {
            "face_detected": True,
            "face_count": face_count,
            "dominant_emotion": dominant,
            "emotions": {k: round(float(v), 2) for k, v in emotions.items()},
        }

    except Exception as e:
        log.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "emotion-analysis"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090, log_level="info")
