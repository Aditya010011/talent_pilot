import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function fetchWithRetry(
  url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

function requireServerAnonEnv(): { url: string; anonKey: string } {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("Missing SUPABASE_URL for server createClient.");
  }
  if (!anonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY for server createClient.");
  }
  return { url, anonKey };
}

/**
 * Server-side Supabase client that uses cookies for auth.
 * Call this in Server Components, Route Handlers, and Server Actions.
 */
export function createClient() {
  const cookieStore = cookies();
  const { url, anonKey } = requireServerAnonEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll can throw in Server Components (read-only context).
          // Safe to ignore — the middleware will refresh the session.
        }
      },
    },
    global: {
      fetch: fetchWithRetry,
    },
  });
}
