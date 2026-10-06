-- ============================================================================
-- MIGRATION 00009: DONATIONS, 2PM-2AM BUSINESS DAY, CASHIER EXPENSES & INVENTORY, ADD ITEMS
-- ============================================================================

-- 1. Add donation columns to restaurant_settings
alter table public.restaurant_settings
  add column if not exists enable_donation boolean not null default false,
  add column if not exists donation_percentage numeric(5,2) not null default 0.00;

-- 2. Update place_order to use 2:00 PM to 2:00 AM single-day shift cutoff
create or replace function public.place_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_timezone text := 'Asia/Karachi';
  v_order_date date;
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
  v_delivery_fee numeric(12,2) := 0.00;
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
  v_delivery_fee := coalesce((p_payload->>'delivery_fee')::numeric, 0.00);

  -- Get restaurant settings for timezone & tax rate
  select timezone, tax_rate
  into v_timezone, v_tax_rate
  from public.restaurant_settings
  where restaurant_id = v_restaurant_id;

  if v_timezone is null then
    v_timezone := 'Asia/Karachi';
  end if;

  if v_tax_rate is null then
    v_tax_rate := 0.00;
  end if;

  -- 2PM (14:00) to 2AM shift: subtract 14 hours so hours 00:00 to 13:59 count as previous day
  v_order_date := ((now() at time zone v_timezone) - interval '14 hours')::date;

  -- 1. Safely allocate daily order number using row locking
  insert into public.order_counters (restaurant_id, order_date, last_no)
  values (v_restaurant_id, v_order_date, 1)
  on conflict (restaurant_id, order_date) do update
  set last_no = public.order_counters.last_no + 1
  returning last_no into v_next_no;

  v_formatted_no := lpad(v_next_no::text, 4, '0');

  -- 2. Insert base order record
  insert into public.orders (
    restaurant_id,
    order_date,
    order_no,
    order_type,
    table_no,
    customer_name,
    customer_phone,
    delivery_address,
    delivery_fee,
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
    v_delivery_fee,
    p_payload->>'notes',
    'new',
    auth.uid()
  )
  returning id into v_order_id;

  -- 3. Process Order Items
  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity <= 0 then
      raise exception 'Item quantity must be greater than 0';
    end if;

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

  -- 4. Calculate Tax and Total
  v_tax_amount := round((v_subtotal * (v_tax_rate / 100.0)), 2);
  v_total := v_subtotal + v_tax_amount + v_delivery_fee;

  update public.orders
  set subtotal = v_subtotal,
      tax_amount = v_tax_amount,
      delivery_fee = v_delivery_fee,
      total = v_total
  where id = v_order_id;

  insert into public.order_events (restaurant_id, order_id, event, by_user)
  values (v_restaurant_id, v_order_id, 'created', auth.uid());

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_formatted_no,
    'total', v_total
  );
end;
$$;

-- 3. Stored Procedure: add_items_to_order (Only addition allowed)
create or replace function public.add_items_to_order(
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_order record;
  v_tax_rate numeric(5,2) := 0.00;
  v_item jsonb;
  v_variant_id uuid;
  v_variant record;
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_quantity integer;
  v_line_total numeric(12,2);
  v_added_subtotal numeric(12,2) := 0.00;
  v_new_subtotal numeric(12,2);
  v_new_tax numeric(12,2);
  v_new_total numeric(12,2);
  v_order_item_id uuid;
  v_addon jsonb;
  v_addon_delta numeric(12,2);
begin
  v_restaurant_id := public.current_restaurant_id();
  if v_restaurant_id is null then
    raise exception 'Unauthenticated or invalid restaurant context';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and restaurant_id = v_restaurant_id;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status in ('paid', 'cancelled') then
    raise exception 'Cannot add items to order that is %', v_order.status;
  end if;

  select coalesce(tax_rate, 0.00) into v_tax_rate
  from public.restaurant_settings
  where restaurant_id = v_restaurant_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity <= 0 then
      raise exception 'Item quantity must be greater than 0';
    end if;

    select
      pv.name as variant_name,
      pv.sale_price,
      p.name as product_name,
      p.status as product_status,
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
      p_order_id,
      v_variant_id,
      v_variant.product_name,
      v_variant.variant_name,
      v_unit_price,
      v_quantity,
      v_line_total,
      v_item->>'notes'
    )
    returning id into v_order_item_id;

    insert into public.order_item_costs (
      order_item_id,
      restaurant_id,
      unit_cost
    ) values (
      v_order_item_id,
      v_restaurant_id,
      v_unit_cost
    );

    v_added_subtotal := v_added_subtotal + v_line_total;

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
        v_added_subtotal := v_added_subtotal + (v_addon_delta * v_quantity);
      end loop;
    end if;
  end loop;

  v_new_subtotal := v_order.subtotal + v_added_subtotal;
  v_new_tax := round((v_new_subtotal * (v_tax_rate / 100.0)), 2);
  v_new_total := v_new_subtotal + v_new_tax;

  update public.orders
  set subtotal = v_new_subtotal,
      tax_amount = v_new_tax,
      total = v_new_total,
      updated_at = now()
  where id = p_order_id;

  insert into public.order_events (restaurant_id, order_id, event, by_user, note)
  values (v_restaurant_id, p_order_id, 'status_changed', auth.uid(), 'Added items to punched order');

  return jsonb_build_object(
    'order_id', p_order_id,
    'added_subtotal', v_added_subtotal,
    'new_total', v_new_total
  );
end;
$$;

-- 4. Update record_purchase to allow Cashiers as well as Admins
create or replace function public.record_purchase(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_supplier_id uuid;
  v_purchase_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric(12,2);
  v_cost numeric(12,2);
  v_total numeric(12,2);
  v_paid_amount numeric(12,2);
  v_unpaid_balance numeric(12,2);
  v_current_stock numeric(12,2);
  v_current_cost numeric(12,2);
  v_new_avg_cost numeric(12,2);
begin
  if not (public.is_admin() or public.is_cashier()) then
    raise exception 'Only Admin or Cashier can record stock purchases';
  end if;

  v_restaurant_id := public.current_restaurant_id();
  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_total := (p_payload->>'total')::numeric;
  v_paid_amount := (p_payload->>'paid_amount')::numeric;

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

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;

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

-- 5. RLS permissions updates: allow Cashiers to insert expenses and read expense categories
create policy "Cashiers read expense categories"
  on public.expense_categories for select
  using (restaurant_id = public.current_restaurant_id() and public.is_cashier());

create policy "Cashiers insert expenses"
  on public.expenses for insert
  with check (restaurant_id = public.current_restaurant_id() and public.is_cashier() and public.is_restaurant_active());

create policy "Cashiers read expenses"
  on public.expenses for select
  using (restaurant_id = public.current_restaurant_id() and public.is_cashier());

-- Allow Cashiers to read inventory and suppliers to record incoming deliveries
create policy "Cashiers read parties"
  on public.parties for select
  using (restaurant_id = public.current_restaurant_id() and public.is_cashier());

create policy "Cashiers read inventory items"
  on public.inventory_items for select
  using (restaurant_id = public.current_restaurant_id() and public.is_cashier());

create policy "Cashiers read purchases"
  on public.purchases for select
  using (restaurant_id = public.current_restaurant_id() and public.is_cashier());
