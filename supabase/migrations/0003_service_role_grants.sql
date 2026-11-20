-- This Supabase project does not auto-grant new public tables to API roles.
-- Only the server's service role gets access; anon/authenticated stay locked out (RLS on, no policies).
grant select, insert, update, delete on table stores, events to service_role;
grant usage, select on sequence events_id_seq to service_role;
