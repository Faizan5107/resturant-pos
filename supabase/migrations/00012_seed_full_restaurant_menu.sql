-- Helper 1: Seed single variant product
create or replace function public.seed_single_product(
  p_restaurant_id uuid, p_category_id uuid, p_code text, p_name text, p_desc text, p_var_name text, p_price numeric
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prod_id uuid;
begin
  select id into v_prod_id from public.products where restaurant_id = p_restaurant_id and code = p_code;
  if v_prod_id is null then
    insert into public.products (restaurant_id, category_id, code, name, description, status)
    values (p_restaurant_id, p_category_id, p_code, p_name, p_desc, 'active')
    returning id into v_prod_id;

    insert into public.product_variants (restaurant_id, product_id, name, sale_price)
    values (p_restaurant_id, v_prod_id, p_var_name, p_price);
  end if;
end;
$$;

-- Helper 2: Seed pizza product (Small, Medium, Large)
create or replace function public.seed_pizza_product(
  p_restaurant_id uuid, p_category_id uuid, p_code text, p_name text, p_small numeric, p_medium numeric, p_large numeric
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prod_id uuid;
begin
  select id into v_prod_id from public.products where restaurant_id = p_restaurant_id and code = p_code;
  if v_prod_id is null then
    insert into public.products (restaurant_id, category_id, code, name, status)
    values (p_restaurant_id, p_category_id, p_code, p_name, 'active')
    returning id into v_prod_id;

    insert into public.product_variants (restaurant_id, product_id, name, sale_price)
    values
      (p_restaurant_id, v_prod_id, 'Small', p_small),
      (p_restaurant_id, v_prod_id, 'Medium', p_medium),
      (p_restaurant_id, v_prod_id, 'Large', p_large);
  end if;
end;
$$;

-- Helper 3: Seed crust product (Medium, Large)
create or replace function public.seed_crust_product(
  p_restaurant_id uuid, p_category_id uuid, p_code text, p_name text, p_medium numeric, p_large numeric
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prod_id uuid;
begin
  select id into v_prod_id from public.products where restaurant_id = p_restaurant_id and code = p_code;
  if v_prod_id is null then
    insert into public.products (restaurant_id, category_id, code, name, status)
    values (p_restaurant_id, p_category_id, p_code, p_name, 'active')
    returning id into v_prod_id;

    insert into public.product_variants (restaurant_id, product_id, name, sale_price)
    values
      (p_restaurant_id, v_prod_id, 'Medium', p_medium),
      (p_restaurant_id, v_prod_id, 'Large', p_large);
  end if;
end;
$$;

-- Helper 4: Seed 2-variant product
create or replace function public.seed_two_variant_product(
  p_restaurant_id uuid, p_category_id uuid, p_code text, p_name text, p_v1_name text, p_v1_price numeric, p_v2_name text, p_v2_price numeric
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prod_id uuid;
begin
  select id into v_prod_id from public.products where restaurant_id = p_restaurant_id and code = p_code;
  if v_prod_id is null then
    insert into public.products (restaurant_id, category_id, code, name, status)
    values (p_restaurant_id, p_category_id, p_code, p_name, 'active')
    returning id into v_prod_id;

    insert into public.product_variants (restaurant_id, product_id, name, sale_price)
    values
      (p_restaurant_id, v_prod_id, p_v1_name, p_v1_price),
      (p_restaurant_id, v_prod_id, p_v2_name, p_v2_price);
  end if;
end;
$$;

-- Main Seed Full Restaurant Menu function
create or replace function public.seed_full_restaurant_menu(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat_deals uuid;
  v_cat_reg_pizza uuid;
  v_cat_spc_pizza uuid;
  v_cat_ext_crust uuid;
  v_cat_nuggets uuid;
  v_cat_paratha uuid;
  v_cat_shuwarma uuid;
  v_cat_burger uuid;
  v_cat_pasta uuid;
  v_cat_fries uuid;
  v_cat_wings uuid;
  
  v_addon_group_id uuid;
begin
  -- 1. Create or resolve Categories
  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Deals', 1, true)
  on conflict do nothing;
  select id into v_cat_deals from public.categories where restaurant_id = p_restaurant_id and name = 'Deals';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Regular Pizza', 2, true)
  on conflict do nothing;
  select id into v_cat_reg_pizza from public.categories where restaurant_id = p_restaurant_id and name = 'Regular Pizza';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Special Pizza', 3, true)
  on conflict do nothing;
  select id into v_cat_spc_pizza from public.categories where restaurant_id = p_restaurant_id and name = 'Special Pizza';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Extream Crust', 4, true)
  on conflict do nothing;
  select id into v_cat_ext_crust from public.categories where restaurant_id = p_restaurant_id and name = 'Extream Crust';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Burger', 5, true)
  on conflict do nothing;
  select id into v_cat_burger from public.categories where restaurant_id = p_restaurant_id and name = 'Burger';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Roll Paratha', 6, true)
  on conflict do nothing;
  select id into v_cat_paratha from public.categories where restaurant_id = p_restaurant_id and name = 'Roll Paratha';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Shuwarma', 7, true)
  on conflict do nothing;
  select id into v_cat_shuwarma from public.categories where restaurant_id = p_restaurant_id and name = 'Shuwarma';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Pasta', 8, true)
  on conflict do nothing;
  select id into v_cat_pasta from public.categories where restaurant_id = p_restaurant_id and name = 'Pasta';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Fries', 9, true)
  on conflict do nothing;
  select id into v_cat_fries from public.categories where restaurant_id = p_restaurant_id and name = 'Fries';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Wings', 10, true)
  on conflict do nothing;
  select id into v_cat_wings from public.categories where restaurant_id = p_restaurant_id and name = 'Wings';

  insert into public.categories (restaurant_id, name, sort_order, is_active)
  values (p_restaurant_id, 'Nuggets', 11, true)
  on conflict do nothing;
  select id into v_cat_nuggets from public.categories where restaurant_id = p_restaurant_id and name = 'Nuggets';

  -- 2. DEALS
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-01', 'Deal 1', '1 Small Pizza + 1 Drink 345ml', 'Standard', 399);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-02', 'Deal 2', '1 Medium Pizza + 1 Drink 345ml', 'Standard', 599);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-03', 'Deal 3', '1 Small Pizza + 1 Zinger + 1 Drink 345ml', 'Standard', 549);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-04', 'Deal 4', '5 Zinger + 1 Drink 1.5L', 'Standard', 1199);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-05', 'Deal 5', '1 Large Pizza + 1 Drink 1L', 'Standard', 899);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-06', 'Deal 6', '2 Large Pizza + 1 Drink 1L', 'Standard', 1599);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-07', 'Deal 7', '1 Large Pizza + 1 Small Pizza + 1 Drink 1.5L', 'Standard', 1399);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-08', 'Deal 8', '3 Zinger + 1 Drink 1.5L', 'Standard', 849);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-FM', 'Family Deal', '1 Large Pizza + 1 Medium Pizza + 1 Patty Burger + 1 Plain Fries + 1 Drink 1.5L + 1 Drink 1L', 'Standard', 2299);
  perform public.seed_single_product(p_restaurant_id, v_cat_deals, 'DEAL-BD', 'Birthday Deal', '2-Pound Cake + 3 Large Pizza + 5 Zinger Burgers + 10 Wings + 10 Nuggets + 20 Drinks 1.5L', 'Standard', 4499);

  -- 3. REGULAR PIZZAS (Small 300, Medium 649, Large 949)
  perform public.seed_pizza_product(p_restaurant_id, v_cat_reg_pizza, 'RPIZ-01', 'Chicken Tikka', 300, 649, 949);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_reg_pizza, 'RPIZ-02', 'Chicken Fajita', 300, 649, 949);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_reg_pizza, 'RPIZ-03', 'Veggie Lover', 300, 649, 949);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_reg_pizza, 'RPIZ-04', 'Cheese Lover', 300, 649, 949);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_reg_pizza, 'RPIZ-05', 'Tandoori', 300, 649, 949);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_reg_pizza, 'RPIZ-06', 'Fajita Sicilian', 300, 649, 949);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_reg_pizza, 'RPIZ-07', 'Buropean Delight', 300, 649, 949);

  -- 4. SPECIAL PIZZAS (Small 400, Medium 699, Large 999)
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-01', 'Shahi', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-02', 'Bon Fire', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-03', 'Behari Kabab', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-04', 'Double Seikh Kabab', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-05', 'Peri Peri', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-06', 'Supreme', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-07', 'Achari', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-08', 'Malai Boti', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-09', 'Mughlai', 400, 699, 999);
  perform public.seed_pizza_product(p_restaurant_id, v_cat_spc_pizza, 'SPIZ-10', 'Fresh Pan Special', 400, 699, 999);

  -- 5. EXTREAM CRUST (Medium / Large)
  perform public.seed_crust_product(p_restaurant_id, v_cat_ext_crust, 'EPIZ-01', 'Crown Crust', 799, 1099);
  perform public.seed_crust_product(p_restaurant_id, v_cat_ext_crust, 'EPIZ-02', 'Royal Crust', 799, 1099);
  perform public.seed_crust_product(p_restaurant_id, v_cat_ext_crust, 'EPIZ-03', 'Kebab Crust', 799, 1099);
  perform public.seed_crust_product(p_restaurant_id, v_cat_ext_crust, 'EPIZ-04', 'Cheese Crust', 799, 1099);
  perform public.seed_crust_product(p_restaurant_id, v_cat_ext_crust, 'EPIZ-05', 'Fresh Pan Crust', 899, 1199);

  -- 6. NUGGETS
  perform public.seed_two_variant_product(p_restaurant_id, v_cat_nuggets, 'NUG-01', 'Nuggets', 'Half (H)', 190, 'Full (F)', 349);

  -- 7. ROLL PARATHA
  perform public.seed_single_product(p_restaurant_id, v_cat_paratha, 'PAR-01', 'Tikka Paratha', '', 'Regular', 249);
  perform public.seed_single_product(p_restaurant_id, v_cat_paratha, 'PAR-02', 'Tikka Cheese Paratha', '', 'Regular', 299);
  perform public.seed_single_product(p_restaurant_id, v_cat_paratha, 'PAR-03', 'Fresh Pan Special Paratha', '', 'Regular', 349);
  perform public.seed_single_product(p_restaurant_id, v_cat_paratha, 'PAR-04', 'Zinger Paratha', '', 'Regular', 299);
  perform public.seed_single_product(p_restaurant_id, v_cat_paratha, 'PAR-05', 'Loaded Paratha', '', 'Regular', 349);

  -- 8. SHUWARMA
  perform public.seed_single_product(p_restaurant_id, v_cat_shuwarma, 'SHW-01', 'Tikka Shuwarma', '', 'Regular', 199);
  perform public.seed_single_product(p_restaurant_id, v_cat_shuwarma, 'SHW-02', 'Arabic Shuwarma', '', 'Regular', 249);
  perform public.seed_single_product(p_restaurant_id, v_cat_shuwarma, 'SHW-03', 'Tikka Cheese Shuwarma', '', 'Regular', 299);

  -- 9. BURGERS
  perform public.seed_single_product(p_restaurant_id, v_cat_burger, 'BRG-01', 'Bonless Thai', '', 'Regular', 199);
  perform public.seed_single_product(p_restaurant_id, v_cat_burger, 'BRG-02', 'Zinger Burger', '', 'Regular', 280);
  perform public.seed_single_product(p_restaurant_id, v_cat_burger, 'BRG-03', 'Chicken Patty Burger', '', 'Regular', 199);
  perform public.seed_single_product(p_restaurant_id, v_cat_burger, 'BRG-04', 'Chicken Grilled Burger', '', 'Regular', 399);
  perform public.seed_single_product(p_restaurant_id, v_cat_burger, 'BRG-05', 'Monster Burger', '', 'Regular', 399);

  -- 10. PASTA
  perform public.seed_single_product(p_restaurant_id, v_cat_pasta, 'PST-01', 'Flaming Pasta', '', 'Regular', 270);
  perform public.seed_single_product(p_restaurant_id, v_cat_pasta, 'PST-02', 'Fresh Pan Special Pasta', '', 'Regular', 320);
  perform public.seed_single_product(p_restaurant_id, v_cat_pasta, 'PST-03', 'Creamy Pasta', '', 'Regular', 350);
  perform public.seed_single_product(p_restaurant_id, v_cat_pasta, 'PST-04', 'Crispy Pasta', '', 'Regular', 390);

  -- 11. FRIES
  perform public.seed_single_product(p_restaurant_id, v_cat_fries, 'FRS-01', 'Reg Fries', '', 'Regular', 180);
  perform public.seed_single_product(p_restaurant_id, v_cat_fries, 'FRS-02', 'Family Fries', '', 'Regular', 299);
  perform public.seed_single_product(p_restaurant_id, v_cat_fries, 'FRS-03', 'Loaded Fries', '', 'Regular', 399);
  perform public.seed_single_product(p_restaurant_id, v_cat_fries, 'FRS-04', 'Pizza Fries', '', 'Regular', 349);

  -- 12. WINGS
  perform public.seed_two_variant_product(p_restaurant_id, v_cat_wings, 'WNG-01', 'Baked Wings', 'Regular', 199, 'Large', 399);
  perform public.seed_two_variant_product(p_restaurant_id, v_cat_wings, 'WNG-02', 'Grilled Wings', 'Regular', 199, 'Large', 399);
  perform public.seed_two_variant_product(p_restaurant_id, v_cat_wings, 'WNG-03', 'B.B.Q. Wings', 'Regular', 249, 'Large', 499);
  perform public.seed_two_variant_product(p_restaurant_id, v_cat_wings, 'WNG-04', 'Creamy Wings', 'Regular', 299, 'Large', 499);

  -- 13. ADDONS
  select id into v_addon_group_id from public.addon_groups where restaurant_id = p_restaurant_id limit 1;
  if v_addon_group_id is null then
    insert into public.addon_groups (restaurant_id, name, min_select, max_select)
    values (p_restaurant_id, 'General Extras', 0, 5)
    returning id into v_addon_group_id;
  end if;

  insert into public.addons (restaurant_id, group_id, name, price_delta)
  values
    (p_restaurant_id, v_addon_group_id, 'Add-on Cheese Slice', 40.00),
    (p_restaurant_id, v_addon_group_id, 'Extra Topping (Small)', 80.00),
    (p_restaurant_id, v_addon_group_id, 'Extra Topping (Medium)', 120.00),
    (p_restaurant_id, v_addon_group_id, 'Extra Topping (Large)', 150.00),
    (p_restaurant_id, v_addon_group_id, 'Double Patty', 100.00),
    (p_restaurant_id, v_addon_group_id, 'Extra Patty', 120.00),
    (p_restaurant_id, v_addon_group_id, 'Dip Sauce', 40.00)
  on conflict do nothing;

  return jsonb_build_object('success', true, 'message', 'Full restaurant menu seeded successfully');
end;
$$;
