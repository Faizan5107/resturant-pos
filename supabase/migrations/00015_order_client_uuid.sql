-- ============================================================================
-- Migration 00015: Idempotent order placement via client_uuid
-- ============================================================================
-- Adds a client-generated UUID column to orders so that:
--   1. A second call with the same (restaurant_id, client_uuid) returns the
--      existing order without consuming a new order number.
--   2. Concurrent syncs from multiple devices cannot create duplicates.
--   3. Tenant isolation is preserved — a client_uuid is only matched within
--      the current restaurant's rows.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_uuid uuid;

-- Partial unique index: only rows that actually carry a client_uuid are
-- constrained. NULL values (server-placed orders) are never restricted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_restaurant_client_uuid
  ON public.orders (restaurant_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

-- ============================================================================
-- Updated place_order function — accepts optional p_client_uuid
-- ============================================================================
CREATE OR REPLACE FUNCTION public.place_order(
  p_payload   jsonb,
  p_client_uuid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id  uuid;
  v_order_date     date := current_date;
  v_next_no        integer;
  v_formatted_no   text;
  v_order_id       uuid;
  v_item           jsonb;
  v_variant_id     uuid;
  v_variant        record;
  v_unit_price     numeric(12,2);
  v_unit_cost      numeric(12,2);
  v_quantity       integer;
  v_line_total     numeric(12,2);
  v_subtotal       numeric(12,2) := 0.00;
  v_tax_rate       numeric(5,2)  := 0.00;
  v_tax_amount     numeric(12,2) := 0.00;
  v_total          numeric(12,2) := 0.00;
  v_order_item_id  uuid;
  v_addon          jsonb;
  v_addon_delta    numeric(12,2);
  v_order_type     text;
BEGIN
  v_restaurant_id := public.current_restaurant_id();
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated or invalid restaurant context';
  END IF;

  IF NOT public.is_restaurant_active() THEN
    RAISE EXCEPTION 'Restaurant subscription is inactive';
  END IF;

  -- ── IDEMPOTENCY CHECK ────────────────────────────────────────────────────
  -- If a client_uuid is provided and we already have an order with that UUID
  -- for THIS restaurant, return it immediately without touching order_counters.
  IF p_client_uuid IS NOT NULL THEN
    SELECT id, order_no, total
    INTO   v_order_id, v_formatted_no, v_total
    FROM   public.orders
    WHERE  restaurant_id = v_restaurant_id
      AND  client_uuid   = p_client_uuid;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_id',   v_order_id,
        'order_no',   v_formatted_no,
        'total',      v_total,
        'idempotent', true
      );
    END IF;
  END IF;

  v_order_type := COALESCE(p_payload->>'order_type', 'dine_in');

  -- ── 1. Allocate daily order number ───────────────────────────────────────
  INSERT INTO public.order_counters (restaurant_id, order_date, last_no)
  VALUES (v_restaurant_id, v_order_date, 1)
  ON CONFLICT (restaurant_id, order_date) DO UPDATE
    SET last_no = public.order_counters.last_no + 1
  RETURNING last_no INTO v_next_no;

  v_formatted_no := lpad(v_next_no::text, 4, '0');

  -- ── 2. Restaurant tax rate ────────────────────────────────────────────────
  SELECT tax_rate INTO v_tax_rate
  FROM   public.restaurant_settings
  WHERE  restaurant_id = v_restaurant_id;

  IF v_tax_rate IS NULL THEN v_tax_rate := 0.00; END IF;

  -- ── 3. Insert base order ──────────────────────────────────────────────────
  INSERT INTO public.orders (
    restaurant_id, order_date, order_no, order_type,
    table_no, customer_name, customer_phone, delivery_address,
    notes, status, created_by, client_uuid
  ) VALUES (
    v_restaurant_id, v_order_date, v_formatted_no, v_order_type,
    p_payload->>'table_no',
    p_payload->>'customer_name',
    p_payload->>'customer_phone',
    p_payload->>'delivery_address',
    p_payload->>'notes',
    'new',
    auth.uid(),
    p_client_uuid      -- may be NULL for server-placed orders
  )
  RETURNING id INTO v_order_id;

  -- ── 4. Order items ────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be greater than 0';
    END IF;

    SELECT
      pv.name         AS variant_name,
      pv.sale_price,
      p.name          AS product_name,
      p.status        AS product_status,
      p.tax_applicable,
      COALESCE(vc.cost_price, 0.00) AS cost_price
    INTO v_variant
    FROM   public.product_variants pv
    JOIN   public.products p ON p.id = pv.product_id
    LEFT JOIN public.variant_costs vc ON vc.variant_id = pv.id
    WHERE  pv.id = v_variant_id AND pv.restaurant_id = v_restaurant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid product variant %', v_variant_id;
    END IF;

    IF v_variant.product_status = 'out_of_stock' THEN
      RAISE EXCEPTION 'Product % is out of stock', v_variant.product_name;
    END IF;

    v_unit_price := v_variant.sale_price;
    v_unit_cost  := v_variant.cost_price;
    v_line_total := v_unit_price * v_quantity;

    INSERT INTO public.order_items (
      restaurant_id, order_id, variant_id,
      product_name, variant_name, unit_price, quantity, line_total, notes
    ) VALUES (
      v_restaurant_id, v_order_id, v_variant_id,
      v_variant.product_name, v_variant.variant_name,
      v_unit_price, v_quantity, v_line_total, v_item->>'notes'
    )
    RETURNING id INTO v_order_item_id;

    INSERT INTO public.order_item_costs (order_item_id, restaurant_id, unit_cost)
    VALUES (v_order_item_id, v_restaurant_id, v_unit_cost);

    v_subtotal := v_subtotal + v_line_total;

    IF v_item ? 'addons' AND jsonb_array_length(v_item->'addons') > 0 THEN
      FOR v_addon IN SELECT * FROM jsonb_array_elements(v_item->'addons') LOOP
        v_addon_delta := (v_addon->>'price_delta')::numeric;
        INSERT INTO public.order_item_addons (
          restaurant_id, order_item_id, addon_name, price_delta
        ) VALUES (
          v_restaurant_id, v_order_item_id, v_addon->>'addon_name', v_addon_delta
        );
        v_subtotal := v_subtotal + (v_addon_delta * v_quantity);
      END LOOP;
    END IF;
  END LOOP;

  -- ── 5. Totals ─────────────────────────────────────────────────────────────
  v_tax_amount := round((v_subtotal * (v_tax_rate / 100.0)), 2);
  v_total      := v_subtotal + v_tax_amount;

  UPDATE public.orders
  SET subtotal   = v_subtotal,
      tax_amount = v_tax_amount,
      total      = v_total
  WHERE id = v_order_id;

  -- ── 6. Audit event ────────────────────────────────────────────────────────
  INSERT INTO public.order_events (restaurant_id, order_id, event, by_user)
  VALUES (v_restaurant_id, v_order_id, 'created', auth.uid());

  RETURN jsonb_build_object(
    'order_id',   v_order_id,
    'order_no',   v_formatted_no,
    'total',      v_total,
    'idempotent', false
  );
END;
$$;
