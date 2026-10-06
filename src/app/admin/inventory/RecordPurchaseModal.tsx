"use client";

import { useState } from "react";
import { recordPurchaseAction } from "./actions";

interface SupplierOption {
  id: string;
  name: string;
}

interface ItemOption {
  item_id: string;
  name: string;
  unit: string;
}

interface LineItem {
  item_id: string;
  quantity: string;
  unit_cost: string;
}

const emptyLine = (): LineItem => ({ item_id: "", quantity: "", unit_cost: "" });

export default function RecordPurchaseModal({
  suppliers,
  items,
}: {
  suppliers: SupplierOption[];
  items: ItemOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [paidAmount, setPaidAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const grandTotal = lines.reduce(
    (sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0),
    0
  );

  const updateLine = (idx: number, field: keyof LineItem, value: string) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const reset = () => {
    setSupplierId("");
    setPurchaseDate(new Date().toISOString().split("T")[0]);
    setLines([emptyLine()]);
    setPaidAmount("");
    setNote("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validLines = lines.filter((l) => l.item_id && l.quantity && l.unit_cost);
    if (!supplierId || validLines.length === 0) {
      setError("Please select a supplier and add at least one item.");
      return;
    }

    setError(null);
    setLoading(true);

    const res = await recordPurchaseAction({
      supplier_id: supplierId,
      purchase_date: purchaseDate,
      total: grandTotal,
      paid_amount: parseFloat(paidAmount) || 0,
      note: note || undefined,
      items: validLines.map((l) => ({
        item_id: l.item_id,
        quantity: parseFloat(l.quantity),
        unit_cost: parseFloat(l.unit_cost),
      })),
    });

    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      handleClose();
    }
  };

  const itemMap = Object.fromEntries(items.map((i) => [i.item_id, i]));

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 transition-colors"
      >
        + Record Stock Purchase
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-black">Record Stock Purchase</h2>
                <p className="text-[11px] text-zinc-500">
                  Record multiple items received from one supplier in a single delivery.
                </p>
              </div>
              <button
                onClick={handleClose}
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

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Supplier + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Supplier / Party <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Delivery Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-black">
                    Items Received <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs font-semibold text-black underline underline-offset-2 hover:text-zinc-600"
                  >
                    + Add Another Item
                  </button>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_100px_100px_28px] gap-2 px-1">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase">Item</span>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase">Qty</span>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase">Unit Cost</span>
                  <span />
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {lines.map((line, idx) => {
                    const lineTotal =
                      (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_cost) || 0);
                    const unit = line.item_id ? itemMap[line.item_id]?.unit : "";

                    return (
                      <div key={idx} className="grid grid-cols-[1fr_100px_100px_28px] gap-2 items-center">
                        <select
                          required
                          value={line.item_id}
                          onChange={(e) => updateLine(idx, "item_id", e.target.value)}
                          className="w-full px-2 py-1.5 border border-zinc-300 rounded-md text-xs focus:outline-none focus:border-black"
                        >
                          <option value="">Select Item</option>
                          {items.map((i) => (
                            <option key={i.item_id} value={i.item_id}>
                              {i.name} ({i.unit})
                            </option>
                          ))}
                        </select>

                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={line.quantity}
                            onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                            placeholder="0.00"
                            className="w-full px-2 py-1.5 border border-zinc-300 rounded-md text-xs focus:outline-none focus:border-black"
                          />
                          {unit && (
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400 pointer-events-none">
                              {unit}
                            </span>
                          )}
                        </div>

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={line.unit_cost}
                          onChange={(e) => updateLine(idx, "unit_cost", e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2 py-1.5 border border-zinc-300 rounded-md text-xs focus:outline-none focus:border-black"
                        />

                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length === 1}
                          className="text-zinc-400 hover:text-red-600 disabled:opacity-20 text-sm font-bold transition-colors"
                          title="Remove line"
                        >
                          ✕
                        </button>

                        {/* Inline line total */}
                        {lineTotal > 0 && (
                          <div className="col-span-4 text-right text-[10px] text-zinc-500 -mt-1 pr-8">
                            Line total: <span className="font-semibold text-black">Rs {lineTotal.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grand Total + Payment */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-zinc-500 uppercase text-[10px]">Grand Total</span>
                  <p className="font-bold text-lg text-black mt-0.5">Rs {grandTotal.toFixed(2)}</p>
                  <p className="text-[10px] text-zinc-400">{lines.filter(l => l.item_id).length} item type(s)</p>
                </div>
                <div>
                  <label className="block font-semibold text-black mb-1">
                    Amount Paid (Rs)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={grandTotal ? grandTotal.toFixed(2) : "0.00"}
                    className="w-full px-2 py-1.5 border border-zinc-300 rounded-md text-xs focus:outline-none focus:border-black"
                  />
                  {grandTotal > 0 && parseFloat(paidAmount) < grandTotal && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Unpaid: <span className="font-semibold text-black">
                        Rs {(grandTotal - (parseFloat(paidAmount) || 0)).toFixed(2)}
                      </span> → posted to Accounts
                    </p>
                  )}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Note <span className="text-zinc-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Morning delivery, partial payment"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold hover:border-black transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Saving..." : "Save Purchase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
