import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_LOCALE_CODES,
  getGoogleSttCode,
  getGoogleTtsConfig,
  LANGUAGES,
  resolveLanguage,
  resolveSessionLanguage,
  SUPPORTED_LANGUAGES,
} from "../src/lib/languages";

describe("languages registry", () => {
  it("lists all 35 supported languages", () => {
    assert.equal(SUPPORTED_LANGUAGES.length, 35);
    assert.equal(LANGUAGES.length, 35);
    assert.equal(APP_LOCALE_CODES.length, 35);
  });

  it("resolves aliases and regional codes", () => {
    assert.equal(resolveLanguage("zh-CN").code, "zh");
    assert.equal(resolveLanguage("pt-BR").code, "pt-BR");
    assert.equal(resolveLanguage("no").code, "nb");
    assert.equal(getGoogleSttCode("ja"), "ja-JP");
    assert.equal(getGoogleTtsConfig("fr").languageCode, "fr-FR");
    assert.equal(resolveSessionLanguage("ja", "en"), "ja");
    assert.equal(resolveSessionLanguage(null, "fr"), "fr");
  });

  it("maps ko / ko-KR to Cantonese (existing yue TTS/STT path)", () => {
    for (const code of ["ko", "ko-KR", "ko-kr"]) {
      assert.equal(resolveLanguage(code).code, "yue");
      assert.equal(getGoogleSttCode(code), "yue-Hant-HK");
      assert.equal(getGoogleTtsConfig(code).voiceName, "yue-HK-Chirp3-HD-Aoede");
    }
    // Explicit yue unchanged
    assert.equal(getGoogleTtsConfig("yue").languageCode, "yue-HK");
  });

  it("uses WaveNet Google TTS for English", () => {
    const en = getGoogleTtsConfig("en");
    assert.equal(en.languageCode, "en-US");
    assert.equal(en.voiceName, "en-US-Wavenet-C");
  });

  it("uses Chirp3 HD for Cantonese (no yue-HK-Wavenet on Google TTS)", () => {
    const yue = getGoogleTtsConfig("yue");
    assert.equal(yue.languageCode, "yue-HK");
    assert.equal(yue.voiceName, "yue-HK-Chirp3-HD-Aoede");
  });

  it("routes every dropdown language through the registry for session/TTS/STT", () => {
    for (const { value } of LANGUAGES) {
      const lang = resolveLanguage(value);
      assert.ok(lang.code, `missing code for ${value}`);
      assert.ok(lang.googleSttCode, `missing STT for ${value}`);
      assert.ok(lang.googleTtsLanguageCode, `missing TTS language for ${value}`);
      assert.ok(lang.googleTtsVoice, `missing TTS voice for ${value}`);
      assert.ok(lang.llmLanguageName, `missing LLM name for ${value}`);
      assert.equal(resolveSessionLanguage(value, "en"), lang.code);
      const tts = getGoogleTtsConfig(value);
      assert.equal(tts.languageCode, lang.googleTtsLanguageCode);
      assert.equal(tts.voiceName, lang.googleTtsVoice);
    }
  });
});
