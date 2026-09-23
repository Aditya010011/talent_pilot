/**
 * Shared candidate clarification / substantive-answer detection.
 * Used by the voice relay (advance guards) and the client (UI advance guards).
 */

const USER_END_PATTERNS = [
  /(?:please|let'?s|I\s+want\s+to|can\s+we)\s+end(?:\s+(?:the\s+)?interview)?/i,
  /(?:end|finish|stop|terminate)\s+(?:the\s+)?interview/i,
  /I'?m\s+done(?:\s+(?:with\s+(?:the\s+)?interview|here))?/i,
  /that'?s\s+(?:all|it|everything)\b/i,
  /(?:结束面试|结束吧|我(?:答|做)完了|就这样吧|面试结束)/,
];

const USER_SKIP_PATTERNS = [
  /(?:let'?s|please|can\s+(?:we|you))\s+(?:move\s+on|skip|proceed|go\s+to\s+(?:the\s+)?next)/i,
  /move\s+on(?:\s+to)?/i,
  /continue\s+to\s+(?:the\s+)?next/i,
  /go\s+(?:on\s+)?to\s+(?:the\s+)?next/i,
  /(?:please|let'?s)\s+end(?:\s+(?:this|here|now))?\.?$/i,
  /skip\s+(?:this|the)\s+(?:question|one|problem)/i,
  /I\s+(?:give\s+up|want\s+to\s+skip|'?d\s+like\s+to\s+skip)/i,
  /next\s+question/i,
  /please\s+(?:move\s+on|skip)/i,
  /(?:跳过|下一(?:个问题|题)|不做了|放弃了?|结束吧|请继续(?:下一|到下))/,
  /(?:我不会|不想做了|不想答了|过吧|换下一)/,
];

function isUserEndRequestLocal(text: string): boolean {
  return USER_END_PATTERNS.some((pattern) => pattern.test(text));
}

function isUserSkipRequestLocal(text: string): boolean {
  if (isUserEndRequestLocal(text)) return false;
  return USER_SKIP_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Candidate-driven clarifications / meta requests (repeat, "what do you mean?",
 * audio checks). These must get a helpful reply on the CURRENT question and must
 * NOT advance the interview or count as a substantive answer.
 *
 * Patterns are intentionally broad; remaining-word budget filters out real answers
 * that merely contain a word like "repeat".
 */
const CANDIDATE_CLARIFICATION_PATTERNS = [
  // Audio / presence checks
  /\b(can you hear me|do you hear me|am i audible|can you hear)\b/i,
  /\b(are you there)\b/i,
  /\b(?:test(?:ing)?\s+(?:audio|mic|microphone))\b/i,
  /^(?:hello|hi|hey)(?:\s+there)?[.!?]*$/i,

  // Repeat / couldn't hear (broad — remaining-word check keeps real answers out)
  /\brepeat\b/i,
  /\b(?:please\s+)?(?:can|could|would)\s+you\s+(?:please\s+)?(?:say|ask|read|tell)\b.*\bagain\b/i,
  /\b(?:say|ask|read|tell)\s+(?:that|it|the\s+(?:question|last\s+question)|this)\s+again\b/i,
  /\bsay\s+again\b/i,
  /\b(?:one\s+more\s+time|again\s+please|come\s+again)\b/i,
  /^(?:uh\s+|um\s+|so\s+|well\s+)?(?:again)[.!?]*$/i,
  /\bwhat\s+(?:was|is)\s+(?:the\s+)?(?:question|that)\b/i,
  /\bwhat\s+did\s+you\s+(?:ask|say)\b/i,
  /\b(?:i\s+)?(?:didn'?t|couldn'?t|did\s+not|could\s+not)\s+(?:quite\s+)?(?:hear|catch|get|understand)\b/i,
  /\b(?:i\s+)?missed\s+(?:that|it|the\s+question)\b/i,
  /\b(?:pardon|sorry|huh|what)[.!?]*$/i,

  // Meaning / clarification
  /\bwhat\s+do\s+you\s+mean\b/i,
  /\bwhat\s+does\s+that\s+mean\b/i,
  /\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:clarify|explain|rephrase|restate)\b/i,
  /\bi\s+don'?t\s+understand\b/i,
  /\b(?:not\s+sure|unclear)\s+what\s+you\s+(?:mean|asked|are\s+asking)\b/i,
  /\b(?:can|could)\s+you\s+(?:please\s+)?(?:go\s+over|run\s+through)\s+(?:that|it|the\s+question)\b/i,

  // Chinese
  /(?:听不清|没听清|没听懂|再说一遍|再说一次|重复一下|重复问题|重复一下问题|什么意思|能再说|请重复|听不到|再问一次|再读一遍|没听清楚)/,
];

const MAX_CLARIFICATION_WORDS = 22;
const MAX_CLARIFICATION_REMAINING_WORDS = 8;

function stripClarificationPhrases(text: string): string {
  let stripped = text;
  for (const pattern of CANDIDATE_CLARIFICATION_PATTERNS) {
    const re = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    stripped = stripped.replace(re, " ");
  }
  return stripped;
}

function countWords(text: string): number {
  return text
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** True when the utterance is primarily a repeat/clarify/meta request. */
export function isCandidateClarificationUtterance(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (isUserSkipRequestLocal(normalized) || isUserEndRequestLocal(normalized)) return false;

  const wordCount = countWords(normalized);
  if (wordCount === 0 || wordCount > MAX_CLARIFICATION_WORDS) return false;

  const matched = CANDIDATE_CLARIFICATION_PATTERNS.some((pattern) => pattern.test(normalized));
  if (!matched) return false;

  const remaining = countWords(stripClarificationPhrases(normalized));
  return remaining <= MAX_CLARIFICATION_REMAINING_WORDS;
}

export function isSubstantiveInterviewAnswer(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (isCandidateClarificationUtterance(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  if (/^(ok|okay|yes|no|sure|thanks|thank you)[.!?]*$/i.test(normalized)) return false;
  return true;
}
