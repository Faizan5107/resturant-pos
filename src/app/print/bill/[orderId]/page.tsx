import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { notFound } from "next/navigation";
import PrintTrigger from "../../PrintTrigger";

export default async function FinalBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<{ reprint?: string }>;
}) {
  const { orderId } = await params;
  const sParams = searchParams ? await searchParams : {};
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(`
      *,
      order_items(
        id,
        product_name,
        variant_name,
        unit_price,
        quantity,
        line_total,
        notes,
        order_item_addons(addon_name, price_delta)
      )
    `)
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  const { createAdminClient } = await import("@/lib/supabase/server");
  const adminClient = createAdminClient();

  const [{ data: settings }, { data: restaurant }] = await Promise.all([
    adminClient
      .from("restaurant_settings")
      .select("*")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle(),
    adminClient
      .from("restaurants")
      .select("name, slug, logo_url")
      .eq("id", order.restaurant_id)
      .maybeSingle(),
  ]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, restaurant_id, restaurants(name, slug, logo_url)")
    .single();

  const restaurantName =
    restaurant?.name || (profile?.restaurants as any)?.name || "Restaurant";
  const restaurantSlug =
    restaurant?.slug || (profile?.restaurants as any)?.slug || "";
  const logoUrl = restaurant?.logo_url || (settings as any)?.logo_url || (profile?.restaurants as any)?.logo_url;
  const currency = settings?.currency || "PKR";
  const slogan = settings?.slogan || settings?.receipt_footer || "";
  const address = settings?.address || "";
  const phone = settings?.phone || "";
  const taxRate = settings?.tax_rate || 0;

  // Check previous bill_printed events for reprint detection
  const { count: previousPrints } = await supabase
    .from("order_events")
    .select("*", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("event", "bill_printed");

  const isReprint = sParams.reprint === "true" || (previousPrints ?? 0) > 0;

  // Log event
  await supabase.from("order_events").insert({
    restaurant_id: order.restaurant_id || (profile as any)?.restaurant_id,
    order_id: orderId,
    event: isReprint ? "bill_reprinted" : "bill_printed",
  });

  const orderTypeLabel =
    order.order_type === "dine_in"
      ? "Dine-In"
      : order.order_type === "takeaway"
        ? "Takeaway"
        : order.order_type === "delivery"
          ? "Delivery"
          : order.order_type ?? "Dine-In";

  const deliveryFee = order.order_type === "delivery" ? Number(order.delivery_fee || 0) : 0;
  const serviceFee = order.order_type === "dine_in" ? Number(order.service_fee || 0) : 0;
  const subtotal = Number(order.subtotal || 0);
  const taxAmount = Number(order.tax_amount || 0);
  const discountAmount = Number(order.discount_amount || 0);

  const netPayable = subtotal + taxAmount + deliveryFee + serviceFee - discountAmount;

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
            width: 75mm !important;
            max-width: 75mm !important;
            margin: 0 !important;
            padding-left: 2mm !important;
            padding-right: 3mm !important;
            padding-bottom: 80mm !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
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
          width: "75mm",
          maxWidth: "75mm",
          margin: "0",
          padding: "0 3mm 35mm 2mm",
          fontSize: "11px",
          lineHeight: "1.4",
          boxSizing: "border-box",
        }}
      >
        {/* ── 1. RESTAURANT LOGO & NAME (Top) ── */}
        <div style={{ textAlign: "center", marginBottom: "6px" }}>
          {logoUrl ? (
            <>
              <img
                src={logoUrl}
                alt={restaurantName}
                style={{
                  maxHeight: "110px",
                  maxWidth: "220px",
                  objectFit: "contain",
                  margin: "0 auto 4px",
                  display: "block",
                  filter: "grayscale(100%) contrast(250%)",
                  imageRendering: "pixelated",
                  mixBlendMode: "multiply",
                }}
              />
              <div style={{ fontWeight: "bold", fontSize: "20px", textTransform: "uppercase" }}>
                {restaurantName}
              </div>
            </>
          ) : (
            <div style={{ fontWeight: "bold", fontSize: "22px", textTransform: "uppercase" }}>
              {restaurantName}
            </div>
          )}
          {slogan && (
            <div style={{ fontSize: "13px", fontWeight: "bold", marginTop: "3px" }}>
              {slogan}
            </div>
          )}
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

        {/* ── 2. ORDER NO & DATE/TIME ROW ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "14px",
            fontWeight: "bold",
            borderTop: "1px solid #000",
            // borderBottom: "1px solid #000",
            padding: "3px 0",
            marginBottom: "4px",
          }}
        >
          <span>Order No: {parseInt(order.order_no, 10)}</span>
          <span>{formatDateTime(order.created_at)}</span>
        </div>

        {/* ── 3. ORDER TYPE, TABLE NO, CUSTOMER DETAILS ── */}
        <div style={{ fontSize: "14px", marginBottom: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              <strong>Type:</strong> {orderTypeLabel}
            </span>
            {order.order_type === "dine_in" && order.table_no && (
              <span>
                <strong>Table #:</strong> {order.table_no}
              </span>
            )}
          </div>
          {order.customer_name && (
            <div>
              <strong>Customer:</strong> {order.customer_name}
            </div>
          )}
          {order.customer_phone && (
            <div>
              <strong>Phone:</strong> {order.customer_phone}
            </div>
          )}
        </div>

        {/* ── 4. HIGHLIGHTED COLUMN NAMES: Product Name, Qty, Price ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 38px 70px",
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

        {/* ── 5. ITEMS LIST ── */}
        <div style={{ marginBottom: "6px" }}>
          {order.order_items?.map((item: any) => {
            const addonsTotal = (item.order_item_addons || []).reduce(
              (sum: number, a: any) => sum + (Number(a.price_delta) || 0),
              0
            );
            const totalItemPrice = Number(item.line_total || 0) + addonsTotal * Number(item.quantity || 1);

            return (
              <div key={item.id} style={{ marginBottom: "5px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 38px 70px",
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
                {/* Addons & Notes */}
                {item.order_item_addons?.map((addon: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      paddingLeft: "28px",
                      fontSize: "11px",
                      color: "#030303ff",
                      fontStyle: "normal",
                      fontWeight: "bold",
                    }}
                  >
                    + {addon.addon_name}
                    {addon.price_delta > 0
                      ? ` (+${formatMoney(addon.price_delta, currency).replace(currency, "").trim()})`
                      : ""}
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

        {/* ── DIVIDER / BAR ── */}
        <div style={{ borderBottom: "1px dashed #000", margin: "4px 0 6px" }} />

        {/* ── 6. TOTALS ── */}
        <div style={{ fontSize: "12.5px", fontWeight: "bold" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
            <span>Subtotal:</span>
            <span>
              {currency} {Math.round(order.subtotal ?? 0).toLocaleString()}
            </span>
          </div>

          {(order.tax_amount ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Tax ({taxRate}%):</span>
              <span>
                {currency} {Math.round(order.tax_amount ?? 0).toLocaleString()}
              </span>
            </div>
          )}

          {(order.discount_amount ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Discount:</span>
              <span>
                -{currency} {Math.round(order.discount_amount ?? 0).toLocaleString()}
              </span>
            </div>
          )}

          {/* Delivery fee: always shown for delivery orders */}
          {order.order_type === "delivery" && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Delivery Fee:</span>
              <span>
                {currency} {Math.round(Number(order.delivery_fee || 0)).toLocaleString()}
              </span>
            </div>
          )}

          {/* Service fee: only applicable in dine in */}
          {order.order_type === "dine_in" && (order.service_fee ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Service Fee:</span>
              <span>
                {currency} {Math.round(order.service_fee).toLocaleString()}
              </span>
            </div>
          )}

          <div style={{ borderBottom: "1px solid #000", margin: "4px 0" }} />

          {/* NET PAYABLE / TOTAL */}
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
              {currency} {Math.round(netPayable).toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── DIVIDER / BAR ── */}
        <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />

        {/* ── 7. RESTAURANT CONTACT & ADDRESS ── */}
        <div style={{ textAlign: "center", marginTop: "4px" }}>
          {phone && <div style={{ fontSize: "14px", fontWeight: "bold" }}>Contact: {phone}</div>}
          {address && <div style={{ fontSize: "14px", fontWeight: "bold" }}>{address}</div>}
        </div>

        {/* ── 8. SPACING ── */}
        <div style={{ height: "12px" }} />

        {/* ── 9. DEVELOPED BY SECTION ── */}
        <div
          style={{
            borderTop: "1px dashed #0c0b0bff",
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

        {/* ── 10. THERMAL PAPER CUT FEED (Generous spacing to feed paper past hardware cutter blade) ── */}
        <div style={{ height: "80mm" }} />
      </div>
    </>
  );
}
