-- Tabela de Motoristas
-- Usada para cadastro de nome + celular, para envio de mensagens (WhatsApp via n8n)
-- sobre rotas atrasadas.

CREATE TABLE IF NOT EXISTS motoristas (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    celular TEXT NOT NULL, -- Somente dígitos (DDD + número, opcionalmente com DDI 55)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE motoristas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Motoristas" ON motoristas;
CREATE POLICY "Public Access Motoristas" ON motoristas FOR ALL USING (true);
