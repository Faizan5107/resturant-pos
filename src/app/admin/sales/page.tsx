import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate, getOrderDateString } from "@/lib/dates";
import { getSettings } from "@/lib/server-data";
import SalesChart from "./SalesChart";

export default async function AdminSalesPage() {
  const supabase = await createClient();

  const today = getOrderDateString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [
    { data: salesData, error: salesError },
    settings,
  ] = await Promise.all([
    supabase.rpc("get_daily_sales", {
      p_from: thirtyDaysAgo,
      p_to: today,
    }),
    getSettings("currency, enable_donation, donation_percentage"),
  ]);
  if (salesError) throw salesError;

  const currency = settings?.currency || "PKR";
  const enableDonation = Boolean(settings?.enable_donation);
  const donationPercentage = Number(settings?.donation_percentage || 0);

  const totalNetSales = (salesData || []).reduce((sum: number, r: any) => sum + Number(r.net_sales), 0);
  const totalTaxCollected = (salesData || []).reduce((sum: number, r: any) => sum + Number(r.tax_collected), 0);
  const totalPaidOrders = (salesData || []).reduce((sum: number, r: any) => sum + Number(r.paid_orders_count), 0);
  const totalDonation = enableDonation ? (totalNetSales * donationPercentage) / 100 : 0;

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-bold text-black tracking-tight">
          Sales Reports
        </h1>
        <p className="text-xs text-zinc-500">
          Only paid orders count towards sales. Tax collected is excluded from revenue. Day shift runs 12:00 PM to 2:00 AM.
        </p>
      </div>

      {/* Summary Cards */}
      <div className={`grid gap-4 ${enableDonation ? "grid-cols-4" : "grid-cols-3"}`}>
        <div className="border border-black p-4 rounded-lg bg-white space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase">Net Sales (Last 30 Days)</p>
          <p className="text-2xl font-bold text-black">{formatMoney(totalNetSales, currency)}</p>
        </div>
        {enableDonation && (
          <div className="border border-emerald-800 bg-emerald-50/50 p-4 rounded-lg space-y-1">
            <p className="text-xs font-semibold text-emerald-800 uppercase">Total Donation ({donationPercentage}%)</p>
            <p className="text-2xl font-bold text-emerald-950">{formatMoney(totalDonation, currency)}</p>
          </div>
        )}
        <div className="border border-black p-4 rounded-lg bg-white space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase">Total Paid Orders</p>
          <p className="text-2xl font-bold text-black">{totalPaidOrders}</p>
        </div>
        <div className="border border-black p-4 rounded-lg bg-white space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase">Tax Collected (Excluded from Revenue)</p>
          <p className="text-2xl font-bold text-black">{formatMoney(totalTaxCollected, currency)}</p>
        </div>
      </div>

      {/* Grayscale Recharts Bar Chart */}
      <SalesChart data={salesData || []} />

      {/* Daily Sales Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Date (Shift)</th>
              <th className="py-3 px-4 font-semibold text-center">Paid Orders</th>
              <th className="py-3 px-4 font-semibold text-right">Net Sales</th>
              {enableDonation && (
                <th className="py-3 px-4 font-semibold text-right text-emerald-300">Donation ({donationPercentage}%)</th>
              )}
              <th className="py-3 px-4 font-semibold text-right">Tax Collected</th>
              <th className="py-3 px-4 font-semibold text-right">Total Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!salesData || salesData.length === 0) ? (
              <tr>
                <td colSpan={enableDonation ? 6 : 5} className="py-8 text-center text-zinc-500 text-xs">
                  No paid sales recorded in the selected period.
                </td>
              </tr>
            ) : (
              salesData.map((row: any) => {
                const dayDonation = enableDonation ? (Number(row.net_sales) * donationPercentage) / 100 : 0;
                return (
                  <tr key={row.sale_date} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-3 px-4 text-xs font-semibold text-black">
                      {formatDate(row.sale_date)}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-center">
                      {row.paid_orders_count}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-right">
                      {formatMoney(row.net_sales, currency)}
                    </td>
                    {enableDonation && (
                      <td className="py-3 px-4 text-xs font-semibold text-emerald-700 text-right">
                        {formatMoney(dayDonation, currency)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-xs text-zinc-500 text-right">
                      {formatMoney(row.tax_collected, currency)}
                    </td>
                    <td className="py-3 px-4 text-xs font-bold text-black text-right">
                      {formatMoney(row.total_revenue, currency)}
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
