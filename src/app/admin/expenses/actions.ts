"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const createExpenseSchema = z.object({
  expenseDate: z.string().default(() => new Date().toISOString().split("T")[0]),
  categoryId: z.string().min(1, "Category required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
  note: z.string().optional(),
  employeeId: z.string().nullable().optional(),
});

export async function createExpenseAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const parse = createExpenseSchema.safeParse({
    expenseDate: formData.get("expenseDate"),
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    note: formData.get("note"),
    employeeId: formData.get("employeeId") || null,
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

  if (!profile?.restaurant_id || (profile.role !== "admin" && profile.role !== "super_admin" && profile.role !== "cashier")) {
    return { error: "Unauthorized" };
  }

  // Use service role client to bypass admin-only RLS on expenses table if cashier
  const { createAdminClient } = await import("@/lib/supabase/server");
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("expenses").insert({
    restaurant_id: profile.restaurant_id,
    expense_date: parse.data.expenseDate,
    category_id: parse.data.categoryId,
    amount: parse.data.amount,
    note: parse.data.note,
    employee_id: parse.data.employeeId || null,
    created_by: user?.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/profit-loss");
  revalidatePath("/admin");
  revalidatePath("/cashier/expenses");
  return { success: true };

}
