"use client";

import { useState, useRef } from "react";
import { createRestaurantAction } from "./actions";

export default function CreateRestaurantModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please choose a valid image file (PNG, JPG, SVG, WebP)");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setLogoPreview(null);
        return;
      }
      setError(null);
      const url = URL.createObjectURL(file);
      setLogoPreview(url);
    } else {
      setLogoPreview(null);
    }
  };

  const handleClearLogo = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setLogoPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const logoFile = formData.get("logoFile") as File | null;
    if (!logoFile || logoFile.size === 0) {
      setError("Restaurant logo is required");
      return;
    }

    setLoading(true);
    const result = await createRestaurantAction(null, formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
      setLogoPreview(null);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    setLogoPreview(null);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 transition-colors"
      >
        + Add Restaurant
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-black rounded-lg w-full max-w-md p-6 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <h2 className="text-lg font-bold text-black">Create Restaurant</h2>
              <button
                onClick={handleClose}
                className="text-zinc-500 hover:text-black font-semibold text-lg"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 border border-red-500 bg-red-50 text-red-700 text-xs rounded-md">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Restaurant Name */}
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Restaurant Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Burger Haven"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Slug (Unique Identifier) <span className="text-red-500">*</span>
                </label>
                <input
                  name="slug"
                  type="text"
                  required
                  placeholder="e.g. burger-haven"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black font-mono text-xs"
                />
              </div>

              {/* Restaurant Logo Required */}
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Restaurant Logo <span className="text-red-500">* (Required)</span>
                </label>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {logoPreview && (
                      <div className="relative w-16 h-16 border border-zinc-300 rounded-md overflow-hidden bg-zinc-50 flex items-center justify-center shrink-0">
                        <img
                          src={logoPreview}
                          alt="Logo Preview"
                          className="w-full h-full object-contain p-1"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        name="logoFile"
                        type="file"
                        required
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogoChange}
                        className="w-full px-3 py-1.5 border border-zinc-300 rounded-md text-xs focus:outline-none focus:border-black file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-black file:text-white hover:file:bg-zinc-800 cursor-pointer"
                      />
                    </div>
                  </div>
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={handleClearLogo}
                      className="text-[11px] text-red-600 hover:underline font-semibold"
                    >
                      Remove logo
                    </button>
                  )}
                  <p className="text-[10px] text-zinc-500">
                    Uploaded logo will be placed on the left sidebar and printed at the top center of all kitchen slips and customer bills.
                  </p>
                </div>
              </div>

              {/* Admin Login Credentials */}
              <div className="pt-2 border-t border-zinc-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  First Owner / Admin Login
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">
                      Owner Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="adminName"
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">
                      Admin Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="adminEmail"
                      type="email"
                      required
                      placeholder="admin@burgerhaven.com"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="adminPassword"
                      type="password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold hover:border-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Save Restaurant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
