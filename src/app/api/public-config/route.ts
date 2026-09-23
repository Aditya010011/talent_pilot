import { NextResponse } from "next/server";

/**
 * Public runtime config for browser recovery if NEXT_PUBLIC_* bake failed.
 * Returns only URL + anon key (already public by design). Never service role.
 */
export async function GET() {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();

  if (!url || !anonKey || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "public supabase config unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { url, anonKey },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
