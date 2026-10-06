"use client";

import { useState, useEffect, useCallback } from "react";
import { getPendingOrdersCount } from "./sqlite-db";
import { syncPendingOrders } from "./sync-service";

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const count = await getPendingOrdersCount();
      setPendingCount(count);
    } catch {
      // Ignore if db not initialized yet
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const res = await syncPendingOrders();
      setLastSyncResult({ synced: res.syncedCount, failed: res.failedCount });
      await refreshCount();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshCount]);

  useEffect(() => {
    // Sync with real browser state after hydration
    setIsOnline(navigator.onLine);
    refreshCount();

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleOrdersChanged = () => {
      refreshCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-orders-changed", handleOrdersChanged);

    // Periodic check every 20 seconds
    const interval = setInterval(() => {
      refreshCount();
      if (navigator.onLine && pendingCount > 0) {
        triggerSync();
      }
    }, 20000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-orders-changed", handleOrdersChanged);
      clearInterval(interval);
    };
  }, [refreshCount, triggerSync, pendingCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    triggerSync,
    lastSyncResult,
  };
}
