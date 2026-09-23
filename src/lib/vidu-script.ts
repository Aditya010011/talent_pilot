/**
 * Shared Vidu Premium interview script — same strings are shown on screen
 * and embedded in the Vidu Live persona (must be spoken verbatim).
 */

export function buildViduVerbatimLines(params: {
  aiName?: string;
  participantName?: string | null;
  questions: Array<{ text: string }>;
}): string[] {
  const name = params.aiName?.trim() || "Inluwa";
  const questions = params.questions.map((q) => q.text.trim()).filter(Boolean);
  const lines: string[] = [];
  if (questions.length === 0) {
    lines.push(`Hello. I'm ${name}, your interviewer for today.`);
  } else {
    lines.push(
      `Hello. I'm ${name}, your interviewer for today. To get us started, ${questions[0]}`,
    );
    for (let i = 1; i < questions.length; i++) {
      lines.push(`Thank you. ${questions[i]}`);
    }
  }
  lines.push("Thank you for your time. That wraps up our interview. Goodbye.");
  return lines;
}
