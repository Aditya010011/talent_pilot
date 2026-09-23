/**
 * Generate UI locale JSON files from src/messages/en.json using Gemini Flash.
 * Requires GOOGLE_API_KEY in .env.local
 *
 * Usage: node scripts/generate-locale-messages.mjs
 *        node scripts/generate-locale-messages.mjs ar de fr
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
config({ path: path.join(root, ".env.local"), override: true });
config({ path: path.join(root, ".env") });

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const MODEL =
  process.env.GEMINI_FLASH_MODEL ||
  process.env.RESUME_MODEL ||
  "gemini-3.5-flash";

// ── Azure OpenAI (DISABLED — Gemini migration) ────────────────────────────
// const API_KEY = process.env.OPENAI_API_KEY;
// const AZURE_ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
// const DEPLOYMENT =
//   process.env.AZURE_OPENAI_DEPLOYMENT_CHAT ||
//   process.env.AZURE_OPENAI_DEPLOYMENT ||
//   "gpt-4o-mini";
// if (!API_KEY || !AZURE_ENDPOINT) {
//   console.error("Missing OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT");
//   process.exit(1);
// }
// const openai = new OpenAI({
//   apiKey: API_KEY,
//   baseURL: `${AZURE_ENDPOINT}/openai/deployments/${DEPLOYMENT}`,
//   defaultQuery: { "api-version": "2024-10-01-preview" },
//   defaultHeaders: { "api-key": API_KEY },
// });

if (!GOOGLE_API_KEY) {
  console.error("Missing GOOGLE_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: GOOGLE_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});
const DEPLOYMENT = MODEL;

const messagesDir = path.join(root, "src/messages");
const en = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf8"));
const keys = Object.keys(en);

const TARGETS = [
  { code: "ar", name: "Arabic" },
  { code: "bg", name: "Bulgarian" },
  { code: "yue", name: "Cantonese" },
  { code: "zh", name: "Simplified Chinese" },
  { code: "hr", name: "Croatian" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "nl", name: "Dutch" },
  { code: "fil", name: "Filipino" },
  { code: "fi", name: "Finnish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ms", name: "Malay" },
  { code: "nb", name: "Norwegian" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "pt-BR", name: "Brazilian Portuguese" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "sk", name: "Slovak" },
  { code: "es", name: "Spanish" },
  { code: "sv", name: "Swedish" },
  { code: "ta", name: "Tamil" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "vi", name: "Vietnamese" },
];

const requested = process.argv.slice(2);
const targets = requested.length
  ? TARGETS.filter((t) => requested.includes(t.code))
  : TARGETS;

async function translateChunk(entries, languageName) {
  const payload = Object.fromEntries(entries);
  const response = await openai.chat.completions.create({
    model: DEPLOYMENT,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You translate UI strings for a web application. Return only valid JSON with the same keys as the input. Translate values naturally for the target language. Keep placeholders like {name} unchanged.",
      },
      {
        role: "user",
        content: `Translate these UI strings to ${languageName}:\n${JSON.stringify(payload)}`,
      },
    ],
  });
  const text = response.choices[0]?.message?.content || "{}";
  return JSON.parse(text);
}

async function translateLocale({ code, name }) {
  const outPath = path.join(messagesDir, `${code}.json`);
  if (code === "zh" && fs.existsSync(outPath)) {
    console.log(`Skipping ${code} (hand-tuned file exists)`);
    return;
  }

  console.log(`Translating ${code} (${name})...`);
  const out = {};
  const chunkSize = 40;

  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunkKeys = keys.slice(i, i + chunkSize);
    const entries = chunkKeys.map((k) => [k, en[k]]);
    const translated = await translateChunk(entries, name);
    for (const k of chunkKeys) {
      out[k] = translated[k] ?? en[k];
    }
    process.stdout.write(`  ${Math.min(i + chunkSize, keys.length)}/${keys.length}\r`);
  }

  console.log(`  ${keys.length}/${keys.length} — writing ${outPath}`);
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
}

for (const target of targets) {
  await translateLocale(target);
}

console.log("Done.");
