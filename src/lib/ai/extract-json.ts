import { createLogger } from "@/lib/logger";

const log = createLogger("ai/extract-json");

/**
 * Robustly extract and parse a JSON object from an AI response string.
 *
 * Handles common issues:
 * - Unicode smart / curly quotes (U+201C, U+201D, etc.) → standard ASCII `"`
 * - JSON wrapped inside markdown code blocks (```json ... ```)
 * - Stray control characters
 * - Unescaped newlines and quotes inside string values
 */
export function extractJson<T = Record<string, unknown>>(raw: string): T {
  // 1. Normalise smart / curly quotes to ASCII equivalents
  let text = raw
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // double
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"); // single

  // 2. If the response is wrapped in a markdown code block, extract the inner content
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) {
    text = codeBlock[1].trim();
  }

  // 3. Extract the outermost JSON object or array (even if truncated without a closing bracket)
  const jsonMatch = text.match(/[\{\[][\s\S]*/);
  if (!jsonMatch) {
    throw new Error("No JSON object or array found in AI response");
  }

  let jsonStr = jsonMatch[0];

  // Fix invalid JSON numbers like "points": +5
  jsonStr = jsonStr.replace(/:\s*\+(\d+(?:\.\d+)?)/g, ": $1");

  // 4. Try parsing directly
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // 5. Fallback: sanitise common issues
    jsonStr = sanitiseJsonString(jsonStr);
    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      // 6. Strip literal ellipsis tokens models often copy from prompts
      const withoutEllipsis = jsonStr
        .replace(/,\s*\.\.\.\s*(?=[,\]])/g, "")
        .replace(/\.\.\.\s*(?=[,\]])/g, "");
      try {
        return JSON.parse(withoutEllipsis) as T;
      } catch {
        // 7. Attempt simple truncated-JSON repair (close open strings/brackets)
        const repaired = repairTruncatedJson(withoutEllipsis);
        try {
          return JSON.parse(repaired) as T;
        } catch (e) {
          log.error(
            "Failed to parse after sanitisation. First 500 chars:",
            jsonStr.slice(0, 500),
          );
          throw e;
        }
      }
    }
  }
}

/**
 * Best-effort repair for truncated JSON: close an open string if needed,
 * drop a trailing incomplete value/comma, then close open braces/brackets.
 */
function repairTruncatedJson(raw: string): string {
  let s = raw.trim();
  // Remove trailing commas before closing or end
  s = s.replace(/,\s*$/, "");

  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    }
  }

  if (inString) {
    // Drop incomplete trailing string content after last comma/colon if huge,
    // otherwise just close the string.
    s += '"';
  }

  // Drop dangling comma left after string close / truncation
  s = s.replace(/,\s*$/, "");

  // If we end mid-key or mid-value (e.g. `"foo": `), strip back to last complete element
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*$/, "");
  s = s.replace(/:\s*$/, "");
  s = s.replace(/,\s*$/, "");

  // Recompute stack after cleanup
  inString = false;
  escape = false;
  stack.length = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if (ch === "}" || ch === "]") {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
    }
  }

  if (inString) s += '"';
  s = s.replace(/,\s*$/, "");
  while (stack.length) s += stack.pop();
  return s;
}

/**
 * Walk through the raw JSON character-by-character, escaping unescaped
 * control characters and quotes that appear inside string values.
 */
function sanitiseJsonString(raw: string): string {
  // Strip invisible / non-printable control chars outside of strings (keep \n \r \t)
  const input = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  const out: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (ch === '"') {
      // Start of a JSON string – walk until we find the real closing quote
      out.push('"');
      i++;
      const strChars: string[] = [];
      while (i < len) {
        const sc = input[i];
        if (sc === "\\") {
          // Keep existing escape sequences
          strChars.push(sc);
          i++;
          if (i < len) {
            strChars.push(input[i]);
            i++;
          }
        } else if (sc === '"') {
          // Is this the real end of the string, or an unescaped interior quote?
          // Peek ahead: if the next non-whitespace char is one of : , ] } or it's
          // immediately followed by , ] } : then it's likely the real closing quote.
          const after = input.slice(i + 1).match(/^\s*(.)/);
          const nextSignificant = after ? after[1] : "";
          if (
            nextSignificant === "," ||
            nextSignificant === "}" ||
            nextSignificant === "]" ||
            nextSignificant === ":" ||
            nextSignificant === ""
          ) {
            // Real closing quote
            break;
          } else {
            // Interior unescaped quote – escape it
            strChars.push('\\"');
            i++;
          }
        } else if (sc === "\n") {
          strChars.push("\\n");
          i++;
        } else if (sc === "\r") {
          strChars.push("\\r");
          i++;
        } else if (sc === "\t") {
          strChars.push("\\t");
          i++;
        } else {
          strChars.push(sc);
          i++;
        }
      }
      out.push(strChars.join(""));
      out.push('"');
      i++; // skip the closing quote
    } else {
      out.push(ch);
      i++;
    }
  }

  return out.join("");
}
