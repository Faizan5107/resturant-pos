import { createClient, createAdminClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import RecordPurchaseModal from "@/app/admin/inventory/RecordPurchaseModal";

export default async function CashierInventoryPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id) return null;

  const adminClient = createAdminClient();

  // Fetch Suppliers
  const { data: suppliers } = await adminClient
    .from("parties")
    .select("id, name")
    .eq("restaurant_id", profile.restaurant_id)
    .eq("type", "supplier")
    .order("name", { ascending: true });

  // Fetch Inventory Items
  const { data: items } = await adminClient
    .from("inventory_stock")
    .select("item_id, name, unit, current_stock, avg_cost, reorder_level")
    .eq("restaurant_id", profile.restaurant_id)
    .order("name", { ascending: true });

  // Fetch recent stock receipts / purchases
  const { data: recentPurchases } = await adminClient
    .from("purchases")
    .select(`
      id,
      purchase_date,
      total,
      paid_amount,
      note,
      parties(name),
      purchase_items(
        quantity,
        unit_cost,
        inventory_items(name, unit)
      )
    `)
    .eq("restaurant_id", profile.restaurant_id)
    .order("purchase_date", { ascending: false })
    .limit(20);

  const { data: settings } = await adminClient
    .from("restaurant_settings")
    .select("currency")
    .eq("restaurant_id", profile.restaurant_id)
    .single();

  const currency = settings?.currency || "PKR";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">
            Receive Supplier Inventory
          </h1>
          <p className="text-xs text-zinc-500">
            Log raw ingredients, meat, dairy, and packaging items received from suppliers.
          </p>
        </div>
        <RecordPurchaseModal
          suppliers={suppliers || []}
          items={(items || []).map((i) => ({
            item_id: i.item_id,
            name: i.name,
            unit: i.unit,
          }))}
        />
      </div>

      {/* Stock Overview Table */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-black">Current Stock Levels</h2>
        <div className="border border-black rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-black text-white text-xs uppercase tracking-wider">
                <th className="py-2.5 px-4 font-semibold">Item</th>
                <th className="py-2.5 px-4 font-semibold text-right">In Stock</th>
                <th className="py-2.5 px-4 font-semibold text-right">Avg Cost</th>
                <th className="py-2.5 px-4 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-800">
              {(!items || items.length === 0) ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500 text-xs">
                    No inventory items defined yet.
                  </td>
                </tr>
              ) : (
                items.map((item: any) => {
                  const stock = Number(item.current_stock) || 0;
                  const reorder = Number(item.reorder_level) || 0;
                  const isLow = stock <= reorder;

                  return (
                    <tr key={item.item_id} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-2.5 px-4 text-xs font-semibold text-black">
                        {item.name}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-bold text-black text-right">
                        {stock} {item.unit}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-zinc-600 text-right">
                        {formatMoney(item.avg_cost, currency)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${
                            isLow
                              ? "bg-red-100 text-red-800 border border-red-300"
                              : "bg-zinc-100 text-zinc-800 border border-zinc-300"
                          }`}
                        >
                          {isLow ? "Low Stock" : "Sufficient"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Purchases Received */}
      <div className="space-y-2 pt-4">
        <h2 className="text-sm font-bold text-black">Recently Received Deliveries</h2>
        <div className="border border-black rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-black text-white text-xs uppercase tracking-wider">
                <th className="py-2.5 px-4 font-semibold">Date</th>
                <th className="py-2.5 px-4 font-semibold">Supplier</th>
                <th className="py-2.5 px-4 font-semibold">Items Received</th>
                <th className="py-2.5 px-4 font-semibold text-right">Total</th>
                <th className="py-2.5 px-4 font-semibold text-right">Paid Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-800">
              {(!recentPurchases || recentPurchases.length === 0) ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-500 text-xs">
                    No supplier deliveries recorded yet.
                  </td>
                </tr>
              ) : (
                recentPurchases.map((p: any) => (
                  <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-2.5 px-4 text-xs font-semibold text-black">
                      {formatDate(p.purchase_date)}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-semibold text-zinc-900">
                      {p.parties?.name || "Supplier"}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-zinc-600">
                      {p.purchase_items?.map((pi: any, idx: number) => (
                        <span key={idx} className="inline-block mr-2">
                          {pi.quantity} {pi.inventory_items?.unit} {pi.inventory_items?.name}
                        </span>
                      ))}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-bold text-black text-right">
                      {formatMoney(p.total, currency)}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-zinc-600 text-right">
                      {formatMoney(p.paid_amount, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
