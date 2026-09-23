-- Create a public bucket for user assets like logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('public-assets', 'public-assets', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for the public-assets bucket
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'public-assets' );

CREATE POLICY "Authenticated users can upload assets" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'public-assets' AND auth.role() = 'authenticated' );

CREATE POLICY "Users can update their own assets"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'public-assets' AND auth.uid() = owner )
WITH CHECK ( bucket_id = 'public-assets' AND auth.uid() = owner );

CREATE POLICY "Users can delete their own assets"
ON storage.objects FOR DELETE
USING ( bucket_id = 'public-assets' AND auth.uid() = owner );
