import { NextRequest, NextResponse } from "next/server";
import speech from "@google-cloud/speech";

let speechClient: any = null;
try {
  speechClient = new speech.SpeechClient({
    keyFilename: "single-quanta-461104-i7-af0effe9cc10.json",
  });
} catch (e) {
  console.error("Failed to initialize Google SpeechClient in test endpoint", e);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    if (!audioFile) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!speechClient) {
      return NextResponse.json({
        text: "Speech Client not configured. Mock Transcription: Hello world! This is a test response.",
      });
    }

    const request = {
      audio: {
        content: buffer.toString("base64"),
      },
      config: {
        encoding: "WEBM_OPUS" as any,
        sampleRateHertz: 48000,
        languageCode: "en-US",
      },
    };

    const [response] = await speechClient.recognize(request);
    const transcription = (response.results ?? [])
      .map((result: any) => result.alternatives?.[0]?.transcript)
      .filter(Boolean)
      .join("\n");

    return NextResponse.json({
      text: transcription || "(Google Speech API did not detect any speech in the audio)",
    });
  } catch (error: any) {
    console.error("Test transcription endpoint failed", error);
    return NextResponse.json(
      { error: "Transcription failed", details: error.message },
      { status: 500 }
    );
  }
}
