"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1, "Category name required"),
  sortOrder: z.coerce.number().default(0),
});

export async function createCategoryAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const parse = createCategorySchema.safeParse({
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder"),
  });

  if (!parse.success) {
    return { error: parse.error.issues[0].message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id) {
    return { error: "Restaurant context missing" };
  }

  const { error } = await supabase.from("categories").insert({
    restaurant_id: profile.restaurant_id,
    name: parse.data.name,
    sort_order: parse.data.sortOrder,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/products");
  return { success: true };
}

export async function createProductAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const code = (formData.get("code") as string)?.trim();
  const categoryId = formData.get("categoryId") || null;
  const description = (formData.get("description") as string) || "";
  const kitchenStation = (formData.get("kitchenStation") as string) || "main";
  const taxApplicable = formData.get("taxApplicable") === "on" || formData.get("taxApplicable") === "true";
  const status = (formData.get("status") as string) || "active";

  if (!name) return { error: "Product name required" };
  if (!code) return { error: "Product code required" };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id) {
    return { error: "Restaurant context missing" };
  }

  const restaurantId = profile.restaurant_id;

  // Image Upload
  let imageUrl = null;
  const imageFile = formData.get("imageFile") as File | null;
  if (imageFile && imageFile.size > 0) {
    const fileExt = imageFile.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
    const filePath = `${restaurantId}/${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(filePath, imageFile);

    if (!uploadError && uploadData) {
      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);
      imageUrl = publicUrlData.publicUrl;
    }
  }

  // Insert Product
  const { data: product, error: prodError } = await supabase
    .from("products")
    .insert({
      restaurant_id: restaurantId,
      category_id: categoryId,
      name,
      code,
      description,
      image_url: imageUrl,
      kitchen_station: kitchenStation,
      tax_applicable: taxApplicable,
      status,
    })
    .select("id")
    .single();

  if (prodError || !product) {
    return { error: prodError?.message || "Failed to create product" };
  }

  // Parse Variants
  let variants: Array<{ name: string; salePrice: number; costPrice: number }> = [];
  const variantsJson = formData.get("variantsJson") as string;

  if (variantsJson) {
    try {
      variants = JSON.parse(variantsJson);
    } catch {
      // fallback
    }
  }

  if (variants.length === 0) {
    const defaultName = (formData.get("variantName") as string) || "Regular";
    const defaultSale = Number(formData.get("salePrice") || 0);
    const defaultCost = Number(formData.get("costPrice") || 0);
    variants.push({ name: defaultName, salePrice: defaultSale, costPrice: defaultCost });
  }

  // Insert Variants & Variant Costs
  for (const v of variants) {
    const { data: variant, error: varError } = await supabase
      .from("product_variants")
      .insert({
        restaurant_id: restaurantId,
        product_id: product.id,
        name: v.name || "Regular",
        sale_price: Number(v.salePrice || 0),
      })
      .select("id")
      .single();

    if (variant) {
      await supabase.from("variant_costs").insert({
        variant_id: variant.id,
        restaurant_id: restaurantId,
        cost_price: Number(v.costPrice || 0),
      });
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  return { success: true };
}

export async function updateProductAction(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const id = formData.get("id") as string;
  if (!id) return { error: "Product ID missing" };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id) return { error: "Restaurant context missing" };

  const restaurantId = profile.restaurant_id;

  // Handle image upload
  let imageUrl: string | null | undefined = undefined;
  const imageFile = formData.get("imageFile") as File | null;
  if (imageFile && imageFile.size > 0) {
    const fileExt = imageFile.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
    const filePath = `${restaurantId}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(filePath, imageFile);

    if (!uploadError && uploadData) {
      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);
      imageUrl = publicUrlData.publicUrl;
    }
  }

  const updatePayload: Record<string, any> = {
    name: formData.get("name"),
    code: formData.get("code"),
    category_id: formData.get("categoryId") || null,
    description: formData.get("description") || null,
    kitchen_station: formData.get("kitchenStation") || "main",
    tax_applicable: formData.get("taxApplicable") === "on" || formData.get("taxApplicable") === "true",
    status: formData.get("status") || "active",
    updated_at: new Date().toISOString(),
  };

  if (imageUrl !== undefined) {
    updatePayload.image_url = imageUrl;
  }

  const { error } = await supabase.from("products").update(updatePayload).eq("id", id);
  if (error) return { error: error.message };

  // Handle Variants update if variantsJson is supplied
  const variantsJson = formData.get("variantsJson") as string;
  if (variantsJson) {
    try {
      const variants: Array<{ id?: string; name: string; salePrice: number; costPrice: number }> = JSON.parse(variantsJson);
      
      // Get existing variants for product
      const { data: existingVariants } = await supabase
        .from("product_variants")
        .select("id")
        .eq("product_id", id);

      const existingIds = (existingVariants || []).map((ev) => ev.id);
      const keptIds: string[] = [];

      for (const v of variants) {
        if (v.id && existingIds.includes(v.id)) {
          keptIds.push(v.id);
          // Update existing variant
          await supabase
            .from("product_variants")
            .update({ name: v.name, sale_price: Number(v.salePrice || 0) })
            .eq("id", v.id);

          // Update cost
          const { data: existingCost } = await supabase
            .from("variant_costs")
            .select("id")
            .eq("variant_id", v.id)
            .single();

          if (existingCost) {
            await supabase
              .from("variant_costs")
              .update({ cost_price: Number(v.costPrice || 0) })
              .eq("variant_id", v.id);
          } else {
            await supabase.from("variant_costs").insert({
              variant_id: v.id,
              restaurant_id: restaurantId,
              cost_price: Number(v.costPrice || 0),
            });
          }
        } else {
          // Insert new variant
          const { data: newVar } = await supabase
            .from("product_variants")
            .insert({
              restaurant_id: restaurantId,
              product_id: id,
              name: v.name,
              sale_price: Number(v.salePrice || 0),
            })
            .select("id")
            .single();

          if (newVar) {
            keptIds.push(newVar.id);
            await supabase.from("variant_costs").insert({
              variant_id: newVar.id,
              restaurant_id: restaurantId,
              cost_price: Number(v.costPrice || 0),
            });
          }
        }
      }

      // Delete removed variants
      const toDelete = existingIds.filter((eid) => !keptIds.includes(eid));
      if (toDelete.length > 0) {
        await supabase.from("product_variants").delete().in("id", toDelete);
      }
    } catch (err: any) {
      console.error("Failed to sync variants:", err);
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  return { success: true, error: null };
}

export async function updateCategoryAction(prevState: any, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("categories").update({
    name: formData.get("name"),
    sort_order: Number(formData.get("sortOrder") || 0),
  }).eq("id", formData.get("id"));
  if (error) return { error: error.message };
  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  return { success: true, error: null };
}

export async function toggleCategoryStatusAction(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  return { success: true };
}

export async function deleteCategoryAction(id: string) {
  const supabase = await createClient();
  // Check if any products are linked to this category
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (count && count > 0) {
    return { error: `Cannot delete: ${count} product(s) are linked to this category. Move or delete them first.` };
  }
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  return { success: true };
}

export async function toggleProductStatusAction(id: string, status: string) {
  // Allowed values: 'active', 'hidden', 'out_of_stock'
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  return { success: true };
}

export async function deleteProductAction(id: string) {
  const supabase = await createClient();

  // Get all variant IDs for this product
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", id);

  const variantIds = (variants || []).map((v) => v.id);

  // Check if any order_items reference these variants
  if (variantIds.length > 0) {
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("variant_id", variantIds);

    if (count && count > 0) {
      // Cannot hard-delete — deactivate instead to preserve order history
      const { error: deactivateError } = await supabase
        .from("products")
        .update({ status: "hidden", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (deactivateError) return { error: deactivateError.message };
      revalidatePath("/admin/products");
      revalidatePath("/cashier");
      return {
        success: true,
        deactivated: true,
        message: `This product appears in ${count} order(s) and cannot be permanently deleted. It has been deactivated instead and will no longer appear in the cashier menu.`,
      };
    }
  }

  // Safe to hard-delete — no order references
  if (variantIds.length > 0) {
    await supabase.from("variant_costs").delete().in("variant_id", variantIds);
    await supabase.from("product_variants").delete().eq("product_id", id);
  }
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  return { success: true, deactivated: false };
}


export async function seedFullMenuAction() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id) return { error: "Restaurant context missing" };

  const { data, error } = await supabase.rpc("seed_full_restaurant_menu", {
    p_restaurant_id: profile.restaurant_id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  return { success: true, result: data };
}
