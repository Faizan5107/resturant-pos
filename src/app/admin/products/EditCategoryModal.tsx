"use client";

import { useState } from "react";
import { updateCategoryAction, toggleCategoryStatusAction, deleteCategoryAction } from "./actions";

interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export default function EditCategoryModal({ category }: { category: Category }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.append("id", category.id);
    const result = await updateCategoryAction(null, formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
    }
  };

  const handleToggleStatus = async () => {
    setToggling(true);
    setError(null);
    const result = await toggleCategoryStatusAction(category.id, !category.is_active);
    setToggling(false);
    if (result.error) setError(result.error);
    else setIsOpen(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const result = await deleteCategoryAction(category.id);
    setDeleting(false);
    if (result.error) {
      setError(result.error);
      setConfirmDelete(false);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-2 py-1 text-xs text-blue-600 hover:underline"
      >
        Edit
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <h2 className="text-base font-bold text-black">Edit Category</h2>
              <button
                onClick={() => { setIsOpen(false); setConfirmDelete(false); setError(null); }}
                className="text-zinc-500 hover:text-black font-semibold text-lg"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 border border-red-400 bg-red-50 text-red-700 text-xs rounded-md">
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
                  defaultValue={category.name}
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
                  defaultValue={category.sort_order}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setConfirmDelete(false); setError(null); }}
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

            {/* Danger Zone */}
            <div className="border-t border-zinc-200 pt-3 space-y-2">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Danger Zone</p>
              <div className="flex gap-2">
                <button
                  onClick={handleToggleStatus}
                  disabled={toggling}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 ${
                    category.is_active
                      ? "border-orange-400 text-orange-600 hover:bg-orange-50"
                      : "border-green-500 text-green-700 hover:bg-green-50"
                  }`}
                >
                  {toggling ? "..." : category.is_active ? "⏸ Deactivate" : "▶ Activate"}
                </button>

                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-red-400 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    🗑 Delete
                  </button>
                ) : (
                  <div className="flex-1 flex gap-1">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold border border-zinc-300 text-zinc-600 hover:border-black"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
