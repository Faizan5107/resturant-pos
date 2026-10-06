import initSqlJs, { Database, SqlJsStatic } from "sql.js";

const DB_STORE_NAME = "restaurant_pos_sqlite";
const DB_KEY = "pos_db_binary";
const WASM_KEY = "pos_wasm_binary";

let sqlInstance: SqlJsStatic | null = null;
let dbInstance: Database | null = null;
let isInitializing = false;

// Simple IndexedDB helper to persist SQLite database binary and wasm module
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not available"));
    }
    const request = window.indexedDB.open(DB_STORE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getWasmBinary(): Promise<ArrayBuffer | null> {
  // 1. Try to load cached wasm binary from IndexedDB (instant offline load)
  try {
    const idb = await openIndexedDB();
    const cached: ArrayBuffer | null = await new Promise((resolve) => {
      const tx = idb.transaction("files", "readonly");
      const req = tx.objectStore("files").get(WASM_KEY);
      req.onsuccess = () => resolve(req.result ? (req.result as ArrayBuffer) : null);
      req.onerror = () => resolve(null);
    });
    if (cached && cached.byteLength > 10000) {
      return cached;
    }
  } catch {
    // Continue to fetch
  }

  // 2. Fetch locally from public /sql-wasm.wasm
  try {
    const url = typeof window !== "undefined" ? `${window.location.origin}/sql-wasm.wasm` : "/sql-wasm.wasm";
    const res = await fetch(url);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      // Cache in IndexedDB for permanent offline availability
      try {
        const idb = await openIndexedDB();
        const tx = idb.transaction("files", "readwrite");
        tx.objectStore("files").put(buffer, WASM_KEY);
      } catch {}
      return buffer;
    }
  } catch {
    // Local fetch failed, fallback to CDN
  }

  // 3. Fallback to Cloudflare CDN if local server is unreachable
  try {
    const res = await fetch("https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm");
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      try {
        const idb = await openIndexedDB();
        const tx = idb.transaction("files", "readwrite");
        tx.objectStore("files").put(buffer, WASM_KEY);
      } catch {}
      return buffer;
    }
  } catch {
    // Offline
  }

  return null;
}

async function loadDbFromIndexedDB(): Promise<Uint8Array | null> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = idb.transaction("files", "readonly");
      const store = tx.objectStore("files");
      const req = store.get(DB_KEY);
      req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result) : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveDbToIndexedDB(binary: Uint8Array): Promise<void> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const req = store.put(binary.buffer, DB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("Failed to persist SQLite to IndexedDB:", e);
  }
}

/**
 * Initializes and returns the local SQLite database.
 */
export async function getOfflineDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (typeof window === "undefined") {
    throw new Error("SQLite client can only run in the browser");
  }

  if (isInitializing) {
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (dbInstance) return dbInstance;
  }

  isInitializing = true;
  try {
    if (!sqlInstance) {
      const wasmBinary = await getWasmBinary();
      if (!wasmBinary) {
        throw new Error("Could not load SQLite WebAssembly module");
      }

      sqlInstance = await initSqlJs({
        wasmBinary,
        locateFile: () => "/sql-wasm.wasm",
        instantiateWasm: (info: any, receiveInstance: any) => {
          WebAssembly.instantiate(wasmBinary, info)
            .then((output) => {
              receiveInstance(output.instance, output.module);
            })
            .catch((err) => {
              console.error("WebAssembly.instantiate error:", err);
            });
          return {}; // signals asynchronous instantiation to emscripten
        },
      });
    }

    const savedBinary = await loadDbFromIndexedDB();
    dbInstance = savedBinary ? new sqlInstance.Database(savedBinary) : new sqlInstance.Database();



    // Create tables
    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS offline_orders (
        id TEXT PRIMARY KEY,
        client_order_no TEXT NOT NULL,
        created_at TEXT NOT NULL,
        order_type TEXT NOT NULL,
        table_no TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        notes TEXT,
        total REAL NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        synced_at TEXT,
        sync_error TEXT
      );

      CREATE TABLE IF NOT EXISTS offline_drafts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        order_type TEXT NOT NULL,
        table_no TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        notes TEXT,
        total REAL NOT NULL,
        cart_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await persistDb();
    return dbInstance;
  } finally {
    isInitializing = false;
  }
}

/**
 * Exports SQLite binary to IndexedDB.
 */
export async function persistDb(): Promise<void> {
  if (!dbInstance) return;
  const binary = dbInstance.export();
  await saveDbToIndexedDB(binary);
}

export interface OfflineOrderRow {
  id: string;
  client_order_no: string;
  created_at: string;
  order_type: string;
  table_no?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  total: number;
  payload: string;
  status: "pending" | "synced" | "failed";
  synced_at?: string;
  sync_error?: string;
}

export interface OfflineDraftRow {
  id: string;
  title: string;
  order_type: string;
  table_no?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  total: number;
  cart_json: string;
  created_at: string;
  updated_at: string;
}

const LOCAL_STORAGE_OFFLINE_ORDERS = "pos_offline_orders_fallback";
const LOCAL_STORAGE_DRAFTS = "pos_drafts_fallback";

/**
 * Saves an order temporarily in local SQLite (or fallback storage) when offline.
 */
export async function saveOfflineOrder(payload: any, total: number): Promise<string> {
  const id = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const clientOrderNo = `OFF-${Date.now().toString().slice(-4)}`;
  const createdAt = new Date().toISOString();

  try {
    const db = await getOfflineDb();
    db.run(
      `INSERT INTO offline_orders (id, client_order_no, created_at, order_type, table_no, customer_name, customer_phone, notes, total, payload, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        id,
        clientOrderNo,
        createdAt,
        payload.order_type || "dine_in",
        payload.table_no || null,
        payload.customer_name || null,
        payload.customer_phone || null,
        payload.notes || null,
        total,
        JSON.stringify(payload),
      ]
    );
    await persistDb();
  } catch (err) {
    console.warn("SQLite offline insert failed, saving to localStorage fallback:", err);
    if (typeof window !== "undefined") {
      const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_OFFLINE_ORDERS) || "[]");
      existing.push({
        id,
        client_order_no: clientOrderNo,
        created_at: createdAt,
        order_type: payload.order_type || "dine_in",
        table_no: payload.table_no,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        notes: payload.notes,
        total,
        payload: JSON.stringify(payload),
        status: "pending",
      });
      localStorage.setItem(LOCAL_STORAGE_OFFLINE_ORDERS, JSON.stringify(existing));
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-orders-changed"));
  }
  return id;
}

/**
 * Retrieves all pending offline orders.
 */
export async function getPendingOfflineOrders(): Promise<OfflineOrderRow[]> {
  try {
    const db = await getOfflineDb();
    const res = db.exec("SELECT * FROM offline_orders WHERE status = 'pending' ORDER BY created_at ASC");
    if (res && res.length > 0) {
      const columns = res[0].columns;
      const orders = res[0].values.map((row) => {
        const obj: any = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj as OfflineOrderRow;
      });
      return orders;
    }
  } catch (err) {
    console.warn("SQLite query failed, reading from localStorage fallback:", err);
  }

  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(LOCAL_STORAGE_OFFLINE_ORDERS);
    if (raw) {
      try {
        const orders = JSON.parse(raw);
        return orders.filter((o: any) => o.status === "pending");
      } catch {}
    }
  }

  return [];
}

/**
 * Marks an offline order as synced with Supabase.
 */
export async function markOfflineOrderSynced(id: string): Promise<void> {
  try {
    const db = await getOfflineDb();
    const now = new Date().toISOString();
    db.run("UPDATE offline_orders SET status = 'synced', synced_at = ? WHERE id = ?", [now, id]);
    await persistDb();
  } catch {}

  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(LOCAL_STORAGE_OFFLINE_ORDERS);
    if (raw) {
      try {
        const orders = JSON.parse(raw);
        const updated = orders.filter((o: any) => o.id !== id);
        localStorage.setItem(LOCAL_STORAGE_OFFLINE_ORDERS, JSON.stringify(updated));
      } catch {}
    }
    window.dispatchEvent(new CustomEvent("offline-orders-changed"));
  }
}

/**
 * Records a sync failure for an offline order.
 */
export async function markOfflineOrderFailed(id: string, errorMsg: string): Promise<void> {
  try {
    const db = await getOfflineDb();
    db.run("UPDATE offline_orders SET sync_error = ? WHERE id = ?", [errorMsg, id]);
    await persistDb();
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-orders-changed"));
  }
}

/**
 * Returns the count of pending offline orders.
 */
export async function getPendingOrdersCount(): Promise<number> {
  try {
    const db = await getOfflineDb();
    const res = db.exec("SELECT COUNT(*) FROM offline_orders WHERE status = 'pending'");
    if (res && res.length > 0 && res[0].values[0]) {
      return Number(res[0].values[0][0]) || 0;
    }
  } catch {}

  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(LOCAL_STORAGE_OFFLINE_ORDERS);
    if (raw) {
      try {
        const orders = JSON.parse(raw);
        return orders.filter((o: any) => o.status === "pending").length;
      } catch {}
    }
  }

  return 0;
}

// ==========================================
// DRAFTS MANAGEMENT IN SQLITE / FALLBACK
// ==========================================

export async function saveOfflineDraft(draft: {
  id?: string;
  title: string;
  order_type: string;
  table_no?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  total: number;
  cart: any[];
}): Promise<string> {
  const id = draft.id || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // Drafts are stored in localStorage only — no WASM/SQLite needed.
  if (typeof window !== "undefined") {
    const drafts: OfflineDraftRow[] = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_DRAFTS) || "[]"
    );
    const existing = drafts.find((d) => d.id === id);
    const filtered = drafts.filter((d) => d.id !== id);
    filtered.unshift({
      id,
      title: draft.title,
      order_type: draft.order_type,
      table_no: draft.table_no,
      customer_name: draft.customer_name,
      customer_phone: draft.customer_phone,
      notes: draft.notes,
      total: draft.total,
      cart_json: JSON.stringify(draft.cart),
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    localStorage.setItem(LOCAL_STORAGE_DRAFTS, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent("offline-drafts-changed"));
  }
  return id;
}

export async function getOfflineDrafts(): Promise<OfflineDraftRow[]> {
  // Drafts are localStorage-only — no WASM/SQLite needed.
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(LOCAL_STORAGE_DRAFTS);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
  }
  return [];
}

export async function deleteOfflineDraft(id: string): Promise<void> {
  // Drafts are localStorage-only — no WASM/SQLite needed.
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(LOCAL_STORAGE_DRAFTS);
    if (raw) {
      try {
        const drafts = JSON.parse(raw);
        const filtered = drafts.filter((d: any) => d.id !== id);
        localStorage.setItem(LOCAL_STORAGE_DRAFTS, JSON.stringify(filtered));
      } catch {}
    }
    window.dispatchEvent(new CustomEvent("offline-drafts-changed"));
  }
}

