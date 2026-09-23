-- Grant proper permissions to authenticated and anon roles on all public tables.
-- The initial schema did not include these grants, causing 403 Forbidden on all
-- REST API calls from the browser (PostgREST requires explicit GRANT to run queries).

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
