import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { isAllowedMediaProxyUrl } from "@/lib/media-proxy";

const log = createLogger("api/media/proxy");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allow long-running range streams for multi-minute avatar clips. */
export const maxDuration = 300;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function pickUpstreamHeaders(req: Request): Headers {
  const out = new Headers();
  const range = req.headers.get("range");
  if (range) out.set("range", range);
  const accept = req.headers.get("accept");
  if (accept) out.set("accept", accept);
  // Some CDNs are picky about UA; forward a generic browser-like one.
  out.set(
    "user-agent",
    req.headers.get("user-agent") ||
      "Mozilla/5.0 (compatible; InterviewMediaProxy/1.0)",
  );
  return out;
}

function pickResponseHeaders(upstream: Response): Headers {
  const out = new Headers();
  const pass = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified",
  ];
  for (const name of pass) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  // Same-origin element — still useful for MES fallbacks / future canvas use.
  out.set("access-control-allow-origin", "*");
  out.set("access-control-expose-headers", "content-length, content-range, accept-ranges");
  return out;
}

/**
 * GET /api/media/proxy?url=<encoded https URL>
 *
 * Streams allowlisted CDN MP4s through Next.js so <video> is same-origin and
 * HTMLMediaElement.captureStream() works for session recording mix.
 */
async function proxyMedia(req: Request, method: "GET" | "HEAD") {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!isAllowedMediaProxyUrl(target.href)) {
    log.warn("Rejected media proxy host", { host: target.hostname });
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.href, {
      method,
      headers: pickUpstreamHeaders(req),
      redirect: "follow",
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      log.warn("Upstream media fetch failed", {
        status: upstream.status,
        host: target.hostname,
        method,
      });
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const headers = pickResponseHeaders(upstream);
    for (const name of HOP_BY_HOP) headers.delete(name);

    if (method === "HEAD") {
      // Drain unused body if the upstream ignored HEAD.
      try {
        await upstream.body?.cancel();
      } catch {
        /* noop */
      }
      return new NextResponse(null, { status: upstream.status, headers });
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    log.error("Media proxy error", {
      host: target.hostname,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Proxy failed" }, { status: 502 });
  }
}

export async function GET(req: Request) {
  return proxyMedia(req, "GET");
}

export async function HEAD(req: Request) {
  return proxyMedia(req, "HEAD");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": "range, accept",
      "access-control-max-age": "86400",
    },
  });
}
