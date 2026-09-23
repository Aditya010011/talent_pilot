import { getProvider } from "@/lib/ai/registry";
import { stripThinking } from "@/lib/ai/strip-thinking";
import { getLlmLanguageName, resolveLanguage } from "@/lib/languages";

type LocalizableQuestion = {
  id?: string;
  text: string;
  description?: string | null;
  options?: unknown;
};

type LocalizedQuestion = {
  id?: string;
  text: string;
  description?: string | null;
  options?: unknown;
};

const translationCache = new Map<string, LocalizedQuestion>();

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = stripThinking(text).trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || cleaned;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function cacheKeyForQuestion(
  sessionId: string,
  targetLanguage: string,
  question: LocalizableQuestion,
): string {
  return [
    sessionId,
    targetLanguage,
    question.id || "",
    question.text || "",
    question.description || "",
    stableStringify(question.options),
  ].join("::");
}

async function translateQuestion(
  question: LocalizableQuestion,
  targetLanguage: string,
): Promise<LocalizedQuestion> {
  const lang = resolveLanguage(targetLanguage);
  const langName = getLlmLanguageName(lang.code);
  const provider = getProvider();

  const inputPayload = {
    text: question.text || "",
    description: question.description ?? null,
    options: question.options ?? null,
  };

  const cantoneseWarning =
    lang.code === "yue"
      ? " IMPORTANT: This is Cantonese (廣東話), NOT Mandarin (普通話). Use natural Hong Kong Cantonese in traditional Chinese."
      : "";

  const result = await provider.generateResponse({
    messages: [
      {
        role: "system",
        content:
          `Translate all provided interview content to ${langName}. ` +
          `Write in the native script of ${langName}; do not leave English, and do not transliterate into Latin letters unless the target language is English.${cantoneseWarning} ` +
          "Return valid JSON only with this exact schema: " +
          '{"text":"string","description":"string|null","options":any}. ' +
          "Preserve structure and semantics. Do not add explanations.",
      },
      { role: "user", content: JSON.stringify(inputPayload) },
    ],
    temperature: 0.1,
    maxTokens: 1200,
  });

  const parsed = parseJsonObject(result.content);
  if (!parsed) {
    return {
      id: question.id,
      text: question.text,
      description: question.description ?? null,
      options: question.options ?? null,
    };
  }

  return {
    id: question.id,
    text: typeof parsed.text === "string" && parsed.text.trim() ? parsed.text.trim() : question.text,
    description:
      typeof parsed.description === "string"
        ? parsed.description
        : question.description ?? null,
    options: Object.prototype.hasOwnProperty.call(parsed, "options")
      ? parsed.options
      : (question.options ?? null),
  };
}

export async function localizeInterviewQuestions(params: {
  sessionId: string;
  multilingualEnabled?: boolean | null;
  interviewLanguage?: string | null;
  sessionLanguage?: string | null;
  questions: LocalizableQuestion[];
}): Promise<LocalizedQuestion[]> {
  const {
    sessionId,
    multilingualEnabled,
    interviewLanguage,
    sessionLanguage,
    questions,
  } = params;

  const source = resolveLanguage(interviewLanguage).code;
  const target = resolveLanguage(sessionLanguage || interviewLanguage).code;
  if (!multilingualEnabled || target === source) {
    return questions.map((q) => ({
      id: q.id,
      text: q.text,
      description: q.description ?? null,
      options: q.options ?? null,
    }));
  }

  const localized = await Promise.all(
    questions.map(async (question) => {
      const key = cacheKeyForQuestion(sessionId, target, question);
      const cached = translationCache.get(key);
      if (cached) return cached;
      const translated = await translateQuestion(question, target);
      translationCache.set(key, translated);
      return translated;
    }),
  );

  return localized;
}
