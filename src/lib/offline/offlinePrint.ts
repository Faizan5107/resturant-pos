/**
 * Offline Slip Printer
 *
 * Provides direct, in-memory HTML rendering and printing for kitchen slips
 * and customer bills without requiring an active internet connection, server
 * roundtrips, or Service Worker document routing.
 */

export interface OfflineSlipItem {
  product_name: string;
  variant_name?: string;
  quantity: number;
  notes?: string;
  line_total?: number;
  addons?: Array<{ addon_name: string; price_delta?: number }>;
}

export interface OfflineKitchenSlipData {
  orderNo: string | number;
  orderType?: string;
  tableNo?: string;
  notes?: string;
  items: OfflineSlipItem[];
  restaurantName?: string;
  restaurantSlug?: string;
  logoUrl?: string;
  slogan?: string;
  createdAt?: string;
}

export interface OfflineBillSlipData {
  orderNo: string | number;
  orderType?: string;
  tableNo?: string;
  customerName?: string;
  customerPhone?: string;
  currency?: string;
  isReprint?: boolean;
  items: OfflineSlipItem[];
  subtotal: number;
  taxAmount?: number;
  discountAmount?: number;
  deliveryFee?: number;
  serviceFee?: number;
  total?: number;
  restaurantName?: string;
  restaurantSlug?: string;
  logoUrl?: string;
  slogan?: string;
  createdAt?: string;
}

export function generateKitchenSlipHtml(data: OfflineKitchenSlipData): string {
  const orderNo = String(data.orderNo || "L-?-001");
  const orderType = data.orderType || "dine_in";
  const tableNo = data.tableNo || "";
  const notes = data.notes || "";
  const items = data.items || [];
  const restaurantName = data.restaurantName || "";
  const restaurantSlug = data.restaurantSlug || "";
  const logoUrl = data.logoUrl || "";
  const slogan = data.slogan || "";

  const orderTypeLabel =
    orderType === "dine_in"
      ? "DINE-IN"
      : orderType === "takeaway"
        ? "TAKEAWAY"
        : orderType.toUpperCase();

  const d = data.createdAt ? new Date(data.createdAt) : new Date();
  const timeStr = d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString("en-PK");

  const itemsHtml = items
    .map((item) => {
      const variantPart =
        item.variant_name && item.variant_name !== item.product_name
          ? ` (${escapeHtml(item.variant_name)})`
          : "";
      const addonsHtml = (item.addons || [])
        .map(
          (a) =>
            `<div style="padding-left:8px;font-weight:bold;font-size:11px;">&gt;&gt; ADD: ${escapeHtml(
              a.addon_name
            )}</div>`
        )
        .join("");
      const notesHtml = item.notes
        ? `<div style="padding-left:8px;font-style:italic;font-size:10.5px;">&gt;&gt; NOTE: ${escapeHtml(
            item.notes
          )}</div>`
        : "";

      return `
        <div style="margin-bottom:8px;">
          <div style="display:grid;grid-template-columns:1fr 40px;font-weight:bold;font-size:12px;">
            <span style="text-transform:uppercase;">${escapeHtml(item.product_name)}${variantPart}</span>
            <span style="text-align:right;">${item.quantity}x</span>
          </div>
          ${addonsHtml}
          ${notesHtml}
        </div>
      `;
    })
    .join("");

  const headerLogoOrName = `
    ${logoUrl ? `
      <img
        src="${escapeHtml(logoUrl)}"
        alt="${escapeHtml(restaurantName || "RESTAURANT")}"
        onerror="this.style.display='none';"
        style="max-height:80px;max-width:180px;object-fit:contain;margin:0 auto 4px;display:block;filter:grayscale(100%) contrast(250%);image-rendering:pixelated;mix-blend-mode:multiply;"
      />
    ` : ""}
    <div style="font-weight:bold;font-size:16px;text-transform:uppercase;letter-spacing:0.5px;">
      ${escapeHtml(restaurantName || "RESTAURANT")}
    </div>
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kitchen Slip - ${escapeHtml(orderNo)}</title>
  <style>
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
      .receipt-container {
        width: 75mm !important;
        max-width: 75mm !important;
        margin: 0 !important;
        padding-left: 2mm !important;
        padding-right: 3mm !important;
        padding-bottom: 50mm !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container" style="font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;width:75mm;max-width:75mm;margin:0;padding:5mm 3mm 25mm 2mm;font-size:11px;line-height:1.4;box-sizing:border-box;">
    <div style="text-align:center;margin-bottom:6px;">
      ${headerLogoOrName}
      ${slogan ? `<div style="font-size:13px;font-weight:bold;margin-top:2px;">${escapeHtml(slogan)}</div>` : ""}
      <div style="font-weight:bold;font-size:15px;letter-spacing:1px;margin-top:4px;">
        *** KITCHEN SLIP ***
      </div>
    </div>

    <div style="border-bottom:1px solid #000;margin:4px 0;"></div>

    <div style="font-size:12px;font-weight:bold;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;">
        <span>Order No: ${escapeHtml(String(parseInt(orderNo, 10) || orderNo))}</span>
        ${orderType === "dine_in" && tableNo ? `<span>TABLE #: ${escapeHtml(tableNo)}</span>` : ""}
      </div>
      <div style="font-size:10px;margin-top:2px;">
        TYPE: ${escapeHtml(orderTypeLabel)}
      </div>
      <div style="font-size:10px;margin-top:2px;">
        TIME: ${timeStr} &middot; ${dateStr}
      </div>
    </div>

    <div style="border-bottom:1px solid #000;margin:4px 0;"></div>

    <div style="display:grid;grid-template-columns:1fr 40px;font-weight:bold;font-size:12px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:6px;">
      <span>PRODUCT NAME</span>
      <span style="text-align:right;">QTY</span>
    </div>

    <div style="margin-bottom:8px;">
      ${itemsHtml}
    </div>

    ${
      notes
        ? `<div style="border:1px solid #000;padding:4px 6px;margin-bottom:8px;font-size:11px;"><strong>ORDER NOTE:</strong> ${escapeHtml(
            notes
          )}</div>`
        : ""
    }

    <div style="border-bottom:1.5px dashed #000;margin:6px 0;"></div>

    <div style="border:2px solid #000;textAlign:center;text-align:center;padding:5px;font-weight:bold;font-size:12px;letter-spacing:1px;margin-top:4px;margin-bottom:12px;">
      PREPARE IMMEDIATELY
    </div>

    <div style="height:20mm;"></div>
  </div>
</body>
</html>`;
}

export function generateBillSlipHtml(data: OfflineBillSlipData): string {
  const orderNo = String(data.orderNo || "L-?-001");
  const orderType = data.orderType || "dine_in";
  const tableNo = data.tableNo || "";
  const customerName = data.customerName || "";
  const customerPhone = data.customerPhone || "";
  const currency = data.currency || "PKR";
  const isReprint = !!data.isReprint;
  const restaurantName = data.restaurantName || "RESTAURANT";
  const restaurantSlug = data.restaurantSlug || "";
  const logoUrl = data.logoUrl || "";
  const slogan = data.slogan || "";

  const subtotal = Number(data.subtotal || 0);
  const taxAmount = Number(data.taxAmount || 0);
  const discountAmount = Number(data.discountAmount || 0);
  const deliveryFee = Number(data.deliveryFee || 0);
  const serviceFee = Number(data.serviceFee || 0);
  const total =
    data.total !== undefined
      ? Number(data.total)
      : subtotal + taxAmount + deliveryFee + serviceFee - discountAmount;

  const orderTypeLabel =
    orderType === "dine_in"
      ? "Dine-In"
      : orderType === "takeaway"
        ? "Takeaway"
        : orderType === "delivery"
          ? "Delivery"
          : orderType;

  const d = data.createdAt ? new Date(data.createdAt) : new Date();
  const timeStr = d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });

  const itemsHtml = (data.items || [])
    .map((item) => {
      const addonsTotal = (item.addons || []).reduce(
        (sum, a) => sum + (Number(a.price_delta) || 0),
        0
      );
      const totalItemPrice =
        Number(item.line_total || 0) + addonsTotal * Number(item.quantity || 1);
      const variantPart =
        item.variant_name && item.variant_name !== item.product_name
          ? ` (${escapeHtml(item.variant_name)})`
          : "";

      const addonsHtml = (item.addons || [])
        .map(
          (addon) =>
            `<div style="padding-left:28px;font-size:11px;font-weight:bold;">+ ${escapeHtml(
              addon.addon_name
            )}</div>`
        )
        .join("");

      const notesHtml = item.notes
        ? `<div style="padding-left:32px;font-size:9.5px;font-style:italic;">* ${escapeHtml(
            item.notes
          )}</div>`
        : "";

      return `
        <div style="margin-bottom:5px;">
          <div style="display:grid;grid-template-columns:1fr 38px 70px;font-size:12px;font-weight:bold;padding:0 4px;">
            <span>${escapeHtml(item.product_name)}${variantPart}</span>
            <span style="text-align:center;">${item.quantity}x</span>
            <span style="text-align:right;">${Math.round(totalItemPrice).toLocaleString()}</span>
          </div>
          ${addonsHtml}
          ${notesHtml}
        </div>
      `;
    })
    .join("");

  const headerLogoOrName = `
    ${logoUrl ? `
      <img
        src="${escapeHtml(logoUrl)}"
        alt="${escapeHtml(restaurantName)}"
        onerror="this.style.display='none';"
        style="max-height:80px;max-width:180px;object-fit:contain;margin:0 auto 4px;display:block;filter:grayscale(100%) contrast(250%);image-rendering:pixelated;mix-blend-mode:multiply;"
      />
    ` : ""}
    <div style="font-weight:bold;font-size:20px;text-transform:uppercase;letter-spacing:0.5px;">
      ${escapeHtml(restaurantName)}
    </div>
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bill Slip - ${escapeHtml(orderNo)}</title>
  <style>
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
      .receipt-container {
        width: 75mm !important;
        max-width: 75mm !important;
        margin: 0 !important;
        padding-left: 2mm !important;
        padding-right: 3mm !important;
        padding-bottom: 80mm !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container" style="font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;width:75mm;max-width:75mm;margin:0;padding:0 3mm 35mm 2mm;font-size:11px;line-height:1.4;box-sizing:border-box;">
    <div style="text-align:center;margin-bottom:6px;">
      ${headerLogoOrName}
      ${slogan ? `<div style="font-size:13px;font-weight:bold;margin-top:2px;">${escapeHtml(slogan)}</div>` : ""}
      ${
        isReprint
          ? `<div style="font-weight:bold;font-size:15px;letter-spacing:1px;border:2px solid #000;text-align:center;padding:2px 0;margin-top:6px;margin-bottom:2px;text-transform:uppercase;">*** REPRINT ***</div>`
          : ""
      }
    </div>

    <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;border-top:1px solid #000;padding:3px 0;margin-bottom:4px;">
      <span>Order No: ${escapeHtml(String(parseInt(orderNo, 10) || orderNo))}</span>
      <span>${timeStr}</span>
    </div>

    <div style="font-size:14px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;">
        <span><strong>Type:</strong> ${escapeHtml(orderTypeLabel)}</span>
        ${orderType === "dine_in" && tableNo ? `<span><strong>Table #:</strong> ${escapeHtml(tableNo)}</span>` : ""}
      </div>
      ${customerName ? `<div><strong>Customer:</strong> ${escapeHtml(customerName)}</div>` : ""}
      ${customerPhone ? `<div><strong>Phone:</strong> ${escapeHtml(customerPhone)}</div>` : ""}
    </div>

    <div style="display:grid;grid-template-columns:1fr 38px 70px;font-weight:bold;font-size:14px;text-transform:uppercase;border-top:1.5px solid #000;border-bottom:1.5px solid #000;padding:3px 4px;background-color:#f2f2f2;margin-bottom:6px;letter-spacing:0.5px;">
      <span>Product Name</span>
      <span style="text-align:center;">Qty</span>
      <span style="text-align:right;">Price</span>
    </div>

    <div style="margin-bottom:6px;">
      ${itemsHtml}
    </div>

    <div style="border-bottom:1px dashed #000;margin:4px 0 6px;"></div>

    <div style="font-size:12.5px;font-weight:bold;">
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
        <span>Subtotal:</span>
        <span>${escapeHtml(currency)} ${Math.round(subtotal).toLocaleString()}</span>
      </div>

      ${
        taxAmount > 0
          ? `<div style="display:flex;justify-content:space-between;margin-bottom:2px;">
              <span>Tax:</span>
              <span>${escapeHtml(currency)} ${Math.round(taxAmount).toLocaleString()}</span>
            </div>`
          : ""
      }

      ${
        discountAmount > 0
          ? `<div style="display:flex;justify-content:space-between;margin-bottom:2px;">
              <span>Discount:</span>
              <span>-${escapeHtml(currency)} ${Math.round(discountAmount).toLocaleString()}</span>
            </div>`
          : ""
      }

      ${
        deliveryFee > 0
          ? `<div style="display:flex;justify-content:space-between;margin-bottom:2px;">
              <span>Delivery Fee:</span>
              <span>${escapeHtml(currency)} ${Math.round(deliveryFee).toLocaleString()}</span>
            </div>`
          : ""
      }

      ${
        serviceFee > 0
          ? `<div style="display:flex;justify-content:space-between;margin-bottom:2px;">
              <span>Service Fee:</span>
              <span>${escapeHtml(currency)} ${Math.round(serviceFee).toLocaleString()}</span>
            </div>`
          : ""
      }

      <div style="border-bottom:1px solid #000;margin:4px 0;"></div>

      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;padding:2px 0;">
        <span>TOTAL:</span>
        <span>${escapeHtml(currency)} ${Math.round(total).toLocaleString()}</span>
      </div>
    </div>

    <div style="border-bottom:1px dashed #000;margin:6px 0;"></div>

    <div style="border-top:1px dashed #000;padding-top:6px;text-align:center;font-size:12px;font-weight:bold;color:#000;margin-bottom:30px;">
      <div>Developed by: Axor Solution</div>
      <div style="margin-top:2px;">Contact No: +923422352913</div>
    </div>

    <div style="height:80mm;"></div>
  </div>
</body>
</html>`;
}

/**
 * Directly prints HTML in-memory without navigating to an HTTP URL.
 * Uses a hidden iframe directly so NO new browser window or tab ever opens.
 * Guaranteed to execute exactly ONCE per call (no duplicate preview/print).
 */
let isPrintJobRunning = false;

export function printHtmlDirectly(html: string): boolean {
  if (typeof window === "undefined") return false;

  // Sanitize any embedded window.print script so document never triggers print independently
  const sanitizedHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Prevent accidental rapid-fire double clicks
  if (isPrintJobRunning) {
    console.warn("POS print job in progress, ignoring duplicate call.");
    return false;
  }
  isPrintJobRunning = true;
  setTimeout(() => {
    isPrintJobRunning = false;
  }, 1200);

  // Primary: Hidden iframe (0ms latency, in-memory, no popup window, never blocked)
  try {
    const existingIframe = document.getElementById("pos-silent-print-frame");
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement("iframe");
    iframe.id = "pos-silent-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    let hasPrinted = false;
    const triggerPrintOnce = () => {
      if (hasPrinted) return;
      hasPrinted = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Direct iframe print error:", err);
      } finally {
        setTimeout(() => {
          try {
            iframe.remove();
          } catch {}
        }, 3000);
      }
    };

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(sanitizedHtml);
      doc.close();

      if (iframe.contentWindow) {
        iframe.contentWindow.onload = () => {
          setTimeout(triggerPrintOnce, 60);
        };
      }
      // Safety timeout in case onload fired immediately
      setTimeout(triggerPrintOnce, 250);
      return true;
    }
  } catch (err) {
    console.warn("Hidden iframe direct print failed, trying window.open fallback:", err);
  }

  // Fallback: window.open (only if iframe fails)
  try {
    const sanitizedHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    const printWindow = window.open("", "_blank", "width=420,height=600");
    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(sanitizedHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {}
      }, 150);
      return true;
    }
  } catch (err) {
    console.error("Window.open fallback also failed:", err);
  }

  return false;
}

export function printOfflineKitchenSlip(data: OfflineKitchenSlipData): boolean {
  const html = generateKitchenSlipHtml(data);
  return printHtmlDirectly(html);
}

export function printOfflineBillSlip(data: OfflineBillSlipData): boolean {
  const html = generateBillSlipHtml(data);
  return printHtmlDirectly(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
