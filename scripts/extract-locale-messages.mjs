/**
 * Extract en/zh translation objects from app-locale-provider.tsx into JSON files.
 * Usage: node scripts/extract-locale-messages.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const providerPath = path.join(root, "src/components/app-locale-provider.tsx");
const outDir = path.join(root, "src/messages");

const source = fs.readFileSync(providerPath, "utf8");

function extractLocaleBlock(locale, existing) {
  const marker = `${locale}Messages: Record<string, string> = {`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${locale} block`);
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  const openBrace = source.indexOf("{", start + marker.length - 1);
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const block = source.slice(openBrace, i + 1);
        // eslint-disable-next-line no-new-func
        return Function(locale, `"use strict"; return (${block});`)(existing);
      }
    }
  }
  throw new Error(`Unterminated block for ${locale}`);
}

fs.mkdirSync(outDir, { recursive: true });

const existingEn = JSON.parse(fs.readFileSync(path.join(outDir, "en.json"), "utf8"));
const existingZh = JSON.parse(fs.readFileSync(path.join(outDir, "zh.json"), "utf8"));
const existingMap = { en: existingEn, zh: existingZh };

for (const locale of ["en", "zh"]) {
  const messages = extractLocaleBlock(locale, existingMap[locale]);
  const outPath = path.join(outDir, `${locale}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(messages, null, 2)}\n`);
  console.log(`Wrote ${outPath} (${Object.keys(messages).length} keys)`);
}
