-- Fix permissions for route_costs (Allow Public Read/Write for now)
drop policy if exists "Enable read access for authenticated users" on route_costs;
drop policy if exists "Enable insert/update access for authenticated users" on route_costs;
drop policy if exists "Enable all access for public" on route_costs;

create policy "Enable all access for public" on route_costs
  for all using (true) with check (true);

-- Fix permissions for order_overrides (Allow Public Read/Write)
drop policy if exists "Enable read access for all users" on public.order_overrides;
drop policy if exists "Enable insert for all users" on public.order_overrides;
drop policy if exists "Enable update for all users" on public.order_overrides;
drop policy if exists "Enable delete for all users" on public.order_overrides;

create policy "Enable all access for public" on public.order_overrides
  for all using (true) with check (true);

-- Ensure columns exist in order_overrides
ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS reason TEXT;
