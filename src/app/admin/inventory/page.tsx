import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import CreateItemModal from "./CreateItemModal";
import RecordPurchaseModal from "./RecordPurchaseModal";
import StockAdjustmentModal from "./StockAdjustmentModal";

export default async function AdminInventoryPage() {
  const supabase = await createClient();

  // Query inventory_stock view
  const { data: stockItems } = await supabase
    .from("inventory_stock")
    .select("*")
    .order("name", { ascending: true });

  // Query preferred supplier for items as initial fallback
  const { data: rawItems } = await supabase
    .from("inventory_items")
    .select("id, preferred_supplier:parties(name)");

  const preferredSupplierMap = new Map<string, string>();
  (rawItems || []).forEach((item: any) => {
    if (item.preferred_supplier?.name) {
      preferredSupplierMap.set(item.id, item.preferred_supplier.name);
    }
  });

  // Query purchases ordered descending to get the actual last supplier for each item
  const { data: recentPurchases } = await supabase
    .from("purchases")
    .select(`
      purchase_date,
      created_at,
      supplier:parties(name),
      purchase_items(item_id)
    `)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  const lastSupplierMap = new Map<string, string>();
  (recentPurchases || []).forEach((p: any) => {
    const supplierName = p.supplier?.name;
    if (supplierName && p.purchase_items) {
      p.purchase_items.forEach((pi: any) => {
        if (!lastSupplierMap.has(pi.item_id)) {
          lastSupplierMap.set(pi.item_id, supplierName);
        }
      });
    }
  });

  // Query suppliers for dropdown
  const { data: suppliers } = await supabase
    .from("parties")
    .select("id, name")
    .eq("type", "supplier")
    .order("name", { ascending: true });

  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("currency")
    .single();

  const currency = settings?.currency || "PKR";
  const lowStockCount = (stockItems || []).filter((i) => i.status === "low" || i.status === "out").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Stock (Inventory)
          </h1>
          <p className="text-xs text-zinc-500">
            Track raw ingredients, average costs, stock levels, reorder alerts, and purchases.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <StockAdjustmentModal items={(stockItems as any) || []} />
          <RecordPurchaseModal suppliers={suppliers || []} items={(stockItems as any) || []} />
          <CreateItemModal suppliers={suppliers || []} />
        </div>
      </div>

      {/* Low Stock Warning Banner */}
      {lowStockCount > 0 && (
        <div className="border border-black bg-zinc-100 p-4 rounded-lg flex justify-between items-center text-xs">
          <div className="flex items-center space-x-2 font-bold text-black">
            <span className="inline-block px-2 py-0.5 bg-black text-white text-[10px] rounded uppercase">
              Alert
            </span>
            <span>{lowStockCount} item(s) are at or below their reorder alert level!</span>
          </div>
        </div>
      )}

      {/* Stock Items Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Item Name</th>
              <th className="py-3 px-4 font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold">Last Supplier</th>
              <th className="py-3 px-4 font-semibold">Current Quantity</th>
              <th className="py-3 px-4 font-semibold">Reorder Alert Level</th>
              <th className="py-3 px-4 font-semibold">Weighted Avg Cost</th>
              <th className="py-3 px-4 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!stockItems || stockItems.length === 0) ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-zinc-500 text-xs">
                  No stock items created yet. Click "+ Add Stock Item" to start tracking inventory.
                </td>
              </tr>
            ) : (
              stockItems.map((item) => {
                const isLow = item.status === "low";
                const isOut = item.status === "out";
                const lastSupplier =
                  lastSupplierMap.get(item.item_id) ||
                  preferredSupplierMap.get(item.item_id) ||
                  "—";

                return (
                  <tr key={item.item_id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-black">{item.name}</td>
                    <td className="py-3 px-4 text-xs text-zinc-600">{item.category}</td>
                    <td className="py-3 px-4 text-xs font-medium text-zinc-700">
                      {lastSupplier !== "—" ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-900 font-semibold text-[11px]">
                          {lastSupplier}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-bold text-black">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-600">
                      {item.reorder_level} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      {formatMoney(item.avg_cost, currency)} / {item.unit}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${
                          isOut
                            ? "bg-zinc-200 text-black border border-black font-bold uppercase"
                            : isLow
                            ? "border border-black text-black"
                            : "bg-black text-white"
                        }`}
                      >
                        {item.status === "ok" ? "OK" : item.status === "low" ? "Low Stock" : "Out of Stock"}
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
  );
}
