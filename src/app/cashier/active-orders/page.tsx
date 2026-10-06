"use client";

/**
 * Active Orders page — fully client-rendered.
 *
 * On mount:
 *  1. Reads orders from IndexedDB immediately → renders
 *  2. If online, fetches fresh from Supabase in background → updates IDB + re-renders
 *  3. Polls every 30 seconds while online to catch kitchen status updates
 *
 * Outbox "pending sync" orders are shown inline with a badge.
 * Works offline once IDB is populated.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getOrdersByRestaurant,
  saveOrders,
  setMeta,
  getMeta,
  OrderEntry,
} from "@/lib/offline/idb";
import { getOutbox } from "@/lib/offline/outbox";
import { OutboxEntry } from "@/lib/offline/idb";
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
    setLoading(false);
  }, []);

  const refreshFromServer = useCallback(async (rid: string) => {
    if (!navigator.onLine) return;
    const supabase = createClient();

    try {
      const { data: ordersData } = await supabase
        .from("orders")
        .select(`
          id, order_no, order_type, table_no, customer_name, status,
          subtotal, tax_amount, total, payment_method, cancel_reason,
          created_at, updated_at,
          order_items(id, product_name, variant_name, unit_price, quantity, line_total, notes)
        `)
        .eq("restaurant_id", rid)
        .order("created_at", { ascending: false });

      if (ordersData) {
        const mapped: OrderEntry[] = (ordersData as any[]).map((o) => ({
          id: o.id,
          restaurant_id: rid,
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
        await setMeta(`lastOrdersSync_${rid}`, Date.now());
        await loadFromIdb(rid);
      }
    } catch {
      // Ignore background refresh errors
    }
  }, [loadFromIdb]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const supabase = createClient();
      let rid = typeof window !== "undefined" ? localStorage.getItem("cached_restaurant_id") : null;
      let userRole = typeof window !== "undefined" ? localStorage.getItem("cached_role") : null;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("restaurant_id, role")
            .eq("id", user.id)
            .single();

          if (profile?.restaurant_id) {
            rid = profile.restaurant_id;
            userRole = profile.role;
            localStorage.setItem("cached_restaurant_id", profile.restaurant_id);
            if (profile.role) localStorage.setItem("cached_role", profile.role);
          }
        }
      } catch {
        // Offline: use cached_restaurant_id from localStorage
      }

      if (!rid || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      setRestaurantId(rid);
      setIsAdmin(userRole === "admin" || userRole === "super_admin");

      // Load IDB first (instant, works offline)
      await loadFromIdb(rid);
      if (!cancelled) setLoading(false);
      if (cancelled) return;

      // Fetch products for add-items modal
      if (navigator.onLine) {
        const [prodRes, settingsRes] = await Promise.all([
          supabase.from("products")
            .select("id, code, name, status, product_variants(id, name, sale_price)")
            .neq("status", "hidden").order("name"),
          supabase.from("restaurant_settings")
            .select("currency").eq("restaurant_id", rid).single(),
        ]);
        if (!cancelled) {
          setProducts((prodRes.data as any) || []);
          setCurrency(settingsRes.data?.currency || "PKR");
        }
      }

      // Background refresh
      if (!cancelled) refreshFromServer(rid).catch(console.warn);

      // Poll every 30 s when online
      pollRef.current = setInterval(() => {
        if (navigator.onLine && !cancelled) refreshFromServer(rid).catch(console.warn);
      }, 30_000);
    }

    // Also refresh outbox entries when they change
    const handleOutboxChanged = () => {
      if (restaurantId) loadFromIdb(restaurantId).catch(console.warn);
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
