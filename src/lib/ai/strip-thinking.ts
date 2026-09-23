/**
 * Strip chain-of-thought / reasoning preambles from model output
 * (Nemotron, MiniMax <think>, "Here's a thinking process:", etc.).
 */
export function stripThinking(text: string): string {
  if (!text) return "";

  let out = text.replace(/\r\n/g, "\n");

  out = out.replace(/<think\b[^>]*>[\s\S]*?<\/think>\s*/gi, "");
  out = out.replace(/<\/?think\b[^>]*>/gi, "");

  const header =
    /^(?:here'?s\s+a\s+thinking\s+process|thinking\s+process|chain[-\s]?of[-\s]?thought|reasoning\s+process|reasoning|thinking)\s*:?\s*\n+/i;
  if (header.test(out.trimStart())) {
    out = out.trimStart().replace(header, "");
    const lines = out.split("\n");
    let start = 0;
    while (start < lines.length) {
      const raw = lines[start];
      const line = raw.trim();
      if (line === "") {
        start++;
        continue;
      }
      const looksLikeThinking =
        /^\d+\.\s/.test(line) ||
        /^[-*•]\s/.test(line) ||
        /^(analyze|identify|consider|evaluate|user input|the (user|question|request)|key (points|concepts)|step\s+\d)/i.test(
          line,
        );
      const indentedContinuation =
        start > 0 && (raw.startsWith("  ") || raw.startsWith("\t") || raw.startsWith("    "));
      if (looksLikeThinking || indentedContinuation) {
        start++;
        continue;
      }
      break;
    }
    out = lines.slice(start).join("\n");
  }

  return out.trim();
}
