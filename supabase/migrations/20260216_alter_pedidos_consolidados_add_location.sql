ALTER TABLE public.pedidos_consolidados ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE public.pedidos_consolidados ADD COLUMN IF NOT EXISTS bairro TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_pedidos_consolidados_municipio ON public.pedidos_consolidados(municipio);
CREATE INDEX IF NOT EXISTS idx_pedidos_consolidados_bairro ON public.pedidos_consolidados(bairro);
