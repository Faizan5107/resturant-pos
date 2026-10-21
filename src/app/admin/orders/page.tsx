import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/server-data";
import ActiveOrdersBoard from "@/app/cashier/active-orders/ActiveOrdersBoard";

export default async function AdminOrdersPage() {
  const supabase = await createClient();

  const [
    { data: orders, error: ordersError },
    { data: products, error: productsError },
    settings,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(`
      id,
      order_no,
      order_type,
      table_no,
      customer_name,
      status,
      subtotal,
      tax_amount,
      delivery_fee,
      service_fee,
      total,
      payment_method,
      cancel_reason,
      created_at,
      order_items(
        id,
        product_name,
        variant_name,
        unit_price,
        quantity,
        line_total,
        notes
      )
      `)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("products")
      .select(`
      id,
      code,
      name,
      status,
      product_variants(
        id,
        name,
        sale_price
      )
      `)
      .neq("status", "hidden")
      .order("name", { ascending: true })
      .limit(1000),
    getSettings("currency"),
  ]);
  if (ordersError) throw ordersError;
  if (productsError) throw productsError;

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-bold text-black tracking-tight">
          Live Orders & History
        </h1>
        <p className="text-xs text-zinc-500">
          Monitor running orders, add items, collect payments, and cancel orders with administrative authority.
        </p>
      </div>

      <ActiveOrdersBoard
        initialOrders={(orders as any) || []}
        products={(products as any) || []}
        currency={settings?.currency || "PKR"}
        isAdmin={true}
      />
    </div>
  );
}
