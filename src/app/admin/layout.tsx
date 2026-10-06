import AdminNav from "./AdminNav";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
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
    .select("full_name, restaurants(name, logo_url)")
    .eq("id", session.user.id)
    .single();

  const restaurantName = (profile?.restaurants as any)?.name || "Restaurant Admin";
  const restaurantLogo = (profile?.restaurants as any)?.logo_url;


  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* Fixed Left Sidebar (Black background, White text) */}
      <aside className="w-64 bg-black text-white flex flex-col fixed inset-y-0 left-0">
        <div className="p-6 border-b border-zinc-800 space-y-3">
          {restaurantLogo ? (
            <div className="space-y-3">
              <div className="bg-white rounded-md p-2 inline-flex items-center justify-center max-w-full shadow-sm">
                <img
                  src={restaurantLogo}
                  alt={restaurantName}
                  className="max-h-12 max-w-[180px] object-contain"
                />
              </div>
              <div>
                <h1 className="font-bold text-base tracking-tight truncate text-white" title={restaurantName}>
                  {restaurantName}
                </h1>
                <p className="text-xs text-zinc-400">Admin Control Panel</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <h1 className="font-bold text-lg tracking-tight truncate">
                {restaurantName}
              </h1>
              <p className="text-xs text-zinc-400">Admin Control Panel</p>
            </div>
          )}
        </div>

        <AdminNav />

        <div className="p-4 border-t border-zinc-800 space-y-2">
          <div className="text-xs text-zinc-400 truncate">
            {profile?.full_name}
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-md transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  );
}
