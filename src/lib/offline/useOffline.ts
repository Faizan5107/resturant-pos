"use client";

/**
 * useOffline — central hook for offline status, pending count, and sync control.
 *
 * - Tracks online/offline state reactively
 * - Reads pending outbox count from IndexedDB
 * - Exposes triggerSync, lastSyncResult, syncPaused (auth required)
 * - Listens to 'outbox-changed', 'sync-status', 'sync-auth-required' events
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getPendingOutboxCount } from "./idb";
import { syncNow, resumeSync } from "./sync-manager";

export interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncPaused: boolean; // true = auth required
  lastSyncResult: { synced: number; failed: number } | null;
  reconciledNotice: ReconciledNotice | null;
  triggerSync: () => void;
  resumeAfterLogin: () => void;
  dismissReconciled: () => void;
}

export interface ReconciledNotice {
  tempOrderNo: string;
  serverOrderNo: string;
  cachedTotal: number;
  serverTotal: number;
}

export function useOffline(restaurantId: string | null): OfflineState {
  const [isOnline, setIsOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPaused, setSyncPaused] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const [reconciledNotice, setReconciledNotice] = useState<ReconciledNotice | null>(null);
  const triggeringRef = useRef(false);

  const refreshCount = useCallback(async () => {
    if (!restaurantId) { setPendingCount(0); return; }
    try {
      const count = await getPendingOutboxCount(restaurantId);
      setPendingCount(count);
    } catch {
      // DB may not be ready yet
    }
  }, [restaurantId]);

  const triggerSync = useCallback(() => {
    if (triggeringRef.current || !navigator.onLine || syncPaused) return;
    triggeringRef.current = true;
    syncNow()
      .then((res) => {
        setLastSyncResult({ synced: res.syncedCount, failed: res.failedCount });
        refreshCount();
      })
      .catch(console.warn)
      .finally(() => { triggeringRef.current = false; });
  }, [syncPaused, refreshCount]);

  const resumeAfterLogin = useCallback(() => {
    setSyncPaused(false);
    resumeSync();
  }, []);

  const dismissReconciled = useCallback(() => {
    setReconciledNotice(null);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    refreshCount();

    const handleOnline = () => { setIsOnline(true); };
    const handleOffline = () => { setIsOnline(false); };

    const handleOutboxChanged = () => { refreshCount(); };
    const handleSyncStatus = (e: Event) => {
      const ce = e as CustomEvent<{ status: "syncing" | "idle" }>;
      setIsSyncing(ce.detail.status === "syncing");
    };
    const handleAuthRequired = () => { setSyncPaused(true); };
    const handleReconciled = (e: Event) => {
      const ce = e as CustomEvent<ReconciledNotice & { clientUuid: string }>;
      setReconciledNotice({
        tempOrderNo: ce.detail.tempOrderNo,
        serverOrderNo: ce.detail.serverOrderNo,
        cachedTotal: ce.detail.cachedTotal,
        serverTotal: ce.detail.serverTotal,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("outbox-changed", handleOutboxChanged);
    window.addEventListener("sync-status", handleSyncStatus);
    window.addEventListener("sync-auth-required", handleAuthRequired);
    window.addEventListener("sync-reconciled", handleReconciled);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("outbox-changed", handleOutboxChanged);
      window.removeEventListener("sync-status", handleSyncStatus);
      window.removeEventListener("sync-auth-required", handleAuthRequired);
      window.removeEventListener("sync-reconciled", handleReconciled);
    };
  }, [refreshCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncPaused,
    lastSyncResult,
    reconciledNotice,
    triggerSync,
    resumeAfterLogin,
    dismissReconciled,
  };
}
