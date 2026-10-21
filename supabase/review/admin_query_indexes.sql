-- Review-only recommendations for the admin reports and list queries.
-- Do not apply this file until the query plans and production workload are reviewed.

create index if not exists idx_orders_restaurant_created_at
  on public.orders (restaurant_id, created_at desc);

create index if not exists idx_orders_restaurant_status_order_date
  on public.orders (restaurant_id, status, order_date);

create index if not exists idx_order_items_order_id
  on public.order_items (order_id);

create index if not exists idx_expenses_restaurant_expense_date
  on public.expenses (restaurant_id, expense_date desc);

create index if not exists idx_ledger_entries_restaurant_entry_date
  on public.ledger_entries (restaurant_id, entry_date desc);

create index if not exists idx_ledger_entries_restaurant_party
  on public.ledger_entries (restaurant_id, party_id);

create index if not exists idx_purchases_restaurant_recent
  on public.purchases (restaurant_id, purchase_date desc, created_at desc);

create index if not exists idx_purchase_items_purchase_id
  on public.purchase_items (purchase_id);

create index if not exists idx_purchase_items_restaurant_item
  on public.purchase_items (restaurant_id, item_id);

create index if not exists idx_stock_movements_restaurant_item
  on public.stock_movements (restaurant_id, item_id);

create index if not exists idx_product_variants_product_id
  on public.product_variants (product_id);
