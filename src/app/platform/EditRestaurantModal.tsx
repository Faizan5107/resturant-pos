"use client";

import { useState, useRef } from "react";
import { updateRestaurantAction, deleteRestaurantAction } from "./actions";

interface RestaurantItem {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: string;
}

export default function EditRestaurantModal({
  restaurant,
}: {
  restaurant: RestaurantItem;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(restaurant.name);
  const [slug, setSlug] = useState(restaurant.slug);
  const [previewUrl, setPreviewUrl] = useState<string | null>(restaurant.logo_url);
  const [fileSelected, setFileSelected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const handleOpen = () => {
    setName(restaurant.name);
    setSlug(restaurant.slug);
    setPreviewUrl(restaurant.logo_url);
    setFileSelected(false);
    setError(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    setConfirmDelete(false);
    setConfirmName("");
  };

  const handleDelete = async () => {
    if (confirmName.trim().toLowerCase() !== restaurant.name.toLowerCase()) {
      setError("Restaurant name does not match. Please type it exactly to confirm.");
      return;
    }
    setDeleting(true);
    setError(null);
    const result = await deleteRestaurantAction(restaurant.id);
    setDeleting(false);
    if (result.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select a valid image file (PNG, JPG, SVG, WebP)");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setError(null);
      setPreviewUrl(URL.createObjectURL(file));
      setFileSelected(true);
    }
  };

  const handleClearSelectedFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFileSelected(false);
    setPreviewUrl(restaurant.logo_url);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("restaurantId", restaurant.id);

    const result = await updateRestaurantAction(null, formData);

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
        onClick={handleOpen}
        className="px-3 py-1 text-xs font-semibold rounded border border-zinc-300 text-zinc-700 hover:border-black hover:text-black transition-colors"
      >
        Edit
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-black rounded-lg w-full max-w-md p-6 space-y-4 my-8 text-left">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <div>
                <h2 className="text-lg font-bold text-black">Edit Restaurant</h2>
                <p className="text-xs text-zinc-500">Update restaurant details or add/change logo</p>
              </div>
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
              <input type="hidden" name="restaurantId" value={restaurant.id} />

              {/* Restaurant Name */}
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Restaurant Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black font-mono text-xs"
                />
              </div>

              {/* Restaurant Logo */}
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Restaurant Logo
                </label>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {previewUrl ? (
                      <div className="relative w-16 h-16 border border-zinc-300 rounded-md overflow-hidden bg-zinc-50 flex items-center justify-center shrink-0">
                        <img
                          src={previewUrl}
                          alt="Logo Preview"
                          className="w-full h-full object-contain p-1"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 border border-dashed border-zinc-300 rounded-md bg-zinc-50 flex items-center justify-center text-[10px] text-zinc-400 text-center px-1 shrink-0">
                        No logo yet
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        name="logoFile"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogoChange}
                        className="w-full px-3 py-1.5 border border-zinc-300 rounded-md text-xs focus:outline-none focus:border-black file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-black file:text-white hover:file:bg-zinc-800 cursor-pointer"
                      />
                    </div>
                  </div>

                  {fileSelected && (
                    <button
                      type="button"
                      onClick={handleClearSelectedFile}
                      className="text-[11px] text-red-600 hover:underline font-semibold"
                    >
                      Revert selected file
                    </button>
                  )}

                  <p className="text-[10px] text-zinc-500">
                    Upload a logo (PNG, JPG, SVG, WebP) to display on the left sidebar and printed slips.
                  </p>
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
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>

            {/* Danger Zone */}
            <div className="border-t-2 border-red-200 pt-4 space-y-3">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">⚠️ Danger Zone</p>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full px-3 py-2 rounded-md text-xs font-semibold border border-red-400 text-red-600 hover:bg-red-50 transition-colors"
                >
                  🗑 Permanently Delete Restaurant
                </button>
              ) : (
                <div className="space-y-2 p-3 bg-red-50 border border-red-300 rounded-md">
                  <p className="text-xs text-red-700 font-semibold">
                    This will permanently delete <strong>{restaurant.name}</strong> and ALL its data — orders, products, staff, and auth accounts. This cannot be undone.
                  </p>
                  <p className="text-xs text-red-600">
                    Type <strong>{restaurant.name}</strong> to confirm:
                  </p>
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder={restaurant.name}
                    className="w-full px-3 py-1.5 border border-red-300 rounded-md text-xs focus:outline-none focus:border-red-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleting || confirmName.trim().toLowerCase() !== restaurant.name.toLowerCase()}
                      className="flex-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {deleting ? "Deleting..." : "Confirm Permanent Delete"}
                    </button>
                    <button
                      onClick={() => { setConfirmDelete(false); setConfirmName(""); setError(null); }}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold border border-zinc-300 text-zinc-600 hover:border-black transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
