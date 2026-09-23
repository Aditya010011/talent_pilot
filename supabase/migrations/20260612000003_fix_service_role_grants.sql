-- Grant proper permissions to service_role on all public tables.
-- This ensures the admin client (which uses the service_role key) can perform
-- operations on all tables bypassing RLS and without encountering 'permission denied' errors.

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
