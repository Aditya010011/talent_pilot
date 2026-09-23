/**
 * Central registry for supported interview & app UI languages.
 * Used by voice relay (Google STT/TTS), interview settings, and i18n.
 */

export interface SupportedLanguage {
  /** Stored in interviews.language (BCP-47 style, e.g. "pt-BR") */
  code: string;
  /** English display name */
  label: string;
  /** Native display name */
  nativeLabel: string;
  /** Google Cloud Speech-to-Text language code */
  googleSttCode: string;
  /** Google Cloud Text-to-Speech language code */
  googleTtsLanguageCode: string;
  /** Google Cloud TTS voice name */
  googleTtsVoice: string;
  /** Human-readable name for LLM prompts */
  llmLanguageName: string;
  /** BCP-47 tag for browser speechSynthesis fallback */
  speechSynthesisLocale: string;
  /** Google Translate API target code (for locale file generation) */
  translateTarget: string;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: "ar", label: "Arabic", nativeLabel: "العربية", googleSttCode: "ar-SA", googleTtsLanguageCode: "ar-XA", googleTtsVoice: "ar-XA-Wavenet-A", llmLanguageName: "Arabic", speechSynthesisLocale: "ar-SA", translateTarget: "ar" },
  { code: "bg", label: "Bulgarian", nativeLabel: "Български", googleSttCode: "bg-BG", googleTtsLanguageCode: "bg-BG", googleTtsVoice: "bg-BG-Standard-A", llmLanguageName: "Bulgarian", speechSynthesisLocale: "bg-BG", translateTarget: "bg" },
  // yue: Use Chirp3-HD-Aoede for premium tier WaveNet-quality.
  { code: "yue", label: "Cantonese", nativeLabel: "廣東話", googleSttCode: "yue-Hant-HK", googleTtsLanguageCode: "yue-HK", googleTtsVoice: "yue-HK-Chirp3-HD-Aoede", llmLanguageName: "Cantonese", speechSynthesisLocale: "yue-HK", translateTarget: "yue" },
  // zh: Use Chirp3-HD-Aoede for premium tier WaveNet-quality.
  { code: "zh", label: "Chinese (Mandarin)", nativeLabel: "中文", googleSttCode: "zh-CN", googleTtsLanguageCode: "cmn-CN", googleTtsVoice: "cmn-CN-Chirp3-HD-Aoede", llmLanguageName: "Simplified Chinese (Mandarin)", speechSynthesisLocale: "zh-CN", translateTarget: "zh-CN" },
  { code: "hr", label: "Croatian", nativeLabel: "Hrvatski", googleSttCode: "hr-HR", googleTtsLanguageCode: "hr-HR", googleTtsVoice: "hr-HR-Standard-A", llmLanguageName: "Croatian", speechSynthesisLocale: "hr-HR", translateTarget: "hr" },
  { code: "cs", label: "Czech", nativeLabel: "Čeština", googleSttCode: "cs-CZ", googleTtsLanguageCode: "cs-CZ", googleTtsVoice: "cs-CZ-Wavenet-A", llmLanguageName: "Czech", speechSynthesisLocale: "cs-CZ", translateTarget: "cs" },
  { code: "da", label: "Danish", nativeLabel: "Dansk", googleSttCode: "da-DK", googleTtsLanguageCode: "da-DK", googleTtsVoice: "da-DK-Wavenet-A", llmLanguageName: "Danish", speechSynthesisLocale: "da-DK", translateTarget: "da" },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands", googleSttCode: "nl-NL", googleTtsLanguageCode: "nl-NL", googleTtsVoice: "nl-NL-Wavenet-A", llmLanguageName: "Dutch", speechSynthesisLocale: "nl-NL", translateTarget: "nl" },
  // en: WaveNet-C = pleasant, natural female voice.
  { code: "en", label: "English", nativeLabel: "English", googleSttCode: "en-US", googleTtsLanguageCode: "en-US", googleTtsVoice: "en-US-Wavenet-C", llmLanguageName: "English", speechSynthesisLocale: "en-US", translateTarget: "en" },
  { code: "fil", label: "Filipino", nativeLabel: "Filipino", googleSttCode: "fil-PH", googleTtsLanguageCode: "fil-PH", googleTtsVoice: "fil-PH-Wavenet-A", llmLanguageName: "Filipino", speechSynthesisLocale: "fil-PH", translateTarget: "fil" },
  { code: "fi", label: "Finnish", nativeLabel: "Suomi", googleSttCode: "fi-FI", googleTtsLanguageCode: "fi-FI", googleTtsVoice: "fi-FI-Wavenet-A", llmLanguageName: "Finnish", speechSynthesisLocale: "fi-FI", translateTarget: "fi" },
  { code: "fr", label: "French", nativeLabel: "Français", googleSttCode: "fr-FR", googleTtsLanguageCode: "fr-FR", googleTtsVoice: "fr-FR-Wavenet-A", llmLanguageName: "French", speechSynthesisLocale: "fr-FR", translateTarget: "fr" },
  { code: "de", label: "German", nativeLabel: "Deutsch", googleSttCode: "de-DE", googleTtsLanguageCode: "de-DE", googleTtsVoice: "de-DE-Wavenet-A", llmLanguageName: "German", speechSynthesisLocale: "de-DE", translateTarget: "de" },
  { code: "el", label: "Greek", nativeLabel: "Ελληνικά", googleSttCode: "el-GR", googleTtsLanguageCode: "el-GR", googleTtsVoice: "el-GR-Wavenet-A", llmLanguageName: "Greek", speechSynthesisLocale: "el-GR", translateTarget: "el" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", googleSttCode: "hi-IN", googleTtsLanguageCode: "hi-IN", googleTtsVoice: "hi-IN-Wavenet-A", llmLanguageName: "Hindi", speechSynthesisLocale: "hi-IN", translateTarget: "hi" },
  { code: "hu", label: "Hungarian", nativeLabel: "Magyar", googleSttCode: "hu-HU", googleTtsLanguageCode: "hu-HU", googleTtsVoice: "hu-HU-Wavenet-A", llmLanguageName: "Hungarian", speechSynthesisLocale: "hu-HU", translateTarget: "hu" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", googleSttCode: "id-ID", googleTtsLanguageCode: "id-ID", googleTtsVoice: "id-ID-Wavenet-A", llmLanguageName: "Indonesian", speechSynthesisLocale: "id-ID", translateTarget: "id" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", googleSttCode: "it-IT", googleTtsLanguageCode: "it-IT", googleTtsVoice: "it-IT-Wavenet-A", llmLanguageName: "Italian", speechSynthesisLocale: "it-IT", translateTarget: "it" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語", googleSttCode: "ja-JP", googleTtsLanguageCode: "ja-JP", googleTtsVoice: "ja-JP-Wavenet-A", llmLanguageName: "Japanese", speechSynthesisLocale: "ja-JP", translateTarget: "ja" },
  { code: "ko", label: "Korean", nativeLabel: "한국어", googleSttCode: "ko-KR", googleTtsLanguageCode: "ko-KR", googleTtsVoice: "ko-KR-Wavenet-A", llmLanguageName: "Korean", speechSynthesisLocale: "ko-KR", translateTarget: "ko" },
  { code: "ms", label: "Malay", nativeLabel: "Bahasa Melayu", googleSttCode: "ms-MY", googleTtsLanguageCode: "ms-MY", googleTtsVoice: "ms-MY-Wavenet-A", llmLanguageName: "Malay", speechSynthesisLocale: "ms-MY", translateTarget: "ms" },
  { code: "nb", label: "Norwegian", nativeLabel: "Norsk", googleSttCode: "nb-NO", googleTtsLanguageCode: "nb-NO", googleTtsVoice: "nb-NO-Wavenet-A", llmLanguageName: "Norwegian", speechSynthesisLocale: "nb-NO", translateTarget: "no" },
  { code: "pl", label: "Polish", nativeLabel: "Polski", googleSttCode: "pl-PL", googleTtsLanguageCode: "pl-PL", googleTtsVoice: "pl-PL-Wavenet-A", llmLanguageName: "Polish", speechSynthesisLocale: "pl-PL", translateTarget: "pl" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", googleSttCode: "pt-PT", googleTtsLanguageCode: "pt-PT", googleTtsVoice: "pt-PT-Wavenet-A", llmLanguageName: "Portuguese", speechSynthesisLocale: "pt-PT", translateTarget: "pt" },
  { code: "pt-BR", label: "Portuguese (Brazil)", nativeLabel: "Português (Brasil)", googleSttCode: "pt-BR", googleTtsLanguageCode: "pt-BR", googleTtsVoice: "pt-BR-Wavenet-A", llmLanguageName: "Brazilian Portuguese", speechSynthesisLocale: "pt-BR", translateTarget: "pt" },
  { code: "ro", label: "Romanian", nativeLabel: "Română", googleSttCode: "ro-RO", googleTtsLanguageCode: "ro-RO", googleTtsVoice: "ro-RO-Wavenet-A", llmLanguageName: "Romanian", speechSynthesisLocale: "ro-RO", translateTarget: "ro" },
  { code: "ru", label: "Russian", nativeLabel: "Русский", googleSttCode: "ru-RU", googleTtsLanguageCode: "ru-RU", googleTtsVoice: "ru-RU-Wavenet-A", llmLanguageName: "Russian", speechSynthesisLocale: "ru-RU", translateTarget: "ru" },
  { code: "sk", label: "Slovak", nativeLabel: "Slovenčina", googleSttCode: "sk-SK", googleTtsLanguageCode: "sk-SK", googleTtsVoice: "sk-SK-Standard-A", llmLanguageName: "Slovak", speechSynthesisLocale: "sk-SK", translateTarget: "sk" },
  { code: "es", label: "Spanish", nativeLabel: "Español", googleSttCode: "es-ES", googleTtsLanguageCode: "es-ES", googleTtsVoice: "es-ES-Wavenet-B", llmLanguageName: "Spanish", speechSynthesisLocale: "es-ES", translateTarget: "es" },
  { code: "sv", label: "Swedish", nativeLabel: "Svenska", googleSttCode: "sv-SE", googleTtsLanguageCode: "sv-SE", googleTtsVoice: "sv-SE-Wavenet-A", llmLanguageName: "Swedish", speechSynthesisLocale: "sv-SE", translateTarget: "sv" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", googleSttCode: "ta-IN", googleTtsLanguageCode: "ta-IN", googleTtsVoice: "ta-IN-Wavenet-A", llmLanguageName: "Tamil", speechSynthesisLocale: "ta-IN", translateTarget: "ta" },
  { code: "th", label: "Thai", nativeLabel: "ไทย", googleSttCode: "th-TH", googleTtsLanguageCode: "th-TH", googleTtsVoice: "th-TH-Neural2-C", llmLanguageName: "Thai", speechSynthesisLocale: "th-TH", translateTarget: "th" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe", googleSttCode: "tr-TR", googleTtsLanguageCode: "tr-TR", googleTtsVoice: "tr-TR-Wavenet-A", llmLanguageName: "Turkish", speechSynthesisLocale: "tr-TR", translateTarget: "tr" },
  { code: "uk", label: "Ukrainian", nativeLabel: "Українська", googleSttCode: "uk-UA", googleTtsLanguageCode: "uk-UA", googleTtsVoice: "uk-UA-Wavenet-A", llmLanguageName: "Ukrainian", speechSynthesisLocale: "uk-UA", translateTarget: "uk" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt", googleSttCode: "vi-VN", googleTtsLanguageCode: "vi-VN", googleTtsVoice: "vi-VN-Wavenet-A", llmLanguageName: "Vietnamese", speechSynthesisLocale: "vi-VN", translateTarget: "vi" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export type AppLocale = LanguageCode;

const LANGUAGE_BY_CODE = new Map<string, SupportedLanguage>(
  SUPPORTED_LANGUAGES.map((lang) => [lang.code.toLowerCase(), lang]),
);

/** Interview language picker options */
export const LANGUAGES = SUPPORTED_LANGUAGES.map((lang) => ({
  value: lang.code,
  label:
    lang.nativeLabel !== lang.label
      ? `${lang.label} (${lang.nativeLabel})`
      : lang.label,
}));

export const APP_LOCALE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as AppLocale[];

const LANGUAGE_ALIASES: Record<string, string> = {
  "zh-cn": "zh",
  "zh-tw": "zh",
  chinese: "zh",
  mandarin: "zh",
  cantonese: "yue",
  "zh-hk": "yue",
  /** Legacy / picker code: treat Korean locale as Cantonese (same TTS/STT as yue). */
  ko: "yue",
  "ko-kr": "yue",
  "pt-br": "pt-BR",
  "pt_br": "pt-BR",
  no: "nb",
  "no-no": "nb",
  fil: "fil",
  tl: "fil",
  tagalog: "fil",
};

export function resolveLanguage(language?: string | null): SupportedLanguage {
  if (!language?.trim()) return LANGUAGE_BY_CODE.get("en")!;
  const raw = language.trim();
  const alias = LANGUAGE_ALIASES[raw.toLowerCase()];
  if (alias) return LANGUAGE_BY_CODE.get(alias.toLowerCase())!;
  const direct = LANGUAGE_BY_CODE.get(raw.toLowerCase());
  if (direct) return direct;
  const prefix = raw.toLowerCase().slice(0, 2);
  return LANGUAGE_BY_CODE.get(prefix) ?? LANGUAGE_BY_CODE.get("en")!;
}

export function getGoogleSttCode(language?: string | null): string {
  return resolveLanguage(language).googleSttCode;
}

export function getGoogleTtsConfig(language?: string | null): {
  languageCode: string;
  voiceName: string;
} {
  const lang = resolveLanguage(language);
  return {
    languageCode: lang.googleTtsLanguageCode,
    voiceName: lang.googleTtsVoice,
  };
}

export function getLlmLanguageName(language?: string | null): string {
  return resolveLanguage(language).llmLanguageName;
}

export function getSpeechSynthesisLocale(language?: string | null): string {
  return resolveLanguage(language).speechSynthesisLocale;
}

export function getLanguageDisplayName(language?: string | null): string {
  const lang = resolveLanguage(language);
  return `${lang.nativeLabel} (${lang.label})`;
}

export function isSupportedLanguageCode(code: string): boolean {
  return LANGUAGE_BY_CODE.has(code.toLowerCase());
}

export function resolveAppLocale(value?: string | null): AppLocale {
  const lang = resolveLanguage(value);
  return lang.code as AppLocale;
}

/** Realtime avatar and voice-only support live language switching; pregenerated video does not. */
export function interviewAllowsCandidateLanguageChoice(interview: {
  is_voice_only?: boolean | null;
  isVoiceOnly?: boolean | null;
}): boolean {
  return !(interview.is_voice_only ?? interview.isVoiceOnly ?? false);
}

/** Voice-only coaching (presenter avatar off) can switch TTS/chat language live; generated avatar videos cannot. */
export function trainingAllowsCandidateLanguageChoice(training: {
  avatarMode?: string | null;
}): boolean {
  return (training.avatarMode ?? "vidu") === "none";
}

/** Session language wins when set; otherwise the interview/training template language. */
export function resolveSessionLanguage(
  sessionLanguage?: string | null,
  interviewLanguage?: string | null,
): string {
  return resolveLanguage(sessionLanguage || interviewLanguage).code;
}

/** Mic test prompt spoken in the interview language */
export function getMicTestMessage(language?: string | null): string {
  const lang = resolveLanguage(language);
  const micTestMessages: Record<string, string> = {
    en: "Hello! If you can hear my voice clearly, please say yes or confirm.",
    zh: "你好！如果你能清楚地听到我的声音，请说「是」或「确认」。",
    es: "¡Hola! Si puedes escuchar mi voz claramente, por favor di sí o confirma.",
    fr: "Bonjour ! Si vous entendez ma voix clairement, veuillez dire oui ou confirmer.",
    de: "Hallo! Wenn Sie meine Stimme klar hören können, sagen Sie bitte ja oder bestätigen Sie.",
    pt: "Olá! Se consegue ouvir a minha voz claramente, por favor diga sim ou confirme.",
    "pt-BR": "Olá! Se você consegue ouvir minha voz claramente, por favor diga sim ou confirme.",
    it: "Ciao! Se riesci a sentire chiaramente la mia voce, per favore di' sì o conferma.",
    ja: "こんにちは！私の声がはっきり聞こえたら、「はい」または「確認」と言ってください。",
    ko: "안녕하세요! 제 목소리가 잘 들리면 '네' 또는 '확인'이라고 말해 주세요.",
    ru: "Здравствуйте! Если вы чётко слышите мой голос, скажите «да» или «подтверждаю».",
    ar: "مرحبًا! إذا كنت تسمع صوتي بوضوح، يرجى قول نعم أو تأكيد.",
    hi: "नमस्ते! अगर आप मेरी आवाज़ साफ़ सुन सकते हैं, तो कृपया हाँ कहें या पुष्टि करें।",
    nl: "Hallo! Als u mijn stem duidelijk kunt horen, zeg dan alstublieft ja of bevestig.",
    tr: "Merhaba! Sesimi net duyabiliyorsanız, lütfen evet deyin veya onaylayın.",
    pl: "Cześć! Jeśli słyszysz wyraźnie mój głos, powiedz tak lub potwierdź.",
    sv: "Hej! Om du hör min röst tydligt, vänligen säg ja eller bekräfta.",
    da: "Hej! Hvis du kan høre min stemme tydeligt, så sig venligst ja eller bekræft.",
    fi: "Hei! Jos kuulet ääneni selvästi, sano kyllä tai vahvista.",
    nb: "Hei! Hvis du kan høre stemmen min tydelig, vennligst si ja eller bekreft.",
    ta: "வணக்கம்! என் குரல் தெளிவாகக் கேட்டால், தயவுசெய்து ஆம் என்று சொல்லுங்கள் அல்லது உறுதிப்படுத்துங்கள்.",
    th: "สวัสดี! หากคุณได้ยินเสียงของฉันชัดเจน กรุณาพูดว่าใช่หรือยืนยัน",
    vi: "Xin chào! Nếu bạn nghe rõ giọng nói của tôi, hãy nói có hoặc xác nhận.",
    id: "Halo! Jika Anda dapat mendengar suara saya dengan jelas, silakan katakan ya atau konfirmasi.",
    ms: "Hello! Jika anda dapat mendengar suara saya dengan jelas, sila sebut ya atau sahkan.",
    uk: "Привіт! Якщо ви чітко чуєте мій голос, будь ласка, скажіть «так» або «підтверджую».",
    el: "Γεια σας! Αν ακούτε τη φωνή μου καθαρά, παρακαλώ πείτε ναι ή επιβεβαιώστε.",
    cs: "Ahoj! Pokud slyšíte můj hlas zřetelně, řekněte prosím ano nebo potvrďte.",
    ro: "Bună! Dacă auziți vocea mea clar, vă rog spuneți da sau confirmați.",
    hu: "Helló! Ha tisztán hallja a hangomat, kérem mondja, hogy igen, vagy erősítse meg.",
    bg: "Здравейте! Ако чувате гласа ми ясно, моля кажете да или потвърдете.",
    hr: "Bok! Ako jasno čujete moj glas, molim recite da ili potvrdite.",
    sk: "Ahoj! Ak počujete môj hlas zreteľne, povedzte prosím áno alebo potvrďte.",
    yue: "你好！如果你聽得清楚我嘅聲音，請講「係」或者「確認」。",
    fil: "Hello! Kung naririnig mo nang malinaw ang boses ko, pakisabi na oo o kumpirmahin.",
  };
  return micTestMessages[lang.code] ?? micTestMessages["en"]!;
}
