"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const createPartySchema = z.object({
  name: z.string().min(1, "Party name required"),
  type: z.enum(["supplier", "customer"]),
  phone: z.string().optional(),
});

export async function createPartyAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const parse = createPartySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    phone: formData.get("phone"),
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

  const { error } = await supabase.from("parties").insert({
    restaurant_id: profile.restaurant_id,
    name: parse.data.name,
    type: parse.data.type,
    phone: parse.data.phone,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/accounts");
  return { success: true };
}

const recordPaymentSchema = z.object({
  partyId: z.string().min(1, "Party required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
  description: z.string().min(1, "Description required"),
  entryDate: z.string().default(() => new Date().toISOString().split("T")[0]),
});

export async function recordPartyPaymentAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const parse = recordPaymentSchema.safeParse({
    partyId: formData.get("partyId"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    entryDate: formData.get("entryDate"),
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

  // Payment to a supplier reduces credit balance (recorded as debit)
  const { error } = await supabase.from("ledger_entries").insert({
    restaurant_id: profile.restaurant_id,
    party_id: parse.data.partyId,
    entry_date: parse.data.entryDate,
    description: parse.data.description,
    debit: parse.data.amount,
    credit: 0.00,
    ref_type: "supplier_payment",
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/accounts");
  return { success: true };
}

const addCreditSchema = z.object({
  partyId: z.string().min(1, "Supplier required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
  description: z.string().min(1, "Description required"),
  entryDate: z.string().default(() => new Date().toISOString().split("T")[0]),
});

export async function addCreditAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const parse = addCreditSchema.safeParse({
    partyId: formData.get("partyId"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    entryDate: formData.get("entryDate"),
  });

  if (!parse.success) return { error: parse.error.issues[0].message };

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

  // Credit entry: supplier gave goods/services on credit (we owe them money)
  const { error } = await supabase.from("ledger_entries").insert({
    restaurant_id: profile.restaurant_id,
    party_id: parse.data.partyId,
    entry_date: parse.data.entryDate,
    description: parse.data.description,
    debit: 0.00,
    credit: parse.data.amount,
    ref_type: "credit_purchase",
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/accounts");
  return { success: true };
}
