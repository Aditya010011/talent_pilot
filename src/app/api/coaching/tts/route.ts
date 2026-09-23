import { NextResponse } from "next/server";
import textToSpeech from "@google-cloud/text-to-speech";
import path from "path";
import { getGoogleTtsConfig } from "@/lib/languages";

const GOOGLE_KEY_FILENAME =
  process.env.GOOGLE_TTS_KEY_FILE ||
  path.join(process.cwd(), "single-quanta-461104-i7-af0effe9cc10.json");

let ttsClient: InstanceType<typeof textToSpeech.TextToSpeechClient> | null = null;
function getTtsClient() {
  if (!ttsClient) {
    ttsClient = new textToSpeech.TextToSpeechClient({
      keyFilename: GOOGLE_KEY_FILENAME,
    });
  }
  return ttsClient;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, language, voice } = body;

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const { languageCode } = getGoogleTtsConfig(language);
    const client = getTtsClient();

    // Determine target gender from avatarVoice (e.g. "Zephyr (Female)")
    const voiceStr = String(voice || "").toLowerCase();
    const isMale = voiceStr.includes("male");
    const targetGender = isMale ? "MALE" : "FEMALE";

    // Query voices for the language
    const [result] = await client.listVoices({ languageCode });
    const voices = result.voices || [];

    // Filter by language prefix and gender
    const matchedVoices = voices.filter((v) => {
      const supportsLang = v.languageCodes?.some((c) => c.toLowerCase().startsWith(languageCode.toLowerCase().slice(0, 2)));
      const matchesGender = v.ssmlGender === targetGender;
      return supportsLang && matchesGender;
    });

    // Sort by quality: Neural2 > Wavenet/Neural > Standard
    matchedVoices.sort((a, b) => {
      const getPriority = (name: string) => {
        if (name.includes("Neural2")) return 1;
        if (name.includes("Wavenet") || name.includes("Neural")) return 2;
        if (name.includes("Standard")) return 3;
        return 4;
      };
      return getPriority(a.name || "") - getPriority(b.name || "");
    });

    // Fallback if no matching voice found
    const selectedVoice = matchedVoices[0]?.name || getGoogleTtsConfig(language).voiceName;

    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode,
        name: selectedVoice,
      },
      audioConfig: {
        audioEncoding: "MP3" as const,
        speakingRate: 0.95,
      },
    });

    if (!response.audioContent) {
      throw new Error("No audio content returned from Google TTS");
    }

    return new Response(response.audioContent as any, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": (response.audioContent as Uint8Array).length.toString(),
      },
    });
  } catch (error: any) {
    console.error("Error generating TTS:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate TTS" },
      { status: 500 }
    );
  }
}
