import { NextResponse } from "next/server";

/**
 * Public config endpoint — returns only the safe, public Supabase credentials.
 * This lets the browser-side Supabase client get its URL and anon key
 * without needing NEXT_PUBLIC_ prefixed env vars (which Vercel may restrict).
 */
export async function GET() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Supabase env vars not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url, anonKey });
}
