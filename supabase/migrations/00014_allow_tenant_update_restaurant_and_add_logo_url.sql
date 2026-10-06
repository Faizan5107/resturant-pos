-- 1. Allow tenant admin to update their own restaurant record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'restaurants' AND policyname = 'Tenant update own restaurant record'
  ) THEN
    CREATE POLICY "Tenant update own restaurant record"
      ON public.restaurants FOR UPDATE
      USING (id = public.current_restaurant_id())
      WITH CHECK (id = public.current_restaurant_id());
  END IF;
END $$;

-- 2. Add logo_url to restaurant_settings if missing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='restaurant_settings' AND column_name='logo_url') THEN
        ALTER TABLE public.restaurant_settings ADD COLUMN logo_url TEXT;
    END IF;
END $$;
