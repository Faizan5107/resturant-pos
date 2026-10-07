"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { formatTime, formatDate, getOrderDateString, isOrderInBusinessDate } from "@/lib/dates";
import { updateOrderStatusAction, markOrderPaidAction } from "../actions";
import AddItemsModal from "./AddItemsModal";
import AdminCancelModal from "./AdminCancelModal";
import type { OutboxEntry } from "@/lib/offline/idb";
import { retryOutboxItem, removeOutboxItem } from "@/lib/offline/sync-manager";

interface OrderItem {
  id: string;
  product_name: string;
  variant_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  notes?: string;
}

interface Order {
  id: string;
  order_no: string;
  order_type: string;
  table_no?: string;
  customer_name?: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method?: string;
  cancel_reason?: string;
  created_at: string;
  order_items: OrderItem[];
}

interface ProductVariant {
  id: string;
  name: string;
  sale_price: number;
}

interface Product {
  id: string;
  code: string;
  name: string;
  status: string;
  product_variants: ProductVariant[];
}

export default function ActiveOrdersBoard({
  initialOrders,
  outboxEntries = [],
  products = [],
  currency = "PKR",
  isAdmin = false,
}: {
  initialOrders: Order[];
  outboxEntries?: OutboxEntry[];
  products?: Product[];
  currency?: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const currentBusinessDate = getOrderDateString(); // 2pm to 2am shift date

  const [activeTab, setActiveTab] = useState<string>("open");
  const [historyDateFilter, setHistoryDateFilter] = useState<string>(currentBusinessDate);
  const [showAllDates, setShowAllDates] = useState(false);

  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "online">("cash");

  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [addItemsOrder, setAddItemsOrder] = useState<Order | null>(null);

  const [loading, setLoading] = useState(false);

  // Filter running vs completed orders
  const openOrders = initialOrders.filter((o) => o.status !== "paid" && o.status !== "cancelled");
  const allCompletedOrders = initialOrders.filter((o) => o.status === "paid" || o.status === "cancelled");

  // Filter Order History by current business date by default
  const historyOrders = showAllDates
    ? allCompletedOrders
    : allCompletedOrders.filter((o) => isOrderInBusinessDate(o.created_at, historyDateFilter));

  const displayedOrders = activeTab === "open" ? openOrders : historyOrders;

  const handleStatusChange = async (orderId: string, nextStatus: string) => {
    setLoading(true);
    await updateOrderStatusAction(orderId, nextStatus);
    setLoading(false);
    router.refresh();
  };

  const printKitchenSlip = (order: Order) => {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const isTempOrder = order.id.startsWith("outbox_") || order.id.startsWith("temp_");

    if (isOffline || isTempOrder) {
      const slipParams = new URLSearchParams({
        uuid: order.id,
        orderNo: String(order.order_no),
        orderType: order.order_type || "dine_in",
        tableNo: order.table_no || "",
        items: JSON.stringify(
          (order.order_items || []).map((i) => ({
            product_name: i.product_name,
            variant_name: i.variant_name,
            quantity: i.quantity,
            notes: i.notes || "",
          }))
        ),
      });
      window.open(`/print/kitchen/offline?${slipParams.toString()}`, "_blank", "width=420,height=600");
    } else {
      window.open(`/print/kitchen/${order.id}`, "_blank", "width=420,height=600");
    }
  };

  const printBillSlip = (order: Order, isReprint = false) => {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const isTempOrder = order.id.startsWith("outbox_") || order.id.startsWith("temp_");

    if (isOffline || isTempOrder) {
      const slipParams = new URLSearchParams({
        orderNo: String(order.order_no),
        orderType: order.order_type || "dine_in",
        tableNo: order.table_no || "",
        customerName: order.customer_name || "",
        items: JSON.stringify(
          (order.order_items || []).map((i) => ({
            product_name: i.product_name,
            variant_name: i.variant_name,
            quantity: i.quantity,
            line_total: i.line_total,
            notes: i.notes || "",
          }))
        ),
        subtotal: String(order.subtotal || 0),
        taxAmount: String(order.tax_amount || 0),
        total: String(order.total || 0),
        currency,
        ...(isReprint ? { reprint: "true" } : {}),
      });
      window.open(`/print/bill/offline?${slipParams.toString()}`, "_blank", "width=420,height=600");
    } else {
      window.open(`/print/bill/${order.id}${isReprint ? "?reprint=true" : ""}`, "_blank", "width=420,height=600");
    }
  };

  const handleMarkPaid = async () => {
    if (!paymentModalOrder) return;
    setLoading(true);
    const res = await markOrderPaidAction(paymentModalOrder.id, paymentMethod);
    setLoading(false);

    if (res.success) {
      const targetOrder = paymentModalOrder;
      setPaymentModalOrder(null);
      printBillSlip(targetOrder);
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Tabs & Filters */}
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3 flex-wrap gap-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab("open")}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-colors ${
              activeTab === "open"
                ? "bg-black text-white"
                : "border border-zinc-300 text-zinc-700 hover:border-black"
            }`}
          >
            Running Orders ({openOrders.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-colors ${
              activeTab === "history"
                ? "bg-black text-white"
                : "border border-zinc-300 text-zinc-700 hover:border-black"
            }`}
          >
            Order History ({historyOrders.length})
          </button>
        </div>

        {/* Date Filter Bar for Order History */}
        {activeTab === "history" && (
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-zinc-500 font-semibold">Shift Date:</span>
            <button
              onClick={() => {
                setShowAllDates(false);
                setHistoryDateFilter(currentBusinessDate);
              }}
              className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                !showAllDates && historyDateFilter === currentBusinessDate
                  ? "bg-black text-white border-black"
                  : "bg-white text-zinc-700 border-zinc-300 hover:border-black"
              }`}
            >
              Today's Shift ({formatDate(currentBusinessDate)})
            </button>

            <input
              type="date"
              value={historyDateFilter}
              onChange={(e) => {
                if (e.target.value) {
                  setHistoryDateFilter(e.target.value);
                  setShowAllDates(false);
                }
              }}
              className="px-2 py-1 border border-zinc-300 rounded text-xs focus:outline-none focus:border-black bg-white"
            />

            <button
              onClick={() => setShowAllDates(!showAllDates)}
              className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                showAllDates
                  ? "bg-black text-white border-black"
                  : "bg-white text-zinc-700 border-zinc-300 hover:border-black"
              }`}
            >
              {showAllDates ? "Showing All Dates" : "Show All"}
            </button>
          </div>
        )}
      </div>

      {/* Pending Sync Orders (outbox entries awaiting network) */}
      {activeTab === "open" && outboxEntries.filter(e => e.type === "place_order").length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pending Sync</p>
          <div className="grid grid-cols-3 gap-4">
            {outboxEntries
              .filter(e => e.type === "place_order")
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .map((entry) => {
                const p = entry.payload as any;
                return (
                  <div key={entry.clientUuid} className="border border-black border-dashed rounded-lg p-4 bg-white flex flex-col space-y-2 opacity-80">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{entry.tempOrderNo}</span>
                      <span className="border border-black text-black text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                        {entry.status === "needs_attention" ? "⚠ Needs Attention" : "Pending Sync"}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 capitalize">
                      {p.order_type?.replace("_", " ")} {p.table_no ? `· Table ${p.table_no}` : ""}
                    </div>
                    {entry.status === "needs_attention" && entry.lastError && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded p-1.5 break-words font-medium">
                          {entry.lastError}
                        </p>
                        <div className="flex space-x-1.5 pt-0.5">
                          <button
                            onClick={() => retryOutboxItem(entry.clientUuid)}
                            className="flex-1 py-1 bg-black text-white text-[10px] font-bold rounded hover:bg-zinc-800"
                          >
                            Retry Sync
                          </button>
                          <button
                            onClick={() => removeOutboxItem(entry.clientUuid)}
                            className="px-2 py-1 border border-zinc-300 text-zinc-600 text-[10px] font-semibold rounded hover:bg-zinc-100"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                    {entry.status === "failed" && entry.lastError && (
                      <p className="text-[10px] text-zinc-500">Retrying… {entry.lastError}</p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Orders Grid */}
      {displayedOrders.length === 0 ? (
        <div className="border border-black p-12 rounded-lg bg-white text-center text-zinc-500 text-xs">
          {activeTab === "open"
            ? "No running orders right now."
            : `No orders found for ${showAllDates ? "all dates" : formatDate(historyDateFilter)} (Shift 2:00 PM - 2:00 AM).`}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {displayedOrders.map((order) => {
            const isPaid = order.status === "paid";
            const isCancelled = order.status === "cancelled";


            return (
              <div
                key={order.id}
                className={`border rounded-lg p-4 bg-white flex flex-col justify-between space-y-3 ${
                  isCancelled
                    ? "border-red-300 bg-red-50/20"
                    : "border-black"
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex justify-between items-start border-b border-zinc-200 pb-2">
                    <div>
                      <span className={`font-bold text-lg ${isCancelled ? "text-red-900 line-through" : "text-black"}`}>
                        #{order.order_no}
                      </span>
                      <p className="text-[10px] uppercase font-semibold text-zinc-500">
                        {order.order_type} {order.table_no ? `• Table ${order.table_no}` : ""}
                        {order.customer_name ? ` • ${order.customer_name}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      {/* Status Pills */}
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-bold rounded-md ${
                          order.status === "new"
                            ? "bg-black text-white"
                            : isPaid
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-400"
                            : isCancelled
                            ? "bg-red-100 text-red-800 border border-red-400 uppercase"
                            : "border border-black text-black"
                        }`}
                      >
                        {order.status}
                      </span>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {formatTime(order.created_at)} ({formatDate(order.created_at, "dd MMM")})
                      </p>
                    </div>
                  </div>

                  {/* Cancel reason banner if cancelled */}
                  {isCancelled && order.cancel_reason && (
                    <div className="my-2 p-2 bg-red-100/60 border border-red-200 rounded text-[11px] text-red-800">
                      <span className="font-bold">Cancellation Reason: </span>
                      {order.cancel_reason}
                    </div>
                  )}

                  {/* Order Items */}
                  <div className="py-2 space-y-1 divide-y divide-zinc-100">
                    {order.order_items?.map((item) => (
                      <div key={item.id} className="pt-1 flex justify-between text-xs">
                        <span>
                          <span className="font-bold">{item.quantity}x</span> {item.product_name}{" "}
                          <span className="text-zinc-500 text-[10px]">({item.variant_name})</span>
                        </span>
                        <span className={`font-semibold ${isCancelled ? "line-through text-zinc-400" : ""}`}>
                          {formatMoney(item.line_total, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="border-t border-zinc-200 pt-3 space-y-2">
                  <div className="flex justify-between font-bold text-sm text-black">
                    <span>Total</span>
                    <span className={isCancelled ? "line-through text-zinc-400" : ""}>
                      {formatMoney(order.total, currency)}
                    </span>
                  </div>

                  {!isPaid && !isCancelled && (
                    <div className="space-y-1.5">
                      {/* Status Advancement Buttons */}
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          onClick={() => handleStatusChange(order.id, "preparing")}
                          disabled={order.status === "preparing" || loading}
                          className="py-1 text-[11px] font-semibold border border-black rounded hover:bg-black hover:text-white disabled:opacity-50"
                        >
                          Preparing
                        </button>
                        <button
                          onClick={() => handleStatusChange(order.id, "ready")}
                          disabled={order.status === "ready" || loading}
                          className="py-1 text-[11px] font-semibold border border-black rounded hover:bg-black hover:text-white disabled:opacity-50"
                        >
                          Ready
                        </button>
                        <button
                          onClick={() => handleStatusChange(order.id, "delivered")}
                          disabled={order.status === "delivered" || loading}
                          className="py-1 text-[11px] font-semibold border border-black rounded hover:bg-black hover:text-white disabled:opacity-50"
                        >
                          Delivered
                        </button>
                      </div>

                      {/* Pay & Print Slips Actions */}
                      <div className="flex space-x-1">
                        <button
                          onClick={() => setPaymentModalOrder(order)}
                          className="flex-1 py-1.5 bg-black text-white text-xs font-bold rounded hover:bg-zinc-800"
                        >
                          Collect Payment
                        </button>
                        <button
                          onClick={() => printKitchenSlip(order)}
                          className="px-2 py-1.5 border border-zinc-300 text-zinc-700 text-xs font-semibold rounded hover:border-black"
                          title="Kitchen Slip"
                        >
                          Slip
                        </button>
                      </div>

                      {/* Add Items and Cancel Actions */}
                      <div className="flex items-center space-x-1 pt-1 border-t border-zinc-100">
                        <button
                          type="button"
                          onClick={() => setAddItemsOrder(order)}
                          className="flex-1 py-1 bg-emerald-50 border border-emerald-600 text-emerald-900 text-xs font-bold rounded hover:bg-emerald-100 transition-colors"
                        >
                          + Add Items
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancelModalOrder(order)}
                          className="px-3 py-1 border border-red-300 text-red-700 text-xs font-semibold rounded hover:bg-red-50 hover:border-red-600 transition-colors"
                        >
                          Cancel {isAdmin ? "(Admin)" : ""}
                        </button>
                      </div>
                    </div>
                  )}

                  {isPaid && (
                    <button
                      onClick={() => printBillSlip(order, true)}
                      className="w-full py-1.5 border border-black text-xs font-semibold rounded hover:bg-black hover:text-white"
                    >
                      Reprint Bill
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collect Payment Modal */}
      {paymentModalOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <h2 className="text-base font-bold text-black">
                Collect Payment • Order #{paymentModalOrder.order_no}
              </h2>
              <button
                onClick={() => setPaymentModalOrder(null)}
                className="text-zinc-500 hover:text-black font-semibold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="text-center py-2 border border-zinc-200 rounded bg-zinc-50">
              <p className="text-xs text-zinc-500 uppercase font-semibold">Total Amount Due</p>
              <p className="text-2xl font-bold text-black">
                {formatMoney(paymentModalOrder.total, currency)}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-black">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {(["cash", "card", "online"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2 text-xs font-bold rounded border capitalize ${
                      paymentMethod === m
                        ? "bg-black text-white border-black"
                        : "border-zinc-300 text-zinc-700 hover:border-black"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
              <button
                onClick={() => setPaymentModalOrder(null)}
                className="px-3 py-1.5 border border-zinc-300 text-zinc-700 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={loading}
                className="px-4 py-1.5 bg-black text-white rounded text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Confirm & Print Bill"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Items Modal */}
      {addItemsOrder && (
        <AddItemsModal
          order={addItemsOrder}
          products={products}
          currency={currency}
          onClose={() => setAddItemsOrder(null)}
          onSuccess={() => {
            setAddItemsOrder(null);
            router.refresh();
          }}
        />
      )}

      {/* Admin Cancel Order Modal */}
      {cancelModalOrder && (
        <AdminCancelModal
          order={cancelModalOrder}
          isAdmin={isAdmin}
          onClose={() => setCancelModalOrder(null)}
          onSuccess={() => {
            setCancelModalOrder(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
