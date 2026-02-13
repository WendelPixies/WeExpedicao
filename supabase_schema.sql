-- 1. Create holidays table
CREATE TABLE IF NOT EXISTS feriados (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL UNIQUE,
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create imports history table
CREATE TABLE IF NOT EXISTS imports (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    nome_arquivo TEXT,
    tipo TEXT CHECK (tipo IN ('xlsx', 'csv', 'both'))
);

-- 3. Create raw tables for staging data
-- raw_xlsx stores JSON content from Excel imports
CREATE TABLE IF NOT EXISTS raw_xlsx (
    id SERIAL PRIMARY KEY,
    import_id INTEGER REFERENCES imports(id) ON DELETE CASCADE,
    data JSONB, -- Stores the entire row as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- raw_csv stores JSON content from CSV imports
CREATE TABLE IF NOT EXISTS raw_csv (
    id SERIAL PRIMARY KEY,
    import_id INTEGER REFERENCES imports(id) ON DELETE CASCADE,
    data JSONB, -- Stores the entire row as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create the main consolidated orders table
-- This table stores the processed state of orders
CREATE TABLE IF NOT EXISTS pedidos_consolidados (
    id SERIAL PRIMARY KEY,
    
    -- Identifiers
    pedido_id_interno TEXT UNIQUE NOT NULL, -- "Pedido" from Excel
    pedido_id_externo TEXT,                 -- "Cód. Externo"
    pedido_id_logistica TEXT,               -- "Pedido" from CSV
    pedido_id_erp_csv TEXT,                 -- "Pedido ERP" from CSV
    
    -- Status & Phase
    fase_atual TEXT,
    situacao TEXT,
    ultima_ocorrencia TEXT,
    sla_status TEXT, -- 'NO PRAZO', 'ATRASADO'
    
    -- Timestamps
    aprovado_at TIMESTAMP WITH TIME ZONE,
    disponivel_faturamento_at TIMESTAMP WITH TIME ZONE,
    faturado_at TIMESTAMP WITH TIME ZONE,
    despachado_at TIMESTAMP WITH TIME ZONE,
    entregue_at TIMESTAMP WITH TIME ZONE,
    
    -- Logistics info
    transportadora TEXT,
    rota TEXT,
    motorista TEXT,
    municipio_uf TEXT,
    nome_pessoa TEXT,
    
    -- Metrics
    dias_uteis_desde_aprovacao INTEGER,
    sla_detalhado JSONB, -- Stores array of specific alerts
    
    -- Metadata
    match_key_used TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos_consolidados(fase_atual);
CREATE INDEX IF NOT EXISTS idx_pedidos_interno ON pedidos_consolidados(pedido_id_interno);
CREATE INDEX IF NOT EXISTS idx_pedidos_aprovado ON pedidos_consolidados(aprovado_at);

-- 6. Enable Row Level Security (RLS)
-- For now, we allow public access, but this is prepared for future auth restrictions
ALTER TABLE feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_xlsx ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_csv ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_consolidados ENABLE ROW LEVEL SECURITY;

-- Create policies (Adjust 'anon' to 'authenticated' if you implement login)
CREATE POLICY "Public Access Feriados" ON feriados FOR ALL USING (true);
CREATE POLICY "Public Access Imports" ON imports FOR ALL USING (true);
CREATE POLICY "Public Access Raw XLSX" ON raw_xlsx FOR ALL USING (true);
CREATE POLICY "Public Access Raw CSV" ON raw_csv FOR ALL USING (true);


-- 7. Tabela de Configurações de SLA (Substitui o localStorage)
-- Armazena as METAS de horas para cada fase.
CREATE TABLE IF NOT EXISTS sla_config (
    id SERIAL PRIMARY KEY,
    sla_picking INTEGER DEFAULT 24,
    sla_packing INTEGER DEFAULT 24,
    sla_disponivel INTEGER DEFAULT 48,
    sla_faturado INTEGER DEFAULT 48,
    sla_despachado INTEGER DEFAULT 96,
    sla_entregue INTEGER DEFAULT 120,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inicializa com valor padrão se não existir
INSERT INTO sla_config (id, sla_picking, sla_packing, sla_disponivel, sla_faturado, sla_despachado, sla_entregue)
SELECT 1, 24, 24, 48, 48, 96, 120
WHERE NOT EXISTS (SELECT 1 FROM sla_config WHERE id = 1);

CREATE POLICY "Public Access SLA Config" ON sla_config FOR ALL USING (true);
ALTER TABLE sla_config ENABLE ROW LEVEL SECURITY;


-- 8. Alterações na tabela de Pedidos para armazenar as MÉTRICAS REAIS de execução
-- Adiciona colunas para salvar quantas horas úteis cada fase levou de fato.
-- Isso permite fazer relatórios de "Média de tempo de Picking", etc.
ALTER TABLE pedidos_consolidados 
ADD COLUMN IF NOT EXISTS horas_picking FLOAT,
ADD COLUMN IF NOT EXISTS horas_packing FLOAT,
ADD COLUMN IF NOT EXISTS horas_disponivel FLOAT,
ADD COLUMN IF NOT EXISTS horas_transporte FLOAT,
ADD COLUMN IF NOT EXISTS horas_faturado FLOAT;

-- 9. Tabela de Overrides de Status (Devolução, Cancelado Manualmente, etc)
CREATE TABLE IF NOT EXISTS order_overrides (
    pedido_id_interno TEXT PRIMARY KEY,
    status_manual TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for Overrides
ALTER TABLE order_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Overrides" ON order_overrides FOR ALL USING (true);

