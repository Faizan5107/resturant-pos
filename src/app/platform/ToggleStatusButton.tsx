"use client";

import { useState } from "react";
import { toggleRestaurantStatusAction } from "./actions";

export default function ToggleStatusButton({
  restaurantId,
  currentStatus,
}: {
  restaurantId: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const actionLabel = currentStatus === "active" ? "suspend" : "reactivate";
    if (!confirm(`Are you sure you want to ${actionLabel} this restaurant?`)) {
      return;
    }

    setLoading(true);
    await toggleRestaurantStatusAction(restaurantId, currentStatus);
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-3 py-1 text-xs font-semibold rounded border ${
        currentStatus === "active"
          ? "border-black text-black hover:bg-black hover:text-white"
          : "border-zinc-400 text-zinc-700 hover:border-black"
      } transition-colors disabled:opacity-50`}
    >
      {loading
        ? "Updating..."
        : currentStatus === "active"
        ? "Suspend"
        : "Reactivate"}
    </button>
  );
}
