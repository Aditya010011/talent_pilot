/**
 * Google Cloud Text-to-Speech helper for onboarding mic test (and other Next.js routes).
 * Voice IDs come from {@link getGoogleTtsConfig} in languages.ts.
 */
import path from "path";
import textToSpeech from "@google-cloud/text-to-speech";
import { getGoogleTtsConfig } from "@/lib/languages";

const GOOGLE_KEY_FILENAME =
  process.env.GOOGLE_TTS_KEY_FILE ||
  path.join(process.cwd(), "single-quanta-461104-i7-af0effe9cc10.json");

type TtsClient = InstanceType<typeof textToSpeech.TextToSpeechClient>;

let ttsClient: TtsClient | null = null;

function getTtsClient(): TtsClient {
  if (!ttsClient) {
    ttsClient = new textToSpeech.TextToSpeechClient({
      keyFilename: GOOGLE_KEY_FILENAME,
    });
  }
  return ttsClient;
}

/** 16-bit signed LE PCM → 32-bit float LE PCM (browser AudioContext format) */
function linear16ToFloat32(buf: Buffer): Buffer {
  const samples = Math.floor(buf.length / 2);
  const out = Buffer.alloc(samples * 4);
  for (let i = 0; i < samples; i++) {
    out.writeFloatLE(buf.readInt16LE(i * 2) / 32768.0, i * 4);
  }
  return out;
}

/**
 * Synthesize `text` with the language's configured Google TTS voice.
 * Returns raw Float32 LE PCM at 24 kHz mono (same format as /api/voice/tts-s2s).
 */
export async function synthesizeGoogleTtsFloat32(
  text: string,
  language?: string | null
): Promise<Buffer> {
  const cleanText = text.trim();
  if (!cleanText) return Buffer.alloc(0);

  const { languageCode, voiceName } = getGoogleTtsConfig(language);
  // Chirp3 HD rejects pitch; Standard / WaveNet / Neural2 accept it.
  const isChirp3 = voiceName.includes("Chirp3");

  const [response] = await getTtsClient().synthesizeSpeech({
    input: { text: cleanText },
    voice: {
      languageCode,
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: "LINEAR16" as const,
      sampleRateHertz: 24000,
      speakingRate: 0.95,
      ...(isChirp3 ? {} : { pitch: -1.5 }),
    },
  });

  let audioData = Buffer.from(response.audioContent as Uint8Array);

  // LINEAR16 responses include a 44-byte WAV header
  if (audioData.length > 44) {
    audioData = audioData.subarray(44);
  }
  if (audioData.length % 2 !== 0) {
    audioData = audioData.subarray(0, audioData.length - 1);
  }
  if (audioData.length === 0) return Buffer.alloc(0);

  return linear16ToFloat32(audioData);
}
