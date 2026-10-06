-- ============================================================================
-- 1. PARTIES AND LEDGER TABLES
-- ============================================================================

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  type text not null check (type in ('supplier', 'customer')),
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  entry_date date not null default current_date,
  description text not null,
  debit numeric(12,2) not null default 0.00 check (debit >= 0),
  credit numeric(12,2) not null default 0.00 check (credit >= 0),
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. INVENTORY, PURCHASES AND STOCK MOVEMENTS TABLES
-- ============================================================================

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  category text default 'General',
  unit text not null default 'kg',
  reorder_level numeric(12,2) not null default 0.00,
  avg_cost numeric(12,2) not null default 0.00,
  preferred_supplier_id uuid references public.parties(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  supplier_id uuid not null references public.parties(id) on delete cascade,
  purchase_date date not null default current_date,
  total numeric(12,2) not null default 0.00,
  paid_amount numeric(12,2) not null default 0.00,
  note text,
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0.00
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  type text not null check (type in ('purchase', 'sale_consumption', 'wastage', 'adjustment', 'supplier_return')),
  quantity_change numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0.00,
  order_id uuid references public.orders(id) on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Performance Indexes (All starting with restaurant_id)
create index idx_parties_restaurant_id on public.parties(restaurant_id);
create index idx_ledger_entries_restaurant_id on public.ledger_entries(restaurant_id);
create index idx_inventory_items_restaurant_id on public.inventory_items(restaurant_id);
create index idx_purchases_restaurant_id on public.purchases(restaurant_id);
create index idx_purchase_items_restaurant_id on public.purchase_items(restaurant_id);
create index idx_stock_movements_restaurant_id on public.stock_movements(restaurant_id);

-- ============================================================================
-- 3. INVENTORY STOCK VIEW & STORED PROCEDURES
-- ============================================================================

create or replace view public.inventory_stock as
select
  i.id as item_id,
  i.restaurant_id,
  i.name,
  i.category,
  i.unit,
  i.reorder_level,
  i.avg_cost,
  i.preferred_supplier_id,
  i.is_active,
  coalesce(sum(m.quantity_change), 0.00) as quantity,
  case
    when coalesce(sum(m.quantity_change), 0.00) <= 0 then 'out'
    when coalesce(sum(m.quantity_change), 0.00) <= i.reorder_level then 'low'
    else 'ok'
  end as status
from public.inventory_items i
left join public.stock_movements m on m.item_id = i.id and m.restaurant_id = i.restaurant_id
group by i.id;

create or replace function public.record_purchase(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_purchase_id uuid;
  v_supplier_id uuid;
  v_total numeric(12,2) := 0.00;
  v_paid_amount numeric(12,2) := 0.00;
  v_unpaid_balance numeric(12,2) := 0.00;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric(12,2);
  v_cost numeric(12,2);
  v_current_stock numeric(12,2);
  v_current_cost numeric(12,2);
  v_new_avg_cost numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Only Admin can record stock purchases';
  end if;

  v_restaurant_id := public.current_restaurant_id();
  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_total := (p_payload->>'total')::numeric;
  v_paid_amount := (p_payload->>'paid_amount')::numeric;

  -- 1. Insert Purchase
  insert into public.purchases (
    restaurant_id,
    supplier_id,
    purchase_date,
    total,
    paid_amount,
    note
  ) values (
    v_restaurant_id,
    v_supplier_id,
    coalesce((p_payload->>'purchase_date')::date, current_date),
    v_total,
    v_paid_amount,
    p_payload->>'note'
  )
  returning id into v_purchase_id;

  -- 2. Process Purchase Items & Stock Movements
  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;

    -- Insert purchase item
    insert into public.purchase_items (
      restaurant_id,
      purchase_id,
      item_id,
      quantity,
      unit_cost
    ) values (
      v_restaurant_id,
      v_purchase_id,
      v_item_id,
      v_qty,
      v_cost
    );

    -- Create positive stock movement
    insert into public.stock_movements (
      restaurant_id,
      item_id,
      type,
      quantity_change,
      unit_cost,
      purchase_id,
      created_by
    ) values (
      v_restaurant_id,
      v_item_id,
      'purchase',
      v_qty,
      v_cost,
      v_purchase_id,
      auth.uid()
    );

    -- Calculate weighted average unit cost
    select avg_cost into v_current_cost from public.inventory_items where id = v_item_id;
    select coalesce(sum(quantity_change), 0.00) into v_current_stock from public.stock_movements where item_id = v_item_id;

    if v_current_stock > 0 then
      v_new_avg_cost := round((((v_current_stock - v_qty) * v_current_cost) + (v_qty * v_cost)) / v_current_stock, 2);
    else
      v_new_avg_cost := v_cost;
    end if;

    update public.inventory_items
    set avg_cost = v_new_avg_cost,
        updated_at = now()
    where id = v_item_id;
  end loop;

  -- 3. If credit purchase (paid_amount < total), record ledger entry for supplier balance
  v_unpaid_balance := v_total - v_paid_amount;
  if v_unpaid_balance > 0 then
    insert into public.ledger_entries (
      restaurant_id,
      party_id,
      entry_date,
      description,
      debit,
      credit,
      ref_type,
      ref_id
    ) values (
      v_restaurant_id,
      v_supplier_id,
      coalesce((p_payload->>'purchase_date')::date, current_date),
      concat('Stock purchase #', v_purchase_id::text, ' (Unpaid Balance)'),
      0.00,
      v_unpaid_balance,
      'purchase',
      v_purchase_id
    );
  end if;

  return jsonb_build_object('purchase_id', v_purchase_id, 'total', v_total, 'unpaid_balance', v_unpaid_balance);
end;
$$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES (ADMIN ONLY FOR STOCK & ACCOUNTS)
-- ============================================================================

alter table public.parties enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.inventory_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.stock_movements enable row level security;

-- Parties RLS
create policy "Admin read parties"
  on public.parties for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage parties"
  on public.parties for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Ledger Entries RLS
create policy "Admin read ledger entries"
  on public.ledger_entries for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage ledger entries"
  on public.ledger_entries for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Inventory Items RLS
create policy "Admin read inventory items"
  on public.inventory_items for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage inventory items"
  on public.inventory_items for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Purchases RLS
create policy "Admin read purchases"
  on public.purchases for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage purchases"
  on public.purchases for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Purchase Items RLS
create policy "Admin read purchase items"
  on public.purchase_items for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage purchase items"
  on public.purchase_items for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Stock Movements RLS
create policy "Admin read stock movements"
  on public.stock_movements for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage stock movements"
  on public.stock_movements for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());
