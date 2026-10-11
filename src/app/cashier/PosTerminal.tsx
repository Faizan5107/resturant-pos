"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { placeOrderAction } from "./actions";
import { useOffline } from "@/lib/offline/useOffline";
import { addOrderToOutbox } from "@/lib/offline/outbox";
import { saveOfflineDraft, OfflineDraftRow } from "@/lib/offline/sqlite-db";
import {
  printOfflineKitchenSlip,
  printOfflineBillSlip,
  OfflineKitchenSlipData,
  OfflineBillSlipData,
} from "@/lib/offline/offlinePrint";
import DraftsModal from "./DraftsModal";

interface Category {
  id: string;
  name: string;
}

interface ProductVariant {
  id: string;
  name: string;
  sale_price: number;
}

interface Product {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
  category_id: string | null;
  status: string;
  product_variants: ProductVariant[];
}

interface Addon {
  id?: string;
  name: string;
  price_delta: number;
}

interface CartItem {
  cart_key: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
  addons?: Array<{ addon_name: string; price_delta: number }>;
  available_variants?: ProductVariant[];
}

// Common fallback add-ons if DB addons table is empty
const DEFAULT_ADDONS: Addon[] = [
  { name: "Double Patty", price_delta: 100 },
  { name: "Extra Cheese", price_delta: 50 },
  { name: "Extra Chicken", price_delta: 150 },
  { name: "Dip Sauce", price_delta: 40 },
  { name: "Extra Patty", price_delta: 120 },
];

export default function PosTerminal({
  categories,
  products,
  addons = [],
  currency = "PKR",
  taxRate = 0,
  enableServiceFee = false,
  serviceFeeAmount = 0,
  restaurantId = "",
  restaurantName = "",
  restaurantSlug = "",
  logoUrl = "",
  slogan = "",
}: {
  categories: Category[];
  products: Product[];
  addons?: Addon[];
  currency?: string;
  taxRate?: number;
  enableServiceFee?: boolean;
  serviceFeeAmount?: number;
  restaurantId?: string;
  restaurantName?: string;
  restaurantSlug?: string;
  logoUrl?: string;
  slogan?: string;
}) {
  const router = useRouter();
  const { isOnline, pendingCount, isSyncing, syncPaused, lastSyncResult, reconciledNotice, triggerSync, resumeAfterLogin, dismissReconciled } = useOffline(restaurantId || null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [tableNo, setTableNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [offlinePrintUrl, setOfflinePrintUrl] = useState<string | null>(null);
  const [lastOfflineSlip, setLastOfflineSlip] = useState<OfflineKitchenSlipData | null>(null);
  const [lastOfflineBillSlip, setLastOfflineBillSlip] = useState<OfflineBillSlipData | null>(null);

  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);

  // Customize Item Modal State
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [addonCounts, setAddonCounts] = useState<Record<string, number>>({});
  const [itemNote, setItemNote] = useState("");

  const availableAddonsList: Addon[] =
    addons && addons.length > 0 ? addons : DEFAULT_ADDONS;

  // Filter products by selected category and search query
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true;
    const matchesSearch = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesCategory && matchesSearch;
  });

  // Open Customize Modal when product is clicked
  const handleOpenCustomize = (product: Product, defaultVariant?: ProductVariant) => {
    if (product.status === "out_of_stock") return;

    setCustomizingProduct(product);
    setSelectedVariant(defaultVariant || product.product_variants[0] || null);
    setAddonCounts({});
    setItemNote("");
  };

  const updateAddonQty = (addonName: string, delta: number) => {
    setAddonCounts((prev) => {
      const current = prev[addonName] || 0;
      const updated = Math.max(0, current + delta);
      return { ...prev, [addonName]: updated };
    });
  };

  // Add customized item from modal to cart
  const handleConfirmAddCustomizedItem = () => {
    if (!customizingProduct || !selectedVariant) return;

    // Calculate addon totals
    const addonDetails: Array<{ addon_name: string; price_delta: number }> = [];
    let totalAddonPrice = 0;

    Object.entries(addonCounts).forEach(([name, count]) => {
      if (count > 0) {
        const addonObj = availableAddonsList.find((a) => a.name === name);
        const singleDelta = Number(addonObj?.price_delta || 0);
        const totalDelta = singleDelta * count;
        totalAddonPrice += totalDelta;

        const displayName = count > 1 ? `${name} (x${count})` : name;
        addonDetails.push({
          addon_name: displayName,
          price_delta: totalDelta,
        });
      }
    });

    const basePrice = Number(selectedVariant.sale_price);
    const unitPrice = basePrice + totalAddonPrice;
    
    // Unique key identifying this exact variant + addon configuration
    const cartKey = `${selectedVariant.id}_${JSON.stringify(addonDetails)}_${itemNote || ""}`;

    setCart((prev) => {
      const existingIndex = prev.findIndex((i) => i.cart_key === cartKey);

      if (existingIndex > -1) {
        // Same exact variant & addons -> increment quantity
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        return updated;
      }

      // Distinct size/variant or distinct addons -> add as a new cart line
      const newItem: CartItem = {
        cart_key: cartKey,
        product_id: customizingProduct.id,
        variant_id: selectedVariant.id,
        product_name: customizingProduct.name,
        variant_name: selectedVariant.name,
        unit_price: unitPrice,
        quantity: 1,
        notes: itemNote || undefined,
        addons: addonDetails.length > 0 ? addonDetails : undefined,
        available_variants: customizingProduct.product_variants,
      };

      return [...prev, newItem];
    });

    setCustomizingProduct(null);
  };

  const changeCartItemVariant = (cartKey: string, newVariantId: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.cart_key === cartKey && item.available_variants) {
          const newVar = item.available_variants.find((v) => v.id === newVariantId);
          if (newVar) {
            const addonPriceSum = (item.addons || []).reduce(
              (sum, a) => sum + Number(a.price_delta),
              0
            );
            const newKey = `${newVar.id}_${JSON.stringify(item.addons || [])}_${item.notes || ""}`;
            return {
              ...item,
              cart_key: newKey,
              variant_id: newVar.id,
              variant_name: newVar.name,
              unit_price: Number(newVar.sale_price) + addonPriceSum,
            };
          }
        }
        return item;
      })
    );
  };

  const updateQuantity = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cart_key === cartKey) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const appliedServiceFee = orderType === "dine_in" && enableServiceFee ? Number(serviceFeeAmount || 0) : 0;
  const total = subtotal + taxAmount + (orderType === "delivery" ? Number(deliveryFee || 0) : 0) + appliedServiceFee;

  const clearForm = () => {
    setCart([]);
    setTableNo("");
    setCustomerName("");
    setCustomerPhone("");
    setOrderNotes("");
    setDeliveryFee(0);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setError("Please add at least one item to the cart.");
      return;
    }

    if (orderType === "dine_in" && !tableNo) {
      setError("Please enter Table Number for Dine-In orders.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessNotice(null);

    const payload = {
      order_type: orderType,
      table_no: tableNo || undefined,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      delivery_fee: orderType === "delivery" ? Number(deliveryFee || 0) : undefined,
      notes: orderNotes || undefined,
      items: cart.map((i) => ({
        variant_id: i.variant_id,
        quantity: i.quantity,
        notes: i.notes,
        addons: i.addons,
      })),
    };

    const triggerOfflinePrint = (
      tempOrderNo: string,
      clientUuid: string,
      orderPayload: any,
      cartItems: CartItem[]
    ) => {
      const slipItems = orderPayload.items.map((i: any) => ({
        product_name: cartItems.find((c) => c.variant_id === i.variant_id)?.product_name || "",
        variant_name: cartItems.find((c) => c.variant_id === i.variant_id)?.variant_name || "",
        quantity: i.quantity,
        line_total: (cartItems.find((c) => c.variant_id === i.variant_id)?.unit_price || 0) * i.quantity,
        notes: i.notes || "",
        addons: i.addons || [],
      }));

      const resolvedRestName = restaurantName || (typeof window !== "undefined" ? localStorage.getItem("cached_restaurant_name") || "" : "");
      const resolvedSlug = restaurantSlug || (typeof window !== "undefined" ? localStorage.getItem("cached_restaurant_slug") || "" : "");
      const resolvedLogo = logoUrl || (typeof window !== "undefined" ? localStorage.getItem("cached_restaurant_logo") || "" : "");
      const resolvedSlogan = slogan || (typeof window !== "undefined" ? localStorage.getItem("cached_restaurant_slogan") || "" : "");

      const kitchenData: OfflineKitchenSlipData = {
        orderNo: tempOrderNo,
        orderType: orderPayload.order_type,
        tableNo: orderPayload.table_no || "",
        items: slipItems,
        notes: orderPayload.notes || "",
        restaurantName: resolvedRestName,
        restaurantSlug: resolvedSlug,
        logoUrl: resolvedLogo,
        slogan: resolvedSlogan,
      };

      const billData: OfflineBillSlipData = {
        orderNo: tempOrderNo,
        orderType: orderPayload.order_type,
        tableNo: orderPayload.table_no || "",
        customerName: orderPayload.customer_name || "",
        customerPhone: orderPayload.customer_phone || "",
        currency,
        items: slipItems,
        subtotal,
        taxAmount,
        deliveryFee,
        serviceFee: appliedServiceFee,
        total,
        restaurantName: resolvedRestName,
        restaurantSlug: resolvedSlug,
        logoUrl: resolvedLogo,
        slogan: resolvedSlogan,
      };

      const slipParams = new URLSearchParams({
        uuid: clientUuid,
        orderNo: tempOrderNo,
        orderType: orderPayload.order_type,
        tableNo: orderPayload.table_no || "",
        items: JSON.stringify(slipItems),
        notes: orderPayload.notes || "",
        restaurantName: resolvedRestName,
        slug: resolvedSlug,
        logoUrl: resolvedLogo,
        slogan: resolvedSlogan,
      });
      const url = `/print/kitchen/offline?${slipParams.toString()}`;

      setLastOfflineSlip(kitchenData);
      setLastOfflineBillSlip(billData);
      setOfflinePrintUrl(url);

      // Directly prints in-memory without navigating to external HTTP URL (0ms latency, works offline)
      printOfflineKitchenSlip(kitchenData);
    };

    try {
      if (!isOnline) {
        // Save to outbox with temp order number
        const { clientUuid, tempOrderNo } = await addOrderToOutbox(
          restaurantId || "unknown",
          payload,
          total
        );
        setLoading(false);
        triggerOfflinePrint(tempOrderNo, clientUuid, payload, cart);
        clearForm();
        setSuccessNotice(`Order ${tempOrderNo} saved offline. Will sync when online.`);
        return;
      }

      const res = await placeOrderAction(payload);
      setLoading(false);

      if (res.error) {
        if (
          res.error.includes("Offline mode active") ||
          res.error.includes("fetch failed") ||
          res.error.includes("Failed to fetch")
        ) {
          const { clientUuid, tempOrderNo } = await addOrderToOutbox(
            restaurantId || "unknown",
            payload,
            total
          );
          triggerOfflinePrint(tempOrderNo, clientUuid, payload, cart);
          clearForm();
          setSuccessNotice(`Supabase unreachable. Order ${tempOrderNo} saved offline.`);
        } else {
          setError(res.error);
        }
      } else if (res.result?.order_id) {
        clearForm();
        try { window.open(`/print/kitchen/${res.result.order_id}`, "_blank", "width=420,height=600"); } catch {}
        // Delay navigation so the browser doesn't block the popup window before it opens
        setTimeout(() => router.push("/cashier/active-orders"), 300);
      }
    } catch {
      const { clientUuid, tempOrderNo } = await addOrderToOutbox(
        restaurantId || "unknown",
        payload,
        total
      );
      setLoading(false);
      triggerOfflinePrint(tempOrderNo, clientUuid, payload, cart);
      clearForm();
      setSuccessNotice(`Connection error. Order ${tempOrderNo} saved offline.`);
    }
  };

  const handleSaveDraft = async () => {
    if (cart.length === 0) {
      setError("Cannot save an empty order as draft.");
      return;
    }

    try {
      const title = `${customerName ? customerName : tableNo ? `Table ${tableNo}` : "Walk-in Customer"} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      await saveOfflineDraft({
        title,
        order_type: orderType,
        table_no: tableNo || undefined,
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        notes: orderNotes || undefined,
        total,
        cart,
      });

      clearForm();
      setError(null);
      setSuccessNotice("Order placed on hold as Draft in SQLite. You can now serve the next customer.");
    } catch (err: any) {
      setError(`Failed to save draft: ${err.message}`);
    }
  };

  const handleResumeDraft = (draft: OfflineDraftRow) => {
    try {
      const savedCart = JSON.parse(draft.cart_json);
      setCart(savedCart);
      setOrderType(draft.order_type as any);
      setTableNo(draft.table_no || "");
      setCustomerName(draft.customer_name || "");
      setCustomerPhone(draft.customer_phone || "");
      setOrderNotes(draft.notes || "");
      setIsDraftsModalOpen(false);
      setSuccessNotice(`Resumed draft: ${draft.title}`);
    } catch (err) {
      setError("Failed to restore draft cart items.");
    }
  };

  // Calculate modal preview totals
  const modalBasePrice = selectedVariant ? Number(selectedVariant.sale_price) : 0;
  const modalAddonsPrice = Object.entries(addonCounts).reduce((sum, [name, count]) => {
    if (count <= 0) return sum;
    const aObj = availableAddonsList.find((a) => a.name === name);
    return sum + Number(aObj?.price_delta || 0) * count;
  }, 0);
  const modalTotalUnitPrice = modalBasePrice + modalAddonsPrice;

  return (
    <div className="space-y-3 h-[calc(100vh-100px)] flex flex-col">
      {/* Top Status Bar */}
      <div className="bg-white border border-black rounded-lg px-4 py-2 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center space-x-3">
          {/* Online/Offline indicator */}
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full border border-black ${
                isOnline ? "bg-black" : "bg-white"
              }`}
            />
            <span className="text-xs font-bold text-black">
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>

          {!isOnline && (
            <span className="border border-black text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
              Offline Mode
            </span>
          )}

          {pendingCount > 0 && (
            <div className="flex items-center space-x-2 border border-black px-2.5 py-1 rounded">
              <span className="text-xs font-semibold text-black">
                Pending sync: {pendingCount}
              </span>
              {isOnline && !syncPaused && (
                <button
                  type="button"
                  onClick={triggerSync}
                  disabled={isSyncing}
                  className="px-2 py-0.5 bg-black text-white text-[11px] font-bold rounded hover:bg-zinc-800 disabled:opacity-50"
                >
                  {isSyncing ? "Syncing…" : "Sync Now"}
                </button>
              )}
            </div>
          )}

          {syncPaused && (
            <span className="border border-black text-black text-[10px] font-bold px-2 py-0.5 rounded">
              ⚠ Session expired — please log in again
            </span>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setIsDraftsModalOpen(true)}
            className="px-3 py-1 bg-zinc-100 border border-black rounded-md text-xs font-bold text-black hover:bg-black hover:text-white transition-colors flex items-center gap-1.5"
          >
            <span>📋 Held Drafts</span>
          </button>
        </div>
      </div>

      {/* Reconciliation notice */}
      {reconciledNotice && (
        <div className="border border-black bg-white rounded p-2.5 flex items-center justify-between text-xs">
          <span className="text-black">
            ℹ Order synced: temp <strong>{reconciledNotice.tempOrderNo}</strong> →
            real <strong>{reconciledNotice.serverOrderNo}</strong>
            {Math.abs(reconciledNotice.serverTotal - reconciledNotice.cachedTotal) > 0.01 && (
              <> · Total updated to <strong>{formatMoney(reconciledNotice.serverTotal, currency)}</strong></>
            )}
          </span>
          <button onClick={dismissReconciled} className="ml-3 font-bold text-black">✕</button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-6 flex-1 overflow-hidden">
        {/* Left Column: Menu Categories & Product Cards Grid (Cols 1-7) */}
        <div className="col-span-7 flex flex-col space-y-3 h-full overflow-hidden">
          {/* Search Box */}
          <div className="relative shrink-0">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-400 text-xs">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search menu items by name or code (e.g., Zinger, BURG-01)..."
              className="w-full pl-8 pr-8 py-2 bg-white border border-zinc-300 rounded-lg text-xs text-black placeholder-zinc-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-black text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Pills Strip */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 shrink-0">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === null
                  ? "bg-black text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-300"
              }`}
            >
              All Categories
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === c.id
                    ? "bg-black text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-300"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Product Cards Grid */}
          <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-3 gap-3 auto-rows-max">
            {filteredProducts.length === 0 ? (
              <div className="col-span-3 py-12 text-center text-zinc-400 text-xs">
                No items found matching "{searchQuery}"
              </div>
            ) : (
              filteredProducts.map((p) => {
                const isOutOfStock = p.status === "out_of_stock";
                return (
                  <div
                    key={p.id}
                    onClick={() => handleOpenCustomize(p)}
                    className={`border border-black rounded-lg overflow-hidden bg-white flex flex-col justify-between cursor-pointer group transition-all ${
                      isOutOfStock ? "opacity-50 pointer-events-none" : "hover:shadow-md hover:border-2"
                    }`}
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-20 object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = "none";
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            const fallback = document.createElement("div");
                            fallback.className = "w-full h-20 bg-zinc-100 flex items-center justify-center";
                            fallback.innerHTML = '<span class="text-3xl">🍽️</span>';
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-20 bg-zinc-100 flex items-center justify-center">
                        <span className="text-3xl">🍽️</span>
                      </div>
                    )}

                    <div className="p-3 space-y-2 flex flex-col flex-1">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-[10px] text-zinc-500">{p.code}</span>
                          {isOutOfStock && (
                            <span className="text-[9px] font-bold uppercase bg-zinc-200 text-black px-1 rounded">
                              Out of Stock
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-black leading-tight mt-1">{p.name}</h3>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-zinc-100 mt-auto">
                        {p.product_variants.map((v) => (
                          <button
                            key={v.id}
                            disabled={isOutOfStock}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCustomize(p, v);
                            }}
                            className="w-full py-1 px-2 bg-zinc-50 group-hover:bg-zinc-100 hover:!bg-black hover:!text-white border border-zinc-300 rounded text-[11px] font-semibold flex justify-between items-center transition-colors disabled:opacity-50"
                          >
                            <span className="truncate">{v.name}</span>
                            <span className="font-bold shrink-0">
                              {formatMoney(v.sale_price, currency)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Order Cart & Controls (Cols 8-12) */}
        <div className="col-span-5 border border-black rounded-lg bg-white flex flex-col justify-between overflow-hidden shadow-sm">
          {/* Order Details Top Form */}
          <div className="p-4 border-b border-zinc-200 space-y-3 shrink-0 bg-zinc-50">
            <div className="flex justify-between items-center">
              <span className="font-bold text-xs uppercase tracking-wider text-black">
                Current Order
              </span>
              <div className="flex border border-black rounded overflow-hidden">
                {(["dine_in", "takeaway", "delivery"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={`px-2 py-1 text-[11px] font-semibold capitalize transition-colors ${
                      orderType === t ? "bg-black text-white" : "bg-white text-black hover:bg-zinc-100"
                    }`}
                  >
                    {t.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {orderType === "dine_in" && (
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                    Table No. {enableServiceFee && serviceFeeAmount > 0 && <span className="text-emerald-700 font-bold ml-1">(+ Service Fee: {formatMoney(serviceFeeAmount, currency)})</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Table 4"
                    value={tableNo}
                    onChange={(e) => setTableNo(e.target.value)}
                    className="w-full px-2 py-1 border border-zinc-300 rounded text-xs focus:outline-none focus:border-black bg-white"
                  />
                </div>
              )}

              {orderType === "delivery" && (
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                    Delivery Fee
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={deliveryFee || ""}
                    onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 border border-zinc-300 rounded text-xs focus:outline-none focus:border-black bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                  Customer Name
                </label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-2 py-1 border border-zinc-300 rounded text-xs focus:outline-none focus:border-black bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                  Phone
                </label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-2 py-1 border border-zinc-300 rounded text-xs focus:outline-none focus:border-black bg-white"
                />
              </div>
            </div>

            <input
              type="text"
              placeholder="Order special instructions / notes..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              className="w-full px-2 py-1 border border-zinc-300 rounded text-xs focus:outline-none focus:border-black bg-white"
            />
          </div>

          {/* Cart Item Rows */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {successNotice && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs rounded font-medium flex justify-between items-center">
                <span>{successNotice}</span>
                <button
                  type="button"
                  onClick={() => setSuccessNotice(null)}
                  className="text-emerald-700 font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs space-y-1">
                <span className="text-2xl">🛒</span>
                <p>Order cart is empty.</p>
                <p className="text-[10px]">Tap menu item to customize & add.</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.cart_key}
                  className="border border-zinc-200 rounded p-2.5 space-y-1.5 bg-white shadow-xs"
                >
                  <div className="flex justify-between items-start text-xs">
                    <div>
                      <span className="font-bold text-black">{item.product_name}</span>
                      {item.available_variants && item.available_variants.length > 1 ? (
                        <select
                          value={item.variant_id}
                          onChange={(e) => changeCartItemVariant(item.cart_key, e.target.value)}
                          className="block mt-1 text-[11px] font-semibold text-black bg-zinc-100 border border-zinc-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-black cursor-pointer"
                        >
                          {item.available_variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({formatMoney(v.sale_price, currency)})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-[10px] text-zinc-500">{item.variant_name}</p>
                      )}

                      {/* Display Addons Breakdown */}
                      {item.addons && item.addons.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.addons.map((a, idx) => (
                            <p key={idx} className="text-[10px] text-emerald-800 font-medium">
                              + {a.addon_name} (+{formatMoney(a.price_delta, currency)})
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-black block">
                        {formatMoney(item.unit_price * item.quantity, currency)}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {formatMoney(item.unit_price, currency)} / ea
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-zinc-100">
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => updateQuantity(item.cart_key, -1)}
                        className="w-5 h-5 flex items-center justify-center border border-zinc-300 rounded hover:bg-zinc-100 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold px-1">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.cart_key, 1)}
                        className="w-5 h-5 flex items-center justify-center border border-zinc-300 rounded hover:bg-zinc-100 text-xs font-bold"
                      >
                        +
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="Add note..."
                      value={item.notes || ""}
                      onChange={(e) => {
                        const note = e.target.value;
                        setCart((prev) =>
                          prev.map((i) =>
                            i.cart_key === item.cart_key ? { ...i, notes: note } : i
                          )
                        );
                      }}
                      className="w-36 px-2 py-0.5 text-[11px] border border-zinc-200 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Bottom Summary & Checkout Buttons */}
          <div className="p-4 border-t border-zinc-200 bg-zinc-50 space-y-3 shrink-0">
            {successNotice && (
              <div className="p-3 border border-black bg-white text-black text-xs rounded font-medium space-y-2 shadow-sm">
                <p>{successNotice}</p>
                {(lastOfflineSlip || lastOfflineBillSlip) && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (lastOfflineSlip) printOfflineKitchenSlip(lastOfflineSlip);
                      }}
                      className="py-2 bg-black text-white text-xs font-bold rounded hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
                    >
                      🖨️ Kitchen Slip
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (lastOfflineBillSlip) printOfflineBillSlip(lastOfflineBillSlip);
                      }}
                      className="py-2 border-2 border-black bg-white text-black text-xs font-bold rounded hover:bg-zinc-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      🧾 Customer Slip
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSuccessNotice(null);
                    setLastOfflineSlip(null);
                    setLastOfflineBillSlip(null);
                    setOfflinePrintUrl(null);
                  }}
                  className="w-full py-1.5 border border-zinc-300 text-zinc-600 text-xs font-semibold rounded hover:bg-zinc-50 transition-colors"
                >
                  ✕ New Order
                </button>
              </div>
            )}

            {error && (
              <div className="p-2 border border-black bg-zinc-100 text-black text-xs rounded font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1 text-xs text-zinc-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono">{formatMoney(subtotal, currency)}</span>
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between text-zinc-500 text-[11px]">
                  <span>Tax ({taxRate}%)</span>
                  <span className="font-mono">{formatMoney(taxAmount, currency)}</span>
                </div>
              )}
              {orderType === "delivery" && deliveryFee > 0 && (
                <div className="flex justify-between text-zinc-500 text-[11px]">
                  <span>Delivery Fee</span>
                  <span className="font-mono">{formatMoney(deliveryFee, currency)}</span>
                </div>
              )}
              {orderType === "dine_in" && enableServiceFee && (
                <div className="flex justify-between text-zinc-500 text-[11px]">
                  <span>Service Fee</span>
                  <span className="font-mono">{formatMoney(appliedServiceFee, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-black border-t border-zinc-200 pt-1">
                <span>Total Amount</span>
                <span className="font-mono">{formatMoney(total, currency)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={loading || cart.length === 0}
                className="py-2.5 px-3 bg-zinc-200 hover:bg-zinc-300 text-black rounded-md text-xs font-bold transition-colors disabled:opacity-50 border border-zinc-400"
              >
                Hold (Draft)
              </button>
              {/* Hide Place Order button while success notice is visible to prevent accidental double-order */}
              {!successNotice && (
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={loading || cart.length === 0}
                  className="py-2.5 px-3 bg-black hover:bg-zinc-800 text-white rounded-md text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {loading ? "Processing..." : "Place Order & Print"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Held Drafts Manager Modal */}
      <DraftsModal
        isOpen={isDraftsModalOpen}
        onClose={() => setIsDraftsModalOpen(false)}
        onResume={handleResumeDraft}
        currency={currency}
      />

      {/* Item Customization & Addons Modal */}
      {customizingProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-zinc-200 pb-3">
              <div>
                <span className="font-mono text-[10px] text-zinc-500 uppercase">{customizingProduct.code}</span>
                <h2 className="text-lg font-bold text-black">{customizingProduct.name}</h2>
                <p className="text-xs text-zinc-500">Select size/variation and extra add-ons.</p>
              </div>
              <button
                onClick={() => setCustomizingProduct(null)}
                className="text-zinc-500 hover:text-black font-semibold text-xl"
              >
                ✕
              </button>
            </div>

            {/* Section 1: Select Size / Variation */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-black">
                1. Select Size / Variation
              </label>
              <div className="grid grid-cols-2 gap-2">
                {customizingProduct.product_variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className={`p-2.5 rounded-lg border text-left flex justify-between items-center transition-all ${
                        isSelected
                          ? "bg-black text-white border-black font-bold shadow"
                          : "bg-zinc-50 text-black border-zinc-300 hover:bg-zinc-100"
                      }`}
                    >
                      <span className="text-xs">{v.name}</span>
                      <span className="text-xs font-mono font-bold">
                        {formatMoney(v.sale_price, currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Add-on Extras with Quantities (2x, 3x) */}
            <div className="space-y-2 pt-3 border-t border-zinc-200">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold uppercase tracking-wider text-black">
                  2. Extra Add-ons (Single, Double 2x, 3x)
                </label>
                <span className="text-[11px] text-zinc-500">Tap + to add multiple extras</span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {availableAddonsList.map((addon) => {
                  const count = addonCounts[addon.name] || 0;
                  const itemDeltaTotal = Number(addon.price_delta) * count;

                  return (
                    <div
                      key={addon.name}
                      className={`p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
                        count > 0
                          ? "bg-zinc-100 border-black font-semibold"
                          : "bg-white border-zinc-200"
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold text-black">{addon.name}</span>
                        <span className="text-xs text-zinc-500 ml-2 font-mono">
                          (+{formatMoney(addon.price_delta, currency)} each)
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        {count > 0 && (
                          <span className="text-xs font-mono font-bold text-emerald-800 mr-1">
                            +{formatMoney(itemDeltaTotal, currency)}
                          </span>
                        )}

                        <div className="flex items-center space-x-1 border border-zinc-300 rounded bg-white overflow-hidden">
                          <button
                            type="button"
                            onClick={() => updateAddonQty(addon.name, -1)}
                            disabled={count <= 0}
                            className="w-6 h-6 flex items-center justify-center hover:bg-zinc-100 text-xs font-bold text-black disabled:opacity-30"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-xs font-bold">{count}</span>
                          <button
                            type="button"
                            onClick={() => updateAddonQty(addon.name, 1)}
                            className="w-6 h-6 flex items-center justify-center hover:bg-zinc-100 text-xs font-bold text-black"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Special Request Notes */}
            <div className="space-y-1 pt-3 border-t border-zinc-200">
              <label className="block text-xs font-bold uppercase tracking-wider text-black">
                3. Special Instructions / Kitchen Note
              </label>
              <input
                type="text"
                placeholder="e.g. Extra spicy, no mayo, double toasted..."
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-md text-xs text-black focus:outline-none focus:border-black"
              />
            </div>

            {/* Footer Summary & Add to Cart Button */}
            <div className="pt-4 border-t border-zinc-200 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Total Unit Price</span>
                <span className="text-lg font-bold text-black font-mono">
                  {formatMoney(modalTotalUnitPrice, currency)}
                </span>
              </div>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setCustomizingProduct(null)}
                  className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold hover:border-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddCustomizedItem}
                  className="px-5 py-2 bg-black text-white rounded-md text-xs font-bold hover:bg-zinc-800 shadow transition-all"
                >
                  Add to Order ({formatMoney(modalTotalUnitPrice, currency)})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
