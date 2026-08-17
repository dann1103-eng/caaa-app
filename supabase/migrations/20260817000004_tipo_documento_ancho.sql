-- =============================================================================
-- Migración 20260817000004 · `tipo` necesita más de 10 caracteres
--
-- La columna nació como VARCHAR(10) cuando los tipos eran ENTRADA, SALIDA y
-- AJUSTE. 'REQUISICION' tiene 11 y reventaba con 22001 (value too long).
-- Lo detectó la prueba E2E de la Fase 1 al crear la primera requisición.
-- =============================================================================

BEGIN;

ALTER TABLE taller_documento_inventario
  ALTER COLUMN tipo TYPE VARCHAR(20);

COMMIT;
