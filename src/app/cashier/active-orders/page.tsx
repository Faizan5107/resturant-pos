"use client";

/**
 * Active Orders page — fully client-rendered.
 *
 * On mount:
 *  1. Reads orders from IndexedDB immediately → renders
 *  2. If online, fetches fresh via server action (always auth'd) → updates IDB + re-renders
 *  3. Polls every 30 seconds while online to catch kitchen status updates
 *
 * Outbox "pending sync" orders are shown inline with a badge.
 * Works offline once IDB is populated.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getOrdersByRestaurant,
  saveOrders,
  setMeta,
  OrderEntry,
} from "@/lib/offline/idb";
import { getOutbox } from "@/lib/offline/outbox";
import { OutboxEntry } from "@/lib/offline/idb";
import { configureSyncFunctions, startSyncManager } from "@/lib/offline/sync-manager";
import { placeOrderAction, updateOrderStatusAction, markOrderPaidAction, fetchOrdersAction } from "@/app/cashier/actions";
import ActiveOrdersBoard from "./ActiveOrdersBoard";

interface Product {
  id: string; code: string; name: string; status: string;
  product_variants: Array<{ id: string; name: string; sale_price: number }>;
}

export default function ActiveOrdersPage() {
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [currency, setCurrency] = useState("PKR");
  const [isAdmin, setIsAdmin] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFromIdb = useCallback(async (rid: string) => {
    try {
      const [idbOrders, outbox] = await Promise.all([
        getOrdersByRestaurant(rid),
        getOutbox(rid),
      ]);
      // Sort newest first
      const sorted = [...idbOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setOrders(sorted);
      setOutboxEntries(outbox);
    } catch (err) {
      console.warn("Failed to load from IDB:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshFromServer = useCallback(async (rid: string) => {
    if (!navigator.onLine) return;
    try {
      // Use server action instead of browser-side Supabase client.
      // This ensures auth always works via server cookies regardless of
      // whether NEXT_PUBLIC_ env vars are set in the browser bundle.
      const res = await fetchOrdersAction();
      if (res.orders) {
        const resolvedRid = res.restaurantId || rid;
        const mapped: OrderEntry[] = res.orders.map((o) => ({
          id: o.id,
          restaurant_id: resolvedRid,
          order_no: o.order_no,
          order_type: o.order_type,
          table_no: o.table_no,
          customer_name: o.customer_name,
          status: o.status,
          subtotal: o.subtotal,
          tax_amount: o.tax_amount,
          total: o.total,
          payment_method: o.payment_method,
          cancel_reason: o.cancel_reason,
          created_at: o.created_at,
          updated_at: o.updated_at,
          order_items: o.order_items || [],
        }));
        await saveOrders(mapped);
        await setMeta(`lastOrdersSync_${resolvedRid}`, Date.now());
        await loadFromIdb(resolvedRid);
      }
    } catch {
      // Ignore background refresh errors
    }
  }, [loadFromIdb]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let rid = typeof window !== "undefined" ? localStorage.getItem("cached_restaurant_id") : null;
      let userRole = typeof window !== "undefined" ? localStorage.getItem("cached_role") : null;

      // 1. Immediately load local IndexedDB data if cached restaurant ID exists
      if (rid) {
        setRestaurantId(rid);
        setIsAdmin(userRole === "admin" || userRole === "super_admin");

        configureSyncFunctions({
          placeOrder: async (payload: unknown, clientUuid: string) => {
            const res = await placeOrderAction(payload as any, clientUuid);
            return {
              success: !!res.success,
              result: res.result ? {
                order_id: res.result.order_id,
                order_no: res.result.order_no,
                total: res.result.total,
              } : undefined,
              error: res.error,
            };
          },
          statusChange: async (orderId: string, status: string) => {
            const res = await updateOrderStatusAction(orderId, status);
            return { success: !!res.success, error: res.error, status: res.status };
          },
          payment: async (orderId: string, method: string) => {
            const res = await markOrderPaidAction(orderId, method as any);
            return { success: !!res.success, error: res.error, status: res.status };
          },
        });
        startSyncManager(rid);

        await loadFromIdb(rid);
      }

      // If no cached ID, turn off loading state immediately so UI isn't stuck
      if (!rid && !cancelled) {
        setLoading(false);
      }

      if (cancelled) return;

      // 2. Perform online auth check in background
      if (navigator.onLine) {
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("restaurant_id, role")
              .eq("id", user.id)
              .single();

            if (profile?.restaurant_id) {
              const newRid = profile.restaurant_id;
              const newRole = profile.role;
              localStorage.setItem("cached_restaurant_id", newRid);
              if (newRole) localStorage.setItem("cached_role", newRole);

              if (newRid !== rid) {
                rid = newRid;
                setRestaurantId(newRid);
                setIsAdmin(newRole === "admin" || newRole === "super_admin");
                await loadFromIdb(newRid);
              }
            }
          }
        } catch {
          // Ignore auth network errors in offline / poor network mode
        }
      }

      if (!rid || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      const activeRid = rid;

      // 3. Fetch products & refresh orders from server in background if online
      if (navigator.onLine) {
        try {
          const supabase = createClient();
          const [prodRes, settingsRes] = await Promise.all([
            supabase
              .from("products")
              .select("id, code, name, status, product_variants(id, name, sale_price)")
              .neq("status", "hidden")
              .order("name"),
            supabase
              .from("restaurant_settings")
              .select("currency")
              .eq("restaurant_id", activeRid)
              .single(),
          ]);
          if (!cancelled) {
            setProducts((prodRes.data as any) || []);
            setCurrency(settingsRes.data?.currency || "PKR");
          }
        } catch {
          // Ignore settings/product fetch errors
        }

        if (!cancelled) refreshFromServer(activeRid).catch(console.warn);
      }

      if (!cancelled) setLoading(false);

      // Poll every 30 s when online
      pollRef.current = setInterval(() => {
        if (navigator.onLine && !cancelled) {
          refreshFromServer(activeRid).catch(console.warn);
        }
      }, 30_000);
    }

    // Refresh outbox entries + re-sync from server when outbox changes.
    // This ensures orders that finish syncing from outbox→Supabase appear
    // in the main orders grid immediately (not just the Pending Sync section).
    const handleOutboxChanged = () => {
      const activeRid = restaurantId || localStorage.getItem("cached_restaurant_id");
      if (!activeRid) return;
      loadFromIdb(activeRid).catch(console.warn);
      if (navigator.onLine) refreshFromServer(activeRid).catch(console.warn);
    };
    window.addEventListener("outbox-changed", handleOutboxChanged);

    init().catch(console.warn);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener("outbox-changed", handleOutboxChanged);
    };
  }, [loadFromIdb, refreshFromServer]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-zinc-500">Loading orders…</p>
        </div>
      </div>
    );
  }

  return (
    <ActiveOrdersBoard
      initialOrders={orders as any}
      outboxEntries={outboxEntries}
      products={products}
      currency={currency}
      isAdmin={isAdmin}
    />
  );
}
