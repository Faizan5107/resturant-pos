-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. PLATFORM TABLES (No restaurant_id, super_admin only)
-- ============================================================================

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2) not null default 0.00,
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'yearly')),
  max_cashiers integer,
  max_products integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  plan_id uuid references public.plans(id),
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_on timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  amount numeric(12,2) not null,
  paid_on timestamptz not null default now(),
  method text not null,
  note text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  details jsonb,
  at timestamptz not null default now()
);

-- ============================================================================
-- 2. ACCESS AND RESTAURANT SETTINGS TABLES
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('super_admin', 'admin', 'cashier')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  address text,
  phone text,
  currency text not null default 'PKR',
  timezone text not null default 'Asia/Karachi',
  tax_rate numeric(5,2) not null default 0.00,
  receipt_footer text default 'Thank you for dining with us!',
  paper_width text default '80mm',
  language text not null default 'en',
  updated_at timestamptz not null default now()
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

-- Indexes for performance
create index idx_subscriptions_restaurant_id on public.subscriptions(restaurant_id);
create index idx_subscription_payments_restaurant_id on public.subscription_payments(restaurant_id);
create index idx_profiles_restaurant_id on public.profiles(restaurant_id);
create index idx_expense_categories_restaurant_id on public.expense_categories(restaurant_id);

-- ============================================================================
-- 3. SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================================

create or replace function public.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin') and is_active = true
  );
$$;

create or replace function public.is_cashier()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('cashier', 'admin', 'super_admin') and is_active = true
  );
$$;

create or replace function public.is_restaurant_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurants r
    join public.profiles p on p.restaurant_id = r.id
    where p.id = auth.uid() and r.status = 'active'
  );
$$;

-- Function for super admin onboarding of a new restaurant
create or replace function public.create_restaurant(
  p_name text,
  p_slug text,
  p_admin_user_id uuid,
  p_admin_name text,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only super admin can create restaurants';
  end if;

  insert into public.restaurants (name, slug, status)
  values (p_name, p_slug, 'active')
  returning id into v_restaurant_id;

  -- Create default restaurant settings
  insert into public.restaurant_settings (restaurant_id, currency, timezone, tax_rate)
  values (v_restaurant_id, 'PKR', 'Asia/Karachi', 0.00);

  -- Create default expense categories
  insert into public.expense_categories (restaurant_id, name)
  values
    (v_restaurant_id, 'Rent'),
    (v_restaurant_id, 'Electricity'),
    (v_restaurant_id, 'Gas'),
    (v_restaurant_id, 'Salaries'),
    (v_restaurant_id, 'Maintenance'),
    (v_restaurant_id, 'Other');

  -- Create trial subscription
  insert into public.subscriptions (restaurant_id, plan_id, status, trial_ends_on, current_period_end)
  values (v_restaurant_id, p_plan_id, 'trial', now() + interval '14 days', now() + interval '14 days');

  -- Create or update Admin profile
  insert into public.profiles (id, restaurant_id, full_name, role, is_active)
  values (p_admin_user_id, v_restaurant_id, p_admin_name, 'admin', true)
  on conflict (id) do update
  set restaurant_id = v_restaurant_id,
      full_name = p_admin_name,
      role = 'admin',
      is_active = true;

  -- Audit log entry
  insert into public.platform_audit_log (actor_id, action, restaurant_id, details)
  values (auth.uid(), 'create_restaurant', v_restaurant_id, jsonb_build_object('name', p_name, 'slug', p_slug));

  return v_restaurant_id;
end;
$$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.restaurants enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.profiles enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.expense_categories enable row level security;

-- Platform Tables Policies (Super Admin full access, tenant read own restaurant record)
create policy "Super Admin full access to restaurants"
  on public.restaurants for all
  using (public.is_super_admin());

create policy "Tenant read own restaurant record"
  on public.restaurants for select
  using (id = public.current_restaurant_id());

create policy "Super Admin full access to plans"
  on public.plans for all
  using (public.is_super_admin());

create policy "Tenant read active plans"
  on public.plans for select
  using (is_active = true);

create policy "Super Admin full access to subscriptions"
  on public.subscriptions for all
  using (public.is_super_admin());

create policy "Tenant read own subscription"
  on public.subscriptions for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Super Admin full access to payments"
  on public.subscription_payments for all
  using (public.is_super_admin());

create policy "Tenant read own subscription payments"
  on public.subscription_payments for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Super Admin full access to audit log"
  on public.platform_audit_log for all
  using (public.is_super_admin());

-- Profiles Policies
create policy "Super Admin full access to profiles"
  on public.profiles for all
  using (public.is_super_admin());

create policy "Tenant users read profiles in same restaurant"
  on public.profiles for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Admin manage profiles in same restaurant"
  on public.profiles for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin());

-- Restaurant Settings Policies
create policy "Super Admin read settings"
  on public.restaurant_settings for select
  using (public.is_super_admin());

create policy "Tenant read own settings"
  on public.restaurant_settings for select
  using (restaurant_id = public.current_restaurant_id());

create policy "Admin manage own settings"
  on public.restaurant_settings for update
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());

-- Expense Categories Policies
create policy "Tenant read expense categories"
  on public.expense_categories for select
  using (restaurant_id = public.current_restaurant_id() and public.is_admin());

create policy "Admin manage expense categories"
  on public.expense_categories for all
  using (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active())
  with check (restaurant_id = public.current_restaurant_id() and public.is_admin() and public.is_restaurant_active());
