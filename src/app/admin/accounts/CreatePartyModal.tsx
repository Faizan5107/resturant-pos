"use client";

import { useState } from "react";
import { createPartyAction } from "./actions";

export default function CreatePartyModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createPartyAction(null, formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 transition-colors"
      >
        + Add Supplier / Party
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <h2 className="text-base font-bold text-black">Add Party (Supplier / Customer)</h2>
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
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Party Type
                </label>
                <select
                  name="type"
                  required
                  defaultValue="supplier"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                >
                  <option value="supplier">Supplier</option>
                  <option value="customer">Customer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Party / Company Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Metro Foods, Fresh Poultry Ltd"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Phone Number
                </label>
                <input
                  name="phone"
                  type="text"
                  placeholder="+92 300 0000000"
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
                  {loading ? "Saving..." : "Save Party"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
