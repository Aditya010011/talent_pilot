import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import {
  assertPublicSupabaseEnv,
  resolvePublicSupabaseEnv,
  type PublicSupabaseEnv,
} from "./public-env";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;
let clientPromise: Promise<ReturnType<typeof createBrowserClient<Database>>> | null =
  null;

function buildBrowserClient(env: PublicSupabaseEnv) {
  const safe = assertPublicSupabaseEnv(env);
  return createBrowserClient<Database>(safe.url, safe.anonKey, {
    auth: {
      // Bypass navigator.locks to prevent AbortError on public pages
      lock: <R,>(
        _name: string,
        _acquireTimeout: number,
        fn: () => Promise<R>,
      ): Promise<R> => fn(),
    },
  });
}

/**
 * Browser-side Supabase client (singleton).
 * Uses the anon key — all queries go through RLS.
 * Never calls createBrowserClient with an empty URL.
 */
export function createClient() {
  if (client) return client;

  // Prefer sync bake path (normal production). Throws a clear error if empty.
  client = buildBrowserClient(assertPublicSupabaseEnv());
  return client;
}

/**
 * Async variant that can recover via /api/public-config when bake failed.
 * Prefer createClient() after a correct production build.
 */
export async function createClientAsync() {
  if (client) return client;
  if (clientPromise) return clientPromise;

  clientPromise = resolvePublicSupabaseEnv()
    .then((env) => {
      client = buildBrowserClient(env);
      return client;
    })
    .finally(() => {
      clientPromise = null;
    });

  return clientPromise;
}
