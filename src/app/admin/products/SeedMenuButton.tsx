"use client";

import { useState } from "react";
import { seedFullMenuAction } from "./actions";

export default function SeedMenuButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSeed = async () => {
    if (!confirm("This will auto-populate your restaurant menu with all Deals, Pizzas, Burgers, Wings, Pasta, Fries & Addons. Continue?")) {
      return;
    }

    setLoading(true);
    setMessage(null);

    const res = await seedFullMenuAction();
    setLoading(false);

    if (res.error) {
      alert(`Error seeding menu: ${res.error}`);
    } else {
      setMessage("Full menu seeded successfully!");
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      {message && (
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded">
          {message}
        </span>
      )}
      <button
        type="button"
        onClick={handleSeed}
        disabled={loading}
        className="px-3 py-2 bg-emerald-700 text-white hover:bg-emerald-800 rounded-md text-xs font-bold transition-colors disabled:opacity-50 shadow-sm flex items-center gap-1.5"
      >
        <span>🌱</span>
        <span>{loading ? "Seeding Menu..." : "Seed Full Menu"}</span>
      </button>
    </div>
  );
}
