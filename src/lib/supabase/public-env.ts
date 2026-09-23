/**
 * Single source for public Supabase browser env.
 * NEXT_PUBLIC_* values are inlined at `next build` — empty bake = empty client.
 */

export type PublicSupabaseEnv = {
  url: string;
  anonKey: string;
};

function readTrimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Sync read of baked NEXT_PUBLIC_* (no network). */
export function readPublicSupabaseEnv(): PublicSupabaseEnv {
  return {
    url: readTrimmed(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: readTrimmed(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

export function assertPublicSupabaseEnv(
  env: PublicSupabaseEnv = readPublicSupabaseEnv(),
): PublicSupabaseEnv {
  if (!env.url || !/^https?:\/\//i.test(env.url)) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Rebuild with compose --env-file .env.local so the URL is baked into the client bundle.",
    );
  }
  if (!env.anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Rebuild with compose --env-file .env.local so the anon key is baked into the client bundle.",
    );
  }
  return env;
}

declare global {
  interface Window {
    __INLUWA_PUBLIC_CONFIG__?: Partial<PublicSupabaseEnv>;
  }
}

/** Optional runtime overlay from window or /api/public-config (URL + anon only). */
export async function resolvePublicSupabaseEnv(): Promise<PublicSupabaseEnv> {
  const baked = readPublicSupabaseEnv();
  if (baked.url && baked.anonKey && /^https?:\/\//i.test(baked.url)) {
    return baked;
  }

  if (typeof window !== "undefined") {
    const fromWindow = window.__INLUWA_PUBLIC_CONFIG__;
    if (fromWindow?.url && fromWindow?.anonKey) {
      return assertPublicSupabaseEnv({
        url: readTrimmed(fromWindow.url),
        anonKey: readTrimmed(fromWindow.anonKey),
      });
    }

    try {
      const res = await fetch("/api/public-config", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as Partial<PublicSupabaseEnv>;
        if (json.url && json.anonKey) {
          const resolved = assertPublicSupabaseEnv({
            url: readTrimmed(json.url),
            anonKey: readTrimmed(json.anonKey),
          });
          window.__INLUWA_PUBLIC_CONFIG__ = resolved;
          return resolved;
        }
      }
    } catch {
      // fall through to assert on baked values
    }
  }

  return assertPublicSupabaseEnv(baked);
}
