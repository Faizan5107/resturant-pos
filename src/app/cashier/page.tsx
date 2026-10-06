import { createClient } from "@/lib/supabase/server";
import PosTerminal from "./PosTerminal";

export default async function CashierTerminalPage() {
  const supabase = await createClient();

  // Fetch Categories
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // Fetch Products & Variants
  const { data: products } = await supabase
    .from("products")
    .select(`
      id,
      code,
      name,
      image_url,
      category_id,
      status,
      product_variants(
        id,
        name,
        sale_price
      )
    `)
    .neq("status", "hidden")
    .order("name", { ascending: true });

  // Fetch Addons
  const { data: addons } = await supabase
    .from("addons")
    .select("id, name, price_delta")
    .order("name", { ascending: true });

  // Fetch Settings (tax rate, currency, service fee)
  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("currency, tax_rate, enable_service_fee, service_fee_amount")
    .single();

  return (
    <PosTerminal
      categories={categories || []}
      products={(products as any) || []}
      addons={addons || []}
      currency={settings?.currency || "PKR"}
      taxRate={settings?.tax_rate || 0}
      enableServiceFee={settings?.enable_service_fee || false}
      serviceFeeAmount={settings?.service_fee_amount || 0}
    />
  );
}
