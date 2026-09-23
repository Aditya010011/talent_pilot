/**
 * Google TTS → Simli PCM conversion.
 * Relay audio is Float32 24 kHz; Simli expects Int16 PCM at 16 kHz.
 */

const SOURCE_SAMPLE_RATE = 24000;
const TARGET_SAMPLE_RATE = 16000;
const DOWNSAMPLE_RATIO = SOURCE_SAMPLE_RATE / TARGET_SAMPLE_RATE; // 1.5

function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

/** Linear-interpolation downsample Float32 24 kHz → Int16 16 kHz. */
export function convertFloat32_24k_to_int16_16k(float32Buffer: ArrayBuffer): Uint8Array {
  const input = new Float32Array(float32Buffer);
  if (input.length === 0) return new Uint8Array(0);

  const outputLength = Math.floor(input.length / DOWNSAMPLE_RATIO);
  const int16 = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const src = i * DOWNSAMPLE_RATIO;
    const i0 = Math.min(Math.floor(src), input.length - 1);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    int16[i] = floatToInt16(input[i0] * (1 - frac) + input[i1] * frac);
  }

  return new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
}
