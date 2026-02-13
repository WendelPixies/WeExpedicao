ALTER TABLE order_overrides
ADD COLUMN IF NOT EXISTS resolution TEXT;

-- Optional: Add check constraint if we want to restrict values, but flexible is usually better for now
-- ALTER TABLE order_overrides ADD CONSTRAINT check_resolution CHECK (resolution IN ('Cancelar', 'Reentrega'));
