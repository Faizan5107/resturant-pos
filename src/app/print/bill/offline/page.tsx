"use client";

/**
 * Offline Customer Bill Slip — rendered from URL params / client state (no database server connection needed).
 *
 * URL: /print/bill/offline?orderNo=101&orderType=dine_in&tableNo=T4&items=[...]&subtotal=500&total=500
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PrintTrigger from "../../PrintTrigger";
import { formatMoney } from "@/lib/money";

interface BillItem {
  product_name: string;
  variant_name?: string;
  quantity: number;
  line_total: number;
  notes?: string;
  addons?: Array<{ addon_name: string; price_delta?: number }>;
}

function OfflineBillSlipContent() {
  const searchParams = useSearchParams();

  const orderNo = searchParams.get("orderNo") || "L-?-001";
  const orderType = searchParams.get("orderType") || "dine_in";
  const tableNo = searchParams.get("tableNo") || "";
  const customerName = searchParams.get("customerName") || "";
  const customerPhone = searchParams.get("customerPhone") || "";
  const currency = searchParams.get("currency") || "PKR";
  const isReprint = searchParams.get("reprint") === "true";

  const subtotal = Number(searchParams.get("subtotal") || 0);
  const taxAmount = Number(searchParams.get("taxAmount") || 0);
  const discountAmount = Number(searchParams.get("discountAmount") || 0);
  const deliveryFee = Number(searchParams.get("deliveryFee") || 0);
  const serviceFee = Number(searchParams.get("serviceFee") || 0);
  const total = Number(searchParams.get("total") || (subtotal + taxAmount + deliveryFee + serviceFee - discountAmount));

  let items: BillItem[] = [];
  try {
    items = JSON.parse(searchParams.get("items") || "[]");
  } catch {
    items = [];
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-PK");

  const orderTypeLabel =
    orderType === "dine_in"
      ? "Dine-In"
      : orderType === "takeaway"
        ? "Takeaway"
        : orderType === "delivery"
          ? "Delivery"
          : orderType;

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @page {
          margin: 0;
          size: 80mm auto;
        }
        @media print {
          html, body {
            width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .receipt-container {
            width: 80mm !important;
            margin: 0 !important;
            padding-bottom: 35mm !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <PrintTrigger />

      <div
        className="receipt-container"
        style={{
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#fff",
          color: "#000",
          width: "80mm",
          margin: "0",
          padding: "0 3mm 35mm 3mm",
          fontSize: "11px",
          lineHeight: "1.4",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "6px" }}>
          <div style={{ fontWeight: "bold", fontSize: "24px", textTransform: "uppercase" }}>
            RESTAURANT
          </div>
          <div style={{ fontSize: "10px", marginTop: "2px", fontStyle: "italic" }}>
            [OFFLINE RECEIPT]
          </div>
          {isReprint && (
            <div
              style={{
                fontWeight: "bold",
                fontSize: "15px",
                letterSpacing: "1px",
                border: "2px solid #000",
                textAlign: "center",
                padding: "2px 0",
                marginTop: "6px",
                marginBottom: "2px",
                textTransform: "uppercase",
              }}
            >
              *** REPRINT ***
            </div>
          )}
        </div>

        {/* Order No & Date */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "14px",
            fontWeight: "bold",
            borderTop: "1px solid #000",
            padding: "3px 0",
            marginBottom: "4px",
          }}
        >
          <span>Order No: {orderNo}</span>
          <span>{timeStr}</span>
        </div>

        {/* Order Details */}
        <div style={{ fontSize: "14px", marginBottom: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              <strong>Type:</strong> {orderTypeLabel}
            </span>
            {orderType === "dine_in" && tableNo && (
              <span>
                <strong>Table #:</strong> {tableNo}
              </span>
            )}
          </div>
          {customerName && (
            <div>
              <strong>Customer:</strong> {customerName}
            </div>
          )}
          {customerPhone && (
            <div>
              <strong>Phone:</strong> {customerPhone}
            </div>
          )}
        </div>

        {/* Table Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 50px 80px",
            fontWeight: "bold",
            fontSize: "14px",
            textTransform: "uppercase",
            borderTop: "1.5px solid #000",
            borderBottom: "1.5px solid #000",
            padding: "3px 4px",
            backgroundColor: "#f2f2f2",
            marginBottom: "6px",
            letterSpacing: "0.5px",
          }}
        >
          <span>Product Name</span>
          <span style={{ textAlign: "center" }}>Qty</span>
          <span style={{ textAlign: "right" }}>Price</span>
        </div>

        {/* Items List */}
        <div style={{ marginBottom: "6px" }}>
          {items.map((item, idx) => {
            const addonsTotal = (item.addons || []).reduce(
              (sum, a) => sum + (Number(a.price_delta) || 0),
              0
            );
            const totalItemPrice = Number(item.line_total || 0) + addonsTotal * Number(item.quantity || 1);

            return (
              <div key={idx} style={{ marginBottom: "5px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 50px 80px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    padding: "0 4px",
                  }}
                >
                  <span>
                    {item.product_name}
                    {item.variant_name && item.variant_name !== item.product_name
                      ? ` (${item.variant_name})`
                      : ""}
                  </span>
                  <span style={{ textAlign: "center" }}>{item.quantity}x</span>
                  <span style={{ textAlign: "right" }}>
                    {formatMoney(totalItemPrice, currency).replace(currency, "").trim()}
                  </span>
                </div>
                {item.addons?.map((addon, aIdx) => (
                  <div
                    key={aIdx}
                    style={{
                      paddingLeft: "28px",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    + {addon.addon_name}
                  </div>
                ))}
                {item.notes && (
                  <div style={{ paddingLeft: "32px", fontSize: "9.5px", fontStyle: "italic" }}>
                    * {item.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ borderBottom: "1px dashed #000", margin: "4px 0 6px" }} />

        {/* Totals */}
        <div style={{ fontSize: "12.5px", fontWeight: "bold" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
            <span>Subtotal:</span>
            <span>
              {currency} {Math.round(subtotal).toLocaleString()}
            </span>
          </div>

          {taxAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Tax:</span>
              <span>
                {currency} {Math.round(taxAmount).toLocaleString()}
              </span>
            </div>
          )}

          {discountAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Discount:</span>
              <span>
                -{currency} {Math.round(discountAmount).toLocaleString()}
              </span>
            </div>
          )}

          {deliveryFee > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Delivery Fee:</span>
              <span>
                {currency} {Math.round(deliveryFee).toLocaleString()}
              </span>
            </div>
          )}

          {serviceFee > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Service Fee:</span>
              <span>
                {currency} {Math.round(serviceFee).toLocaleString()}
              </span>
            </div>
          )}

          <div style={{ borderBottom: "1px solid #000", margin: "4px 0" }} />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontWeight: "bold",
              fontSize: "14px",
              padding: "2px 0",
            }}
          >
            <span>TOTAL:</span>
            <span>
              {currency} {Math.round(total).toLocaleString()}
            </span>
          </div>
        </div>

        <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />

        <div
          style={{
            borderTop: "1px dashed #000",
            paddingTop: "6px",
            textAlign: "center",
            fontSize: "12px",
            fontWeight: "bold",
            color: "#000",
            marginBottom: "30px",
          }}
        >
          <div>Developed by: Axor Solution </div>
          <div
            style={{ marginTop: "2px" }}
          >Contact No: +923422352913</div>
        </div>

        <div style={{ height: "80mm" }} />
      </div>
    </>
  );
}

export default function OfflineBillSlip() {
  return (
    <Suspense fallback={<div className="p-4 text-xs font-mono">Loading receipt...</div>}>
      <OfflineBillSlipContent />
    </Suspense>
  );
}
