-- Grant permissions to standard supabase roles
GRANT ALL ON TABLE public."jobTemplates" TO anon;
GRANT ALL ON TABLE public."jobTemplates" TO authenticated;
GRANT ALL ON TABLE public."jobTemplates" TO service_role;
