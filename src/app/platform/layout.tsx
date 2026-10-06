import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlatformNav from "./PlatformNav";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  if (profile?.role !== "super_admin") {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* Fixed Left Sidebar */}
      <aside className="w-64 bg-black text-white flex flex-col fixed inset-y-0 left-0">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="font-bold text-lg tracking-tight">Platform Admin</h1>
          <p className="text-xs text-zinc-400">Multi-Restaurant SaaS</p>
        </div>

        {/* Client nav — active link highlighted via usePathname */}
        <PlatformNav />

        <div className="p-4 border-t border-zinc-800">
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
      <main className="flex-1 ml-64 p-8">
        {children}
      </main>
    </div>
  );
}
