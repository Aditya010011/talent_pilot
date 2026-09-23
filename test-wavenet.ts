import textToSpeech from "@google-cloud/text-to-speech";
import path from "path";
const GOOGLE_KEY_FILENAME = path.join(process.cwd(), "single-quanta-461104-i7-af0effe9cc10.json");

async function main() {
  const client = new textToSpeech.TextToSpeechClient({ keyFilename: GOOGLE_KEY_FILENAME });
  try {
    const [response] = await client.synthesizeSpeech({
      input: { text: "你好" },
      voice: { languageCode: "yue-HK", name: "yue-HK-Wavenet-A" },
      audioConfig: { audioEncoding: "MP3" },
    });
    console.log("Success with yue-HK-Wavenet-A!");
  } catch (err: any) {
    console.error("Failed to synthesize:", err.message);
  }
}
main();
