/**
 * Pruna p-video-avatar voice ids (exact strings for speech.voice).
 * Docs: https://runware.ai/docs/models/prunaai-p-video-avatar
 */

export const AVATAR_VOICES = [
  "Zephyr (Female)",
  "Puck (Male)",
  "Charon (Male)",
  "Kore (Female)",
  "Fenrir (Male)",
  "Leda (Female)",
  "Orus (Male)",
  "Aoede (Female)",
  "Callirrhoe (Female)",
  "Iapetus (Male)",
] as const;

export type AvatarVoice = (typeof AVATAR_VOICES)[number];

export const DEFAULT_AVATAR_VOICE: AvatarVoice = "Aoede (Female)";

export function resolveAvatarVoice(voice?: string | null): AvatarVoice {
  const trimmed = voice?.trim();
  if (trimmed && (AVATAR_VOICES as readonly string[]).includes(trimmed)) {
    return trimmed as AvatarVoice;
  }
  return DEFAULT_AVATAR_VOICE;
}

/** Built-in portrait presets (public `/avatars/*`) linked 1:1 to Runware voices. */
export type AvatarPreset = {
  id: string;
  label: string;
  /** Still PNG for Runware `frameImages` (site-relative under `public/`). */
  imagePath: string;
  /** MP4 preview for the preset grid UI (plays once on select; includes voice audio). */
  videoPath: string;
  /** Optional MP3 sample for voice-dropdown preview (filename quirks: Aeode, Lepetus). */
  audioPath: string;
  voice: AvatarVoice;
  /** Pre-generated headshaking (listening) video path. */
  listeningVideoPath?: string;
};

/**
 * 2×5 grid order: women on row 1, men on row 2.
 * Gender of voice matches filename (_w / _m).
 * UI shows `imagePath` stills by default and plays `videoPath` once on select;
 * API generation uses `imagePath` stills only.
 */
export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  {
    id: "f1",
    label: "HR Woman Avatar v2",
    imagePath: "/avatars/f1.jpg",
    videoPath: "/avatars/Zephyr.mp4",
    audioPath: "/avatars/Zephyr.mp3",
    voice: "Zephyr (Female)",
    // Silent attentive listening / idle clip.
    listeningVideoPath: "/avatars/f1.mp4",
  },
  {
    id: "f2",
    label: "Female Avatar 2",
    imagePath: "/avatars/f2.jpg",
    videoPath: "/avatars/Kore.mp4",
    audioPath: "/avatars/Aeode.mp3",
    voice: "Aoede (Female)",
    listeningVideoPath: "/avatars/f2.mp4",
  },
  {
    id: "f3",
    label: "Female Avatar 3",
    imagePath: "/avatars/f3.jpg",
    videoPath: "/avatars/Callirrhoe.mp4",
    audioPath: "/avatars/Leda.mp3",
    voice: "Leda (Female)",
    listeningVideoPath: "/avatars/f3.mp4",
  },
  {
    id: "f4",
    label: "Female Avatar 4",
    imagePath: "/avatars/f4.jpg",
    videoPath: "/avatars/Aeode.mp4",
    audioPath: "/avatars/Kore.mp3",
    voice: "Kore (Female)",
    listeningVideoPath: "/avatars/f4.mp4",
  },
  {
    id: "f5",
    label: "Female Avatar 5",
    imagePath: "/avatars/f5.jpg",
    videoPath: "/avatars/Leda.mp4",
    audioPath: "/avatars/Callirrhoe.mp3",
    voice: "Callirrhoe (Female)",
    listeningVideoPath: "/avatars/f5.mp4",
  },
  {
    id: "m1",
    label: "Male Avatar 1",
    imagePath: "/avatars/m1.jpg",
    videoPath: "/avatars/Puck.mp4",
    audioPath: "/avatars/Puck.mp3",
    voice: "Puck (Male)",
    listeningVideoPath: "/avatars/m1.mp4",
  },
  {
    id: "m2",
    label: "Male Avatar 2",
    imagePath: "/avatars/m2.jpg",
    videoPath: "/avatars/Fenrir.mp4",
    audioPath: "/avatars/Lepetus.mp3",
    voice: "Iapetus (Male)",
    listeningVideoPath: "/avatars/m2.mp4",
  },
  {
    id: "m3",
    label: "Male Avatar 3",
    imagePath: "/avatars/m3.jpg",
    videoPath: "/avatars/Orus.mp4",
    audioPath: "/avatars/Orus.mp3",
    voice: "Orus (Male)",
    listeningVideoPath: "/avatars/m3.mp4",
  },
  {
    id: "m4",
    label: "Male Avatar 4",
    imagePath: "/avatars/m4.jpg",
    videoPath: "/avatars/Lepetus.mp4",
    audioPath: "/avatars/Fenrir.mp3",
    voice: "Fenrir (Male)",
    listeningVideoPath: "/avatars/m4.mp4",
  },
  {
    id: "m5",
    label: "Male Avatar 5",
    imagePath: "/avatars/m5.jpg",
    videoPath: "/avatars/Charon.mp4",
    audioPath: "/avatars/Charon.mp3",
    voice: "Charon (Male)",
    listeningVideoPath: "/avatars/m5.mp4",
  },
] as const;

/** MP3 preview path for a Runware voice (custom dropdown). */
export function getAvatarVoiceAudioPath(voice: AvatarVoice): string | undefined {
  return AVATAR_PRESETS.find((p) => p.voice === voice)?.audioPath;
}

/** Absolute URL for a public avatar path (Runware / Zod require full URLs). */
export function absoluteAvatarImageUrl(
  imagePath: string,
  origin?: string | null,
): string {
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const path = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  const base = (
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).replace(/\/$/, "");
  if (!base) return path;
  return `${base}${path}`;
}

export function findAvatarPresetByImageUrl(
  url?: string | null,
): AvatarPreset | undefined {
  if (!url) return undefined;
  return AVATAR_PRESETS.find(
    (p) => {
      if (url === p.imagePath || url.endsWith(p.imagePath)) return true;
      // Handle alternative name-based image URLs (e.g. white_w.png) mapping to indexed presets
      if (p.id === "f1" && (url.endsWith("/white_w.png") || url.endsWith("/white_w"))) return true;
      if (p.id === "f2" && (url.endsWith("/black_w.png") || url.endsWith("/black_w"))) return true;
      if (p.id === "f3" && (url.endsWith("/arab_w.png") || url.endsWith("/arab_w"))) return true;
      if (p.id === "f4" && (url.endsWith("/ind_w.png") || url.endsWith("/ind_w"))) return true;
      if (p.id === "f5" && (url.endsWith("/hk_w.png") || url.endsWith("/hk_w"))) return true;
      if (p.id === "m1" && (url.endsWith("/white_m.png") || url.endsWith("/white_m"))) return true;
      if (p.id === "m2" && (url.endsWith("/black_m.png") || url.endsWith("/black_m"))) return true;
      if (p.id === "m3" && (url.endsWith("/arab_m.png") || url.endsWith("/arab_m"))) return true;
      if (p.id === "m4" && (url.endsWith("/ind_m.png") || url.endsWith("/ind_m"))) return true;
      if (p.id === "m5" && (url.endsWith("/asia_m.png") || url.endsWith("/asia_m"))) return true;
      return false;
    }
  );
}

/**
 * Preset is "fully selected" only when image AND voice both match.
 * Allows intentional mixes (e.g. Charon still + Fenrir voice) without
 * keeping the old preset tile highlighted.
 */
export function findMatchingAvatarPreset(
  imageUrl?: string | null,
  voice?: string | null,
): AvatarPreset | undefined {
  const byImage = findAvatarPresetByImageUrl(imageUrl);
  if (!byImage) return undefined;
  return byImage.voice === resolveAvatarVoice(voice) ? byImage : undefined;
}

/**
 * Runware Pruna `speech.language` allowlist.
 * Docs: https://runware.ai/docs/models/prunaai-p-video-avatar
 *
 * Chinese (zh / yue) are not on Pruna's allowlist, but sending `"ko"` works
 * well in practice: speech.text carries Chinese characters and positivePrompt
 * carries the real HR-selected language (Mandarin/Cantonese) tone cue.
 */
export const PRUNA_SPEECH_LANGUAGES = [
  "en",
  "en-US",
  "en-GB",
  "es",
  "es-ES",
  "fr",
  "fr-FR",
  "de",
  "de-DE",
  "it",
  "it-IT",
  "pt-BR",
  "ja",
  "ja-JP",
  "ko",
  "ko-KR",
  "hi",
  "hi-IN",
] as const;

export type PrunaSpeechLanguage = (typeof PRUNA_SPEECH_LANGUAGES)[number];

/**
 * Map interview.language → Pruna speech.language.
 * zh / yue (and aliases) map to `"ko"` (workaround; real language stays in
 * positivePrompt). Returns null for other unsupported langs so callers omit
 * `speech.language`.
 */
export function toPrunaSpeechLanguage(
  language?: string | null,
): PrunaSpeechLanguage | null {
  const raw = (language || "").trim();
  if (!raw) return "en-US";
  const lower = raw.toLowerCase();

  const map: Record<string, PrunaSpeechLanguage> = {
    en: "en",
    "en-us": "en-US",
    "en-gb": "en-GB",
    es: "es",
    "es-es": "es-ES",
    fr: "fr",
    "fr-fr": "fr-FR",
    de: "de",
    "de-de": "de-DE",
    it: "it",
    "it-it": "it-IT",
    "pt-br": "pt-BR",
    pt: "pt-BR",
    ja: "ja",
    "ja-jp": "ja-JP",
    ko: "ko",
    "ko-kr": "ko-KR",
    hi: "hi",
    "hi-in": "hi-IN",
    // Chinese / Cantonese → ko (allowlist workaround; prompt has real lang)
    zh: "ko",
    "zh-cn": "ko",
    "zh-tw": "ko",
    "zh-hk": "ko",
    chinese: "ko",
    mandarin: "ko",
    yue: "ko",
    "yue-hk": "ko",
    cantonese: "ko",
  };

  return map[lower] ?? map[lower.slice(0, 2)] ?? null;
}
