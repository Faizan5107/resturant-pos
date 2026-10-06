"use client";

import { useState } from "react";
import { addCreditAction } from "./actions";

interface Party {
  id: string;
  name: string;
  type: string;
}

export default function AddCreditModal({ parties }: { parties: Party[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const suppliers = parties.filter((p) => p.type === "supplier");
  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await addCreditAction(null, formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
      (e.target as HTMLFormElement).reset();
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 border border-black text-black rounded-md text-xs font-semibold hover:bg-black hover:text-white transition-colors"
      >
        + Add Credit
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <h2 className="text-base font-bold text-black">Add Supplier Credit</h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-black font-semibold text-lg">X</button>
            </div>

            <p className="text-xs text-zinc-500">
              Record goods or services received on credit. This increases the outstanding balance owed to the supplier.
            </p>

            {error && (
              <div className="p-3 border border-black bg-zinc-100 text-black text-xs rounded-md">{error}</div>
            )}

            {suppliers.length === 0 ? (
              <div className="p-3 bg-zinc-100 text-xs text-zinc-600 rounded-md">
                No suppliers found. Please create a supplier party first.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Supplier</label>
                  <select name="partyId" required
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black">
                    <option value="">Select supplier...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Credit Amount</label>
                  <input name="amount" type="number" step="0.01" min="0.01" required
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Description</label>
                  <input name="description" type="text" required
                    placeholder="e.g. Chicken purchase on credit"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Date</label>
                  <input name="entryDate" type="date" defaultValue={today}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black" />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
                  <button type="button" onClick={() => setIsOpen(false)}
                    className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold hover:border-black">
                    Cancel
                  </button>
                  <button type="submit" disabled={loading}
                    className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50">
                    {loading ? "Saving..." : "Record Credit"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}