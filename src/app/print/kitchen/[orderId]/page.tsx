import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { notFound } from "next/navigation";
import PrintTrigger from "../../PrintTrigger";

export default async function KitchenSlipPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(`
      id,
      restaurant_id,
      order_no,
      order_type,
      table_no,
      order_date,
      created_at,
      notes,
      order_items(
        id,
        product_name,
        variant_name,
        quantity,
        notes,
        order_item_addons(addon_name)
      )
    `)
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, restaurant_id, restaurants(name, logo_url)")
    .single();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, logo_url")
    .eq("id", order.restaurant_id)
    .single();

  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("*")
    .single();

  const restaurantName =
    restaurant?.name || (profile?.restaurants as any)?.name || "Restaurant";
  const cashierName = (profile as any)?.full_name || "Staff";
  const logoUrl = restaurant?.logo_url || (settings as any)?.logo_url || (profile?.restaurants as any)?.logo_url;
  const slogan = settings?.slogan || settings?.receipt_footer || "";

  // Log event
  await supabase.from("order_events").insert({
    restaurant_id: order.restaurant_id || (profile as any)?.restaurant_id,
    order_id: orderId,
    event: "kitchen_slip_printed",
  });

  const orderTypeLabel =
    order.order_type === "dine_in"
      ? "DINE-IN"
      : order.order_type === "takeaway"
        ? "TAKEAWAY"
        : order.order_type?.toUpperCase() ?? "DINE-IN";

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
            padding-bottom: 25mm !important;
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
          padding: "5mm 3mm 25mm 3mm",
          fontSize: "11px",
          lineHeight: "1.4",
          boxSizing: "border-box",
        }}
      >
        {/* ── HEADER ── */}
        <div style={{ textAlign: "center", marginBottom: "6px" }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={restaurantName}
              style={{
                maxHeight: "110px",
                maxWidth: "220px",
                objectFit: "contain",
                margin: "0 auto 6px",
                display: "block",
                filter: "grayscale(100%) contrast(250%)",
                imageRendering: "pixelated",
                mixBlendMode: "multiply",
              }}
            />
          ) : (
            <div style={{ fontWeight: "bold", fontSize: "16px", textTransform: "uppercase" }}>
              {restaurantName}
            </div>
          )}
          {slogan && (
            <div style={{ fontSize: "21.5px", fontWeight: "bold", marginTop: "4px" }}>
              {slogan}
            </div>
          )}
          <div style={{ fontWeight: "bold", fontSize: "15px", letterSpacing: "1px", marginTop: "4px" }}>
            *** KITCHEN SLIP ***
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{ borderBottom: "1px solid #000", margin: "4px 0" }} />

        {/* ── ORDER META (No Customer Details) ── */}
        <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
            <span>Order No: {parseInt(order.order_no, 10)}</span>
            {order.order_type === "dine_in" && order.table_no && (
              <span>TABLE #: {order.table_no}</span>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: "2px" }}>
            <span>TYPE: {orderTypeLabel}</span>
          </div>
          <div style={{ fontSize: "10px", marginTop: "2px" }}>
            TIME: {formatDateTime(order.created_at)}
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{ borderBottom: "1px solid #000", margin: "4px 0" }} />

        {/* ── ITEMS TABLE HEADER ── */}
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

        {/* ── ITEMS ── */}
        <div style={{ marginBottom: "8px" }}>
          {order.order_items?.map((item: any) => (
            <div key={item.id} style={{ marginBottom: "8px" }}>
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
              {item.order_item_addons?.map((addon: any, idx: number) => (
                <div
                  key={idx}
                  style={{ paddingLeft: "8px", fontWeight: "bold", fontSize: "11px" }}
                >
                  &gt;&gt; ADD: {addon.addon_name}
                </div>
              ))}
              {item.notes && (
                <div
                  style={{ paddingLeft: "8px", fontStyle: "italic", fontSize: "10.5px" }}
                >
                  &gt;&gt; NOTE: {item.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── ORDER NOTE ── */}
        {order.notes && (
          <div
            style={{
              border: "1px solid #000",
              padding: "4px 6px",
              marginBottom: "8px",
              fontSize: "11px",
            }}
          >
            <strong>ORDER NOTE:</strong> {order.notes}
          </div>
        )}

        {/* ── DIVIDER ── */}
        <div style={{ borderBottom: "1.5px dashed #0f0000ff", margin: "6px 0" }} />

        {/* ── PREPARE IMMEDIATELY BANNER ── */}
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

        {/* ── THERMAL PAPER CUT FEED ── */}
        <div style={{ height: "20mm" }} />
      </div>
    </>
  );
}
