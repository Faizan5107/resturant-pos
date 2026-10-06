-- Seed Plans
insert into public.plans (id, name, price, billing_period, max_cashiers, max_products, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Standard POS Plan', 29.00, 'monthly', 5, 100, true),
  ('22222222-2222-2222-2222-222222222222', 'Unlimited Plan', 79.00, 'monthly', null, null, true)
on conflict (id) do nothing;

-- Seed Restaurants
insert into public.restaurants (id, name, slug, status)
values
  ('a1111111-1111-1111-1111-111111111111', 'Burger Haven', 'burger-haven', 'active'),
  ('a2222222-2222-2222-2222-222222222222', 'Pizza Craft', 'pizza-craft', 'active')
on conflict (id) do nothing;

-- Seed Settings
insert into public.restaurant_settings (restaurant_id, address, phone, currency, timezone, tax_rate)
values
  ('a1111111-1111-1111-1111-111111111111', '123 Main St, Karachi', '+92 300 1111111', 'PKR', 'Asia/Karachi', 13.00),
  ('a2222222-2222-2222-2222-222222222222', '456 Commercial Area, Lahore', '+92 300 2222222', 'PKR', 'Asia/Karachi', 16.00)
on conflict (restaurant_id) do nothing;

-- Seed Expense Categories for Burger Haven
insert into public.expense_categories (restaurant_id, name)
values
  ('a1111111-1111-1111-1111-111111111111', 'Rent'),
  ('a1111111-1111-1111-1111-111111111111', 'Electricity'),
  ('a1111111-1111-1111-1111-111111111111', 'Gas'),
  ('a1111111-1111-1111-1111-111111111111', 'Salaries'),
  ('a1111111-1111-1111-1111-111111111111', 'Maintenance'),
  ('a1111111-1111-1111-1111-111111111111', 'Other')
on conflict do nothing;

-- Seed Expense Categories for Pizza Craft
insert into public.expense_categories (restaurant_id, name)
values
  ('a2222222-2222-2222-2222-222222222222', 'Rent'),
  ('a2222222-2222-2222-2222-222222222222', 'Electricity'),
  ('a2222222-2222-2222-2222-222222222222', 'Gas'),
  ('a2222222-2222-2222-2222-222222222222', 'Salaries'),
  ('a2222222-2222-2222-2222-222222222222', 'Maintenance'),
  ('a2222222-2222-2222-2222-222222222222', 'Other')
on conflict do nothing;
