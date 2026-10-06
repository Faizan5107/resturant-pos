"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import EditProductModal from "./EditProductModal";
import EditCategoryModal from "./EditCategoryModal";

interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface ProductVariant {
  id: string;
  name: string;
  sale_price: number;
  variant_costs?: Array<{ cost_price: number }>;
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
  categories?: { name: string } | null;
  product_variants?: ProductVariant[];
}

export default function ProductsTable({
  categories,
  products,
}: {
  categories: Category[];
  products: Product[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true;
    const matchesSearch = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ((p.categories as any)?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Category Pills & Search Input Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
        {/* Category Pills Strip */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              selectedCategory === null
                ? "bg-black text-white"
                : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-300"
            }`}
          >
            All Products ({products.length})
          </button>
          {categories.map((c) => (
            <div key={c.id} className={`inline-flex items-center ${!c.is_active ? "opacity-50" : ""}`}>
              <button
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  selectedCategory === c.id
                    ? "bg-black text-white"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-300"
                }`}
              >
                {c.name}{!c.is_active && <span className="ml-1 text-[9px] text-zinc-400">(off)</span>}
              </button>
              <div className="ml-1">
                <EditCategoryModal category={c} />
              </div>
            </div>
          ))}
        </div>

        {/* Search Bar Input */}
        <div className="relative w-full sm:w-72">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-400 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by code or name..."
            className="w-full pl-8 pr-8 py-1.5 bg-white border border-zinc-300 rounded-md text-xs text-black placeholder-zinc-400 focus:outline-none focus:border-black"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-zinc-400 hover:text-black text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Image</th>
              <th className="py-3 px-4 font-semibold">Code / Name</th>
              <th className="py-3 px-4 font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold">Variants & Prices</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500 text-xs">
                  No products found matching your search.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => (
                <tr key={p.id} className={`hover:bg-zinc-50 transition-colors ${p.status === "hidden" ? "opacity-50" : ""}`}>
                  <td className="py-3 px-4">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-12 h-12 object-cover rounded-md border border-zinc-200"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = "none";
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            const fallback = document.createElement("div");
                            fallback.className =
                              "w-12 h-12 bg-zinc-100 rounded-md border border-zinc-200 flex items-center justify-center text-zinc-400 text-[9px] text-center";
                            fallback.innerText = "No Image";
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-12 h-12 bg-zinc-100 rounded-md border border-zinc-200 flex items-center justify-center text-zinc-400 text-[9px] text-center">
                        No Image
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-mono text-[10px] text-zinc-500">{p.code}</p>
                    <p className="font-semibold text-black">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-zinc-500">{p.description}</p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    {(p.categories as any)?.name || "Uncategorized"}
                  </td>
                  <td className="py-3 px-4 text-xs space-y-1">
                    {p.product_variants?.map((v: any) => {
                      const cost = v.variant_costs?.[0]?.cost_price ?? 0;
                      return (
                        <div key={v.id} className="flex items-center space-x-2">
                          <span className="font-semibold">{v.name}:</span>
                          <span>{formatMoney(v.sale_price)}</span>
                          <span className="text-zinc-400 text-[11px]">
                            (Cost: {formatMoney(cost)})
                          </span>
                        </div>
                      );
                    })}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${
                        p.status === "active"
                          ? "bg-black text-white"
                          : p.status === "out_of_stock"
                          ? "bg-zinc-200 text-zinc-800 border border-black"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-right">
                    <EditProductModal product={p as any} categories={categories || []} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
