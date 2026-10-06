"use client";

import { useState } from "react";
import { createProductAction } from "./actions";

interface CategoryOption {
  id: string;
  name: string;
}

interface VariantRow {
  name: string;
  salePrice: number;
  costPrice: number;
}

export default function CreateProductModal({ categories }: { categories: CategoryOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [variants, setVariants] = useState<VariantRow[]>([
    { name: "Small", salePrice: 450, costPrice: 200 },
    { name: "Medium", salePrice: 750, costPrice: 350 },
    { name: "Large", salePrice: 1100, costPrice: 500 },
  ]);

  const addVariantRow = () => {
    setVariants((prev) => [...prev, { name: "", salePrice: 0, costPrice: 0 }]);
  };

  const updateVariantRow = (index: number, field: keyof VariantRow, value: any) => {
    setVariants((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeVariantRow = (index: number) => {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.append("variantsJson", JSON.stringify(variants));

    const result = await createProductAction(null, formData);

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
        + Add Product
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-black">Create Product</h2>
                <p className="text-xs text-zinc-500">Set up product details, sizes, variants, and extras.</p>
              </div>
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Product Code *
                  </label>
                  <input
                    name="code"
                    type="text"
                    required
                    placeholder="e.g. PIZ-01, BURG-01"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black font-mono"
                  />
                  <p className="text-[10px] text-zinc-500 mt-0.5">Unique item identifier</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Product Name *
                  </label>
                  <input
                    name="name"
                    type="text"
                    required
                    placeholder="e.g. Chicken Fajita Pizza, Zinger Burger"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Category
                  </label>
                  <select
                    name="categoryId"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Kitchen Station
                  </label>
                  <input
                    name="kitchenStation"
                    type="text"
                    defaultValue="main"
                    placeholder="e.g. pizza, grill, fryer"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Optional details e.g. Spicy chicken, onions, bell peppers & mozzarella..."
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Product Image
                </label>
                <input
                  name="imageFile"
                  type="file"
                  accept="image/*"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-100 file:text-black hover:file:bg-zinc-200"
                />
              </div>

              {/* Dynamic Variants & Addons Section */}
              <div className="pt-3 border-t border-zinc-200 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-black">
                      Product Sizes / Variations / Addons
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Add options like Small, Medium, Large or Extra Cheese, Dip Sauce.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addVariantRow}
                    className="px-2.5 py-1 bg-zinc-100 border border-zinc-300 hover:border-black rounded text-xs font-bold text-black transition-colors"
                  >
                    + Add Size / Option
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {variants.map((v, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center bg-zinc-50 p-2 rounded-md border border-zinc-200"
                    >
                      <div className="col-span-5">
                        <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                          Variant Name (Size / Addon)
                        </label>
                        <input
                          type="text"
                          required
                          value={v.name}
                          onChange={(e) => updateVariantRow(idx, "name", e.target.value)}
                          placeholder="e.g. Large, Single Patty, Extra Cheese"
                          className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs text-black focus:outline-none focus:border-black"
                        />
                      </div>

                      <div className="col-span-3">
                        <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                          Sale Price (Rs)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={v.salePrice}
                          onChange={(e) => updateVariantRow(idx, "salePrice", Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs text-black focus:outline-none focus:border-black"
                        />
                      </div>

                      <div className="col-span-3">
                        <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                          Cost Price (Rs)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={v.costPrice}
                          onChange={(e) => updateVariantRow(idx, "costPrice", Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs text-black focus:outline-none focus:border-black"
                        />
                      </div>

                      <div className="col-span-1 text-center pt-3">
                        {variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeVariantRow(idx)}
                            className="text-zinc-400 hover:text-black text-sm font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="taxApplicable-create"
                  name="taxApplicable"
                  defaultChecked
                  className="rounded border-zinc-300 text-black focus:ring-black"
                />
                <label htmlFor="taxApplicable-create" className="text-xs font-semibold text-black">
                  Product is taxable
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold hover:border-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
