"use client";

import { createLogger } from "@/lib/logger";
import { useCallback, useEffect, useRef, useState } from "react";

const log = createLogger("face-analysis");

// ── Types ────────────────────────────────────────────────────────────────

export interface FaceAnalysisResult {
  /** Whether a face was detected in the frame */
  faceDetected: boolean;
  /** Whether the user is looking at the camera */
  eyeContact: boolean;
  /** Emotion from the Python service (null if not yet fetched) */
  dominantEmotion: string | null;
  /** Confidence scores for all emotions */
  emotions: Record<string, number>;
  /** Timestamp of the analysis */
  timestamp: string;
  /** Number of faces detected (if supported) */
  faceCount?: number;
  /** Whether multiple faces were detected */
  multipleFacesDetected?: boolean;
}

// ── MediaPipe Iris Landmarks ─────────────────────────────────────────────
// These are the indices for the iris and eye corner landmarks
// in the MediaPipe FaceLandmarker 478-point model.

const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;

/**
 * Calculate whether the user is making eye contact with the camera.
 * We compute the horizontal position of each iris center relative to
 * the inner/outer eye corners. If both irises are roughly centered
 * (within a threshold), we consider it "eye contact."
 */
function computeEyeContact(landmarks: { x: number; y: number; z: number }[]): boolean {
  if (landmarks.length < 478) return false;

  const getHorizontalRatio = (inner: { x: number }, outer: { x: number }, iris: { x: number }) => {
    const minX = Math.min(inner.x, outer.x);
    const maxX = Math.max(inner.x, outer.x);
    const width = maxX - minX;
    if (width < 0.002) return 0.5;
    return (iris.x - minX) / width;
  };

  // Left eye: ratio of iris position between inner and outer corner
  const leftRatio = getHorizontalRatio(
    landmarks[LEFT_EYE_INNER],
    landmarks[LEFT_EYE_OUTER],
    landmarks[LEFT_IRIS_CENTER]
  );

  // Right eye: same calculation
  const rightRatio = getHorizontalRatio(
    landmarks[RIGHT_EYE_INNER],
    landmarks[RIGHT_EYE_OUTER],
    landmarks[RIGHT_IRIS_CENTER]
  );

  // "Centered" means the ratio is roughly 0.5 (middle of the eye)
  // We use a more lenient threshold (0.22) to account for glasses and slight head tilts.
  // Glasses can cause reflections that make one iris harder to track, so we allow 
  // "eye contact" if EITHER eye appears centered.
  const threshold = 0.18; 
  const leftCentered = Math.abs(leftRatio - 0.5) < threshold;
  const rightCentered = Math.abs(rightRatio - 0.5) < threshold;

  return leftCentered || rightCentered;
}

// ── Hook ─────────────────────────────────────────────────────────────────

interface UseFaceAnalysisOptions {
  /** Whether analysis is enabled */
  enabled: boolean;
  /** URL for the emotion analysis Python service */
  emotionServiceUrl?: string;
  /** Interval for emotion analysis in ms (default: 60000 = 1 min) */
  emotionIntervalMs?: number;
  /** Interval for eye contact checks in ms (default: 2000 = 2s) */
  eyeContactIntervalMs?: number;
}

export function useFaceAnalysis({
  enabled,
  emotionServiceUrl = "/_emotion/analyze",
  emotionIntervalMs = 15_000,
  eyeContactIntervalMs = 2_000,
}: UseFaceAnalysisOptions) {
  const [latestResult, setLatestResult] = useState<FaceAnalysisResult | null>(null);
  const [eyeContactScore, setEyeContactScore] = useState<number>(0); // 0-100%
  const [missedEyeContactCount, setMissedEyeContactCount] = useState(0);
  const resultsRef = useRef<FaceAnalysisResult[]>([]);
  const multipleFacesCountRef = useRef(0);

  // MediaPipe refs
  const faceLandmarkerRef = useRef<any>(null);
  const eyeContactTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emotionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Eye contact tracking
  const eyeContactCountRef = useRef(0);
  const totalChecksRef = useRef(0);

  /**
   * Initialize MediaPipe FaceLandmarker for eye contact detection.
   */
  const initMediaPipe = useCallback(async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const { FaceLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 5,
        outputFacialTransformationMatrixes: false,
        outputFaceBlendshapes: false,
      });

      faceLandmarkerRef.current = landmarker;
      log.info("MediaPipe FaceLandmarker initialized ✅");
      return landmarker;
    } catch (err) {
      log.error("Failed to initialize MediaPipe:", err);
      return null;
    }
  }, []);

  /**
   * Check eye contact from the current camera frame.
   */
  const checkEyeContact = useCallback(() => {
    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) return;

    try {
      const result = landmarker.detect(video);
      totalChecksRef.current++;

      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        if (result.faceLandmarks.length > 1) {
          multipleFacesCountRef.current++;
        }
        
        const landmarks = result.faceLandmarks[0];
        const hasEyeContact = computeEyeContact(landmarks);

        if (hasEyeContact) {
          eyeContactCountRef.current++;
        } else {
          setMissedEyeContactCount((prev) => prev + 1);
        }

        // Update running score
        const score = Math.round(
          (eyeContactCountRef.current / totalChecksRef.current) * 100
        );
        setEyeContactScore(score);

        // Update latest result for UI indicators
        setLatestResult((prev) => ({
          faceDetected: true,
          eyeContact: hasEyeContact,
          dominantEmotion: prev?.dominantEmotion ?? null,
          emotions: prev?.emotions ?? {},
          timestamp: new Date().toISOString(),
          multipleFacesDetected: result.faceLandmarks.length > 1,
        }));
      } else {
        // No face detected = no eye contact
        setMissedEyeContactCount((prev) => prev + 1);
        const score = Math.round(
          (eyeContactCountRef.current / totalChecksRef.current) * 100
        );
        setEyeContactScore(score);
        
        setLatestResult((prev) => ({
          faceDetected: false,
          eyeContact: false,
          dominantEmotion: prev?.dominantEmotion ?? null,
          emotions: prev?.emotions ?? {},
          timestamp: new Date().toISOString(),
          multipleFacesDetected: false,
        }));
      }
    } catch {
      // Silently ignore detection errors (e.g., tab not focused)
    }
  }, []);

  /**
   * Start face analysis. Call this with the camera video element.
   */
  const start = useCallback(
    async (cameraVideo: HTMLVideoElement) => {
      if (!enabled) return;

      // Layout remounts (tools ↔ main / PiP) pass a new video element — retarget
      // without resetting scores or stacking duplicate intervals.
      if (eyeContactTimerRef.current) {
        videoRef.current = cameraVideo;
        return;
      }

      videoRef.current = cameraVideo;
      eyeContactCountRef.current = 0;
      totalChecksRef.current = 0;

      // Initialize MediaPipe for eye contact
      await initMediaPipe();

      // Start eye contact checks (every 3s to avoid stalling video playback)
      eyeContactTimerRef.current = setInterval(checkEyeContact, 3_000);

      // Run first check after 2s
      setTimeout(checkEyeContact, 2_000);

      log.info(
        `Face analysis started (eye contact: every 0.5s)`
      );
    },
    [enabled, initMediaPipe, checkEyeContact]
  );

  /**
   * Stop face analysis and return all collected results.
   */
  const stop = useCallback(() => {
    if (eyeContactTimerRef.current) {
      clearInterval(eyeContactTimerRef.current);
      eyeContactTimerRef.current = null;
    }

    // Close MediaPipe
    if (faceLandmarkerRef.current) {
      faceLandmarkerRef.current.close();
      faceLandmarkerRef.current = null;
    }

    videoRef.current = null;
    log.info("Face analysis stopped");

    return {
      results: resultsRef.current,
      eyeContactScore: eyeContactScore,
      totalChecks: totalChecksRef.current,
      eyeContactCount: eyeContactCountRef.current,
      missedCount: totalChecksRef.current - eyeContactCountRef.current,
      multipleFacesCount: multipleFacesCountRef.current,
    };
  }, [eyeContactScore]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eyeContactTimerRef.current) clearInterval(eyeContactTimerRef.current);
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
    };
  }, []);

  return {
    start,
    stop,
    latestResult,
    eyeContactScore,
    missedEyeContactCount,
    results: resultsRef,
  };
}
