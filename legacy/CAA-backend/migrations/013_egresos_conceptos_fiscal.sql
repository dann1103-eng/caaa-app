-- =============================================================================
-- Migración 013: nuevas categorías de egreso + catálogo de conceptos de cobro
--                + datos fiscales en `usuario`.
--
-- (1) egreso: 3 categorías nuevas (gastos financieros, impuestos tributarios,
--     gastos no deducibles). DROP+ADD del CHECK (no aditivo, no destructivo).
-- (2) concepto_cobro: catálogo configurable de "tipos de cobro" con monto por
--     defecto (primero: reposición de examen $60). El cobro debita el saldo
--     prepagado del alumno (movimiento_cuenta), enlazado por id_concepto_cobro.
-- (3) usuario: dui, direccion, telefono (datos fiscales/generales, comunes a
--     alumnos e instructores). El resto es aditivo.
-- =============================================================================

BEGIN;

-- (1) Categorías de egreso ----------------------------------------------------
ALTER TABLE egreso DROP CONSTRAINT IF EXISTS egreso_categoria_check;
ALTER TABLE egreso
  ADD CONSTRAINT egreso_categoria_check
  CHECK (categoria IN (
    'COMBUSTIBLE','MANTENIMIENTO','REPUESTOS','NOMINA','HONORARIOS',
    'SUMINISTROS','PROVEEDOR','SERVICIOS','SERVICIOS_BASICOS','ALQUILER',
    'HANGAR','IMPUESTOS','SEGUROS','TASAS_AAC','PUBLICIDAD','VIATICOS',
    'CAPACITACION','BANCARIO',
    'GASTOS_FINANCIEROS','IMPUESTOS_TRIBUTARIOS','GASTOS_NO_DEDUCIBLES',
    'OTRO'
  ));

-- (2) Catálogo de conceptos de cobro -----------------------------------------
CREATE TABLE IF NOT EXISTS concepto_cobro (
  id           SERIAL PRIMARY KEY,
  codigo       VARCHAR(40) UNIQUE,
  nombre       VARCHAR(160) NOT NULL,
  monto_usd    NUMERIC(10,2) NOT NULL DEFAULT 0,
  descripcion  TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en    TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO concepto_cobro (codigo, nombre, monto_usd, descripcion)
SELECT 'REPOSICION_EXAMEN', 'Reposición de examen', 60.00,
       'Cobro al alumno que deja un examen y debe reponerlo'
WHERE NOT EXISTS (SELECT 1 FROM concepto_cobro WHERE codigo = 'REPOSICION_EXAMEN');

-- Enlace del movimiento de cuenta al concepto (para reportar ingresos por concepto).
ALTER TABLE movimiento_cuenta
  ADD COLUMN IF NOT EXISTS id_concepto_cobro INTEGER NULL REFERENCES concepto_cobro(id);

-- (3) Datos fiscales / generales en usuario ----------------------------------
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS telefono  VARCHAR(20);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS dui       VARCHAR(20);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS direccion TEXT;

-- Backfill del teléfono desde la ficha de alumno (donde ya existía).
UPDATE usuario u
SET telefono = a.telefono
FROM alumno a
WHERE a.id_usuario = u.id_usuario
  AND (u.telefono IS NULL OR u.telefono = '')
  AND a.telefono IS NOT NULL AND a.telefono <> '';

COMMIT;
