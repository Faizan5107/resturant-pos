import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import CreateRestaurantModal from "./CreateRestaurantModal";
import EditRestaurantModal from "./EditRestaurantModal";
import ToggleStatusButton from "./ToggleStatusButton";

export default async function PlatformRestaurantsPage() {
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("*, subscriptions(status, trial_ends_on)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Restaurants
          </h1>
          <p className="text-xs text-zinc-500">
            Manage platform restaurants, subscriptions, and status.
          </p>
        </div>

        <CreateRestaurantModal />
      </div>

      {/* Restaurants Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Restaurant Name</th>
              <th className="py-3 px-4 font-semibold">Slug Code</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Subscription</th>
              <th className="py-3 px-4 font-semibold">Created Date</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!restaurants || restaurants.length === 0) ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500 text-xs">
                  No restaurants onboarded yet. Click "Add Restaurant" to create one.
                </td>
              </tr>
            ) : (
              restaurants.map((r) => {
                const sub = (r.subscriptions as any)?.[0];
                const isActive = r.status === "active";

                return (
                  <tr key={r.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-black">
                      <div className="flex items-center gap-3">
                        {r.logo_url ? (
                          <img
                            src={r.logo_url}
                            alt={r.name}
                            className="w-7 h-7 object-contain rounded border border-zinc-200 bg-white p-0.5 shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0">
                            {r.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span>{r.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-zinc-600">{r.slug}</td>
                    <td className="py-3 px-4">
                      {/* Status styling per spec: filled black = active, light gray = inactive/suspended */}
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${
                          isActive
                            ? "bg-black text-white"
                            : "bg-zinc-200 text-zinc-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {sub ? (
                        <span className="capitalize">{sub.status}</span>
                      ) : (
                        <span className="text-zinc-400">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-600">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditRestaurantModal restaurant={r} />
                        <ToggleStatusButton
                          restaurantId={r.id}
                          currentStatus={r.status}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
