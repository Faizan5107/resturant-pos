"use client";

/**
 * CashierLayoutClient — client wrapper for the cashier shell.
 *
 * Responsibilities:
 *  - Warms the SW cache for cashier routes after login
 *  - Shows a persistent "Offline" banner in the header when offline
 *  - Blocks logout when the outbox has pending orders
 *  - Tracks restaurant_id to scope IDB data correctly
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import CashierNav from "./CashierNav";
import { CacheWarmer } from "@/lib/offline/CacheWarmer";
import { useOffline } from "@/lib/offline/useOffline";
import { clearRestaurantData } from "@/lib/offline/idb";
import { stopSyncManager } from "@/lib/offline/sync-manager";

interface Props {
  restaurantName: string;
  restaurantLogo?: string | null;
  restaurantId: string;
  fullName: string;
  role: string;
  children: React.ReactNode;
}

export function CashierLayoutClient({
  restaurantName,
  restaurantLogo,
  restaurantId,
  fullName,
  role,
  children,
}: Props) {
  const router = useRouter();
  const { isOnline, pendingCount } = useOffline(restaurantId);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (!isOnline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      setLogoutError("Sign out is not possible in offline mode. Please connect to the internet to sign out.");
      return;
    }

    if (pendingCount > 0) {
      setLogoutError(
        `You have ${pendingCount} order${pendingCount > 1 ? "s" : ""} pending sync. Please wait until they sync before signing out, or connect to the internet.`
      );
      return;
    }
    setLogoutError(null);

    // Cleanup: stop sync, clear restaurant data from IDB
    stopSyncManager();
    try { await clearRestaurantData(restaurantId); } catch { /* non-fatal */ }

    // POST to sign out
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/auth/signout";
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      {/* Simple Top Bar for Cashier */}
      <header className="bg-black text-white border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center gap-3">
            {restaurantLogo && (
              <div className="bg-white rounded p-1 inline-flex items-center justify-center shrink-0">
                <img
                  src={restaurantLogo}
                  alt={restaurantName}
                  className="h-8 max-w-[100px] object-contain"
                />
              </div>
            )}
            <div>
              <h1 className="font-bold text-base tracking-tight">{restaurantName}</h1>
              <p className="text-[11px] text-zinc-400">Cashier Panel</p>
            </div>
          </div>

          <CashierNav />
        </div>

        <div className="flex items-center space-x-4">
          {/* Offline badge — always visible in header when offline */}
          {!isOnline && (
            <span className="border border-white text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
              Offline
            </span>
          )}

          <div className="text-xs text-right">
            <p className="font-semibold">{fullName}</p>
            <p className="text-[10px] text-zinc-400 capitalize">{role}</p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title={!isOnline ? "Sign out is not possible in offline mode" : "Sign Out"}
            className="px-3 py-1.5 text-xs font-semibold border border-zinc-700 text-zinc-300 hover:text-white hover:border-white rounded-md transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Logout blocked warning */}
      {logoutError && (
        <div className="bg-amber-50 border-b border-amber-300 px-6 py-2.5 flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="text-amber-700 text-sm font-bold">⚠️</span>
            <span className="text-xs font-medium text-amber-950">{logoutError}</span>
          </div>
          <button
            onClick={() => setLogoutError(null)}
            className="text-xs font-bold text-amber-900 hover:text-black ml-4 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content Area */}
      <main className="flex-1 p-6">{children}</main>

      {/* SW cache warmer — runs silently after authenticated load */}
      <CacheWarmer />
    </div>
  );
}
