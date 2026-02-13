create table if not exists route_costs (
  route text primary key,
  cost numeric default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS (Optional, depending on your project's security model, but good practice)
alter table route_costs enable row level security;

-- Policy to allow authenticated users to read costs
create policy "Enable read access for authenticated users" on route_costs
  for select using (auth.role() = 'authenticated');

-- Policy to allow authenticated users to insert/update costs
create policy "Enable insert/update access for authenticated users" on route_costs
  for all using (auth.role() = 'authenticated');
