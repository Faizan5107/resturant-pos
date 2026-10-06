import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import CreateCashierModal from "./CreateCashierModal";
import EditEmployeeModal from "./EditEmployeeModal";

export default async function AdminEmployeesPage() {
  const supabase = await createClient();

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("restaurant_id, restaurants(slug)")
    .single();

  const restaurantSlug = (currentProfile?.restaurants as any)?.slug || "";

  // Query profiles for current restaurant
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Employees & Cashiers
          </h1>
          <p className="text-xs text-zinc-500">
            Manage restaurant staff and cashier login accounts.
          </p>
        </div>

        <CreateCashierModal restaurantSlug={restaurantSlug} />
      </div>

      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Full Name</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Created Date</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!profiles || profiles.length === 0) ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                  No employee profiles found.
                </td>
              </tr>
            ) : (
              profiles.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-black">{p.full_name}</td>
                  <td className="py-3 px-4 text-xs capitalize">
                    <span className="inline-block px-2 py-0.5 border border-black rounded-md font-semibold">
                      {p.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${
                        p.is_active
                          ? "bg-black text-white"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-600">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="py-3 px-4 text-xs text-right">
                    <EditEmployeeModal employee={p} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
