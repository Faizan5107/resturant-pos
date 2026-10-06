import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./SettingsForm";

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  
  let restaurant = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id, restaurants(name, logo_url)")
      .eq("id", user.id)
      .single();

    if (profile?.restaurants) {
      restaurant = profile.restaurants as any;
    }
  }

  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("*")
    .single();

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-bold text-black tracking-tight">
          Restaurant Settings
        </h1>
        <p className="text-xs text-zinc-500">
          Configure restaurant branding (logo, slogan, phone, address), tax rate, currency, timezone, and print slip width.
        </p>
      </div>

      <SettingsForm 
        initialSettings={settings || { currency: "PKR", timezone: "Asia/Karachi", tax_rate: 0 }}
        restaurantName={restaurant?.name || ""}
        logoUrl={restaurant?.logo_url || ""}
      />
    </div>
  );
}
