"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const createRestaurantSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must contain lowercase letters, numbers, and hyphens only"),
  adminEmail: z.string().email("Invalid admin email"),
  adminName: z.string().min(2, "Admin name required"),
  adminPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export async function createRestaurantAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthenticated" };

  const logoFile = formData.get("logoFile") as File | null;
  if (!logoFile || logoFile.size === 0) {
    return { error: "Restaurant logo is required" };
  }

  if (!logoFile.type.startsWith("image/")) {
    return { error: "Please upload a valid image file (PNG, JPG, SVG, WebP)" };
  }

  const rawData = {
    name: formData.get("name") as string,
    slug: formData.get("slug") as string,
    adminEmail: formData.get("adminEmail") as string,
    adminName: formData.get("adminName") as string,
    adminPassword: formData.get("adminPassword") as string,
  };

  const parse = createRestaurantSchema.safeParse(rawData);
  if (!parse.success) {
    return { error: parse.error.issues[0].message };
  }

  const { name, slug, adminEmail, adminName, adminPassword } = parse.data;

  // Create Auth User for restaurant Admin using Service Role
  const adminClient = createAdminClient();

  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: { full_name: adminName, role: "admin" },
  });

  if (authError || !authUser.user) {
    return { error: authError?.message || "Failed to create Admin login" };
  }

  // Upload Restaurant Logo
  let logoUrl: string | null = null;
  const fileExt = logoFile.name.split(".").pop() || "png";
  const cleanExt = fileExt.toLowerCase();
  const fileName = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${cleanExt}`;
  const filePath = `${slug}/${fileName}`;
  const bucketName = "restaurant-logos";

  try {
    const { data: bucketData } = await adminClient.storage.getBucket(bucketName);
    if (!bucketData) {
      await adminClient.storage.createBucket(bucketName, { public: true });
    }
  } catch {
    // Continue if bucket check fails
  }

  let uploadRes = await adminClient.storage
    .from(bucketName)
    .upload(filePath, logoFile, {
      contentType: logoFile.type || "image/png",
      upsert: true,
    });

  if (uploadRes.error) {
    // Fallback to product-images bucket
    uploadRes = await adminClient.storage
      .from("product-images")
      .upload(`logos/${filePath}`, logoFile, {
        contentType: logoFile.type || "image/png",
        upsert: true,
      });

    if (uploadRes.error) {
      return { error: `Failed to upload logo: ${uploadRes.error.message}` };
    }

    const { data: publicUrlData } = adminClient.storage
      .from("product-images")
      .getPublicUrl(`logos/${filePath}`);
    logoUrl = publicUrlData.publicUrl;
  } else {
    const { data: publicUrlData } = adminClient.storage
      .from(bucketName)
      .getPublicUrl(filePath);
    logoUrl = publicUrlData.publicUrl;
  }

  // Call RPC create_restaurant database function
  const { data: restaurantId, error: dbError } = await supabase.rpc("create_restaurant", {
    p_name: name,
    p_slug: slug,
    p_admin_user_id: authUser.user.id,
    p_admin_name: adminName,
  });

  if (dbError) {
    return { error: dbError.message };
  }

  // Update restaurant record with uploaded logo_url
  if (logoUrl && restaurantId) {
    const { error: updateError } = await adminClient
      .from("restaurants")
      .update({ logo_url: logoUrl })
      .eq("id", restaurantId);

    if (updateError) {
      console.error("Error setting restaurant logo:", updateError);
    }
  }

  revalidatePath("/platform");
  return { success: true, restaurantId };
}

export async function toggleRestaurantStatusAction(restaurantId: string, currentStatus: string) {
  const supabase = await createClient();

  const newStatus = currentStatus === "active" ? "suspended" : "active";

  const { error } = await supabase
    .from("restaurants")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", restaurantId);

  if (error) return { error: error.message };

  // Log action to platform_audit_log
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("platform_audit_log").insert({
    actor_id: user?.id,
    action: newStatus === "suspended" ? "suspend_restaurant" : "reactivate_restaurant",
    restaurant_id: restaurantId,
    details: { status: newStatus },
  });

  revalidatePath("/platform");
  return { success: true };
}

const updateRestaurantSchema = z.object({
  restaurantId: z.string().uuid("Invalid restaurant ID"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must contain lowercase letters, numbers, and hyphens only"),
});

export async function updateRestaurantAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthenticated" };

  const rawData = {
    restaurantId: formData.get("restaurantId") as string,
    name: formData.get("name") as string,
    slug: formData.get("slug") as string,
  };

  const parse = updateRestaurantSchema.safeParse(rawData);
  if (!parse.success) {
    return { error: parse.error.issues[0].message };
  }

  const { restaurantId, name, slug } = parse.data;
  const adminClient = createAdminClient();

  const updateData: Record<string, any> = {
    name,
    slug,
    updated_at: new Date().toISOString(),
  };

  const logoFile = formData.get("logoFile") as File | null;
  if (logoFile && logoFile.size > 0) {
    if (!logoFile.type.startsWith("image/")) {
      return { error: "Please upload a valid image file (PNG, JPG, SVG, WebP)" };
    }

    const fileExt = logoFile.name.split(".").pop() || "png";
    const cleanExt = fileExt.toLowerCase();
    const fileName = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${cleanExt}`;
    const filePath = `${slug}/${fileName}`;
    const bucketName = "restaurant-logos";

    try {
      const { data: bucketData } = await adminClient.storage.getBucket(bucketName);
      if (!bucketData) {
        await adminClient.storage.createBucket(bucketName, { public: true });
      }
    } catch {
      // Continue if bucket check fails
    }

    let uploadRes = await adminClient.storage
      .from(bucketName)
      .upload(filePath, logoFile, {
        contentType: logoFile.type || "image/png",
        upsert: true,
      });

    if (uploadRes.error) {
      uploadRes = await adminClient.storage
        .from("product-images")
        .upload(`logos/${filePath}`, logoFile, {
          contentType: logoFile.type || "image/png",
          upsert: true,
        });

      if (uploadRes.error) {
        return { error: `Failed to upload logo: ${uploadRes.error.message}` };
      }

      const { data: publicUrlData } = adminClient.storage
        .from("product-images")
        .getPublicUrl(`logos/${filePath}`);
      updateData.logo_url = publicUrlData.publicUrl;
    } else {
      const { data: publicUrlData } = adminClient.storage
        .from(bucketName)
        .getPublicUrl(filePath);
      updateData.logo_url = publicUrlData.publicUrl;
    }
  }

  const { error: updateError } = await adminClient
    .from("restaurants")
    .update(updateData)
    .eq("id", restaurantId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Audit log
  await supabase.from("platform_audit_log").insert({
    actor_id: user.id,
    action: "update_restaurant",
    restaurant_id: restaurantId,
    details: { name, slug, updated_logo: !!updateData.logo_url },
  });

  revalidatePath("/platform");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteRestaurantAction(restaurantId: string) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  // Verify caller is super_admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") return { error: "Unauthorized" };

  // ── Cascade delete all restaurant data ──────────────────────────────────────
  // 1. Order items (FK → product_variants)
  const { data: orders } = await adminClient
    .from("orders")
    .select("id")
    .eq("restaurant_id", restaurantId);
  const orderIds = (orders || []).map((o) => o.id);
  if (orderIds.length > 0) {
    await adminClient.from("order_item_addons").delete().in(
      "order_item_id",
      adminClient
        .from("order_items")
        .select("id")
        .in("order_id", orderIds) as any
    );
    await adminClient.from("order_items").delete().in("order_id", orderIds);
    await adminClient.from("order_audit_log").delete().in("order_id", orderIds);
  }
  await adminClient.from("orders").delete().eq("restaurant_id", restaurantId);

  // 2. Products hierarchy
  const { data: variants } = await adminClient
    .from("product_variants")
    .select("id")
    .eq("restaurant_id", restaurantId);
  const variantIds = (variants || []).map((v) => v.id);
  if (variantIds.length > 0) {
    await adminClient.from("variant_costs").delete().in("variant_id", variantIds);
  }
  await adminClient.from("product_variants").delete().eq("restaurant_id", restaurantId);
  await adminClient.from("addons").delete().eq("restaurant_id", restaurantId);
  await adminClient.from("products").delete().eq("restaurant_id", restaurantId);
  await adminClient.from("categories").delete().eq("restaurant_id", restaurantId);

  // 3. Employees / staff
  await adminClient.from("employees").delete().eq("restaurant_id", restaurantId);

  // 4. Subscriptions & plans
  await adminClient.from("subscriptions").delete().eq("restaurant_id", restaurantId);

  // 5. Platform audit log entries for this restaurant
  await adminClient
    .from("platform_audit_log")
    .delete()
    .eq("restaurant_id", restaurantId);

  // 6. Profiles linked to this restaurant (get their auth IDs first)
  const { data: linkedProfiles } = await adminClient
    .from("profiles")
    .select("id")
    .eq("restaurant_id", restaurantId);

  await adminClient.from("profiles").delete().eq("restaurant_id", restaurantId);

  // 7. Delete the restaurant row
  const { error: deleteError } = await adminClient
    .from("restaurants")
    .delete()
    .eq("id", restaurantId);

  if (deleteError) return { error: deleteError.message };

  // 8. Delete auth users (best-effort)
  for (const p of linkedProfiles || []) {
    try {
      await adminClient.auth.admin.deleteUser(p.id);
    } catch {
      // Ignore individual failures
    }
  }

  revalidatePath("/platform");
  return { success: true };
}

