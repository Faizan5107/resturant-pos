/// <reference lib="webworker" />

/**
 * Serwist Service Worker — Restaurant POS
 *
 * Strategy:
 *  - App shell & static assets   → CacheFirst (precached by Serwist at build time)
 *  - Page navigations            → NetworkFirst with /~offline fallback
 *  - Supabase API calls          → NetworkOnly (never cache auth/data responses)
 *
 * The SW is disabled in development (see next.config.ts).
 * Cache warm-up for authenticated cashier routes happens from the client
 * after a successful login — NOT at install time.
 */

import { defaultCache } from "@serwist/next/worker";
import { Serwist, NetworkFirst, CacheFirst, NetworkOnly } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const CACHE_VERSION = "pos-v1";

const sw = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // ── Supabase API — never cache ──────────────────────────────────────────
    {
      matcher: ({ url }) =>
        url.hostname.includes("supabase.co") ||
        url.hostname.includes("supabase.in"),
      handler: new NetworkOnly(),
    },

    // ── Page navigations — NetworkFirst with offline fallback ───────────────
    // The offline fallback for document requests is handled via fallbacks below.
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: `${CACHE_VERSION}-pages`,
        networkTimeoutSeconds: 5,
        plugins: [],
      }),
    },

    // ── Static assets (images, fonts, icons) — CacheFirst ──────────────────
    {
      matcher: ({ request }) =>
        request.destination === "image" ||
        request.destination === "font",
      handler: new CacheFirst({
        cacheName: `${CACHE_VERSION}-assets`,
        plugins: [],
      }),
    },

    // ── Next.js static chunks — CacheFirst ──────────────────────────────────
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: `${CACHE_VERSION}-next-static`,
        plugins: [],
      }),
    },

    // ── Everything else — use default Serwist cache strategies ──────────────
    ...defaultCache,
  ],

  // Serve /~offline for any document navigation that fails network
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

sw.addEventListeners();
