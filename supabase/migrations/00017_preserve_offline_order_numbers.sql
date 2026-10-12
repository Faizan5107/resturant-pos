-- ============================================================================
-- MIGRATION 00017: PRESERVE OFFLINE ORDER NUMBERS & RESTORE SERVICE FEE & TAX
-- ============================================================================

-- Update place_order to:
-- 1. Honor client-provided order_no (from offline mode) if no collision exists today
-- 2. Correctly calculate tax_amount based on restaurant_settings.tax_rate
-- 3. Correctly calculate and add service_fee for dine_in orders based on restaurant_settings
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
  v_restaurant_id       uuid;
  v_timezone            text := 'Asia/Karachi';
  v_order_date          date;
  v_next_no             integer;
  v_formatted_no        text;
  v_order_id            uuid;
  v_item                jsonb;
  v_variant_id          uuid;
  v_variant             record;
  v_unit_price          numeric(12,2);
  v_unit_cost           numeric(12,2);
  v_quantity            integer;
  v_line_total          numeric(12,2);
  v_subtotal            numeric(12,2) := 0.00;
  v_tax_rate            numeric(5,2)  := 0.00;
  v_tax_amount          numeric(12,2) := 0.00;
  v_enable_service_fee  boolean       := false;
  v_service_fee_amount  numeric(12,2) := 0.00;
  v_service_fee         numeric(12,2) := 0.00;
  v_total               numeric(12,2) := 0.00;
  v_order_item_id       uuid;
  v_addon               jsonb;
  v_addon_delta         numeric(12,2);
  v_order_type          text;
  v_desired_no          text;
BEGIN
  v_restaurant_id := public.current_restaurant_id();
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated or invalid restaurant context';
  END IF;

  IF NOT public.is_restaurant_active() THEN
    RAISE EXCEPTION 'Restaurant subscription is inactive';
  END IF;

  -- ── IDEMPOTENCY CHECK ────────────────────────────────────────────────────
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

  -- Get restaurant settings for timezone, tax rate, and service fee
  SELECT timezone, tax_rate, COALESCE(enable_service_fee, false), COALESCE(service_fee_amount, 0.00)
  INTO   v_timezone, v_tax_rate, v_enable_service_fee, v_service_fee_amount
  FROM   public.restaurant_settings
  WHERE  restaurant_id = v_restaurant_id;

  IF v_timezone IS NULL THEN v_timezone := 'Asia/Karachi'; END IF;
  IF v_tax_rate IS NULL THEN v_tax_rate := 0.00; END IF;

  -- 12PM (12:00) to 2AM shift: subtract 12 hours so hours 00:00 to 11:59 count as previous day
  v_order_date := ((now() AT TIME ZONE v_timezone) - interval '12 hours')::date;

  -- ── 1. Allocate daily order number (or honor offline order number) ────────
  v_desired_no := p_payload->>'order_no';
  IF v_desired_no IS NOT NULL AND v_desired_no <> '' THEN
    IF v_desired_no ~ '^[0-9]+$' THEN
      v_formatted_no := lpad(v_desired_no, 4, '0');
    ELSE
      v_formatted_no := v_desired_no;
    END IF;

    -- Check if this order_no already exists today
    IF EXISTS (
      SELECT 1 FROM public.orders
      WHERE restaurant_id = v_restaurant_id
        AND order_date = v_order_date
        AND order_no = v_formatted_no
    ) THEN
      v_formatted_no := NULL; -- Collision: fall back to generating next number
    ELSE
      -- Ensure order_counters.last_no is at least this number
      IF v_desired_no ~ '^[0-9]+$' THEN
        v_next_no := v_desired_no::integer;
        INSERT INTO public.order_counters (restaurant_id, order_date, last_no)
        VALUES (v_restaurant_id, v_order_date, v_next_no)
        ON CONFLICT (restaurant_id, order_date) DO UPDATE
          SET last_no = GREATEST(public.order_counters.last_no, v_next_no);
      END IF;
    END IF;
  END IF;

  IF v_formatted_no IS NULL THEN
    INSERT INTO public.order_counters (restaurant_id, order_date, last_no)
    VALUES (v_restaurant_id, v_order_date, 1)
    ON CONFLICT (restaurant_id, order_date) DO UPDATE
      SET last_no = public.order_counters.last_no + 1
    RETURNING last_no INTO v_next_no;

    v_formatted_no := lpad(v_next_no::text, 4, '0');
  END IF;

  -- ── 2. Insert base order ──────────────────────────────────────────────────
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
    p_client_uuid
  )
  RETURNING id INTO v_order_id;

  -- ── 3. Order items ────────────────────────────────────────────────────────
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

  -- ── 4. Totals ─────────────────────────────────────────────────────────────
  v_tax_amount := round((v_subtotal * (v_tax_rate / 100.0)), 2);
  IF v_order_type = 'dine_in' AND v_enable_service_fee THEN
    v_service_fee := v_service_fee_amount;
  END IF;
  v_total      := v_subtotal + v_tax_amount + v_service_fee;

  UPDATE public.orders
  SET subtotal    = v_subtotal,
      tax_amount  = v_tax_amount,
      service_fee = v_service_fee,
      total       = v_total
  WHERE id = v_order_id;

  -- ── 5. Audit Log ──────────────────────────────────────────────────────────
  INSERT INTO public.order_events (
    restaurant_id, order_id, event, user_id, note
  ) VALUES (
    v_restaurant_id, v_order_id, 'created', auth.uid(),
    'Order #' || v_formatted_no || ' placed (' || v_order_type || ')'
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_formatted_no,
    'total',    v_total
  );
END;
$$;
