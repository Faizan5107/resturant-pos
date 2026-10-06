import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";

export default async function AdminProfitLossPage() {
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];

  // Call get_profit_and_loss RPC
  const { data: pnl } = await supabase.rpc("get_profit_and_loss", {
    p_from: firstDayOfMonth,
    p_to: today,
  });

  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("currency")
    .single();

  const currency = settings?.currency || "PKR";

  const netSales = pnl?.net_sales ?? 0;
  const costOfIngredients = pnl?.cost_of_ingredients ?? 0;
  const profitBeforeExpenses = pnl?.profit_before_expenses ?? 0;
  const operatingExpenses = pnl?.operating_expenses ?? 0;
  const profitAfterAllCosts = pnl?.profit_after_all_costs ?? 0;

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-bold text-black tracking-tight">
          Profit & Loss Statement
        </h1>
        <p className="text-xs text-zinc-500">
          Financial summary for the current month ({firstDayOfMonth} to {today}). Plain-language income statement.
        </p>
      </div>

      {/* Income Statement Table / Card Layout */}
      <div className="max-w-2xl border border-black rounded-lg bg-white overflow-hidden">
        <div className="bg-black text-white px-6 py-3 font-bold text-sm uppercase tracking-wider flex justify-between">
          <span>Financial Item</span>
          <span>Amount</span>
        </div>

        <div className="p-6 space-y-4 text-sm divide-y divide-zinc-200">
          {/* Net Sales */}
          <div className="flex justify-between items-center pt-2">
            <div>
              <p className="font-bold text-black text-base">Net Sales</p>
              <p className="text-xs text-zinc-500">
                Paid orders subtotal minus discounts (excluding tax)
              </p>
            </div>
            <span className="font-bold text-black text-lg">
              {formatMoney(netSales, currency)}
            </span>
          </div>

          {/* Cost of Ingredients Used */}
          <div className="flex justify-between items-center pt-4">
            <div>
              <p className="font-semibold text-black">Cost of ingredients used</p>
              <p className="text-xs text-zinc-500">
                Variant cost snapshot x quantity sold
              </p>
            </div>
            <span className="font-semibold text-zinc-800">
              -{formatMoney(costOfIngredients, currency)}
            </span>
          </div>

          {/* Profit Before Expenses */}
          <div className="flex justify-between items-center pt-4 bg-zinc-50 -mx-6 px-6 py-3 border-y border-zinc-300">
            <div>
              <p className="font-bold text-black text-base">Profit before expenses</p>
              <p className="text-xs text-zinc-600">Net sales minus cost of ingredients</p>
            </div>
            <span className="font-bold text-black text-lg">
              {formatMoney(profitBeforeExpenses, currency)}
            </span>
          </div>

          {/* Operating Expenses */}
          <div className="flex justify-between items-center pt-4">
            <div>
              <p className="font-semibold text-black">Operating Expenses</p>
              <p className="text-xs text-zinc-500">
                Rent, electricity, gas, salaries, maintenance, and other costs
              </p>
            </div>
            <span className="font-semibold text-zinc-800">
              -{formatMoney(operatingExpenses, currency)}
            </span>
          </div>

          {/* Profit After All Costs */}
          <div className="flex justify-between items-center pt-4 bg-black text-white -mx-6 px-6 py-4">
            <div>
              <p className="font-bold text-lg">Profit after all costs</p>
              <p className="text-xs text-zinc-300">Net profit after all costs & expenses</p>
            </div>
            <span className="font-bold text-2xl">
              {formatMoney(profitAfterAllCosts, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
