"use client";

/**
 * New Order page — fully client-rendered.
 *
 * On mount:
 *  1. Reads menu + settings from IndexedDB immediately → renders
 *  2. If online, fetches fresh data from Supabase in background → updates IDB + re-renders
 *
 * Works entirely offline once the cache has been populated after the first
 * online visit.
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getMenuByType,
  getSettings,
  saveMenuEntries,
  saveSettings,
  setMeta,
  getMeta,
  MenuEntry,
  SettingsEntry,
} from "@/lib/offline/idb";
import {
  startSyncManager,
  stopSyncManager,
  configureSyncFunctions,
} from "@/lib/offline/sync-manager";
import { placeOrderAction, updateOrderStatusAction, markOrderPaidAction, fetchMenuDataAction } from "@/app/cashier/actions";
import PosTerminal from "@/app/cashier/PosTerminal";

// ─── Types matching PosTerminal props ─────────────────────────────────────────

interface Category { id: string; name: string; sort_order?: number; }
interface ProductVariant { id: string; name: string; sale_price: number; }
interface Product {
  id: string; code: string; name: string; image_url: string | null;
  category_id: string | null; status: string; sort_order?: number;
  product_variants: ProductVariant[];
}
interface Addon { id?: string; name: string; price_delta: number; }

interface PageData {
  categories: Category[];
  products: Product[];
  addons: Addon[];
  settings: SettingsEntry | null;
  restaurantId: string | null;
}

const EMPTY_DATA: PageData = {
  categories: [], products: [], addons: [], settings: null, restaurantId: null,
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function NewOrderPage() {
  const [data, setData] = useState<PageData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [cachedBranding, setCachedBranding] = useState({ name: "", slug: "", logo_url: "", slogan: "" });
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Read localStorage branding on client mount (SSR-safe fallback)
  useEffect(() => {
    setCachedBranding({
      name: localStorage.getItem("cached_restaurant_name") || "",
      slug: localStorage.getItem("cached_restaurant_slug") || "",
      logo_url: localStorage.getItem("cached_restaurant_logo") || "",
      slogan: localStorage.getItem("cached_restaurant_slogan") || "",
    });
  }, []);

  // ── 1. Load from IDB on mount ────────────────────────────────────────────
  const loadFromIdb = useCallback(async (restaurantId: string) => {
    const [cats, prods, vars, addons, settings] = await Promise.all([
      getMenuByType(restaurantId, "category"),
      getMenuByType(restaurantId, "product"),
      getMenuByType(restaurantId, "variant"),
      getMenuByType(restaurantId, "addon"),
      getSettings(restaurantId),
    ]);

    // Reconstruct products with variants
    const variantMap = new Map<string, ProductVariant[]>();
    for (const v of vars) {
      const vd = v.data as any;
      const productId = vd.product_id;
      if (!variantMap.has(productId)) variantMap.set(productId, []);
      variantMap.get(productId)!.push({ id: vd.id, name: vd.name, sale_price: vd.sale_price });
    }

    const products: Product[] = prods
      .map((p) => {
        const pd = p.data as any;
        return {
          id: pd.id, code: pd.code, name: pd.name,
          image_url: pd.image_url, category_id: pd.category_id,
          status: pd.status,
          sort_order: pd.sort_order ?? 0,
          product_variants: variantMap.get(pd.id) || [],
        };
      })
      .sort((a, b) => {
        const sDiff = (a.sort_order || 0) - (b.sort_order || 0);
        if (sDiff !== 0) return sDiff;
        return (a.code || "").localeCompare(b.code || "", undefined, { numeric: true });
      });

    const categories: Category[] = cats
      .map((c) => {
        const cd = c.data as any;
        return { id: cd.id, name: cd.name, sort_order: cd.sort_order ?? 999 };
      })
      .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

    const addonList: Addon[] = addons.map((a) => {
      const ad = a.data as any;
      return { id: ad.id, name: ad.name, price_delta: ad.price_delta };
    });

    const localTaxRate = typeof window !== "undefined" ? parseFloat(localStorage.getItem("cached_tax_rate") || "") : NaN;
    const localEnableServiceFee = typeof window !== "undefined" ? localStorage.getItem("cached_enable_service_fee") === "true" : false;
    const localServiceFeeAmount = typeof window !== "undefined" ? parseFloat(localStorage.getItem("cached_service_fee_amount") || "") : NaN;

    const mergedSettings = settings ? {
      ...settings,
      tax_rate: settings.tax_rate ?? (!isNaN(localTaxRate) ? localTaxRate : 0),
      enable_service_fee: settings.enable_service_fee ?? localEnableServiceFee,
      service_fee_amount: settings.service_fee_amount ?? (!isNaN(localServiceFeeAmount) ? localServiceFeeAmount : 0),
    } : {
      currency: "PKR",
      tax_rate: !isNaN(localTaxRate) ? localTaxRate : 0,
      enable_service_fee: localEnableServiceFee,
      service_fee_amount: !isNaN(localServiceFeeAmount) ? localServiceFeeAmount : 0,
    };

    setData({ categories, products, addons: addonList, settings: mergedSettings as any, restaurantId });
    setLoading(false);
  }, []);

  // ── 2. Fetch from Supabase + refresh IDB in background ──────────────────
  const refreshFromServer = useCallback(async (restaurantId: string) => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const res = await fetchMenuDataAction();
      if (res.error || !res.restaurantId) {
        setSyncing(false);
        return;
      }

      const resolvedRid = res.restaurantId || restaurantId;

      const allEntries: MenuEntry[] = [
        ...(res.categories || []).map((r: any) => ({ id: `cat_${r.id}`, restaurant_id: resolvedRid, type: "category" as const, data: r })),
        ...(res.products || []).map((r: any) => ({ id: `prod_${r.id}`, restaurant_id: resolvedRid, type: "product" as const, data: r })),
        ...(res.variants || []).map((r: any) => ({ id: `var_${r.id}`, restaurant_id: resolvedRid, type: "variant" as const, data: r })),
        ...(res.addons || []).map((r: any) => ({ id: `addon_${r.id}`, restaurant_id: resolvedRid, type: "addon" as const, data: r })),
      ];

      await saveMenuEntries(resolvedRid, allEntries.map(e => ({ id: e.id, type: e.type, data: e.data })));

      const settingsData = res.settings;
      const restData = res.restaurant;

      if (restData?.name) localStorage.setItem("cached_restaurant_name", restData.name);
      if (restData?.slug) localStorage.setItem("cached_restaurant_slug", restData.slug);
      if (restData?.logo_url) localStorage.setItem("cached_restaurant_logo", restData.logo_url);
      if (settingsData?.slogan) localStorage.setItem("cached_restaurant_slogan", settingsData.slogan);

      if (settingsData) {
        localStorage.setItem("cached_tax_rate", String(settingsData.tax_rate ?? 0));
        localStorage.setItem("cached_enable_service_fee", String(settingsData.enable_service_fee ? "true" : "false"));
        localStorage.setItem("cached_service_fee_amount", String(settingsData.service_fee_amount ?? 0));
      }

      await saveSettings({
        restaurant_id: resolvedRid,
        currency: settingsData?.currency || "PKR",
        tax_rate: settingsData?.tax_rate || 0,
        enable_service_fee: settingsData?.enable_service_fee || false,
        service_fee_amount: settingsData?.service_fee_amount || 0,
        name: restData?.name || "",
        slug: restData?.slug || "",
        logo_url: restData?.logo_url || "",
        slogan: settingsData?.slogan || "",
      });

      await setMeta(`lastMenuSync_${resolvedRid}`, Date.now());
      setLastSyncTime(Date.now());
      setSyncing(false);

      // Re-render from IDB with fresh data
      await loadFromIdb(resolvedRid);
    } catch {
      setSyncing(false);
      // Ignore background refresh errors (we already have IDB data)
    }
  }, [loadFromIdb]);

  // ── 3. Bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      let restaurantId = typeof window !== "undefined" ? localStorage.getItem("cached_restaurant_id") : null;

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("restaurant_id")
            .eq("id", user.id)
            .single();
          if (profile?.restaurant_id) {
            restaurantId = profile.restaurant_id;
            localStorage.setItem("cached_restaurant_id", profile.restaurant_id);
          }
        }
      } catch {
        // Offline: use cached_restaurant_id from localStorage
      }

      if (!restaurantId || cancelled) return;

      // Configure sync functions (inject server actions into sync manager)
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

      // Start sync manager
      startSyncManager(restaurantId);

      // Load IDB first (instant, works offline)
      await loadFromIdb(restaurantId);
      if (cancelled) return;

      // Read last sync time for UI
      const lastSync = await getMeta(`lastMenuSync_${restaurantId}`);
      if (lastSync) setLastSyncTime(lastSync as number);

      // Then refresh from server in background
      refreshFromServer(restaurantId).catch(console.warn);
    }

    init().catch(console.warn);

    return () => {
      cancelled = true;
      stopSyncManager();
    };
  }, [loadFromIdb, refreshFromServer]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-zinc-500">Loading menu…</p>
        </div>
      </div>
    );
  }

  const { categories, products, addons, settings, restaurantId } = data;

  // If offline and no menu cached yet, show a friendly error
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const hasMenuCache = products.length > 0;

  if (isOffline && !hasMenuCache) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)] p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">📵</div>
          <h2 className="text-base font-bold text-black">Menu Not Available Offline</h2>
          <p className="text-xs text-zinc-500 leading-relaxed">
            The menu has not been cached yet. Please connect to the internet and visit
            this page once while online — the full menu will be saved automatically
            for offline use.
          </p>
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-xs text-zinc-600 text-left">
            <p className="font-semibold mb-1">How to enable offline mode:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Connect to internet</li>
              <li>Open New Order page</li>
              <li>Wait for menu to load</li>
              <li>You can now use it offline ✓</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  const syncLabel = lastSyncTime
    ? `Menu synced ${new Date(lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : syncing ? "Syncing menu…" : "Menu not synced yet";

  return (
    <div className="relative">
      {/* Offline cache status badge */}
      <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5">
        {syncing && (
          <span className="text-[10px] text-zinc-400 flex items-center gap-1">
            <span className="w-2 h-2 border border-zinc-400 border-t-transparent rounded-full animate-spin inline-block" />
            Syncing menu…
          </span>
        )}
        {!syncing && lastSyncTime && (
          <span className="text-[10px] text-zinc-400" title={syncLabel}>
            💾 {syncLabel}
          </span>
        )}
        {!syncing && !lastSyncTime && (
          <span className="text-[10px] text-amber-600 font-semibold" title="Visit while online to cache menu for offline use">
            ⚠ Menu not cached
          </span>
        )}
      </div>
      <PosTerminal
        categories={categories}
        products={products}
        addons={addons}
        currency={settings?.currency || "PKR"}
        taxRate={Number(settings?.tax_rate || 0)}
        enableServiceFee={Boolean(settings?.enable_service_fee)}
        serviceFeeAmount={Number(settings?.service_fee_amount || 0)}
        restaurantId={restaurantId || ""}
        restaurantName={settings?.name || cachedBranding.name}
        restaurantSlug={settings?.slug || cachedBranding.slug}
        logoUrl={settings?.logo_url || cachedBranding.logo_url}
        slogan={settings?.slogan || cachedBranding.slogan}
      />
    </div>
  );
}
