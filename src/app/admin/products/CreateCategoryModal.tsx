"use client";

import { useState } from "react";
import { createCategoryAction } from "./actions";

export default function CreateCategoryModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createCategoryAction(null, formData);

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
        className="px-3 py-2 border border-black text-black rounded-md text-xs font-semibold hover:bg-black hover:text-white transition-colors"
      >
        + Add Category
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <h2 className="text-base font-bold text-black">Add Category</h2>
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
                  Category Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Burgers, Beverages"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Sort Order
                </label>
                <input
                  name="sortOrder"
                  type="number"
                  defaultValue={0}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold hover:border-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
