import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";

export default async function PlatformSubscriptionsPage() {
  const supabase = await createClient();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("*, restaurants(name, slug), plans(name, price, billing_period)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Subscriptions
          </h1>
          <p className="text-xs text-zinc-500">
            View and manage all restaurant subscriptions.
          </p>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Restaurant</th>
              <th className="py-3 px-4 font-semibold">Plan</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Trial Ends</th>
              <th className="py-3 px-4 font-semibold">Period End</th>
              <th className="py-3 px-4 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!subscriptions || subscriptions.length === 0) ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500 text-xs">
                  No subscriptions found.
                </td>
              </tr>
            ) : (
              subscriptions.map((sub) => {
                const restaurant = sub.restaurants as any;
                const plan = sub.plans as any;
                const statusColors: Record<string, string> = {
                  active: "bg-black text-white",
                  trial: "bg-zinc-700 text-white",
                  past_due: "bg-red-600 text-white",
                  suspended: "bg-zinc-300 text-zinc-700",
                  cancelled: "bg-zinc-200 text-zinc-500",
                };

                return (
                  <tr key={sub.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-black text-sm">{restaurant?.name ?? "—"}</div>
                      <div className="text-xs text-zinc-500 font-mono">{restaurant?.slug ?? ""}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {plan ? (
                        <span>
                          {plan.name}{" "}
                          <span className="text-zinc-400">
                            ({Number(plan.price).toFixed(2)} / {plan.billing_period})
                          </span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">No plan</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md capitalize ${
                          statusColors[sub.status] ?? "bg-zinc-200 text-zinc-700"
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-600">
                      {sub.trial_ends_on ? formatDate(sub.trial_ends_on) : <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-600">
                      {sub.current_period_end ? formatDate(sub.current_period_end) : <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-600">
                      {formatDate(sub.created_at)}
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
