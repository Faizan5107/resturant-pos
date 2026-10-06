"use client";

import { useState } from "react";
import { updateProductAction, deleteProductAction, toggleProductStatusAction } from "./actions";

interface CategoryOption {
  id: string;
  name: string;
}

interface ProductVariant {
  id?: string;
  name: string;
  sale_price: number;
  salePrice?: number;
  variant_costs?: Array<{ cost_price: number }>;
  costPrice?: number;
}

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category_id: string | null;
  kitchen_station: string | null;
  tax_applicable: boolean;
  status: string;
  product_variants?: ProductVariant[];
}

export default function EditProductModal({
  product,
  categories,
}: {
  product: Product;
  categories: CategoryOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(product.image_url);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Initialize variant rows from existing product variants
  const [variants, setVariants] = useState<Array<{ id?: string; name: string; salePrice: number; costPrice: number }>>(() => {
    if (product.product_variants && product.product_variants.length > 0) {
      return product.product_variants.map((v) => ({
        id: v.id,
        name: v.name,
        salePrice: Number(v.sale_price || 0),
        costPrice: Number(v.variant_costs?.[0]?.cost_price || 0),
      }));
    }
    return [{ name: "Regular", salePrice: 0, costPrice: 0 }];
  });

  const addVariantRow = () => {
    setVariants((prev) => [...prev, { name: "", salePrice: 0, costPrice: 0 }]);
  };

  const updateVariantRow = (index: number, field: string, value: any) => {
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
    formData.append("id", product.id);
    formData.append("variantsJson", JSON.stringify(variants));

    const result = await updateProductAction(null, formData);

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
    // Valid statuses: 'active', 'hidden', 'out_of_stock'
    const newStatus = product.status === "active" ? "hidden" : "active";
    const result = await toggleProductStatusAction(product.id, newStatus);
    setToggling(false);
    if (result.error) setError(result.error);
    else setIsOpen(false);
  };

  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    setInfoMessage(null);
    const result = await deleteProductAction(product.id);
    setDeleting(false);
    if (result.error) {
      setError(result.error);
      setConfirmDelete(false);
    } else if ((result as any).deactivated) {
      // Product had order history — was deactivated, not deleted
      setInfoMessage((result as any).message);
      setConfirmDelete(false);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-2.5 py-1 text-xs text-black border border-black hover:bg-black hover:text-white rounded font-semibold transition-colors"
      >
        Edit Product
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-black">Edit Product</h2>
                <p className="text-xs text-zinc-500">Update product info, sizes, prices, and options.</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
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

            {infoMessage && (
              <div className="p-3 border border-amber-400 bg-amber-50 text-amber-800 text-xs rounded-md">
                ℹ️ {infoMessage}
              </div>
            )}


            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Product Code
                  </label>
                  <input
                    name="code"
                    type="text"
                    required
                    defaultValue={product.code}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Product Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    required
                    defaultValue={product.name}
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
                    defaultValue={product.category_id || ""}
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
                    defaultValue={product.kitchen_station || "main"}
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
                  defaultValue={product.description || ""}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Product Image
                </label>
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Product preview"
                    className="w-20 h-20 object-cover rounded-md border border-zinc-300 mb-2"
                  />
                )}
                <input
                  name="imageFile"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setImagePreview(URL.createObjectURL(f));
                  }}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-100 file:text-black hover:file:bg-zinc-200"
                />
                <p className="text-[10px] text-zinc-500 mt-0.5">Leave empty to keep existing image</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={product.status}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                  >
                    <option value="active">Active</option>
                    <option value="hidden">Hidden</option>
                    <option value="out_of_stock">Out of Stock</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <input
                    type="checkbox"
                    id={"taxApplicable-" + product.id}
                    name="taxApplicable"
                    defaultChecked={product.tax_applicable}
                    className="rounded border-zinc-300 text-black focus:ring-black"
                  />
                  <label htmlFor={"taxApplicable-" + product.id} className="text-xs font-semibold text-black">
                    Product is taxable
                  </label>
                </div>
              </div>

              {/* Dynamic Sizes & Options Section */}
              <div className="pt-3 border-t border-zinc-200 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-black">
                      Product Sizes / Variations / Addons
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Manage sizes (Small, Medium, Large) or extras (Extra Cheese, Dip Sauce).
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
                          Variant Name
                        </label>
                        <input
                          type="text"
                          required
                          value={v.name}
                          onChange={(e) => updateVariantRow(idx, "name", e.target.value)}
                          placeholder="e.g. Small, Extra Cheese"
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
                            onClick={() => removeVariantRow(indexIfMatch(idx))}
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

              <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setConfirmDelete(false); setError(null); }}
                  className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold hover:border-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Changes"}
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
                    product.status === "active"
                      ? "border-orange-400 text-orange-600 hover:bg-orange-50"
                      : "border-green-500 text-green-700 hover:bg-green-50"
                  }`}
                >
                  {toggling ? "..." : product.status === "active" ? "🙈 Hide from Menu" : "👁 Show in Menu"}
                </button>

                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-red-400 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    🗑 Delete Product
                  </button>
                ) : (
                  <div className="flex-1 flex gap-1">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Confirm Delete"}
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

  function indexIfMatch(i: number) {
    return i;
  }
}