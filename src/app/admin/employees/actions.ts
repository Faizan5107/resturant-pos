"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const createCashierSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  username: z
    .string()
    .min(2, "Username required")
    .regex(/^[a-z0-9_]+$/, "Username must contain lowercase letters, numbers, and underscores only"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function createCashierAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthenticated" };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("restaurant_id, role, restaurants(slug)")
    .eq("id", user.id)
    .single();

  if (!adminProfile || (adminProfile.role !== "admin" && adminProfile.role !== "super_admin")) {
    return { error: "Unauthorized" };
  }

  const restaurantId = adminProfile.restaurant_id;
  const restaurantSlug = (adminProfile.restaurants as any)?.slug;
  if (!restaurantId || !restaurantSlug) {
    return { error: "Restaurant context missing" };
  }

  const rawData = {
    fullName: formData.get("fullName") as string,
    username: formData.get("username") as string,
    password: formData.get("password") as string,
  };

  const parse = createCashierSchema.safeParse(rawData);
  if (!parse.success) {
    return { error: parse.error.issues[0].message };
  }

  const { fullName, username, password } = parse.data;
  const cashierEmail = `${username.trim().toLowerCase()}@${restaurantSlug}.internal`;

  const adminClient = createAdminClient();

  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: cashierEmail,
    password: password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "cashier" },
  });

  if (authError || !authUser.user) {
    return { error: authError?.message || "Failed to create Cashier login" };
  }

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: authUser.user.id,
    restaurant_id: restaurantId,
    full_name: fullName,
    role: "cashier",
    is_active: true,
  });

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/admin/employees");
  return { success: true };
}

export async function updateEmployeeAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminProfile || (adminProfile.role !== "admin" && adminProfile.role !== "super_admin")) {
    return { error: "Unauthorized" };
  }

  const id = formData.get("id") as string;
  const fullName = formData.get("fullName") as string;
  const isActive = formData.get("isActive") === "on";
  const password = formData.get("password") as string;

  if (!id || !fullName) return { error: "Missing required fields" };

  // Update profile record
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, is_active: isActive })
    .eq("id", id);

  if (profileError) return { error: profileError.message };

  // If password provided, update it via admin client
  if (password && password.length >= 6) {
    const adminClient = createAdminClient();
    const { error: pwError } = await adminClient.auth.admin.updateUserById(id, { password });
    if (pwError) return { error: pwError.message };
  }

  revalidatePath("/admin/employees");
  return { success: true };
}
