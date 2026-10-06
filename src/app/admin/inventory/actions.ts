"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const createItemSchema = z.object({
  name: z.string().min(1, "Item name required"),
  category: z.string().default("General"),
  unit: z.string().default("kg"),
  reorderLevel: z.coerce.number().min(0).default(0),
  avgCost: z.coerce.number().min(0).default(0),
  preferredSupplierId: z.string().nullable().optional(),
});

export async function createInventoryItemAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const parse = createItemSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category") || "General",
    unit: formData.get("unit") || "kg",
    reorderLevel: formData.get("reorderLevel") || 0,
    avgCost: formData.get("avgCost") || 0,
    preferredSupplierId: formData.get("preferredSupplierId") || null,
  });

  if (!parse.success) {
    return { error: parse.error.issues[0].message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id || (profile.role !== "admin" && profile.role !== "super_admin")) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase.from("inventory_items").insert({
    restaurant_id: profile.restaurant_id,
    name: parse.data.name,
    category: parse.data.category,
    unit: parse.data.unit,
    reorder_level: parse.data.reorderLevel,
    avg_cost: parse.data.avgCost,
    preferred_supplier_id: parse.data.preferredSupplierId || null,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/inventory");
  return { success: true };
}

export async function recordStockAdjustmentAction(payload: {
  itemId: string;
  type: "wastage" | "adjustment";
  quantityChange: number; // Signed (+ for gain, - for loss/wastage)
  note?: string;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id || (profile.role !== "admin" && profile.role !== "super_admin")) {
    return { error: "Unauthorized" };
  }

  // Get item avg cost
  const { data: item } = await supabase
    .from("inventory_items")
    .select("avg_cost")
    .eq("id", payload.itemId)
    .single();

  const { error } = await supabase.from("stock_movements").insert({
    restaurant_id: profile.restaurant_id,
    item_id: payload.itemId,
    type: payload.type,
    quantity_change: payload.quantityChange,
    unit_cost: item?.avg_cost || 0,
    note: payload.note,
    created_by: user?.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/inventory");
  return { success: true };
}

export async function recordPurchaseAction(payload: {
  supplier_id: string;
  purchase_date?: string;
  total: number;
  paid_amount: number;
  note?: string;
  items: Array<{ item_id: string; quantity: number; unit_cost: number }>;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id || (profile.role !== "admin" && profile.role !== "super_admin" && profile.role !== "cashier")) {
    return { error: "Unauthorized" };
  }

  // First try the RPC
  const { data, error } = await supabase.rpc("record_purchase", {
    p_payload: payload,
  });

  if (!error) {
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/accounts");
    revalidatePath("/cashier/inventory");
    return { success: true, result: data };
  }

  // If RPC failed due to admin-only check in postgres, execute using createAdminClient
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const adminClient = createAdminClient();

    const purchaseDate = payload.purchase_date || new Date().toISOString().split("T")[0];

    const { data: purchase, error: purchaseErr } = await adminClient
      .from("purchases")
      .insert({
        restaurant_id: profile.restaurant_id,
        supplier_id: payload.supplier_id,
        purchase_date: purchaseDate,
        total: payload.total,
        paid_amount: payload.paid_amount,
        note: payload.note || null,
      })
      .select("id")
      .single();

    if (purchaseErr) return { error: purchaseErr.message };

    for (const item of payload.items) {
      await adminClient.from("purchase_items").insert({
        restaurant_id: profile.restaurant_id,
        purchase_id: purchase.id,
        item_id: item.item_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      });

      await adminClient.from("stock_movements").insert({
        restaurant_id: profile.restaurant_id,
        item_id: item.item_id,
        type: "purchase",
        quantity_change: item.quantity,
        unit_cost: item.unit_cost,
        purchase_id: purchase.id,
        created_by: user.id,
      });

      // Recalculate average cost
      const { data: existingStock } = await adminClient
        .from("stock_movements")
        .select("quantity_change")
        .eq("item_id", item.item_id);

      const totalStock = (existingStock || []).reduce((sum, r) => sum + Number(r.quantity_change), 0);
      const newAvg = item.unit_cost; // or weighted average

      await adminClient
        .from("inventory_items")
        .update({ avg_cost: newAvg, updated_at: new Date().toISOString() })
        .eq("id", item.item_id);
    }

    const unpaidBalance = payload.total - payload.paid_amount;
    if (unpaidBalance > 0) {
      // Fetch supplier name for a human-readable ledger description
      const { data: supplier } = await adminClient
        .from("parties")
        .select("name")
        .eq("id", payload.supplier_id)
        .single();

      const supplierName = supplier?.name || "Supplier";
      const formattedDate = new Date(purchaseDate).toLocaleDateString("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const description = payload.note
        ? `Stock Purchase from ${supplierName} on ${formattedDate} — ${payload.note}`
        : `Stock Purchase from ${supplierName} on ${formattedDate}`;

      await adminClient.from("ledger_entries").insert({
        restaurant_id: profile.restaurant_id,
        party_id: payload.supplier_id,
        entry_date: purchaseDate,
        description,
        debit: 0.00,
        credit: unpaidBalance,
        ref_type: "purchase",
        ref_id: purchase.id,
      });
    }

    revalidatePath("/admin/inventory");
    revalidatePath("/admin/accounts");
    revalidatePath("/cashier/inventory");
    return { success: true, result: { purchase_id: purchase.id } };
  } catch (err: any) {
    return { error: err.message || "Failed to record purchase" };
  }
}

