"use client";

import { useState } from "react";
import { recordStockAdjustmentAction } from "./actions";

interface ItemOption {
  item_id: string;
  name: string;
  unit: string;
  quantity: number;
}

export default function StockAdjustmentModal({ items }: { items: ItemOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [type, setType] = useState<"wastage" | "adjustment">("wastage");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedItem = items.find((i) => i.item_id === selectedItemId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || !quantity) return;

    setError(null);
    setLoading(true);

    const qtyNum = parseFloat(quantity);
    // Wastage is always a negative quantity change
    const quantityChange = type === "wastage" ? -Math.abs(qtyNum) : qtyNum;

    const res = await recordStockAdjustmentAction({
      itemId: selectedItemId,
      type,
      quantityChange,
      note,
    });

    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setIsOpen(false);
      setSelectedItemId("");
      setQuantity("");
      setNote("");
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-2 border border-black text-black rounded-md text-xs font-semibold hover:bg-black hover:text-white transition-colors"
      >
        Record Wastage / Adjustment
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <h2 className="text-base font-bold text-black">Stock Movement / Wastage</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-black font-semibold text-lg"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 border border-black bg-zinc-100 text-black text-xs rounded-md">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded border border-zinc-200">
                <button
                  type="button"
                  onClick={() => setType("wastage")}
                  className={`py-1.5 text-xs font-semibold rounded ${
                    type === "wastage" ? "bg-black text-white" : "text-zinc-700"
                  }`}
                >
                  Wastage (Deduct)
                </button>
                <button
                  type="button"
                  onClick={() => setType("adjustment")}
                  className={`py-1.5 text-xs font-semibold rounded ${
                    type === "adjustment" ? "bg-black text-white" : "text-zinc-700"
                  }`}
                >
                  Stock Adjustment
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Select Stock Item
                </label>
                <select
                  required
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                >
                  <option value="">Select Item</option>
                  {items.map((i) => (
                    <option key={i.item_id} value={i.item_id}>
                      {i.name} (Current: {i.quantity} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Quantity ({selectedItem?.unit || "units"})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={type === "wastage" ? "Amount wasted (e.g. 1.5)" : "Signed adjustment (+ or -)"}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Reason / Note
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Expired batch, spoiled, count correction..."
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {loading ? "Recording..." : "Confirm Movement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
