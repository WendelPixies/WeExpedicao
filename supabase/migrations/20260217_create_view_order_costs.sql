-- View to calculate order delivery costs based on Municipality/Neighborhood -> Route -> Cost
-- 1. Pedidos (Col H=Município, Col J=Bairro) match Routes (municipio, bairro)
-- 2. Routes (name) match Route Costs (route)

DROP VIEW IF EXISTS view_order_costs;

CREATE VIEW view_order_costs AS
SELECT
    p.id,
    p.entregue_at,
    p.municipio,
    p.bairro,
    COALESCE(r.name, 'SEM ROTA') as rota_calculada,
    COALESCE(rc.cost, 0) as custo_calculado
FROM pedidos_consolidados p
LEFT JOIN routes r ON LOWER(p.municipio) = LOWER(r.municipio) AND LOWER(p.bairro) = LOWER(r.bairro)
LEFT JOIN route_costs rc ON r.name = rc.route
WHERE p.fase_atual = 'Entregue';
