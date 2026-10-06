-- Fix ledger entry description in record_purchase to be human-readable
-- instead of showing a raw UUID like "Stock purchase #uuid (Unpaid Balance)"

create or replace function public.record_purchase(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_supplier_id uuid;
  v_supplier_name text;
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
  v_purchase_date date;
  v_note text;
  v_description text;
begin
  if not (public.is_admin() or public.is_cashier()) then
    raise exception 'Only Admin or Cashier can record stock purchases';
  end if;

  v_restaurant_id := public.current_restaurant_id();
  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_total := (p_payload->>'total')::numeric;
  v_paid_amount := (p_payload->>'paid_amount')::numeric;
  v_purchase_date := coalesce((p_payload->>'purchase_date')::date, current_date);
  v_note := nullif(trim(p_payload->>'note'), '');

  -- Resolve supplier name for human-readable ledger description
  select name into v_supplier_name from public.parties where id = v_supplier_id;

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
    v_purchase_date,
    v_total,
    v_paid_amount,
    v_note
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
    -- Build a clean, human-readable description
    v_description := concat(
      'Stock Purchase from ',
      coalesce(v_supplier_name, 'Supplier'),
      ' on ',
      to_char(v_purchase_date, 'DD Mon YYYY')
    );
    if v_note is not null then
      v_description := v_description || ' — ' || v_note;
    end if;

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
      v_purchase_date,
      v_description,
      0.00,
      v_unpaid_balance,
      'purchase',
      v_purchase_id
    );
  end if;

  return jsonb_build_object('purchase_id', v_purchase_id, 'total', v_total, 'unpaid_balance', v_unpaid_balance);
end;
$$;
