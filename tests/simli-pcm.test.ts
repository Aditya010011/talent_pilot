import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertFloat32_24k_to_int16_16k } from "../src/lib/simli-pcm";

describe("simli PCM conversion", () => {
  it("returns empty output for empty input", () => {
    const out = convertFloat32_24k_to_int16_16k(new Float32Array(0).buffer);
    assert.equal(out.byteLength, 0);
  });

  it("downsamples 24 kHz float32 to 16 kHz int16 (3:2)", () => {
    const input = new Float32Array(300);
    for (let i = 0; i < input.length; i++) input[i] = i / input.length;
    const out = convertFloat32_24k_to_int16_16k(input.buffer);
    assert.equal(out.byteLength, 200 * 2);
  });

  it("clamps out-of-range samples", () => {
    const input = new Float32Array([1.5, 1.5, -1.5, -1.5, 0, 0]);
    const out = convertFloat32_24k_to_int16_16k(input.buffer);
    const int16 = new Int16Array(out.buffer, out.byteOffset, out.byteLength / 2);
    assert.equal(int16[0], 32767);
    assert.equal(int16[2], -32768);
  });
});
