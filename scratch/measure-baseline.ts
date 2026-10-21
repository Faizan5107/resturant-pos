import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !serviceKey) {
  console.error("Missing SUPABASE env vars. url:", url, "hasServiceKey:", !!serviceKey);
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function timeQuery<T>(name: string, fn: () => PromiseLike<T>): Promise<{ name: string; ms: number }> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  const ms = Math.round(end - start);
  console.log(`  [${name}]: ${ms}ms`);
  return { name, ms };
}

async function run() {
  console.log("=== MEASURING SUPABASE CALLS IN SLOWEST ADMIN PAGES ===");

  // 1. /admin
  console.log("\n--- /admin (Dashboard) ---");
  const adminSeqStart = performance.now();
  await timeQuery("/admin: profiles", () =>
    supabase.from("profiles").select("full_name, restaurants(name, slug)").limit(1).single()
  );
  await timeQuery("/admin: get_profit_and_loss RPC", () =>
    supabase.rpc("get_profit_and_loss", { p_from: "2026-10-20", p_to: "2026-10-20" })
  );
  await timeQuery("/admin: restaurant_settings", () =>
    supabase.from("restaurant_settings").select("currency, enable_donation, donation_percentage").limit(1).single()
  );
  const adminSeqTotal = Math.round(performance.now() - adminSeqStart);
  console.log(`  Total Sequential Waterfall: ${adminSeqTotal}ms`);

  const adminParStart = performance.now();
  await Promise.all([
    supabase.from("profiles").select("full_name, restaurants(name, slug)").limit(1).single(),
    supabase.rpc("get_profit_and_loss", { p_from: "2026-10-20", p_to: "2026-10-20" }),
    supabase.from("restaurant_settings").select("currency, enable_donation, donation_percentage").limit(1).single(),
  ]);
  const adminParTotal = Math.round(performance.now() - adminParStart);
  console.log(`  With Promise.all (Parallel): ${adminParTotal}ms (SAVINGS: ${adminSeqTotal - adminParTotal}ms)`);

  // 2. /admin/inventory
  console.log("\n--- /admin/inventory ---");
  const invSeqStart = performance.now();
  await timeQuery("/admin/inventory: inventory_stock", () =>
    supabase.from("inventory_stock").select("*").order("name", { ascending: true })
  );
  await timeQuery("/admin/inventory: inventory_items", () =>
    supabase.from("inventory_items").select("id, preferred_supplier:parties(name)")
  );
  await timeQuery("/admin/inventory: purchases", () =>
    supabase.from("purchases").select("purchase_date, created_at, supplier:parties(name), purchase_items(item_id)").order("purchase_date", { ascending: false })
  );
  await timeQuery("/admin/inventory: suppliers", () =>
    supabase.from("parties").select("id, name").eq("type", "supplier").order("name", { ascending: true })
  );
  await timeQuery("/admin/inventory: restaurant_settings", () =>
    supabase.from("restaurant_settings").select("currency").limit(1).single()
  );
  const invSeqTotal = Math.round(performance.now() - invSeqStart);
  console.log(`  Total Sequential Waterfall: ${invSeqTotal}ms`);

  const invParStart = performance.now();
  await Promise.all([
    supabase.from("inventory_stock").select("*").order("name", { ascending: true }),
    supabase.from("inventory_items").select("id, preferred_supplier:parties(name)"),
    supabase.from("purchases").select("purchase_date, created_at, supplier:parties(name), purchase_items(item_id)").order("purchase_date", { ascending: false }),
    supabase.from("parties").select("id, name").eq("type", "supplier").order("name", { ascending: true }),
    supabase.from("restaurant_settings").select("currency").limit(1).single(),
  ]);
  const invParTotal = Math.round(performance.now() - invParStart);
  console.log(`  With Promise.all (Parallel): ${invParTotal}ms (SAVINGS: ${invSeqTotal - invParTotal}ms)`);

  // 3. /admin/expenses
  console.log("\n--- /admin/expenses ---");
  const expSeqStart = performance.now();
  await timeQuery("/admin/expenses: expense_categories", () =>
    supabase.from("expense_categories").select("id, name").order("name", { ascending: true })
  );
  await timeQuery("/admin/expenses: employees", () =>
    supabase.from("employees").select("id, full_name").order("full_name", { ascending: true })
  );
  await timeQuery("/admin/expenses: expenses", () =>
    supabase.from("expenses").select("*, expense_categories(name), employees(full_name)").order("expense_date", { ascending: false })
  );
  await timeQuery("/admin/expenses: restaurant_settings", () =>
    supabase.from("restaurant_settings").select("currency").limit(1).single()
  );
  const expSeqTotal = Math.round(performance.now() - expSeqStart);
  console.log(`  Total Sequential Waterfall: ${expSeqTotal}ms`);

  const expParStart = performance.now();
  await Promise.all([
    supabase.from("expense_categories").select("id, name").order("name", { ascending: true }),
    supabase.from("employees").select("id, full_name").order("full_name", { ascending: true }),
    supabase.from("expenses").select("*, expense_categories(name), employees(full_name)").order("expense_date", { ascending: false }),
    supabase.from("restaurant_settings").select("currency").limit(1).single(),
  ]);
  const expParTotal = Math.round(performance.now() - expParStart);
  console.log(`  With Promise.all (Parallel): ${expParTotal}ms (SAVINGS: ${expSeqTotal - expParTotal}ms)`);

  // 4. /admin/orders
  console.log("\n--- /admin/orders ---");
  const ordSeqStart = performance.now();
  await timeQuery("/admin/orders: orders", () =>
    supabase.from("orders").select("id, order_no, order_type, table_no, customer_name, status, subtotal, tax_amount, delivery_fee, service_fee, total, payment_method, cancel_reason, created_at, order_items(id, product_name, variant_name, unit_price, quantity, line_total, notes)").order("created_at", { ascending: false })
  );
  await timeQuery("/admin/orders: products", () =>
    supabase.from("products").select("id, code, name, status, product_variants(id, name, sale_price)").neq("status", "hidden").order("name", { ascending: true })
  );
  await timeQuery("/admin/orders: restaurant_settings", () =>
    supabase.from("restaurant_settings").select("currency").limit(1).single()
  );
  const ordSeqTotal = Math.round(performance.now() - ordSeqStart);
  console.log(`  Total Sequential Waterfall: ${ordSeqTotal}ms`);

  const ordParStart = performance.now();
  await Promise.all([
    supabase.from("orders").select("id, order_no, order_type, table_no, customer_name, status, subtotal, tax_amount, delivery_fee, service_fee, total, payment_method, cancel_reason, created_at, order_items(id, product_name, variant_name, unit_price, quantity, line_total, notes)").order("created_at", { ascending: false }),
    supabase.from("products").select("id, code, name, status, product_variants(id, name, sale_price)").neq("status", "hidden").order("name", { ascending: true }),
    supabase.from("restaurant_settings").select("currency").limit(1).single(),
  ]);
  const ordParTotal = Math.round(performance.now() - ordParStart);
  console.log(`  With Promise.all (Parallel): ${ordParTotal}ms (SAVINGS: ${ordSeqTotal - ordParTotal}ms)`);

  // 5. /admin/accounts
  console.log("\n--- /admin/accounts ---");
  const accSeqStart = performance.now();
  await timeQuery("/admin/accounts: parties", () =>
    supabase.from("parties").select("*, ledger_entries(debit, credit)").order("name", { ascending: true })
  );
  await timeQuery("/admin/accounts: ledger_entries", () =>
    supabase.from("ledger_entries").select("*, parties(name, type)").order("entry_date", { ascending: false })
  );
  await timeQuery("/admin/accounts: restaurant_settings", () =>
    supabase.from("restaurant_settings").select("currency").limit(1).single()
  );
  const accSeqTotal = Math.round(performance.now() - accSeqStart);
  console.log(`  Total Sequential Waterfall: ${accSeqTotal}ms`);

  const accParStart = performance.now();
  await Promise.all([
    supabase.from("parties").select("*, ledger_entries(debit, credit)").order("name", { ascending: true }),
    supabase.from("ledger_entries").select("*, parties(name, type)").order("entry_date", { ascending: false }),
    supabase.from("restaurant_settings").select("currency").limit(1).single(),
  ]);
  const accParTotal = Math.round(performance.now() - accParStart);
  console.log(`  With Promise.all (Parallel): ${accParTotal}ms (SAVINGS: ${accSeqTotal - accParTotal}ms)`);
}

run();
