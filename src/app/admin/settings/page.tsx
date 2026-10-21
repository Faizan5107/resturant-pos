import { redirect } from "next/navigation";
import { getProfile, getSettings } from "@/lib/server-data";
import SettingsForm from "./SettingsForm";

export default async function AdminSettingsPage() {
  const [profile, settings] = await Promise.all([
    getProfile(),
    getSettings(
      "address, phone, slogan, currency, timezone, tax_rate, receipt_footer, paper_width, enable_donation, donation_percentage, enable_service_fee, service_fee_amount"
    ),
  ]);
  if (!profile) redirect("/login?role=admin");

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
        restaurantName={profile.restaurants?.name || ""}
        logoUrl={profile.restaurants?.logo_url || ""}
      />
    </div>
  );
}
