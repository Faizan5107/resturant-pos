"use client";

/**
 * CacheWarmer — warms the service worker cache for cashier routes
 * after a successful authenticated page load.
 *
 * Must be included in the cashier layout (client component) so it only
 * runs after authentication is confirmed. Never caches login redirects.
 *
 * Strategy: fetch each URL with credentials included, check that the
 * response is NOT a login redirect before adding to cache.
 */

import { useEffect } from "react";

const CASHIER_ROUTES = [
  "/cashier/new-order",
  "/cashier/active-orders",
  "/~offline",
];

export function CacheWarmer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return;

    async function warm() {
      try {
        const cache = await caches.open("pos-v1-pages");
        await Promise.allSettled(
          CASHIER_ROUTES.map(async (url) => {
            const res = await fetch(url, { credentials: "include" });
            // Verify it's the actual page — not a login redirect (which
            // would land at /login and return 200 for the login page HTML)
            if (
              res.ok &&
              res.url.includes(url.split("?")[0]) &&
              !res.url.includes("/login")
            ) {
              await cache.put(url, res.clone());
            }
          })
        );
      } catch {
        // Cache warm-up failure is non-fatal
      }
    }

    // Warm after SW is controlling the page (or immediately if already active)
    if (navigator.serviceWorker.controller) {
      warm();
    } else {
      navigator.serviceWorker.addEventListener("controllerchange", warm, { once: true });
    }
  }, []);

  return null; // renders nothing
}
