-- =============================================================================
-- Migración 003: Modalidades de pago para instructores
--
-- La escuela paga a sus instructores de dos formas distintas:
--   1. Salario mensual fijo (algunos staff).
--   2. Por hora — separada en hora de instrucción de vuelo y hora teórica
--      (cada una puede tener tarifa diferente).
--   3. Mixto: salario fijo + horas extra de vuelo/teoría.
--
-- Esta migración:
--   * Agrega tipo_pago + campos relacionados a instructor_tarifa.
--   * Agrega columnas a nomina_detalle para reflejar el desglose.
-- =============================================================================

BEGIN;

-- ── instructor_tarifa ────────────────────────────────────────────────
ALTER TABLE instructor_tarifa
  ADD COLUMN IF NOT EXISTS tipo_pago             VARCHAR(20) NOT NULL DEFAULT 'POR_HORA'
    CHECK (tipo_pago IN ('MENSUAL_FIJO','POR_HORA','MIXTO')),
  ADD COLUMN IF NOT EXISTS salario_mensual_fijo  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_hora_vuelo     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_hora_teoria    NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Migrar datos legacy: si tarifa_hora_usd > 0, copiar a tarifa_hora_vuelo
UPDATE instructor_tarifa
   SET tarifa_hora_vuelo = tarifa_hora_usd
 WHERE tarifa_hora_vuelo = 0 AND tarifa_hora_usd > 0;

-- ── nomina_detalle ───────────────────────────────────────────────────
ALTER TABLE nomina_detalle
  ADD COLUMN IF NOT EXISTS tipo_pago           VARCHAR(20) DEFAULT 'POR_HORA',
  ADD COLUMN IF NOT EXISTS horas_teoricas      NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_hora_teoria  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_vuelo         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_teorico       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario_mensual     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observaciones       TEXT;

COMMIT;
