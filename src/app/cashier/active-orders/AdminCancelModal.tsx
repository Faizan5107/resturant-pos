"use client";

import { useState } from "react";
import { cancelOrderAction, adminCancelOrderWithAuthAction } from "../actions";

interface AdminCancelModalProps {
  order: {
    id: string;
    order_no: string;
    total: number;
    table_no?: string;
  };
  isAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminCancelModal({
  order,
  isAdmin,
  onClose,
  onSuccess,
}: AdminCancelModalProps) {
  const [reason, setReason] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please provide a cancellation reason.");
      return;
    }

    setLoading(true);
    setError(null);

    let res: { success?: boolean; error?: string };

    if (isAdmin) {
      res = await cancelOrderAction(order.id, reason);
    } else {
      if (!adminEmail.trim() || !adminPassword.trim()) {
        setError("Admin email and password are required to authorize cancellation.");
        setLoading(false);
        return;
      }

      res = await adminCancelOrderWithAuthAction({
        orderId: order.id,
        reason,
        adminEmail,
        adminPassword,
      });
    }

    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-black rounded-lg w-full max-w-md p-6 space-y-4 shadow-xl">
        <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-black flex items-center gap-2">
              Cancel Order #{order.order_no}
              <span className="text-[10px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded border border-red-300">
                Admin Action
              </span>
            </h2>
            <p className="text-xs text-zinc-500">
              Only managers/administrators are authorized to cancel orders.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-black font-bold text-xl px-2"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleCancel} className="space-y-3">
          {!isAdmin && (
            <div className="p-3 bg-zinc-50 border border-zinc-300 rounded-md space-y-2.5">
              <p className="text-[11px] font-bold text-zinc-800 uppercase tracking-wider">
                Manager / Admin Verification Required
              </p>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@restaurant.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3 py-1.5 border border-zinc-300 rounded text-xs focus:outline-none focus:border-black bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">
                  Admin Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border border-zinc-300 rounded text-xs focus:outline-none focus:border-black bg-white"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-black mb-1">
              Reason for Cancellation <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. Customer left, duplicate punched by mistake, item unavailable..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-xs focus:outline-none focus:border-black"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-zinc-300 text-zinc-700 text-xs font-semibold rounded hover:border-black"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Cancelling Order..." : "Confirm Cancellation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
