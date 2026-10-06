"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { addItemsToOrderAction } from "../actions";

interface ProductVariant {
  id: string;
  name: string;
  sale_price: number;
}

interface Product {
  id: string;
  name: string;
  code: string;
  status: string;
  product_variants: ProductVariant[];
}

interface AddItemsModalProps {
  order: {
    id: string;
    order_no: string;
    table_no?: string;
    customer_name?: string;
    total: number;
    order_items: Array<{
      id: string;
      product_name: string;
      variant_name: string;
      quantity: number;
      line_total: number;
    }>;
  };
  products: Product[];
  currency?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface NewItemSelection {
  variant_id: string;
  product_name: string;
  variant_name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
}

export default function AddItemsModal({
  order,
  products,
  currency = "PKR",
  onClose,
  onSuccess,
}: AddItemsModalProps) {
  const [selectedItems, setSelectedItems] = useState<NewItemSelection[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = products.filter(
    (p) =>
      p.status !== "out_of_stock" &&
      (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleAddItem = (prod: Product, variant: ProductVariant) => {
    setSelectedItems((prev) => {
      const idx = prev.findIndex((i) => i.variant_id === variant.id);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx].quantity += 1;
        return updated;
      }
      return [
        ...prev,
        {
          variant_id: variant.id,
          product_name: prod.name,
          variant_name: variant.name,
          unit_price: Number(variant.sale_price),
          quantity: 1,
        },
      ];
    });
  };

  const handleUpdateQty = (variantId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((item) => {
          if (item.variant_id === variantId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as NewItemSelection[]
    );
  };

  const addedSubtotal = selectedItems.reduce(
    (sum, i) => sum + i.unit_price * i.quantity,
    0
  );

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      setError("Please add at least one new item.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await addItemsToOrderAction({
      orderId: order.id,
      items: selectedItems.map((i) => ({
        variant_id: i.variant_id,
        quantity: i.quantity,
        notes: i.notes,
      })),
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-black rounded-lg w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-lg font-bold text-black flex items-center gap-2">
              Add Items to Order #{order.order_no}
              <span className="text-xs font-normal text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                (Addition only mode)
              </span>
            </h2>
            <p className="text-xs text-zinc-500">
              {order.table_no ? `Table ${order.table_no} • ` : ""}
              {order.customer_name ? `Customer: ${order.customer_name} • ` : ""}
              Current Total: {formatMoney(order.total, currency)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-black font-bold text-xl px-2"
          >
            ✕
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-300 text-red-800 text-xs rounded-md">
            {error}
          </div>
        )}

        {/* Body (Two Column Layout) */}
        <div className="flex-1 grid grid-cols-12 divide-x divide-zinc-200 overflow-hidden">
          {/* Left Column: Menu Item Selector (Cols 1-7) */}
          <div className="col-span-7 p-4 flex flex-col overflow-hidden space-y-3">
            <input
              type="text"
              placeholder="Search product name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-xs focus:outline-none focus:border-black"
            />

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 text-xs">
                  No matching products available.
                </div>
              ) : (
                filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    className="border border-zinc-200 rounded-md p-2.5 bg-zinc-50 hover:bg-white hover:border-black transition-colors"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="font-semibold text-xs text-black">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {p.code}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {p.product_variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => handleAddItem(p, v)}
                          className="px-2.5 py-1 text-xs border border-zinc-300 bg-white rounded hover:bg-black hover:text-white transition-colors flex items-center gap-1.5"
                        >
                          <span>{v.name}</span>
                          <span className="font-bold">
                            {formatMoney(v.sale_price, currency)}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">
                            + Add
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Existing Punched Items & Items to Add (Cols 8-12) */}
          <div className="col-span-5 p-4 flex flex-col justify-between overflow-hidden bg-zinc-50/50">
            <div className="overflow-y-auto space-y-4 pr-1">
              {/* Existing items (READ ONLY / LOCKED) */}
              <div>
                <div className="flex items-center justify-between pb-1 border-b border-zinc-200">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                    Already Punched (Locked)
                  </span>
                  <span className="text-[10px] text-zinc-400">Cannot be removed</span>
                </div>
                <div className="space-y-1.5 pt-2">
                  {order.order_items?.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between text-xs text-zinc-500 bg-zinc-100 p-2 rounded border border-zinc-200"
                    >
                      <span>
                        <span className="font-semibold">{item.quantity}x</span>{" "}
                        {item.product_name}{" "}
                        <span className="text-[10px]">({item.variant_name})</span>
                      </span>
                      <span>{formatMoney(item.line_total, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Newly added items */}
              <div>
                <div className="flex items-center justify-between pb-1 border-b border-black">
                  <span className="text-[11px] font-bold text-black uppercase tracking-wider">
                    New Items to Add ({selectedItems.length})
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700">
                    +{formatMoney(addedSubtotal, currency)}
                  </span>
                </div>

                {selectedItems.length === 0 ? (
                  <p className="text-center py-6 text-xs text-zinc-400">
                    Click items on the left to add to this order.
                  </p>
                ) : (
                  <div className="space-y-2 pt-2">
                    {selectedItems.map((item) => (
                      <div
                        key={item.variant_id}
                        className="bg-white border border-black p-2.5 rounded-md space-y-1.5 shadow-sm"
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-black">
                            {item.product_name}{" "}
                            <span className="text-zinc-500 font-normal">
                              ({item.variant_name})
                            </span>
                          </span>
                          <span className="font-bold text-black">
                            {formatMoney(item.unit_price * item.quantity, currency)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center pt-1 border-t border-zinc-100">
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.variant_id, -1)}
                              className="w-5 h-5 flex items-center justify-center border border-zinc-300 rounded hover:bg-zinc-100 text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="font-bold text-xs px-1">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.variant_id, 1)}
                              className="w-5 h-5 flex items-center justify-center border border-zinc-300 rounded hover:bg-zinc-100 text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[10px] text-zinc-400">
                            @{formatMoney(item.unit_price, currency)} each
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Summary & Action */}
            <div className="pt-3 border-t border-zinc-300 space-y-2 shrink-0">
              <div className="flex justify-between text-xs text-zinc-600">
                <span>Existing Order Total</span>
                <span>{formatMoney(order.total, currency)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-emerald-800">
                <span>Adding ({selectedItems.length} items)</span>
                <span>+{formatMoney(addedSubtotal, currency)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-black border-t border-black pt-1">
                <span>Estimated New Total</span>
                <span>{formatMoney(order.total + addedSubtotal, currency)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2 border border-zinc-300 text-zinc-700 text-xs font-semibold rounded hover:border-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || selectedItems.length === 0}
                  className="py-2 bg-black text-white text-xs font-bold rounded hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Adding..." : "Confirm & Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
