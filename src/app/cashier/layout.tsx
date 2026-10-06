import CashierNav from "./CashierNav";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    .select("full_name, role, restaurants(name, logo_url)")
    .eq("id", session.user.id)
    .single();

  const restaurantName = (profile?.restaurants as any)?.name || "Restaurant POS";
  const restaurantLogo = (profile?.restaurants as any)?.logo_url;


  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      {/* Simple Top Bar for Cashier */}
      <header className="bg-black text-white border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center gap-3">
            {restaurantLogo && (
              <div className="bg-white rounded p-1 inline-flex items-center justify-center shrink-0">
                <img
                  src={restaurantLogo}
                  alt={restaurantName}
                  className="h-8 max-w-[100px] object-contain"
                />
              </div>
            )}
            <div>
              <h1 className="font-bold text-base tracking-tight">{restaurantName}</h1>
              <p className="text-[11px] text-zinc-400">Cashier Panel</p>
            </div>
          </div>

          <CashierNav />
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-xs text-right">
            <p className="font-semibold">{profile?.full_name}</p>
            <p className="text-[10px] text-zinc-400 capitalize">{profile?.role}</p>
          </div>

          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold border border-zinc-700 text-zinc-300 hover:text-white hover:border-white rounded-md transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
