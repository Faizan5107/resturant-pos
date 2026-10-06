import { getPendingOfflineOrders, markOfflineOrderSynced, markOfflineOrderFailed, getPendingOrdersCount } from "./sqlite-db";
import { placeOrderAction } from "@/app/cashier/actions";

let isSyncing = false;

/**
 * Syncs all pending offline orders stored in local SQLite to the Supabase database.
 */
export async function syncPendingOrders(): Promise<{
  syncedCount: number;
  failedCount: number;
  errors: string[];
}> {
  if (typeof window === "undefined") {
    return { syncedCount: 0, failedCount: 0, errors: [] };
  }

  if (isSyncing) {
    return { syncedCount: 0, failedCount: 0, errors: ["Sync already in progress"] };
  }

  if (!navigator.onLine) {
    return { syncedCount: 0, failedCount: 0, errors: ["Device is currently offline"] };
  }

  isSyncing = true;
  let syncedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    const pendingOrders = await getPendingOfflineOrders();

    for (const order of pendingOrders) {
      try {
        const payload = JSON.parse(order.payload);
        const res = await placeOrderAction(payload);

        if (res.success) {
          await markOfflineOrderSynced(order.id);
          syncedCount++;
        } else {
          await markOfflineOrderFailed(order.id, res.error || "Unknown server error");
          failedCount++;
          errors.push(`Order ${order.client_order_no}: ${res.error}`);
        }
      } catch (err: any) {
        await markOfflineOrderFailed(order.id, err.message || "Network error");
        failedCount++;
        errors.push(`Order ${order.client_order_no}: ${err.message}`);
      }
    }
  } finally {
    isSyncing = false;
    window.dispatchEvent(new CustomEvent("offline-sync-finished", { detail: { syncedCount, failedCount } }));
  }

  return { syncedCount, failedCount, errors };
}
