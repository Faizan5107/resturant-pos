"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrderDateString } from "@/lib/dates";

export async function placeOrderAction(
  payload: {
    order_type: "dine_in" | "takeaway" | "delivery";
    order_no?: string;
    table_no?: string;
    customer_name?: string;
    customer_phone?: string;
    delivery_address?: string;
    delivery_fee?: number;
    notes?: string;
    items: Array<{
      variant_id: string;
      quantity: number;
      notes?: string;
      addons?: Array<{ addon_name: string; price_delta: number }>;
    }>;
  },
  clientUuid?: string | null
) {
  const supabase = await createClient();

  let data: any = null;
  let error: any = null;

  if (clientUuid) {
    const res = await supabase.rpc("place_order", {
      p_payload: payload,
      p_client_uuid: clientUuid,
    });
    data = res.data;
    error = res.error;
  }

  // Fallback: If clientUuid was not provided OR if the RPC failed (e.g. signature mismatch on local DB)
  if (!clientUuid || error) {
    const fallbackRes = await supabase.rpc("place_order", {
      p_payload: payload,
    });
    if (!fallbackRes.error) {
      data = fallbackRes.data;
      error = null;
    } else if (!data) {
      error = fallbackRes.error;
    }
  }

  if (error) {
    return { error: error.message };
  }

  if (data?.order_id) {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const adminClient = createAdminClient();

    // Fetch current order details
    const { data: ord } = await adminClient
      .from("orders")
      .select("subtotal, tax_amount, order_type, restaurant_id, order_no")
      .eq("id", data.order_id)
      .single();

    if (ord) {
      const bizOrderDate = getOrderDateString();
      let finalOrderNo = ord.order_no;

      // If client supplied an offline order_no, preserve it if no collision exists
      const desiredOrderNo = payload.order_no ? String(payload.order_no).padStart(4, "0") : null;
      if (desiredOrderNo && desiredOrderNo !== ord.order_no) {
        const { data: existing } = await adminClient
          .from("orders")
          .select("id")
          .eq("restaurant_id", ord.restaurant_id)
          .eq("order_date", bizOrderDate)
          .eq("order_no", desiredOrderNo)
          .neq("id", data.order_id)
          .maybeSingle();

        if (!existing) {
          finalOrderNo = desiredOrderNo;

          // Advance order_counters so subsequent orders continue after this number
          const num = parseInt(desiredOrderNo, 10);
          if (!isNaN(num)) {
            const { data: counter } = await adminClient
              .from("order_counters")
              .select("last_no")
              .eq("restaurant_id", ord.restaurant_id)
              .eq("order_date", bizOrderDate)
              .maybeSingle();

            const curLast = counter?.last_no || 0;
            if (num > curLast) {
              await adminClient
                .from("order_counters")
                .upsert({
                  restaurant_id: ord.restaurant_id,
                  order_date: bizOrderDate,
                  last_no: num,
                });
            }
          }
        }
      }

      // Fetch restaurant settings specifically for this restaurant
      const { data: settings } = await adminClient
        .from("restaurant_settings")
        .select("enable_service_fee, service_fee_amount")
        .eq("restaurant_id", ord.restaurant_id)
        .maybeSingle();

      const subtotal = Number(ord.subtotal || 0);
      const taxAmount = Number(ord.tax_amount || 0);
      const deliveryFee = ord.order_type === "delivery" ? Number(payload.delivery_fee || 0) : 0;

      // Apply service fee only for dine-in if enabled in settings
      const enableServiceFee = settings?.enable_service_fee ?? false;
      const serviceFeeAmount = Number(settings?.service_fee_amount || 0);
      const serviceFee = ord.order_type === "dine_in" && enableServiceFee ? serviceFeeAmount : 0;

      const newTotal = subtotal + taxAmount + deliveryFee + serviceFee;

      await adminClient
        .from("orders")
        .update({
          order_no: finalOrderNo,
          order_date: bizOrderDate,
          delivery_fee: deliveryFee,
          service_fee: serviceFee,
          total: newTotal,
        })
        .eq("id", data.order_id);

      data.order_no = finalOrderNo;
      data.total = newTotal;
    }
  }

  revalidatePath("/cashier");
  revalidatePath("/cashier/active-orders");
  return { success: true, result: data };
}

export async function updateOrderStatusAction(orderId: string, newStatus: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id) return { error: "Restaurant not found", status: 401 };

  const { error } = await supabase
    .from("orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", profile.restaurant_id);

  if (error) return { error: error.message, status: 422 };

  // Log status change event
  await supabase.from("order_events").insert({
    restaurant_id: profile.restaurant_id,
    order_id: orderId,
    event: "status_changed",
    note: `Status changed to ${newStatus}`,
  });

  revalidatePath("/cashier/active-orders");
  return { success: true, status: 200 };
}

export async function markOrderPaidAction(orderId: string, paymentMethod: "cash" | "card" | "online") {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated", status: 401 };

  const { data, error } = await supabase.rpc("mark_order_paid", {
    p_order_id: orderId,
    p_payment_method: paymentMethod,
  });

  if (error) return { error: error.message, status: 422 };

  revalidatePath("/cashier/active-orders");
  return { success: true, status: 200 };
}

/**
 * Fetches all orders for the authenticated user's restaurant.
 * Uses server-side Supabase auth (cookies) so it always works regardless of
 * whether NEXT_PUBLIC_ env vars are available in the browser bundle.
 */
export async function fetchOrdersAction(): Promise<{
  orders?: Array<{
    id: string; order_no: string; order_type: string; table_no?: string;
    customer_name?: string; status: string; subtotal: number; tax_amount: number;
    total: number; payment_method?: string; cancel_reason?: string;
    created_at: string; updated_at?: string;
    order_items: Array<{
      id: string; product_name: string; variant_name: string;
      unit_price: number; quantity: number; line_total: number; notes?: string;
    }>;
  }>;
  restaurantId?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthenticated" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.restaurant_id) return { error: "Restaurant not found" };

    const { data: ordersData, error } = await supabase
      .from("orders")
      .select(`
        id, order_no, order_type, table_no, customer_name, status,
        subtotal, tax_amount, total, payment_method, cancel_reason,
        created_at, updated_at,
        order_items(id, product_name, variant_name, unit_price, quantity, line_total, notes)
      `)
      .eq("restaurant_id", profile.restaurant_id)
      .order("created_at", { ascending: false });

    if (error) return { error: error.message };

    return {
      restaurantId: profile.restaurant_id,
      orders: (ordersData as any[]).map((o) => ({
        ...o,
        order_items: o.order_items || [],
      })),
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

/**
 * Fetches auth profile, products, and restaurant settings in one server-side round-trip.
 * Replaces the two createClient() calls in active-orders/page.tsx so the client
 * doesn't need NEXT_PUBLIC_ env vars to work.
 */
export async function fetchCashierBootstrapAction(): Promise<{
  restaurantId?: string;
  role?: string;
  currency?: string;
  restaurantName?: string;
  restaurantSlug?: string;
  logoUrl?: string;
  slogan?: string;
  products?: Array<{
    id: string; code: string; name: string; status: string;
    product_variants: Array<{ id: string; name: string; sale_price: number }>;
  }>;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthenticated" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.restaurant_id) return { error: "Restaurant not found" };

    const [prodRes, settingsRes, restRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, code, name, status, product_variants(id, name, sale_price)")
        .neq("status", "hidden")
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true }),
      supabase
        .from("restaurant_settings")
        .select("currency, slogan")
        .eq("restaurant_id", profile.restaurant_id)
        .maybeSingle(),
      supabase
        .from("restaurants")
        .select("name, slug, logo_url")
        .eq("id", profile.restaurant_id)
        .maybeSingle(),
    ]);

    return {
      restaurantId: profile.restaurant_id,
      role: profile.role,
      currency: settingsRes.data?.currency || "PKR",
      restaurantName: restRes.data?.name || "",
      restaurantSlug: restRes.data?.slug || "",
      logoUrl: restRes.data?.logo_url || "",
      slogan: settingsRes.data?.slogan || "",
      products: (prodRes.data as any) || [],
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Bootstrap failed" };
  }
}

export async function cancelOrderAction(orderId: string, reason: string) {


  const supabase = await createClient();

  const { data, error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath("/cashier/active-orders");
  return { success: true };
}

/**
 * Allows a cashier to cancel an order if approved with Admin credentials.
 */
export async function adminCancelOrderWithAuthAction(payload: {
  orderId: string;
  reason: string;
  adminEmail: string;
  adminPassword?: string;
}) {
  const supabase = await createClient();

  // Verify the admin credentials
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: payload.adminEmail,
    password: payload.adminPassword || "",
  });

  if (authError || !authData.user) {
    return { error: "Invalid Admin credentials. Cancellation denied." };
  }

  // Verify user is actually an admin
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("restaurant_id, role")
    .eq("id", authData.user.id)
    .single();

  if (!adminProfile || (adminProfile.role !== "admin" && adminProfile.role !== "super_admin")) {
    return { error: "This user does not have Administrator rights." };
  }

  // Cancel order via adminClient
  const { createAdminClient } = await import("@/lib/supabase/server");
  const adminClient = createAdminClient();

  const { error: cancelError } = await adminClient
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_by: authData.user.id,
      cancel_reason: payload.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.orderId)
    .eq("restaurant_id", adminProfile.restaurant_id);

  if (cancelError) return { error: cancelError.message };

  await adminClient.from("order_events").insert({
    restaurant_id: adminProfile.restaurant_id,
    order_id: payload.orderId,
    event: "cancelled",
    by_user: authData.user.id,
    note: `Cancelled by Admin (${adminProfile.role}): ${payload.reason}`,
  });

  revalidatePath("/cashier/active-orders");
  return { success: true };
}

/**
 * Adds new items to an existing punched order.
 * Only ADDITION of items is allowed; existing items are preserved.
 */
export async function addItemsToOrderAction(payload: {
  orderId: string;
  items: Array<{
    variant_id: string;
    quantity: number;
    notes?: string;
    addons?: Array<{ addon_name: string; price_delta: number }>;
  }>;
}) {
  if (!payload.items || payload.items.length === 0) {
    return { error: "Please select at least one item to add." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id) return { error: "Restaurant context missing" };

  const { createAdminClient } = await import("@/lib/supabase/server");
  const adminClient = createAdminClient();

  // Fetch current order
  const { data: order, error: orderErr } = await adminClient
    .from("orders")
    .select("id, status, subtotal, tax_amount, total, delivery_fee, restaurant_id")
    .eq("id", payload.orderId)
    .eq("restaurant_id", profile.restaurant_id)
    .single();

  if (orderErr || !order) return { error: "Order not found" };

  if (order.status === "paid" || order.status === "cancelled") {
    return { error: `Cannot add items to an order that is already ${order.status}.` };
  }

  // Get restaurant tax rate
  const { data: settings } = await adminClient
    .from("restaurant_settings")
    .select("tax_rate")
    .eq("restaurant_id", profile.restaurant_id)
    .single();

  const taxRate = Number(settings?.tax_rate || 0);

  let addedSubtotal = 0;
  const addedItemNames: string[] = [];

  for (const item of payload.items) {
    if (item.quantity <= 0) continue;

    // Fetch product variant details
    const { data: variant, error: varErr } = await adminClient
      .from("product_variants")
      .select(`
        id,
        name,
        sale_price,
        products (name, status)
      `)
      .eq("id", item.variant_id)
      .eq("restaurant_id", profile.restaurant_id)
      .single();

    if (varErr || !variant) {
      return { error: `Invalid product variant selected.` };
    }

    const prod = variant.products as any;
    if (prod?.status === "out_of_stock") {
      return { error: `Product ${prod?.name} is out of stock.` };
    }

    const unitPrice = Number(variant.sale_price) || 0;
    const lineTotal = unitPrice * item.quantity;
    addedSubtotal += lineTotal;
    addedItemNames.push(`${item.quantity}x ${prod?.name} (${variant.name})`);

    // Insert order item
    const { data: insertedItem, error: itemInsertErr } = await adminClient
      .from("order_items")
      .insert({
        restaurant_id: profile.restaurant_id,
        order_id: order.id,
        variant_id: variant.id,
        product_name: prod?.name || "Product",
        variant_name: variant.name,
        unit_price: unitPrice,
        quantity: item.quantity,
        line_total: lineTotal,
        notes: item.notes || null,
      })
      .select("id")
      .single();

    if (itemInsertErr) {
      return { error: `Failed to insert item: ${itemInsertErr.message}` };
    }

    // Snapshot cost for admin profit tracking
    const { data: costRec } = await adminClient
      .from("variant_costs")
      .select("cost_price")
      .eq("variant_id", variant.id)
      .single();

    await adminClient.from("order_item_costs").insert({
      order_item_id: insertedItem.id,
      restaurant_id: profile.restaurant_id,
      unit_cost: Number(costRec?.cost_price || 0),
    });

    // Process Addons if any
    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        const delta = Number(addon.price_delta) || 0;
        await adminClient.from("order_item_addons").insert({
          restaurant_id: profile.restaurant_id,
          order_item_id: insertedItem.id,
          addon_name: addon.addon_name,
          price_delta: delta,
        });
        addedSubtotal += delta * item.quantity;
      }
    }
  }

  // Update Order totals
  const newSubtotal = Number(order.subtotal) + addedSubtotal;
  const newTaxAmount = Math.round(newSubtotal * (taxRate / 100) * 100) / 100;
  const deliveryFee = Number((order as any).delivery_fee || 0);
  const newTotal = newSubtotal + newTaxAmount + deliveryFee;

  await adminClient
    .from("orders")
    .update({
      subtotal: newSubtotal,
      tax_amount: newTaxAmount,
      total: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  // Log status change / item added event
  await adminClient.from("order_events").insert({
    restaurant_id: profile.restaurant_id,
    order_id: order.id,
    event: "status_changed",
    by_user: user.id,
    note: `Added items to order: ${addedItemNames.join(", ")}`,
  });

  revalidatePath("/cashier/active-orders");
  return {
    success: true,
    addedItems: addedItemNames,
    newTotal,
  };
}

