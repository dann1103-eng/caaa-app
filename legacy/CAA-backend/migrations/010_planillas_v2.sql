-- Planillas v2: configuración fiscal editable (tabla oficial El Salvador),
-- costo patronal, snapshot al sellar, firma de recibo y anulación de periodos.
-- Aditiva e idempotente.

-- ── 1. Configuración fiscal (versionable por vigente_desde) ───────────────
CREATE TABLE IF NOT EXISTS config_fiscal (
  id                 SERIAL PRIMARY KEY,
  vigente_desde      DATE NOT NULL UNIQUE,
  isss_empleado_rate NUMERIC(6,4)  NOT NULL DEFAULT 0.0300,
  isss_patrono_rate  NUMERIC(6,4)  NOT NULL DEFAULT 0.0750,
  isss_tope_usd      NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
  afp_empleado_rate  NUMERIC(6,4)  NOT NULL DEFAULT 0.0725,
  afp_patrono_rate   NUMERIC(6,4)  NOT NULL DEFAULT 0.0875,
  afp_tope_usd       NUMERIC(10,2),                 -- NULL = sin tope
  isr_tramos_json    JSONB NOT NULL,
  servicios_isr_rate NUMERIC(6,4)  NOT NULL DEFAULT 0.1000,
  notas              TEXT,
  creado_en          TIMESTAMP NOT NULL DEFAULT now(),
  creado_por         INTEGER
);

-- Seed: tabla de retención mensual oficial de El Salvador.
INSERT INTO config_fiscal
  (vigente_desde, isss_empleado_rate, isss_patrono_rate, isss_tope_usd,
   afp_empleado_rate, afp_patrono_rate, afp_tope_usd,
   isr_tramos_json, servicios_isr_rate, notas)
SELECT
  '2024-01-01', 0.0300, 0.0750, 1000.00,
  0.0725, 0.0875, NULL,
  '[
     {"from":0,      "to":472.00,  "rate":0.00, "fixed":0.00,   "baseSubtract":0},
     {"from":472.01, "to":895.24,  "rate":0.10, "fixed":17.67,  "baseSubtract":472.00},
     {"from":895.25, "to":2038.10, "rate":0.20, "fixed":60.00,  "baseSubtract":895.24},
     {"from":2038.11,"to":null,    "rate":0.30, "fixed":288.57, "baseSubtract":2038.10}
   ]'::jsonb,
  0.1000,
  'Tabla de retención mensual El Salvador (Min. Hacienda). ISR sobre base = bruto - ISSS - AFP.'
WHERE NOT EXISTS (SELECT 1 FROM config_fiscal);

-- ── 2. nomina_periodo: mes/año, snapshot, anulación ───────────────────────
ALTER TABLE nomina_periodo ADD COLUMN IF NOT EXISTS anio             INTEGER;
ALTER TABLE nomina_periodo ADD COLUMN IF NOT EXISTS mes              INTEGER;
ALTER TABLE nomina_periodo ADD COLUMN IF NOT EXISTS config_snapshot  JSONB;
ALTER TABLE nomina_periodo ADD COLUMN IF NOT EXISTS fecha_anulacion  TIMESTAMP;
ALTER TABLE nomina_periodo ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
ALTER TABLE nomina_periodo ADD COLUMN IF NOT EXISTS anulado_por      INTEGER;

-- Completar anio/mes de periodos existentes a partir de periodo_inicio.
UPDATE nomina_periodo
   SET anio = EXTRACT(YEAR  FROM periodo_inicio)::int,
       mes  = EXTRACT(MONTH FROM periodo_inicio)::int
 WHERE anio IS NULL OR mes IS NULL;

-- Ampliar el CHECK de estado para incluir ANULADA.
ALTER TABLE nomina_periodo DROP CONSTRAINT IF EXISTS nomina_periodo_estado_check;
ALTER TABLE nomina_periodo ADD  CONSTRAINT nomina_periodo_estado_check
  CHECK (estado IN ('BORRADOR','APROBADA','PAGADA','ANULADA'));

-- ── 3. nomina_detalle: costo patronal, snapshot y firma ───────────────────
ALTER TABLE nomina_detalle ADD COLUMN IF NOT EXISTS isss_patrono   NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE nomina_detalle ADD COLUMN IF NOT EXISTS afp_patrono    NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE nomina_detalle ADD COLUMN IF NOT EXISTS costo_patronal NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE nomina_detalle ADD COLUMN IF NOT EXISTS user_snapshot  JSONB;
ALTER TABLE nomina_detalle ADD COLUMN IF NOT EXISTS firmado_en     TIMESTAMP;
ALTER TABLE nomina_detalle ADD COLUMN IF NOT EXISTS firmado_ip     VARCHAR(64);
