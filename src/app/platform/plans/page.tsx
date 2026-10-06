import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";

export default async function PlatformPlansPage() {
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .order("price", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Plans &amp; Pricing
          </h1>
          <p className="text-xs text-zinc-500">
            Manage subscription plans and pricing tiers.
          </p>
        </div>
      </div>

      {/* Plans Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Plan Name</th>
              <th className="py-3 px-4 font-semibold">Price</th>
              <th className="py-3 px-4 font-semibold">Billing Period</th>
              <th className="py-3 px-4 font-semibold">Max Cashiers</th>
              <th className="py-3 px-4 font-semibold">Max Products</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!plans || plans.length === 0) ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-zinc-500 text-xs">
                  No plans created yet.
                </td>
              </tr>
            ) : (
              plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-black">{plan.name}</td>
                  <td className="py-3 px-4 text-xs font-mono">
                    {Number(plan.price).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-xs capitalize">{plan.billing_period}</td>
                  <td className="py-3 px-4 text-xs">
                    {plan.max_cashiers ?? <span className="text-zinc-400">Unlimited</span>}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    {plan.max_products ?? <span className="text-zinc-400">Unlimited</span>}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${
                        plan.is_active
                          ? "bg-black text-white"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {plan.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-600">
                    {formatDate(plan.created_at)}
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
