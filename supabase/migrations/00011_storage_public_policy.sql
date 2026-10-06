-- Enable public read access for product-images storage bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access to Product Images'
  ) THEN
    CREATE POLICY "Public Access to Product Images"
    ON storage.objects FOR SELECT
    USING ( bucket_id = 'product-images' );
  END IF;
END $$;
