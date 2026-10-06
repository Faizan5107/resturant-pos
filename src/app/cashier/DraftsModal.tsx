"use client";

import { useState, useEffect } from "react";
import { formatMoney } from "@/lib/money";
import { formatTime } from "@/lib/dates";
import { getOfflineDrafts, deleteOfflineDraft, OfflineDraftRow } from "@/lib/offline/sqlite-db";

interface DraftsModalProps {
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  onResume: (draft: OfflineDraftRow) => void;
}

export default function DraftsModal({
  currency,
  isOpen,
  onClose,
  onResume,
}: DraftsModalProps) {
  const [drafts, setDrafts] = useState<OfflineDraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const data = await getOfflineDrafts();
      setDrafts(data);
    } catch (err) {
      console.error("Error loading drafts from SQLite:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDrafts();
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    await deleteOfflineDraft(id);
    await loadDrafts();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-black rounded-lg w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-base font-bold text-black flex items-center gap-2">
              Held Draft Orders
              <span className="text-xs bg-zinc-100 text-zinc-800 font-semibold px-2 py-0.5 rounded border border-zinc-300">
                {drafts.length} Held
              </span>
            </h2>
            <p className="text-xs text-zinc-500">
              Orders kept on hold while waiting for customer confirmation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-black font-bold text-xl px-2"
          >
            ✕
          </button>
        </div>

        {/* Draft List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="text-center py-10 text-xs text-zinc-500">
              Loading drafts...
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-zinc-300 rounded-lg text-xs text-zinc-500 space-y-1">
              <p className="font-semibold text-zinc-700">No draft orders currently on hold.</p>
              <p>When a customer is undecided, click "Save as Draft" to serve the next customer in queue.</p>
            </div>
          ) : (
            drafts.map((draft) => {
              let cartItems: any[] = [];
              try {
                cartItems = JSON.parse(draft.cart_json);
              } catch {}

              return (
                <div
                  key={draft.id}
                  className="border border-black rounded-lg p-4 bg-white hover:bg-zinc-50 transition-colors space-y-3"
                >
                  <div className="flex justify-between items-start border-b border-zinc-100 pb-2">
                    <div>
                      <h3 className="font-bold text-sm text-black">
                        {draft.title}
                      </h3>
                      <p className="text-[11px] text-zinc-500 capitalize">
                        {draft.order_type.replace("_", " ")}
                        {draft.table_no ? ` • Table ${draft.table_no}` : ""}
                        {draft.customer_phone ? ` • ${draft.customer_phone}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-black">
                        {formatMoney(draft.total, currency)}
                      </span>
                      <p className="text-[10px] text-zinc-400">
                        {formatTime(draft.updated_at)}
                      </p>
                    </div>
                  </div>

                  {/* Items Preview */}
                  <div className="text-xs text-zinc-600 space-y-0.5 max-h-24 overflow-y-auto">
                    {cartItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-[11px]">
                        <span>
                          <span className="font-semibold">{item.quantity}x</span> {item.product_name}{" "}
                          <span className="text-zinc-400">({item.variant_name})</span>
                        </span>
                        <span>{formatMoney(item.unit_price * item.quantity, currency)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100">
                    <button
                      type="button"
                      onClick={() => handleDelete(draft.id)}
                      className="px-3 py-1.5 border border-zinc-300 text-zinc-600 text-xs font-semibold rounded hover:border-red-600 hover:text-red-700 transition-colors"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => onResume(draft)}
                      className="px-4 py-1.5 bg-black text-white text-xs font-bold rounded hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
                    >
                      <span>Resume Order</span>
                      <span className="text-[10px] bg-zinc-700 px-1 rounded">→</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-50 flex justify-between items-center text-xs text-zinc-500">
          <span>Stored locally in browser</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 border border-zinc-300 bg-white text-black font-semibold rounded hover:border-black"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
