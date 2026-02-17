-- Create a view to join orders with their route costs
-- This ensures that we always get the latest cost for the route and handle case/trim variations
create or replace view view_order_costs as
select
  p.pedido_id_interno,
  p.rota,
  p.entregue_at,
  coalesce(rc.cost, 0) as unit_cost
from
  pedidos_consolidados p
left join
  route_costs rc on upper(trim(p.rota)) = upper(trim(rc.route))
where
  p.fase_atual = 'Entregue' 
  and p.entregue_at is not null;

-- Grant permissions (if needed, though standard authenticated role usually replicates table perms or needs explicit grant depending on setup)
grant select on view_order_costs to authenticated;
grant select on view_order_costs to service_role;
