-- =============================================================================
-- Vouchera de simulador: el instructor cobra un número de horas independiente
-- de la lectura de Hobbs (que en un simulador es solo referencia de uso, no
-- determina el cargo). 100% aditivo.
-- =============================================================================

BEGIN;

ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS horas_cobrar NUMERIC(10,2);

COMMIT;

-- Verificación
SELECT column_name FROM information_schema.columns
WHERE table_name = 'reporte_vuelo' AND column_name = 'horas_cobrar';
