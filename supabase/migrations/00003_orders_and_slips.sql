-- ============================================================================
-- 1. ORDERS AND SLIPS TABLES
-- ============================================================================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_date date not null default current_date,
  order_no text not null,
  order_type text not null check (order_type in ('dine_in', 'takeaway', 'delivery')),
  table_no text,
  customer_name text,
  customer_phone text,
  delivery_address text,
  notes text,
  status text not null default 'new' check (status in ('new', 'preparing', 'ready', 'delivered', 'paid', 'cancelled')),
  subtotal numeric(12,2) not null default 0.00,
  discount_amount numeric(12,2) not null default 0.00,
  tax_amount numeric(12,2) not null default 0.00,
  total numeric(12,2) not null default 0.00,
  payment_method text check (payment_method in ('cash', 'card', 'online')),
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  cancelled_by uuid references auth.users(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, order_date, order_no)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id),
  product_name text not null,
  variant_name text not null,
  unit_price numeric(12,2) not null,
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null,
  notes text
);

create table public.order_item_addons (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  addon_name text not null,
  price_delta numeric(12,2) not null default 0.00
);

-- ADMIN ONLY: Cost price snapshot at sale time
create table public.order_item_costs (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  unit_cost numeric(12,2) not null default 0.00
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event text not null check (event in ('created', 'status_changed', 'kitchen_slip_printed', 'bill_printed', 'paid', 'cancelled')),
  by_user uuid references auth.users(id),
  at timestamptz not null default now(),
  note text
);

create table public.order_counters (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_date date not null default current_date,
  last_no integer not null default 0,
  primary key (restaurant_id, order_date)
);

-- Performance Indexes (All starting with restaurant_id)
create index idx_orders_restaurant_id on public.orders(restaurant_id);
create index idx_order_items_restaurant_id on public.order_items(restaurant_id);
create index idx_order_item_addons_restaurant_id on public.order_item_addons(restaurant_id);
create index idx_order_item_costs_restaurant_id on public.order_item_costs(restaurant_id);
create index idx_order_events_restaurant_id on public.order_events(restaurant_id);

-- ============================================================================
-- 2. STORED PROCEDURES (Order Placement & Status Management)
-- ============================================================================

create or replace function public.place_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_order_date date := current_date;
  v_next_no integer;
  v_formatted_no text;
  v_order_id uuid;
  v_item jsonb;
  v_variant_id uuid;
  v_variant record;
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_quantity integer;
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0.00;
  v_tax_rate numeric(5,2) := 0.00;
  v_tax_amount numeric(12,2) := 0.00;
  v_total numeric(12,2) := 0.00;
  v_order_item_id uuid;
  v_addon jsonb;
  v_addon_delta numeric(12,2);
  v_order_type text;
begin
  v_restaurant_id := public.current_restaurant_id();
  if v_restaurant_id is null then
    raise exception 'Unauthenticated or invalid restaurant context';
  end if;

  if not public.is_restaurant_active() then
    raise exception 'Restaurant subscription is inactive';
  end if;

  v_order_type := coalesce(p_payload->>'order_type', 'dine_in');

  -- 1. Safely allocate daily order number using row locking
  insert into public.order_counters (restaurant_id, order_date, last_no)
  values (v_restaurant_id, v_order_date, 1)
  on conflict (restaurant_id, order_date) do update
  set last_no = public.order_counters.last_no + 1
  returning last_no into v_next_no;

  v_formatted_no := lpad(v_next_no::text, 4, '0');

  -- 2. Get restaurant tax rate
  select tax_rate into v_tax_rate
  from public.restaurant_settings
  where restaurant_id = v_restaurant_id;

  if v_tax_rate is null then
    v_tax_rate := 0.00;
  end if;

  -- 3. Insert base order record
  insert into public.orders (
    restaurant_id,
    order_date,
    order_no,
    order_type,
    table_no,
    customer_name,
    customer_phone,
    delivery_address,
    notes,
    status,
    created_by
  ) values (
    v_restaurant_id,
    v_order_date,
    v_formatted_no,
    v_order_type,
    p_payload->>'table_no',
    p_payload->>'customer_name',
    p_payload->>'customer_phone',
    p_payload->>'delivery_address',
    p_payload->>'notes',
    'new',
    auth.uid()
  )
  returning id into v_order_id;

  -- 4. Process Order Items (Read prices strictly from database)
  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity <= 0 then
      raise exception 'Item quantity must be greater than 0';
    end if;

    -- Fetch product variant & cost from database
    select
      pv.name as variant_name,
      pv.sale_price,
      p.name as product_name,
      p.status as product_status,
      p.tax_applicable,
      coalesce(vc.cost_price, 0.00) as cost_price
    into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    left join public.variant_costs vc on vc.variant_id = pv.id
    where pv.id = v_variant_id and pv.restaurant_id = v_restaurant_id;

    if not found then
      raise exception 'Invalid product variant %', v_variant_id;
    end if;

    if v_variant.product_status = 'out_of_stock' then
      raise exception 'Product % is out of stock', v_variant.product_name;
    end if;

    v_unit_price := v_variant.sale_price;
    v_unit_cost := v_variant.cost_price;
    v_line_total := v_unit_price * v_quantity;

    -- Insert order item
    insert into public.order_items (
      restaurant_id,
      order_id,
      variant_id,
      product_name,
      variant_name,
      unit_price,
      quantity,
      line_total,
      notes
    ) values (
      v_restaurant_id,
      v_order_id,
      v_variant_id,
      v_variant.product_name,
      v_variant.variant_name,
      v_unit_price,
      v_quantity,
      v_line_total,
      v_item->>'notes'
    )
    returning id into v_order_item_id;

    -- Insert order item cost snapshot (Admin only)
    insert into public.order_item_costs (
      order_item_id,
      restaurant_id,
      unit_cost
    ) values (
      v_order_item_id,
      v_restaurant_id,
      v_unit_cost
    );

    v_subtotal := v_subtotal + v_line_total;

    -- Process Add-ons if present
    if v_item ? 'addons' and jsonb_array_length(v_item->'addons') > 0 then
      for v_addon in select * from jsonb_array_elements(v_item->'addons')
      loop
        v_addon_delta := (v_addon->>'price_delta')::numeric;
        insert into public.order_item_addons (
          restaurant_id,
          order_item_id,
          addon_name,
          price_delta
        ) values (
          v_restaurant_id,
          v_order_item_id,
          v_addon->>'addon_name',
          v_addon_delta
        );
        v_subtotal := v_subtotal + (v_addon_delta * v_quantity);
      end loop;
    end if;
  end loop;

  -- 5. Calculate Tax and Total
  v_tax_amount := round((v_subtotal * (v_tax_rate / 100.0)), 2);
  v_total := v_subtotal + v_tax_amount;

  -- Update order totals
  update public.orders
  set subtotal = v_subtotal,
      tax_amount = v_tax_amount,
      total = v_total
  where id = v_order_id;

  -- Log created event
  insert into public.order_events (restaurant_id, order_id, event, by_user)
  values (v_restaurant_id, v_order_id, 'created', auth.uid());

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_formatted_no,
    'total', v_total
  );
end;
$$;

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_payment_method text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  v_restaurant_id := public.current_restaurant_id();
  if v_restaurant_id is null then
    raise exception 'Unauthenticated';
  end if;

  update public.orders
  set status = 'paid',
      payment_method = p_payment_method,
      paid_at = now(),
      updated_at = now()
  where id = p_order_id and restaurant_id = v_restaurant_id;

  insert into public.order_events (restaurant_id, order_id, event, by_user, note)
  values (v_restaurant_id, p_order_id, 'paid', auth.uid(), jsonb_build_object('method', p_payment_method)::text);

  return true;
end;
$$;

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only Admin can cancel orders';
  end if;

  v_restaurant_id := public.current_restaurant_id();

  update public.orders
  set status = 'cancelled',
      cancelled_by = auth.uid(),
      cancel_reason = p_reason,
      updated_at = now()
  where id = p_order_id and restaurant_id = v_restaurant_id;

  insert into public.order_events (restaurant_id, order_id, event, by_user, note)
  values (v_restaurant_id, p_order_id, 'cancelled', auth.uid(), p_reason);

  return true;
end;
$$;

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_addons enable row level security;
alter table public.order_item_costs enable row level security;
alter table public.order_events enable row level security;
alter table public.order_counters enable row level security;

-- Orders RLS (Tenant users read, create, update status)
create policy "Tenant users read orders"
  on public.orders for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Tenant users insert orders"
  on public.orders for insert
  with check (restaurant_id = public.current_restaurant_id() and public.is_restaurant_active());

create policy "Tenant users update orders"
  on public.orders for update
  using (restaurant_id = public.current_restaurant_id() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_restaurant_active());

-- Order Items RLS
create policy "Tenant users read order items"
  on public.order_items for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Tenant users insert order items"
  on public.order_items for insert
  with check (restaurant_id = public.current_restaurant_id() and public.is_restaurant_active());

-- Order Item Addons RLS
create policy "Tenant users read order item addons"
  on public.order_item_addons for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Tenant users insert order item addons"
  on public.order_item_addons for insert
  with check (restaurant_id = public.current_restaurant_id() and public.is_restaurant_active());

-- Order Item Costs RLS (ADMIN ONLY)
create policy "Admin read order item costs"
  on public.order_item_costs for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage order item costs"
  on public.order_item_costs for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Order Events RLS
create policy "Tenant users read order events"
  on public.order_events for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Tenant users insert order events"
  on public.order_events for insert
  with check (restaurant_id = public.current_restaurant_id() and public.is_restaurant_active());

-- Order Counters RLS
create policy "Tenant users access order counters"
  on public.order_counters for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
