/**
 * IndexedDB wrapper for the Restaurant POS offline layer.
 *
 * DB name   : restaurant_pos_v2
 * Stores    : menu · settings · orders · outbox · meta
 *
 * All data is keyed/filtered by restaurant_id so that switching restaurants
 * (or logging in with a different account) never leaks data across tenants.
 */

import { openDB, DBSchema, IDBPDatabase } from "idb";

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface MenuEntry {
  id: string;
  restaurant_id: string;
  type: "category" | "product" | "variant" | "addon";
  data: unknown; // raw Supabase row
}

export interface SettingsEntry {
  restaurant_id: string;
  currency: string;
  tax_rate: number;
  enable_service_fee: boolean;
  service_fee_amount: number;
  name?: string;
  slug?: string;
  logo_url?: string;
  slogan?: string;
}

export interface OrderEntry {
  id: string; // Supabase UUID
  restaurant_id: string;
  order_no: string;
  order_type: string;
  table_no?: string;
  customer_name?: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method?: string;
  cancel_reason?: string;
  created_at: string;
  updated_at?: string;
  order_items: OrderItemEntry[];
}

export interface OrderItemEntry {
  id: string;
  product_name: string;
  variant_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  notes?: string;
}

/** Type of outbox operation */
export type OutboxType = "place_order" | "status_change" | "payment";

/** Error severity determines retry strategy */
export type SyncErrorKind = "network" | "auth" | "server_rejection";

export interface OutboxEntry {
  clientUuid: string; // crypto.randomUUID() — primary key
  restaurant_id: string; // tenant scoping
  type: OutboxType;
  /** For place_order: full payload. For status_change/payment: partial. */
  payload: unknown;
  /** "L-A-001" style for place_order; undefined for others */
  tempOrderNo?: string;
  /** Cached total shown to cashier before sync */
  cachedTotal?: number;
  /**
   * For status_change / payment: clientUuid of the parent place_order.
   * Must not sync until the parent has synced (i.e. is no longer in outbox).
   */
  parentClientUuid?: string;
  status: "pending" | "syncing" | "failed" | "needs_attention";
  retryCount: number;
  /** Epoch ms: do not attempt sync before this time */
  nextRetryAt: number;
  createdAt: string; // ISO
  lastError?: string;
  errorKind?: SyncErrorKind;
  /** Filled after server confirms the place_order */
  syncedOrderId?: string;
  syncedOrderNo?: string;
  syncedTotal?: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

interface PosDBSchema extends DBSchema {
  menu: {
    key: string;
    value: MenuEntry;
    indexes: {
      by_restaurant_type: [string, string];
    };
  };
  settings: {
    key: string; // restaurant_id
    value: SettingsEntry;
  };
  orders: {
    key: string; // Supabase order id
    value: OrderEntry;
    indexes: {
      by_restaurant: string;
      by_restaurant_status: [string, string];
    };
  };
  outbox: {
    key: string; // clientUuid
    value: OutboxEntry;
    indexes: {
      by_restaurant: string;
      by_restaurant_createdAt: [string, string];
      by_restaurant_status: [string, string];
    };
  };
  meta: {
    key: string;
    value: MetaEntry;
  };
}

const DB_NAME = "restaurant_pos_v2";
const DB_VERSION = 1;

let _db: IDBPDatabase<PosDBSchema> | null = null;

export async function getDb(): Promise<IDBPDatabase<PosDBSchema>> {
  if (_db) return _db;
  _db = await openDB<PosDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // menu store
      if (!db.objectStoreNames.contains("menu")) {
        const menuStore = db.createObjectStore("menu", { keyPath: "id" });
        menuStore.createIndex("by_restaurant_type", ["restaurant_id", "type"]);
      }

      // settings store
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "restaurant_id" });
      }

      // orders store
      if (!db.objectStoreNames.contains("orders")) {
        const ordersStore = db.createObjectStore("orders", { keyPath: "id" });
        ordersStore.createIndex("by_restaurant", "restaurant_id");
        ordersStore.createIndex("by_restaurant_status", ["restaurant_id", "status"]);
      }

      // outbox store
      if (!db.objectStoreNames.contains("outbox")) {
        const outboxStore = db.createObjectStore("outbox", { keyPath: "clientUuid" });
        outboxStore.createIndex("by_restaurant", "restaurant_id");
        outboxStore.createIndex("by_restaurant_createdAt", ["restaurant_id", "createdAt"]);
        outboxStore.createIndex("by_restaurant_status", ["restaurant_id", "status"]);
      }

      // meta store
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    },
  });
  return _db;
}

// ─── Menu helpers ─────────────────────────────────────────────────────────────

export async function saveMenuEntries(
  restaurantId: string,
  entries: Omit<MenuEntry, "restaurant_id">[]
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("menu", "readwrite");
  for (const e of entries) {
    await tx.store.put({ ...e, restaurant_id: restaurantId });
  }
  await tx.done;
}

export async function getMenuByType(
  restaurantId: string,
  type: MenuEntry["type"]
): Promise<MenuEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("menu", "by_restaurant_type", [restaurantId, type]);
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

export async function saveSettings(entry: SettingsEntry): Promise<void> {
  const db = await getDb();
  await db.put("settings", entry);
}

export async function getSettings(restaurantId: string): Promise<SettingsEntry | undefined> {
  const db = await getDb();
  return db.get("settings", restaurantId);
}

// ─── Orders helpers ───────────────────────────────────────────────────────────

export async function saveOrders(orders: OrderEntry[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("orders", "readwrite");
  for (const o of orders) {
    await tx.store.put(o);
  }
  await tx.done;
}

export async function syncOrdersForRestaurant(
  restaurantId: string,
  orders: OrderEntry[]
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["orders", "outbox"], "readwrite");
  const ordersStore = tx.objectStore("orders");
  const outboxStore = tx.objectStore("outbox");

  // Keep any outbox clientUuids so we don't accidentally delete pending offline orders
  const outboxKeys = await outboxStore.getAllKeys();
  const pendingUuids = new Set(outboxKeys as string[]);

  // Get existing local orders for this restaurant
  const existingOrders = await ordersStore.index("by_restaurant").getAll(restaurantId);
  const serverOrderIds = new Set(orders.map((o) => o.id));

  for (const localOrder of existingOrders) {
    if (!serverOrderIds.has(localOrder.id) && !pendingUuids.has(localOrder.id)) {
      await ordersStore.delete(localOrder.id);
    }
  }

  for (const o of orders) {
    await ordersStore.put(o);
  }

  await tx.done;
}

export async function getOrdersByRestaurant(restaurantId: string): Promise<OrderEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("orders", "by_restaurant", restaurantId);
}

export async function updateOrderStatus(id: string, status: string): Promise<void> {
  const db = await getDb();
  const order = await db.get("orders", id);
  if (order) {
    await db.put("orders", { ...order, status, updated_at: new Date().toISOString() });
  }
}

export async function updateOrderPayment(
  id: string,
  paymentMethod: string
): Promise<void> {
  const db = await getDb();
  const order = await db.get("orders", id);
  if (order) {
    await db.put("orders", {
      ...order,
      status: "paid",
      payment_method: paymentMethod,
      updated_at: new Date().toISOString(),
    });
  }
}

// ─── Outbox helpers ───────────────────────────────────────────────────────────

export async function saveOutboxEntry(entry: OutboxEntry): Promise<void> {
  const db = await getDb();
  await db.put("outbox", entry);
}

export async function getOutboxEntries(restaurantId: string): Promise<OutboxEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("outbox", "by_restaurant_createdAt", IDBKeyRange.bound(
    [restaurantId, ""],
    [restaurantId, "\uffff"]
  ));
}

export async function getPendingOutboxCount(restaurantId: string): Promise<number> {
  const entries = await getOutboxEntries(restaurantId);
  return entries.filter(
    (e) => e.status === "pending" || e.status === "syncing" || e.status === "failed"
  ).length;
}

export async function getOutboxEntry(clientUuid: string): Promise<OutboxEntry | undefined> {
  const db = await getDb();
  return db.get("outbox", clientUuid);
}

export async function removeOutboxEntry(clientUuid: string): Promise<void> {
  const db = await getDb();
  await db.delete("outbox", clientUuid);
}

export async function updateOutboxEntry(entry: OutboxEntry): Promise<void> {
  const db = await getDb();
  await db.put("outbox", entry);
}

/** On app start: reset any entries stuck in 'syncing' or failed due to RPC schema cache mismatches */
export async function resetStuckSyncingEntries(restaurantId: string): Promise<void> {
  const entries = await getOutboxEntries(restaurantId);
  const db = await getDb();
  const tx = db.transaction("outbox", "readwrite");
  for (const e of entries) {
    if (
      e.status === "syncing" ||
      (e.status === "needs_attention" &&
        e.lastError &&
        (e.lastError.includes("Could not find the function") || e.lastError.includes("schema cache")))
    ) {
      await tx.store.put({
        ...e,
        status: "pending",
        nextRetryAt: Date.now(),
        retryCount: 0,
        lastError: undefined,
      });
    }
  }
  await tx.done;
}

// ─── Meta helpers ─────────────────────────────────────────────────────────────

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const entry = await db.get("meta", key);
  return entry?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put("meta", { key, value });
}

// ─── Tenant clear (on logout or restaurant switch) ────────────────────────────

export async function clearRestaurantData(restaurantId: string): Promise<void> {
  const db = await getDb();

  // Menu
  const menuEntries = await db.getAllFromIndex("menu", "by_restaurant_type",
    IDBKeyRange.bound([restaurantId, ""], [restaurantId, "\uffff"])
  );
  // Simpler: clear all menu entries for this restaurant via cursor
  {
    const tx = db.transaction("menu", "readwrite");
    let cursor = await tx.store.openCursor();
    while (cursor) {
      if ((cursor.value as MenuEntry).restaurant_id === restaurantId) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // Settings
  await db.delete("settings", restaurantId);

  // Orders
  {
    const tx = db.transaction("orders", "readwrite");
    const keys = await tx.store.index("by_restaurant").getAllKeys(restaurantId);
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
  }

  // Outbox (only call this after confirming outbox is empty for this restaurant)
  {
    const tx = db.transaction("outbox", "readwrite");
    let cursor = await tx.store.openCursor();
    while (cursor) {
      if ((cursor.value as OutboxEntry).restaurant_id === restaurantId) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // Meta: clear restaurant-specific sync timestamps
  await db.delete("meta", `lastMenuSync_${restaurantId}`);
  await db.delete("meta", `lastOrdersSync_${restaurantId}`);
}
