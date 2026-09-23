import { NextResponse } from "next/server";
import textToSpeech from "@google-cloud/text-to-speech";
import path from "path";
import { getGoogleTtsConfig } from "@/lib/languages";
import { getAuthUser } from "@/lib/auth";

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
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { text, language } = body;

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const { languageCode, voiceName } = getGoogleTtsConfig(language);
    const isChirp3 = voiceName.includes("Chirp3");

    const [response] = await getTtsClient().synthesizeSpeech({
      input: { text },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: "MP3" as const,
        speakingRate: 0.95,
        ...(isChirp3 ? {} : { pitch: -1.5 }),
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
