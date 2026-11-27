FROM postgres:17-alpine

COPY demo/database/00_create_supabase_roles.sql /docker-entrypoint-initdb.d/00_create_supabase_roles.sql
COPY supabase/migrations/20261125000000_initial_schema.sql /docker-entrypoint-initdb.d/10_sugardash_schema.sql
