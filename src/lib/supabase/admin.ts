import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

function requireServerSupabaseEnv(): { url: string; serviceRoleKey: string } {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(
      "Missing SUPABASE_URL for supabaseAdmin (server-only). Check .env.local / compose env_file.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY for supabaseAdmin (server-only).",
    );
  }
  return { url, serviceRoleKey };
}

let adminClient: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const { url, serviceRoleKey } = requireServerSupabaseEnv();
  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithRetry,
    },
  });
  return adminClient;
}

/**
 * Admin Supabase client using the service_role key.
 * Bypasses RLS — use only in server-side code (tRPC routers, API routes).
 * Lazy so importing this module never calls createClient("").
 *
 * Note: The Database generic is intentionally omitted to avoid `never` types
 * on relation joins (our manual types don't define Relationships yet).
 * Regenerate types with `npm run db:types` after schema changes for full safety.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
