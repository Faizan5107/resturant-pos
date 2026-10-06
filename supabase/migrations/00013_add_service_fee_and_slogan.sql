-- Add service_fee to orders if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='service_fee') THEN
        ALTER TABLE public.orders ADD COLUMN service_fee NUMERIC(10,2) DEFAULT 0;
    END IF;
END $$;

-- Add slogan to restaurant_settings if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='restaurant_settings' AND column_name='slogan') THEN
        ALTER TABLE public.restaurant_settings ADD COLUMN slogan TEXT;
    END IF;
END $$;
