import CashierNav from "./CashierNav";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CashierLayoutClient } from "./CashierLayoutClient";

export default async function CashierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Middleware already validated the user and role — use getSession() here
  // (reads from cookie, no network round-trip) to get the user id cheaply.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  // Single DB query for display data only — role guard is already done by middleware
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, restaurant_id, restaurants(name, logo_url)")
    .eq("id", session.user.id)
    .single();

  const restaurantName = (profile?.restaurants as any)?.name || "Restaurant POS";
  const restaurantLogo = (profile?.restaurants as any)?.logo_url;
  const restaurantId   = profile?.restaurant_id || "";

  return (
    <CashierLayoutClient
      restaurantName={restaurantName}
      restaurantLogo={restaurantLogo}
      restaurantId={restaurantId}
      fullName={profile?.full_name || ""}
      role={profile?.role || "cashier"}
    >
      {children}
    </CashierLayoutClient>
  );
}
