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
} from "./idb";

// ─── Device code ─────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = "pos_device_id";

function getDeviceCode(): string {
  if (typeof window === "undefined") return "X";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  // Map UUID to a letter A–Z using first hex nibble
  const nibble = parseInt(id[0], 16); // 0-15
  return String.fromCharCode(65 + (nibble % 26)); // A-Z
}

// ─── Temp order counter ───────────────────────────────────────────────────────

/** Returns the next temp order number for today on this device. */
async function nextTempOrderNo(restaurantId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const counterKey = `outbox_counter_${restaurantId}_${today}`;

  const current = (await getMeta<number>(counterKey)) ?? 0;
  const next = current + 1;
  await setMeta(counterKey, next);

  const deviceCode = getDeviceCode();
  return `L-${deviceCode}-${String(next).padStart(3, "0")}`;
}

// ─── Save to outbox ───────────────────────────────────────────────────────────

interface PlaceOrderPayload {
  order_type: "dine_in" | "takeaway" | "delivery";
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

  const entry: OutboxEntry = {
    clientUuid,
    restaurant_id: restaurantId,
    type: "place_order",
    payload,
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
