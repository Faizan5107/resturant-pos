-- ============================================================================
-- 1. MENU TABLES
-- ============================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  image_url text,
  code text not null,
  tax_applicable boolean not null default true,
  order_types text[] not null default '{"dine_in", "takeaway", "delivery"}',
  kitchen_station text default 'main',
  status text not null default 'active' check (status in ('active', 'hidden', 'out_of_stock')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, code)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sale_price numeric(12,2) not null default 0.00,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ADMIN ONLY: Keeps cost prices hidden from cashiers
create table public.variant_costs (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  cost_price numeric(12,2) not null default 0.00,
  updated_at timestamptz not null default now()
);

create table public.addon_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  min_select integer not null default 0,
  max_select integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  group_id uuid not null references public.addon_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(12,2) not null default 0.00,
  created_at timestamptz not null default now()
);

create table public.product_addon_groups (
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.addon_groups(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  primary key (product_id, group_id)
);

-- ============================================================================
-- 2. EMPLOYEES TABLE
-- ============================================================================

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  full_name text not null,
  phone text,
  job_title text,
  monthly_salary numeric(12,2) not null default 0.00,
  joined_on date default current_date,
  is_active boolean not null default true,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Performance Indexes (All starting with restaurant_id per spec)
create index idx_categories_restaurant_id on public.categories(restaurant_id);
create index idx_products_restaurant_id on public.products(restaurant_id);
create index idx_product_variants_restaurant_id on public.product_variants(restaurant_id);
create index idx_variant_costs_restaurant_id on public.variant_costs(restaurant_id);
create index idx_addon_groups_restaurant_id on public.addon_groups(restaurant_id);
create index idx_addons_restaurant_id on public.addons(restaurant_id);
create index idx_product_addon_groups_restaurant_id on public.product_addon_groups(restaurant_id);
create index idx_employees_restaurant_id on public.employees(restaurant_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.variant_costs enable row level security;
alter table public.addon_groups enable row level security;
alter table public.addons enable row level security;
alter table public.product_addon_groups enable row level security;
alter table public.employees enable row level security;

-- Categories RLS
create policy "Tenant users read categories"
  on public.categories for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Admin manage categories"
  on public.categories for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Products RLS
create policy "Tenant users read products"
  on public.products for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Admin manage products"
  on public.products for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Product Variants RLS
create policy "Tenant users read product variants"
  on public.product_variants for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Admin manage product variants"
  on public.product_variants for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Variant Costs RLS (ADMIN ONLY)
create policy "Admin read variant costs"
  on public.variant_costs for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage variant costs"
  on public.variant_costs for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Addon Groups RLS
create policy "Tenant users read addon groups"
  on public.addon_groups for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Admin manage addon groups"
  on public.addon_groups for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Addons RLS
create policy "Tenant users read addons"
  on public.addons for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Admin manage addons"
  on public.addons for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Product Addon Groups RLS
create policy "Tenant users read product addon groups"
  on public.product_addon_groups for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Admin manage product addon groups"
  on public.product_addon_groups for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Employees RLS (ADMIN ONLY)
create policy "Admin read employees"
  on public.employees for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage employees"
  on public.employees for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());
