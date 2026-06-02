-- =============================================================================
-- Migración 006: Planilla dual (Planta / Servicios profesionales) + deducciones
--
-- La escuela emite DOS tipos de planilla:
--   1. PLANTA (mensual fijo): se deducen ISR (por tramos de Hacienda),
--      ISSS (3%, tope $30) y AFP (6.25%).
--   2. SERVICIOS profesionales: sólo retención del 10% sobre el bruto.
--
-- Cada persona se marca con un selector booleano (es_servicios_profesionales)
-- que decide en cuál planilla entra. Aplica a instructores Y a personal
-- administrativo de planta (tabla `empleado`, nueva).
--
-- Todo aditivo salvo la relajación de NOT NULL en nomina_detalle.id_instructor
-- (necesaria para permitir detalles de empleados no-instructores). No destructivo.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Personal administrativo de planta (no instructor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empleado (
  id                          SERIAL PRIMARY KEY,
  nombre                      VARCHAR(160) NOT NULL,
  dui                         VARCHAR(20)  NULL,
  nit                         VARCHAR(25)  NULL,
  isss_num                    VARCHAR(25)  NULL,
  afp_num                     VARCHAR(25)  NULL,
  cargo                       VARCHAR(120) NULL,
  sueldo_base                 NUMERIC(10,2) NOT NULL DEFAULT 0,
  es_servicios_profesionales  BOOLEAN NOT NULL DEFAULT FALSE,
  activo                      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en                   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Flag de tipo de planilla en instructores
--    (la mayoría de instructores cobra por servicio → default TRUE)
-- ---------------------------------------------------------------------------
ALTER TABLE instructor_tarifa
  ADD COLUMN IF NOT EXISTS es_servicios_profesionales BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- 3. Tipo de planilla en el periodo de nómina
-- ---------------------------------------------------------------------------
ALTER TABLE nomina_periodo
  ADD COLUMN IF NOT EXISTS tipo_planilla VARCHAR(20) NOT NULL DEFAULT 'SERVICIOS'
    CHECK (tipo_planilla IN ('PLANTA','SERVICIOS'));

-- ---------------------------------------------------------------------------
-- 4. Detalle de nómina: soportar empleados + columnas de deducción
-- ---------------------------------------------------------------------------
-- Permitir detalles de empleados (no-instructor)
ALTER TABLE nomina_detalle ALTER COLUMN id_instructor DROP NOT NULL;

ALTER TABLE nomina_detalle
  ADD COLUMN IF NOT EXISTS id_empleado  INTEGER NULL REFERENCES empleado(id),
  ADD COLUMN IF NOT EXISTS bruto        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isr          NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isss         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS afp          NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion    NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMIT;
