/**
 * Simli LiveKit session helpers.
 * The Simli JS client does not emit `stop`/`error` when the LiveKit room
 * disconnects — video goes black while our UI still says "ready".
 */

export const SIMLI_MAX_SESSION_LENGTH_SEC = 7200; // 2h interview ceiling
export const SIMLI_MAX_IDLE_TIME_SEC = 1800; // thinking time between answers
export const SIMLI_UNHEALTHY_POLLS_BEFORE_RECONNECT = 3;
export const SIMLI_MAX_RECONNECT_ATTEMPTS = 8;

export function buildSimliSessionConfig(faceId: string) {
  return {
    faceId,
    handleSilence: true,
    maxSessionLength: SIMLI_MAX_SESSION_LENGTH_SEC,
    maxIdleTime: SIMLI_MAX_IDLE_TIME_SEC,
    model: "fasttalk" as const,
  };
}

/** True when the <video> still has a live LiveKit video track with frames. */
export function isSimliVideoHealthy(video: HTMLVideoElement | null | undefined): boolean {
  if (!video) return false;
  const stream = video.srcObject;
  if (!(stream instanceof MediaStream)) return false;
  const tracks = stream.getVideoTracks();
  if (tracks.length === 0) return false;
  if (tracks.every((track) => track.readyState === "ended")) return false;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
  if (video.videoWidth < 2 || video.videoHeight < 2) return false;
  return true;
}

export function shouldReconnectAfterUnhealthyPolls(
  consecutiveUnhealthy: number,
  threshold = SIMLI_UNHEALTHY_POLLS_BEFORE_RECONNECT,
): boolean {
  return consecutiveUnhealthy >= threshold;
}

const TERMINAL_FOR_SILENT = new Set(["disconnected", "error", "idle", "connecting"]);

/** `silent` must not flip a dead/connecting session back to "ready". */
export function canApplySilentReady(status: string): boolean {
  return !TERMINAL_FOR_SILENT.has(status);
}

export function nextSimliReconnectDelayMs(attempt: number): number {
  const capped = Math.min(Math.max(attempt, 1), 6);
  return Math.min(1000 * 2 ** (capped - 1), 10_000);
}

/** Don't tear down a live VoiceInterface just because localization refetched. */
export function shouldBlockSessionForLocalization(
  isLocalizing: boolean,
  sessionAlreadyMounted: boolean,
  waitingForFirstLocalization = false,
): boolean {
  if (sessionAlreadyMounted) return false;
  return isLocalizing || waitingForFirstLocalization;
}

export function shouldRestartQuestionLocalization(
  needsLocalization: boolean,
  language: string,
  alreadyLocalizedLanguage: string | null,
): boolean {
  if (!needsLocalization) return false;
  return alreadyLocalizedLanguage !== language;
}
