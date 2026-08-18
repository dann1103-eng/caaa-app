-- Cola de trabajo del Taller, asignación, revisión del jefe y estimado de finalización.
-- Spec: docs/superpowers/specs/2026-08-18-cola-de-trabajo-y-revision-del-jefe-design.md
--
-- Tres cosas:
--   1. La orden de trabajo gana ASIGNACIÓN (quién la trabaja) y REVISIÓN (la firma
--      del jefe), y su ciclo pasa de ABIERTA→CERRADA a ABIERTA→FIRMADA→APROBADA.
--   2. El mantenimiento guarda el ESTIMADO del Taller: su fecha manda sobre la que
--      puso Operaciones, y se conserva la original para poder explicar el cambio.
--   3. La cola NO es tabla nueva: sale de cruzar mantenimiento con sus órdenes.
BEGIN;

-- ── 1. Orden de trabajo: asignación y revisión ────────────────────────────────
ALTER TABLE orden_trabajo
  -- Quién la está trabajando. DISTINTO de id_mecanico, que es quien FIRMA y se
  -- llena al terminar: un trabajo asignado todavía no tiene firmante.
  ADD COLUMN IF NOT EXISTS id_mecanico_asignado INTEGER NULL REFERENCES usuario(id_usuario),
  ADD COLUMN IF NOT EXISTS asignado_en          TIMESTAMP,
  -- La firma del jefe que revisa.
  ADD COLUMN IF NOT EXISTS id_aprobador         INTEGER NULL REFERENCES usuario(id_usuario),
  ADD COLUMN IF NOT EXISTS fecha_aprobacion     DATE,
  ADD COLUMN IF NOT EXISTS aprobado_en          TIMESTAMP,
  -- Ejecutor y aprobador son la misma persona: se permite, pero se ve.
  ADD COLUMN IF NOT EXISTS aprobacion_propia    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Por qué el jefe la devolvió al mecánico.
  ADD COLUMN IF NOT EXISTS nota_revision        TEXT,
  ADD COLUMN IF NOT EXISTS devoluciones         INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ot_asignado ON orden_trabajo(id_mecanico_asignado)
  WHERE id_mecanico_asignado IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ot_mantenimiento ON orden_trabajo(id_mantenimiento)
  WHERE id_mantenimiento IS NOT NULL;

-- Estados nuevos. Se conserva 'CERRADA' en el CHECK por si algún camino viejo la
-- escribe, pero el flujo vivo es ABIERTA → FIRMADA → APROBADA.
ALTER TABLE orden_trabajo DROP CONSTRAINT IF EXISTS orden_trabajo_estado_check;
ALTER TABLE orden_trabajo ADD CONSTRAINT orden_trabajo_estado_check
  CHECK (estado IN ('ABIERTA','FIRMADA','APROBADA','CERRADA','ANULADA'));

-- El viejo ck_ot_cerrada solo miraba 'CERRADA'; ahora la exigencia es para
-- cualquier orden ya firmada.
ALTER TABLE orden_trabajo DROP CONSTRAINT IF EXISTS ck_ot_cerrada;
ALTER TABLE orden_trabajo ADD CONSTRAINT ck_ot_firmada
  CHECK (estado NOT IN ('FIRMADA','APROBADA','CERRADA')
         OR (id_mecanico IS NOT NULL AND fecha_firma IS NOT NULL));
ALTER TABLE orden_trabajo ADD CONSTRAINT ck_ot_aprobada
  CHECK (estado <> 'APROBADA'
         OR (id_aprobador IS NOT NULL AND fecha_aprobacion IS NOT NULL));

COMMENT ON COLUMN orden_trabajo.id_mecanico_asignado IS
  'Quién trabaja la orden. Distinto de id_mecanico (quien firma al terminar). Asignar no bloquea: varios mecánicos pueden trabajar el mismo avión.';
COMMENT ON COLUMN orden_trabajo.aprobacion_propia IS
  'El jefe aprobó una orden que él mismo firmó. Permitido en un taller chico, pero queda visible.';

-- ── 2. Mantenimiento: el estimado del Taller manda ────────────────────────────
-- El Taller escribe directo sobre fecha_fin (una sola fuente de verdad; todo lo
-- que ya lee esa fecha sigue funcionando). Lo que había dicho Operaciones se
-- guarda aparte para poder explicar por qué se cancelaron los vuelos.
ALTER TABLE mantenimiento_aeronave
  ADD COLUMN IF NOT EXISTS fecha_fin_original TIMESTAMP,
  ADD COLUMN IF NOT EXISTS estimado_por       INTEGER NULL REFERENCES usuario(id_usuario),
  ADD COLUMN IF NOT EXISTS estimado_en        TIMESTAMP,
  ADD COLUMN IF NOT EXISTS motivo_estimado    TEXT;

COMMENT ON COLUMN mantenimiento_aeronave.fecha_fin_original IS
  'Lo que puso Operaciones al iniciar. Se guarda la PRIMERA vez que el Taller mueve fecha_fin; si es NULL, nadie la movió.';

COMMIT;
