FROM postgres:17-alpine

COPY 00_create_supabase_roles.sql /docker-entrypoint-initdb.d/00_create_supabase_roles.sql
COPY 10_sugardash_schema.sql /docker-entrypoint-initdb.d/10_sugardash_schema.sql
