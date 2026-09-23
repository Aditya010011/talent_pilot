/**
 * Same-origin proxy helpers for CDN-hosted pregenerated avatar clips.
 * captureStream() requires same-origin (or CORS-enabled) media; Vidu/Runware
 * CDNs typically omit Access-Control-Allow-Origin, so we stream via Next.js.
 */

const ALLOWED_HOST_SUFFIXES = [
  "vidu.com",
  "runware.ai",
  "amazonaws.com",
  "cloudfront.net",
  "googleusercontent.com",
  "storage.googleapis.com",
] as const;

export function isAllowedMediaProxyHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function isAllowedMediaProxyUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return isAllowedMediaProxyHost(parsed.hostname);
  } catch {
    return false;
  }
}

/** Rewrite absolute CDN clip URLs to the same-origin proxy when allowlisted. */
export function toSameOriginMediaUrl(url: string): string {
  if (!url || typeof url !== "string") return url;
  try {
    const absolute = new URL(
      url,
      typeof window !== "undefined" ? window.location.href : "http://localhost",
    );
    if (typeof window !== "undefined" && absolute.origin === window.location.origin) {
      return url;
    }
    if (!isAllowedMediaProxyHost(absolute.hostname)) {
      return url;
    }
    return `/api/media/proxy?url=${encodeURIComponent(absolute.href)}`;
  } catch {
    return url;
  }
}

/** True when two media URLs refer to the same clip (CDN or proxied). */
export function mediaUrlsReferToSameClip(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    const ua = new URL(a, typeof window !== "undefined" ? window.location.href : "http://localhost");
    const ub = new URL(b, typeof window !== "undefined" ? window.location.href : "http://localhost");
    if (ua.href === ub.href) return true;

    const unwrap = (u: URL) => {
      if (u.pathname === "/api/media/proxy" || u.pathname.endsWith("/api/media/proxy")) {
        const inner = u.searchParams.get("url");
        return inner || u.href;
      }
      return u.href;
    };
    return unwrap(ua) === unwrap(ub);
  } catch {
    return false;
  }
}
