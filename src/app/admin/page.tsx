import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { getOrderDateString, formatDate } from "@/lib/dates";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, restaurants(name, slug)")
    .single();

  const restaurant = (profile?.restaurants as any);
  // Shift 2:00 PM to 2:00 AM counts as a single day
  const today = getOrderDateString();

  const { data: pnl } = await supabase.rpc("get_profit_and_loss", {
    p_from: today,
    p_to: today,
  });

  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("currency, enable_donation, donation_percentage")
    .single();

  const currency = settings?.currency || "PKR";
  const enableDonation = Boolean(settings?.enable_donation);
  const donationPercentage = Number(settings?.donation_percentage || 0);
  const donationAmount = enableDonation
    ? ((Number(pnl?.net_sales) || 0) * donationPercentage) / 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-bold text-black tracking-tight">
          Dashboard
        </h1>
        <p className="text-xs text-zinc-500">
          Welcome back, {profile?.full_name}. Overview for {restaurant?.name} today ({formatDate(today)}, Shift: 2:00 PM - 2:00 AM).
        </p>
      </div>

      <div className={`grid gap-4 ${enableDonation ? "grid-cols-5" : "grid-cols-4"}`}>
        <div className="border border-black p-5 rounded-lg bg-white space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Today's Net Sales
          </p>
          <p className="text-2xl font-bold text-black">
            {formatMoney(pnl?.net_sales ?? 0, currency)}
          </p>
        </div>

        {enableDonation && (
          <div className="border border-emerald-800 bg-emerald-50/50 p-5 rounded-lg space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                Donation ({donationPercentage}%)
              </p>
              <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-1.5 py-0.5 rounded">
                Active
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-950">
              {formatMoney(donationAmount, currency)}
            </p>
            <p className="text-[10px] text-emerald-700">
              Calculated on daily net sales
            </p>
          </div>
        )}

        <div className="border border-black p-5 rounded-lg bg-white space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Paid Orders
          </p>
          <p className="text-2xl font-bold text-black">
            {pnl?.paid_orders_count ?? 0}
          </p>
        </div>

        <div className="border border-black p-5 rounded-lg bg-white space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Operating Expenses
          </p>
          <p className="text-2xl font-bold text-black">
            {formatMoney(pnl?.operating_expenses ?? 0, currency)}
          </p>
        </div>

        <div className="border border-black p-5 rounded-lg bg-black text-white space-y-1">
          <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Profit After All Costs
          </p>
          <p className="text-2xl font-bold text-white">
            {formatMoney(pnl?.profit_after_all_costs ?? 0, currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
