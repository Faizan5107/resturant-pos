/**
 * Outbox — the single source of truth for orders not yet confirmed by the server.
 *
 * Temp order number format: L-{deviceCode}-{counter}
 *   deviceCode = a stable 1-letter code derived from a per-device UUID stored
 *                in localStorage, so two devices never produce the same number.
 *   counter    = per-device daily counter starting at 1, reset each calendar day.
 *
 * Example: L-A-001, L-B-042
 */

import {
  OutboxEntry,
  OutboxType,
  saveOutboxEntry,
  getOutboxEntries,
  removeOutboxEntry,
  updateOutboxEntry,
  getMeta,
  setMeta,
  getOrdersByRestaurant,
} from "./idb";
import { getOrderDateString, isOrderInBusinessDate } from "@/lib/dates";

// ─── Daily order counter ─────────────────────────────────────────────────────

/** Updates the known daily order counter to at least the given number (only if from today's shift). */
export async function updateDailyOrderCounter(
  restaurantId: string,
  orderNo: number | string,
  orderCreatedAt?: string
): Promise<void> {
  const num = typeof orderNo === "number" ? orderNo : parseInt(orderNo, 10);
  if (isNaN(num) || num <= 0) return;
  const today = getOrderDateString();

  // If a timestamp is provided, strictly ignore orders from previous days / shifts
  if (orderCreatedAt && !isOrderInBusinessDate(orderCreatedAt, today)) {
    return;
  }

  const counterKey = `daily_order_counter_${restaurantId}_${today}`;
  const current = (await getMeta<number>(counterKey)) ?? 0;
  if (num > current) {
    await setMeta(counterKey, num);
  }
}

/** Returns the next sequential order number for today on this device. */
export async function nextTempOrderNo(restaurantId: string): Promise<string> {
  const today = getOrderDateString(); // YYYY-MM-DD shift date
  const counterKey = `daily_order_counter_${restaurantId}_${today}`;

  let current = (await getMeta<number>(counterKey)) ?? 0;

  // If counter is not set yet, check cached orders in IDB strictly for today's shift
  if (current === 0) {
    try {
      const localOrders = await getOrdersByRestaurant(restaurantId);
      for (const ord of localOrders) {
        if (ord.created_at && !isOrderInBusinessDate(ord.created_at, today)) {
          continue; // Skip past dates!
        }
        const n = parseInt(ord.order_no, 10);
        if (!isNaN(n) && n > current) {
          current = n;
        }
      }
    } catch {}
  }

  // Also check existing outbox entries strictly for today's shift
  try {
    const entries = await getOutboxEntries(restaurantId);
    for (const entry of entries) {
      if (entry.createdAt && !isOrderInBusinessDate(entry.createdAt, today)) {
        continue; // Skip past dates!
      }
      if (entry.tempOrderNo) {
        const n = parseInt(entry.tempOrderNo, 10);
        if (!isNaN(n) && n > current) {
          current = n;
        }
      }
    }
  } catch {}

  const next = current + 1;
  await setMeta(counterKey, next);

  // Return standard 4-digit formatted order number (e.g. "0001", "0015")
  return String(next).padStart(4, "0");
}

// ─── Save to outbox ───────────────────────────────────────────────────────────

interface PlaceOrderPayload {
  order_type: "dine_in" | "takeaway" | "delivery";
  order_no?: string;
  table_no?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  delivery_fee?: number;
  notes?: string;
  items: Array<{
    variant_id: string;
    quantity: number;
    notes?: string;
    addons?: Array<{ addon_name: string; price_delta: number }>;
  }>;
}

export interface PlaceOrderOutboxResult {
  clientUuid: string;
  tempOrderNo: string;
  cachedTotal: number;
}

/**
 * Saves a new order to the outbox.
 * Returns the clientUuid and temp order number immediately.
 */
export async function addOrderToOutbox(
  restaurantId: string,
  payload: PlaceOrderPayload,
  cachedTotal: number
): Promise<PlaceOrderOutboxResult> {
  const clientUuid = crypto.randomUUID();
  const tempOrderNo = await nextTempOrderNo(restaurantId);
  const now = new Date().toISOString();

  // Attach order_no to payload so sync will preserve the exact order number!
  const payloadWithOrderNo: PlaceOrderPayload = {
    ...payload,
    order_no: tempOrderNo,
  };

  const entry: OutboxEntry = {
    clientUuid,
    restaurant_id: restaurantId,
    type: "place_order",
    payload: payloadWithOrderNo,
    tempOrderNo,
    cachedTotal,
    status: "pending",
    retryCount: 0,
    nextRetryAt: Date.now(),
    createdAt: now,
  };

  await saveOutboxEntry(entry);
  dispatchOutboxChanged();
  return { clientUuid, tempOrderNo, cachedTotal };
}

/**
 * Queues a status change for an order.
 * If parentClientUuid is provided and that order is still in the outbox,
 * this entry will NOT sync until the parent has been removed from the outbox.
 */
export async function addStatusChangeToOutbox(
  restaurantId: string,
  orderId: string,
  newStatus: string,
  parentClientUuid?: string
): Promise<void> {
  const clientUuid = crypto.randomUUID();
  const entry: OutboxEntry = {
    clientUuid,
    restaurant_id: restaurantId,
    type: "status_change",
    payload: { orderId, newStatus },
    parentClientUuid,
    status: "pending",
    retryCount: 0,
    nextRetryAt: Date.now(),
    createdAt: new Date().toISOString(),
  };
  await saveOutboxEntry(entry);
  dispatchOutboxChanged();
}

/**
 * Queues a payment for an order.
 */
export async function addPaymentToOutbox(
  restaurantId: string,
  orderId: string,
  paymentMethod: "cash" | "card" | "online",
  parentClientUuid?: string
): Promise<void> {
  const clientUuid = crypto.randomUUID();
  const entry: OutboxEntry = {
    clientUuid,
    restaurant_id: restaurantId,
    type: "payment",
    payload: { orderId, paymentMethod },
    parentClientUuid,
    status: "pending",
    retryCount: 0,
    nextRetryAt: Date.now(),
    createdAt: new Date().toISOString(),
  };
  await saveOutboxEntry(entry);
  dispatchOutboxChanged();
}

// ─── Read outbox ──────────────────────────────────────────────────────────────

export async function getOutbox(restaurantId: string): Promise<OutboxEntry[]> {
  return getOutboxEntries(restaurantId);
}

export async function getPendingOutbox(restaurantId: string): Promise<OutboxEntry[]> {
  const all = await getOutboxEntries(restaurantId);
  return all.filter((e) => e.status !== "needs_attention");
}

// ─── Remove from outbox ───────────────────────────────────────────────────────

export async function confirmOutboxEntry(
  clientUuid: string,
  result: { syncedOrderId: string; syncedOrderNo: string; syncedTotal: number }
): Promise<void> {
  await removeOutboxEntry(clientUuid);
  dispatchOutboxChanged();
}

// ─── Mark as failed ───────────────────────────────────────────────────────────

export async function markOutboxFailed(
  entry: OutboxEntry,
  errorKind: OutboxEntry["errorKind"],
  errorMsg: string
): Promise<void> {
  const newStatus: OutboxEntry["status"] =
    errorKind === "server_rejection" ? "needs_attention" : "failed";

  const backoff = computeBackoff(entry.retryCount);
  const updated: OutboxEntry = {
    ...entry,
    status: newStatus,
    retryCount: entry.retryCount + 1,
    nextRetryAt: errorKind === "server_rejection" ? Infinity : Date.now() + backoff,
    lastError: errorMsg,
    errorKind,
  };
  await updateOutboxEntry(updated);
  dispatchOutboxChanged();
}

export async function markOutboxSyncing(entry: OutboxEntry): Promise<void> {
  await updateOutboxEntry({ ...entry, status: "syncing" });
}

// ─── Backoff ──────────────────────────────────────────────────────────────────

/** Exponential backoff: 5 s, 30 s, 2 min, 10 min (capped) */
export function computeBackoff(retryCount: number): number {
  const delays = [5_000, 30_000, 120_000, 600_000];
  return delays[Math.min(retryCount, delays.length - 1)];
}

// ─── Events ───────────────────────────────────────────────────────────────────

export function dispatchOutboxChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("outbox-changed"));
  }
}
