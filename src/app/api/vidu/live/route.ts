import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  buildViduInterviewerPersona,
  createViduLiveSession,
  getViduLiveSession,
} from "@/lib/vidu-live";
import { resolveViduAvatarUrl } from "@/lib/vidu-client";

const log = createLogger("api/vidu/live");

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      action = "create",
      liveId,
      aiName,
      title,
      objective,
      questions,
      language,
      avatarImageUrl,
      voice,
      aiTone,
      followUpDepth,
      participantName,
    } = body as {
      action?: "create" | "status";
      liveId?: string;
      aiName?: string;
      title?: string;
      objective?: string | null;
      questions?: Array<{
        text: string;
        type?: string;
        description?: string | null;
        options?: { options?: string[]; allowMultiple?: boolean } | null;
      }>;
      language?: string;
      avatarImageUrl?: string;
      voice?: string;
      aiTone?: string;
      followUpDepth?: string;
      participantName?: string | null;
    };

    if (action === "status") {
      if (!liveId) {
        return NextResponse.json({ error: "liveId required" }, { status: 400 });
      }
      const status = await getViduLiveSession(liveId);
      return NextResponse.json({ success: true, ...status });
    }

    if (!title || !aiName) {
      return NextResponse.json(
        { error: "title and aiName are required" },
        { status: 400 },
      );
    }

    const persona = buildViduInterviewerPersona({
      aiName,
      title,
      objective,
      questions: questions || [],
      language,
      aiTone,
      followUpDepth,
      participantName,
    });

    log.info("Creating Vidu live with verbatim persona", {
      personaChars: persona.length,
      questionCount: questions?.length ?? 0,
      personaPreview: persona.slice(0, 240),
    });

    const session = await createViduLiveSession({
      callMode: "video",
      avatar: {
        persona,
        imageUri: avatarImageUrl || resolveViduAvatarUrl(),
        name: aiName,
        voice: voice || "Tina",
      },
    });

    log.info("Vidu live session created", { liveId: session.liveId });
    return NextResponse.json({ success: true, session });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Vidu live API error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
