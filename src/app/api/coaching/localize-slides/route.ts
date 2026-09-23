/**
 * POST /api/coaching/localize-slides
 *
 * Translates all coaching slide scripts from the training's source language
 * into the candidate's chosen session language. Called once when the session
 * page loads and a language mismatch is detected.
 *
 * Body: { slides: Array<{ script?: string; [key: string]: any }>, sourceLanguage: string, targetLanguage: string }
 * Returns: { slides: Array<{ script: string; [key: string]: any }> }
 */

import { NextResponse } from "next/server";
import { translateCoachingScript } from "@/lib/coaching-script-localization";
import { resolveLanguage } from "@/lib/languages";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slides, sourceLanguage, targetLanguage } = body;

    if (!Array.isArray(slides)) {
      return NextResponse.json({ error: "slides must be an array" }, { status: 400 });
    }

    const sourceLang = resolveLanguage(sourceLanguage);
    const targetLang = resolveLanguage(targetLanguage);

    // No translation needed
    if (sourceLang.code === targetLang.code) {
      return NextResponse.json({ slides });
    }

    // Translate each slide's script in parallel (cache handles duplicates)
    const translatedSlides = await Promise.all(
      slides.map(async (slide: any) => {
        if (!slide?.script?.trim()) return slide;
        const translatedScript = await translateCoachingScript(
          slide.script,
          sourceLang.code,
          targetLang.code,
        );
        return { ...slide, script: translatedScript };
      }),
    );

    return NextResponse.json({ slides: translatedSlides });
  } catch (err: any) {
    console.error("[coaching/localize-slides] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to localize slides" },
      { status: 500 },
    );
  }
}
