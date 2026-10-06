import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Root entry point — redirects every user to their correct section
 * based on their role, or to /login if not authenticated.
 *
 * super_admin → /platform
 * admin       → /admin
 * cashier     → /cashier
 */
export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") {
    redirect("/platform");
  }

  if (profile?.role === "admin") {
    redirect("/admin");
  }

  if (profile?.role === "cashier") {
    redirect("/cashier");
  }

  // Fallback: profile missing or unknown role
  redirect("/login");
}
