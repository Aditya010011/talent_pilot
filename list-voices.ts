import textToSpeech from "@google-cloud/text-to-speech";
import path from "path";
const GOOGLE_KEY_FILENAME = path.join(process.cwd(), "single-quanta-461104-i7-af0effe9cc10.json");

async function main() {
  const client = new textToSpeech.TextToSpeechClient({ keyFilename: GOOGLE_KEY_FILENAME });
  const [result] = await client.listVoices({});
  const voices = result.voices || [];
  
  const yueVoices = voices.filter(v => v.languageCodes?.some(code => code.includes("yue")));
  console.log("yue:", yueVoices.map(v => v.name).join(", "));
  
  const cmnVoices = voices.filter(v => v.languageCodes?.some(code => code.includes("cmn")));
  console.log("cmn:", cmnVoices.map(v => v.name).join(", "));
}
main().catch(console.error);
