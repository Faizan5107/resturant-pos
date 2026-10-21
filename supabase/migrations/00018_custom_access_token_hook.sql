create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  profile_role text;
  profile_restaurant_id uuid;
  profile_is_active boolean;
  restaurant_status text;
begin
  select p.role, p.restaurant_id, p.is_active, r.status
  into profile_role, profile_restaurant_id, profile_is_active, restaurant_status
  from public.profiles as p
  left join public.restaurants as r on r.id = p.restaurant_id
  where p.id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := claims || jsonb_build_object(
    'user_role', profile_role,
    'restaurant_id', profile_restaurant_id,
    'is_active', coalesce(profile_is_active, false),
    'restaurant_status', restaurant_status
  );

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
