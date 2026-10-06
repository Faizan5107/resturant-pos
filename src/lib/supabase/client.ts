import { createBrowserClient } from "@supabase/ssr";

// Cache the resolved config so we only fetch once per page load
let _cachedUrl: string | null = null;
let _cachedAnonKey: string | null = null;

/**
 * Resolves Supabase credentials.
 * On Vercel, NEXT_PUBLIC_ vars may not be set — so we fall back to fetching
 * the public /api/config endpoint which reads server-side env vars safely.
 */
async function resolveConfig(): Promise<{ url: string; anonKey: string }> {
  // Check for compile-time injected env vars first (fastest path)
  const envUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const envKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey };
  }

  // Use cached values if already fetched
  if (_cachedUrl && _cachedAnonKey) {
    return { url: _cachedUrl, anonKey: _cachedAnonKey };
  }

  // Fetch from server-side config endpoint
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to load Supabase config");
  const data = await res.json();

  _cachedUrl = data.url;
  _cachedAnonKey = data.anonKey;

  return { url: data.url, anonKey: data.anonKey };
}

/**
 * Synchronous client for use in non-async contexts.
 * Falls back to empty strings only if env vars aren't available
 * (will throw a Supabase error instead of silently doing nothing).
 */
export function createClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    _cachedUrl ||
    "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    _cachedAnonKey ||
    "";

  return createBrowserClient(url, anonKey);
}

/**
 * Async client that ensures config is loaded before creating the Supabase client.
 * Use this in async contexts (e.g., login handlers) where you need a guaranteed connection.
 */
export async function createClientAsync() {
  const { url, anonKey } = await resolveConfig();
  return createBrowserClient(url, anonKey);
}
