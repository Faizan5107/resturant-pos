"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateSettingsSchema = z.object({
  restaurantName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  slogan: z.string().optional(),
  currency: z.string().default("PKR"),
  timezone: z.string().default("Asia/Karachi"),
  taxRate: z.coerce.number().min(0).max(100),
  receiptFooter: z.string().optional(),
  paperWidth: z.string().default("80mm"),
  enableDonation: z.coerce.boolean().default(false),
  donationPercentage: z.coerce.number().min(0).max(100).default(0),
  enableServiceFee: z.coerce.boolean().default(false),
  serviceFeeAmount: z.coerce.number().min(0).default(0),
});

export async function updateRestaurantSettingsAction(prevState: any, formData: FormData) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const parse = updateSettingsSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    slogan: formData.get("slogan"),
    currency: formData.get("currency") || "PKR",
    timezone: formData.get("timezone") || "Asia/Karachi",
    taxRate: formData.get("taxRate") || 0,
    receiptFooter: formData.get("receiptFooter") || formData.get("slogan"),
    paperWidth: formData.get("paperWidth") || "80mm",
    enableDonation: formData.get("enableDonation") === "true" || formData.get("enableDonation") === "on",
    donationPercentage: formData.get("donationPercentage") || 0,
    enableServiceFee: formData.get("enableServiceFee") === "true" || formData.get("enableServiceFee") === "on",
    serviceFeeAmount: formData.get("serviceFeeAmount") || 0,
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

  const restaurantId = profile.restaurant_id;

  // Handle Logo File Upload / Removal
  const logoFile = formData.get("logoFile") as File | null;
  const removeLogo = formData.get("removeLogo") === "true";
  let newLogoUrl: string | null | undefined = undefined;

  if (removeLogo) {
    newLogoUrl = null;
  } else if (logoFile && logoFile.size > 0) {
    const fileExt = logoFile.name.split(".").pop() || "png";
    const fileName = `logo_${restaurantId}_${Date.now()}.${fileExt}`;
    const filePath = `${restaurantId}/${fileName}`;

    // 1. Try uploading to Supabase Storage using adminClient
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from("product-images")
      .upload(filePath, logoFile, { upsert: true });

    if (!uploadError && uploadData) {
      const { data: publicUrlData } = adminClient.storage
        .from("product-images")
        .getPublicUrl(filePath);
      newLogoUrl = publicUrlData.publicUrl;
    } else {
      // 2. Fallback to base64 Data URL if storage upload is unavailable
      const arrayBuffer = await logoFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = logoFile.type || "image/png";
      newLogoUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    }
  }

  // Update restaurants table (Name & Logo URL) using adminClient to bypass RLS restrictions
  const restaurantUpdate: any = {};
  if (parse.data.restaurantName) restaurantUpdate.name = parse.data.restaurantName;
  if (newLogoUrl !== undefined) restaurantUpdate.logo_url = newLogoUrl;

  if (Object.keys(restaurantUpdate).length > 0) {
    const { error: restError } = await adminClient
      .from("restaurants")
      .update(restaurantUpdate)
      .eq("id", restaurantId);
    
    if (restError) console.error("Error updating restaurant:", restError);
  }

  const baseUpdate: any = {
    address: parse.data.address,
    phone: parse.data.phone,
    currency: parse.data.currency,
    timezone: parse.data.timezone,
    tax_rate: parse.data.taxRate,
    receipt_footer: parse.data.receiptFooter || parse.data.slogan,
    slogan: parse.data.slogan || parse.data.receiptFooter,
    paper_width: parse.data.paperWidth,
    enable_service_fee: parse.data.enableServiceFee,
    service_fee_amount: parse.data.serviceFeeAmount,
    updated_at: new Date().toISOString(),
  };

  if (newLogoUrl !== undefined) {
    baseUpdate.logo_url = newLogoUrl;
  }

  // Update restaurant_settings table using adminClient
  let { error } = await adminClient
    .from("restaurant_settings")
    .update({
      ...baseUpdate,
      enable_donation: parse.data.enableDonation,
      donation_percentage: parse.data.donationPercentage,
    })
    .eq("restaurant_id", restaurantId);

  if (error) {
    delete baseUpdate.slogan;
    delete baseUpdate.logo_url;
    const { error: fallbackError } = await adminClient
      .from("restaurant_settings")
      .update(baseUpdate)
      .eq("restaurant_id", restaurantId);
    if (fallbackError) return { error: fallbackError.message };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/products");
  revalidatePath("/cashier");
  revalidatePath("/print/bill/[orderId]", "page");
  return { success: true };
}
