-- ============================================================================
-- 1. EXPENSES TABLE
-- ============================================================================

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  expense_date date not null default current_date,
  category_id uuid references public.expense_categories(id) on delete set null,
  amount numeric(12,2) not null default 0.00 check (amount >= 0),
  note text,
  employee_id uuid references public.employees(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_expenses_restaurant_id on public.expenses(restaurant_id);

-- ============================================================================
-- 2. FINANCIAL REPORTING STORED PROCEDURES
-- ============================================================================

-- Daily Sales RPC (Only paid orders count per spec)
create or replace function public.get_daily_sales(
  p_from date,
  p_to date
)
returns table (
  sale_date date,
  paid_orders_count bigint,
  net_sales numeric(12,2),
  tax_collected numeric(12,2),
  total_revenue numeric(12,2)
)
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

  return query
  select
    o.order_date as sale_date,
    count(o.id) as paid_orders_count,
    coalesce(sum(o.subtotal - o.discount_amount), 0.00) as net_sales,
    coalesce(sum(o.tax_amount), 0.00) as tax_collected,
    coalesce(sum(o.total), 0.00) as total_revenue
  from public.orders o
  where o.restaurant_id = v_restaurant_id
    and o.status = 'paid'
    and o.order_date >= p_from
    and o.order_date <= p_to
  group by o.order_date
  order by o.order_date desc;
end;
$$;

-- Profit and Loss RPC (Following spec formula)
create or replace function public.get_profit_and_loss(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_net_sales numeric(12,2) := 0.00;
  v_cost_of_ingredients numeric(12,2) := 0.00;
  v_profit_before_expenses numeric(12,2) := 0.00;
  v_operating_expenses numeric(12,2) := 0.00;
  v_profit_after_all_costs numeric(12,2) := 0.00;
  v_paid_orders_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only Admin can view Profit and Loss';
  end if;

  v_restaurant_id := public.current_restaurant_id();

  -- 1. Net sales & count from paid orders only
  select
    coalesce(sum(subtotal - discount_amount), 0.00),
    count(id)
  into v_net_sales, v_paid_orders_count
  from public.orders
  where restaurant_id = v_restaurant_id
    and status = 'paid'
    and order_date >= p_from
    and order_date <= p_to;

  -- 2. Cost of ingredients used (unit_cost * quantity for paid orders)
  select coalesce(sum(oic.unit_cost * oi.quantity), 0.00)
  into v_cost_of_ingredients
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.order_item_costs oic on oic.order_item_id = oi.id
  where o.restaurant_id = v_restaurant_id
    and o.status = 'paid'
    and o.order_date >= p_from
    and o.order_date <= p_to;

  -- 3. Profit before expenses
  v_profit_before_expenses := v_net_sales - v_cost_of_ingredients;

  -- 4. Operating expenses
  select coalesce(sum(amount), 0.00)
  into v_operating_expenses
  from public.expenses
  where restaurant_id = v_restaurant_id
    and expense_date >= p_from
    and expense_date <= p_to;

  -- 5. Profit after all costs
  v_profit_after_all_costs := v_profit_before_expenses - v_operating_expenses;

  return jsonb_build_object(
    'net_sales', v_net_sales,
    'cost_of_ingredients', v_cost_of_ingredients,
    'profit_before_expenses', v_profit_before_expenses,
    'operating_expenses', v_operating_expenses,
    'profit_after_all_costs', v_profit_after_all_costs,
    'paid_orders_count', v_paid_orders_count
  );
end;
$$;

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.expenses enable row level security;

-- Expenses RLS (ADMIN ONLY)
create policy "Admin read expenses"
  on public.expenses for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage expenses"
  on public.expenses for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());
