"use client";

/**
 * Offline Kitchen Slip — rendered from URL params (no server needed).
 *
 * Shows: temp order number, order type, items+qty, notes.
 * Does NOT show prices — kitchen slip never shows prices, online or offline.
 *
 * URL: /print/kitchen/offline?uuid=…&orderNo=L-A-001&orderType=dine_in
 *      &tableNo=T4&items=[{…}]&notes=…
 */

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PrintTrigger from "../../PrintTrigger";

interface SlipItem {
  product_name: string;
  variant_name: string;
  quantity: number;
  notes?: string;
  addons?: Array<{ addon_name: string }>;
}

function OfflineKitchenSlipContent() {
  const searchParams = useSearchParams();

  const orderNo   = searchParams.get("orderNo")   || "L-?-001";
  const orderType = searchParams.get("orderType") || "dine_in";
  const tableNo   = searchParams.get("tableNo")   || "";
  const notes     = searchParams.get("notes")     || "";
  const restaurantName = searchParams.get("restaurantName") || searchParams.get("restaurant") || "";
  const slug = searchParams.get("slug") || searchParams.get("restaurantSlug") || "";
  const logoUrl = searchParams.get("logoUrl") || "";
  const slogan = searchParams.get("slogan") || "";

  let items: SlipItem[] = [];
  try {
    items = JSON.parse(searchParams.get("items") || "[]");
  } catch {
    items = [];
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-PK");

  const orderTypeLabel =
    orderType === "dine_in"   ? "DINE-IN"   :
    orderType === "takeaway"  ? "TAKEAWAY"  :
    orderType.toUpperCase();

  return (
    <>
      <PrintTrigger />
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @page { margin: 0; size: 80mm auto; }
        @media print {
          html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; }
          .receipt-container { width: 75mm !important; max-width: 75mm !important; margin: 0 !important; padding-left: 2mm !important; padding-right: 3mm !important; padding-bottom: 50mm !important; box-sizing: border-box !important; }
        }
      `}</style>

      <div
        className="receipt-container"
        style={{
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#fff",
          color: "#000",
          width: "75mm",
          maxWidth: "75mm",
          margin: "0",
          padding: "5mm 3mm 25mm 2mm",
          fontSize: "11px",
          lineHeight: "1.4",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "6px" }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt={restaurantName || "Restaurant"}
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
              style={{
                maxHeight: "80px",
                maxWidth: "180px",
                objectFit: "contain",
                margin: "0 auto 4px",
                display: "block",
                filter: "grayscale(100%) contrast(250%)",
                imageRendering: "pixelated",
                mixBlendMode: "multiply",
              }}
            />
          )}
          <div
            style={{
              fontWeight: "bold",
              fontSize: "16px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {restaurantName || "RESTAURANT"}
          </div>

          {slug && (
            <div style={{ fontSize: "11px", fontWeight: "bold", fontFamily: "monospace", letterSpacing: "1px", textTransform: "uppercase", margin: "2px 0 3px" }}>
              SLUG: {slug}
            </div>
          )}

          {slogan && (
            <div style={{ fontSize: "12px", fontWeight: "bold", fontStyle: "italic", marginTop: "2px" }}>
              {slogan}
            </div>
          )}

          <div style={{ fontWeight: "bold", fontSize: "15px", letterSpacing: "1px", marginTop: "4px" }}>
            *** KITCHEN SLIP ***
          </div>
          <div style={{ fontSize: "10px", marginTop: "2px", fontStyle: "italic" }}>
            [OFFLINE — Temp Slip]
          </div>
        </div>

        <div style={{ borderBottom: "1px solid #000", margin: "4px 0" }} />

        {/* Order meta */}
        <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Order No: {orderNo}</span>
            {orderType === "dine_in" && tableNo && (
              <span>TABLE #: {tableNo}</span>
            )}
          </div>
          <div style={{ fontSize: "10px", marginTop: "2px" }}>
            TYPE: {orderTypeLabel}
          </div>
          <div style={{ fontSize: "10px", marginTop: "2px" }}>
            TIME: {timeStr} · {dateStr}
          </div>
        </div>

        <div style={{ borderBottom: "1px solid #000", margin: "4px 0" }} />

        {/* Items header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 40px",
            fontWeight: "bold",
            fontSize: "12px",
            borderBottom: "1px solid #000",
            paddingBottom: "3px",
            marginBottom: "6px",
          }}
        >
          <span>PRODUCT NAME</span>
          <span style={{ textAlign: "right" }}>QTY</span>
        </div>

        {/* Items */}
        <div style={{ marginBottom: "8px" }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ marginBottom: "8px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 40px",
                  fontWeight: "bold",
                  fontSize: "12px",
                }}
              >
                <span style={{ textTransform: "uppercase" }}>
                  {item.product_name}
                  {item.variant_name && item.variant_name !== item.product_name
                    ? ` (${item.variant_name})`
                    : ""}
                </span>
                <span style={{ textAlign: "right" }}>{item.quantity}x</span>
              </div>
              {item.addons?.map((a, ai) => (
                <div key={ai} style={{ paddingLeft: "8px", fontWeight: "bold", fontSize: "11px" }}>
                  &gt;&gt; ADD: {a.addon_name}
                </div>
              ))}
              {item.notes && (
                <div style={{ paddingLeft: "8px", fontStyle: "italic", fontSize: "10.5px" }}>
                  &gt;&gt; NOTE: {item.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Order note */}
        {notes && (
          <div style={{ border: "1px solid #000", padding: "4px 6px", marginBottom: "8px", fontSize: "11px" }}>
            <strong>ORDER NOTE:</strong> {notes}
          </div>
        )}

        <div style={{ borderBottom: "1.5px dashed #000", margin: "6px 0" }} />

        <div
          style={{
            border: "2px solid #000",
            textAlign: "center",
            padding: "5px",
            fontWeight: "bold",
            fontSize: "12px",
            letterSpacing: "1px",
            marginTop: "4px",
            marginBottom: "12px",
          }}
        >
          PREPARE IMMEDIATELY
        </div>

        <div style={{ height: "20mm" }} />
      </div>
    </>
  );
}

export default function OfflineKitchenSlip() {
  return (
    <Suspense fallback={<div className="p-4 text-xs font-mono">Loading slip...</div>}>
      <OfflineKitchenSlipContent />
    </Suspense>
  );
}
