-- Add new columns
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS bairro TEXT;

-- Drop the unique constraint on name if it exists (we need to find its name or just try dropping it)
-- Typically Supabase/Postgres names it routes_name_key
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_name_key;

-- Add a unique constraint for the location (municipio + bairro) to avoid duplicates
-- We only want one route per neighborhood
ALTER TABLE public.routes ADD CONSTRAINT routes_municipio_bairro_key UNIQUE (municipio, bairro);

-- Note: existing data might violate this if there are nulls or duplicates. 
-- Assuming the table is fresh or has only names. If it has only names, municipio/bairro will be null.
-- We might want to allow nulls for "generic" routes, but the user wants mapping.
-- For now, we allow nulls but the unique constraint treats nulls as distinct.
