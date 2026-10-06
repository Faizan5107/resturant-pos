/**
 * Sync Manager — sends outbox entries to the server in creation order.
 *
 * Error classification:
 *   network error         → retry with exponential backoff (5s → 30s → 2m → 10m)
 *   401 / auth error      → pause ALL sync, emit 'sync-auth-required' event
 *   server rejection      → mark 'needs_attention', no further retries
 *
 * On app start call resetStuckSyncingEntries() before the first sync attempt.
 */

import { OutboxEntry, resetStuckSyncingEntries, saveOrders, getOutboxEntry } from "./idb";
import {
  getOutboxEntries,
  removeOutboxEntry,
  updateOutboxEntry,
} from "./idb";
import {
  computeBackoff,
  dispatchOutboxChanged,
} from "./outbox";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  syncedCount: number;
  failedCount: number;
  needsAuthCount: number;
  errors: string[];
}

type PlaceOrderResult = {
  success: boolean;
  result?: { order_id: string; order_no: string; total: number; idempotent?: boolean };
  error?: string;
  status?: number;
};

// ─── State ────────────────────────────────────────────────────────────────────

let _isSyncing = false;
let _isPaused = false; // true when we get a 401 — wait for re-auth
let _syncInterval: ReturnType<typeof setInterval> | null = null;
let _currentRestaurantId: string | null = null;

// Injected at runtime to avoid circular imports
let _placeOrderFn: ((payload: unknown, clientUuid: string) => Promise<PlaceOrderResult>) | null = null;
let _statusChangeFn: ((orderId: string, status: string) => Promise<{ success?: boolean; error?: string; status?: number }>) | null = null;
let _paymentFn: ((orderId: string, method: string) => Promise<{ success?: boolean; error?: string; status?: number }>) | null = null;

export function configureSyncFunctions(fns: {
  placeOrder: typeof _placeOrderFn;
  statusChange: typeof _statusChangeFn;
  payment: typeof _paymentFn;
}): void {
  _placeOrderFn = fns.placeOrder;
  _statusChangeFn = fns.statusChange;
  _paymentFn = fns.payment;
}

export function setCurrentRestaurant(restaurantId: string | null): void {
  _currentRestaurantId = restaurantId;
}

// ─── Core sync logic ──────────────────────────────────────────────────────────

export async function syncNow(): Promise<SyncResult> {
  const result: SyncResult = { syncedCount: 0, failedCount: 0, needsAuthCount: 0, errors: [] };

  if (typeof window === "undefined") return result;
  if (!navigator.onLine) return result;
  if (_isSyncing) return result;
  if (_isPaused) return result;
  if (!_currentRestaurantId) return result;

  _isSyncing = true;
  dispatchSyncStatus("syncing");

  const restaurantId = _currentRestaurantId;

  try {
    const all = await getOutboxEntries(restaurantId);
    // Process in creation order
    const pending = all
      .filter((e) => e.status !== "needs_attention")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    // Build a set of clientUuids currently in the outbox to detect parent deps
    const inOutbox = new Set(all.map((e) => e.clientUuid));

    for (const entry of pending) {
      // Skip if not yet time to retry
      if (entry.nextRetryAt > Date.now()) continue;

      // Skip if parent hasn't synced yet
      if (entry.parentClientUuid && inOutbox.has(entry.parentClientUuid)) continue;

      // Skip if auth is paused
      if (_isPaused) break;

      // Mark as syncing
      await updateOutboxEntry({ ...entry, status: "syncing" });

      try {
        const syncResult = await processEntry(entry);

        if (syncResult.authRequired) {
          // Pause all sync, ask cashier to log in
          _isPaused = true;
          await updateOutboxEntry({ ...entry, status: "pending", nextRetryAt: Date.now() });
          result.needsAuthCount++;
          dispatchAuthRequired();
          break;
        }

        if (syncResult.success) {
          inOutbox.delete(entry.clientUuid);
          await removeOutboxEntry(entry.clientUuid);
          result.syncedCount++;

          // Dispatch reconciliation notice if numbers/totals differ
          if (
            entry.type === "place_order" &&
            syncResult.serverOrderNo &&
            (syncResult.serverOrderNo !== entry.tempOrderNo ||
              (syncResult.serverTotal !== undefined &&
                entry.cachedTotal !== undefined &&
                Math.abs(syncResult.serverTotal - entry.cachedTotal) > 0.01))
          ) {
            dispatchReconciled({
              clientUuid: entry.clientUuid,
              tempOrderNo: entry.tempOrderNo!,
              serverOrderNo: syncResult.serverOrderNo,
              cachedTotal: entry.cachedTotal!,
              serverTotal: syncResult.serverTotal!,
            });
          }
        } else {
          // Server rejection — mark needs_attention, stop retrying
          await updateOutboxEntry({
            ...entry,
            status: "needs_attention",
            lastError: syncResult.error ?? "Server rejected the request",
            errorKind: "server_rejection",
            retryCount: entry.retryCount + 1,
            nextRetryAt: Infinity,
          });
          result.failedCount++;
          result.errors.push(`${entry.clientUuid}: ${syncResult.error}`);
        }
      } catch (err: unknown) {
        // Network error — retry with backoff
        const msg = err instanceof Error ? err.message : String(err);
        const backoff = computeBackoff(entry.retryCount);
        await updateOutboxEntry({
          ...entry,
          status: "failed",
          lastError: msg,
          errorKind: "network",
          retryCount: entry.retryCount + 1,
          nextRetryAt: Date.now() + backoff,
        });
        result.failedCount++;
        result.errors.push(`${entry.clientUuid}: ${msg}`);
      }
    }
  } finally {
    _isSyncing = false;
    dispatchOutboxChanged();
    dispatchSyncStatus("idle");
  }

  return result;
}

// ─── Process a single entry ───────────────────────────────────────────────────

interface ProcessResult {
  success: boolean;
  authRequired?: boolean;
  error?: string;
  serverOrderNo?: string;
  serverTotal?: number;
}

async function processEntry(entry: OutboxEntry): Promise<ProcessResult> {
  if (entry.type === "place_order") {
    if (!_placeOrderFn) return { success: false, error: "placeOrderFn not configured" };
    const res = await _placeOrderFn(entry.payload, entry.clientUuid);

    if (res.status === 401) return { success: false, authRequired: true };
    if (!res.success) return { success: false, error: res.error };

    // Update the local orders store with the real order data
    if (res.result) {
      // Minimal order patch — full refresh will happen when Active Orders loads
      dispatchOutboxChanged();
    }

    return {
      success: true,
      serverOrderNo: res.result?.order_no,
      serverTotal: res.result?.total,
    };
  }

  if (entry.type === "status_change") {
    if (!_statusChangeFn) return { success: false, error: "statusChangeFn not configured" };
    const p = entry.payload as { orderId: string; newStatus: string };
    const res = await _statusChangeFn(p.orderId, p.newStatus);

    if (res.status === 401) return { success: false, authRequired: true };
    if (!res.success) {
      // Conflict (e.g. order already cancelled) → needs_attention
      return { success: false, error: res.error ?? "Status change rejected" };
    }
    return { success: true };
  }

  if (entry.type === "payment") {
    if (!_paymentFn) return { success: false, error: "paymentFn not configured" };
    const p = entry.payload as { orderId: string; paymentMethod: string };
    const res = await _paymentFn(p.orderId, p.paymentMethod);

    if (res.status === 401) return { success: false, authRequired: true };
    if (!res.success) return { success: false, error: res.error ?? "Payment rejected" };
    return { success: true };
  }

  return { success: false, error: `Unknown outbox type: ${(entry as OutboxEntry).type}` };
}

// ─── Start / stop auto-sync ───────────────────────────────────────────────────

export function startSyncManager(restaurantId: string): void {
  setCurrentRestaurant(restaurantId);

  // Reset stuck entries on start
  resetStuckSyncingEntries(restaurantId).catch(console.warn);

  // Sync immediately on start
  syncNow().catch(console.warn);

  // Auto-sync every 30 seconds while there are pending entries
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(async () => {
    if (!navigator.onLine) return;
    if (_isPaused) return;
    syncNow().catch(console.warn);
  }, 30_000);

  // Re-sync when back online
  window.addEventListener("online", handleOnline);
}

export function stopSyncManager(): void {
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
  window.removeEventListener("online", handleOnline);
  setCurrentRestaurant(null);
}

function handleOnline(): void {
  // Clear auth pause on re-auth (caller should call resumeSync after login)
  syncNow().catch(console.warn);
}

/** Called after the cashier successfully re-authenticates */
export function resumeSync(): void {
  _isPaused = false;
  syncNow().catch(console.warn);
}

/** Reset a failed/needs_attention outbox entry to pending and trigger sync immediately */
export async function retryOutboxItem(clientUuid: string): Promise<void> {
  const entry = await getOutboxEntry(clientUuid);
  if (entry) {
    await updateOutboxEntry({
      ...entry,
      status: "pending",
      nextRetryAt: Date.now(),
      retryCount: 0,
      lastError: undefined,
    });
    dispatchOutboxChanged();
    syncNow().catch(console.warn);
  }
}

/** Remove an outbox entry completely (e.g. dismissed by cashier) */
export async function removeOutboxItem(clientUuid: string): Promise<void> {
  await removeOutboxEntry(clientUuid);
  dispatchOutboxChanged();
}

// ─── Events ───────────────────────────────────────────────────────────────────

function dispatchSyncStatus(status: "syncing" | "idle"): void {
  window.dispatchEvent(new CustomEvent("sync-status", { detail: { status } }));
}

function dispatchAuthRequired(): void {
  window.dispatchEvent(new CustomEvent("sync-auth-required"));
}

interface ReconciledDetail {
  clientUuid: string;
  tempOrderNo: string;
  serverOrderNo: string;
  cachedTotal: number;
  serverTotal: number;
}

function dispatchReconciled(detail: ReconciledDetail): void {
  window.dispatchEvent(new CustomEvent("sync-reconciled", { detail }));
}
