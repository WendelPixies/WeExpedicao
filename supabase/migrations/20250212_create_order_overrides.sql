create table if not exists public.order_overrides (
    pedido_id_interno text primary key,
    status_manual text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.order_overrides enable row level security;

create policy "Enable read access for all users" on public.order_overrides for select using (true);
create policy "Enable insert for all users" on public.order_overrides for insert with check (true);
create policy "Enable update for all users" on public.order_overrides for update using (true);
create policy "Enable delete for all users" on public.order_overrides for delete using (true);
