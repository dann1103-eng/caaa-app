-- =============================================================================
-- Migración 20260817000003 · La unicidad del documento pasa al correlativo
--
-- El UNIQUE original era (tipo, anio, numero). Con la Fase 1 eso rompe:
--
--   · Los 243 documentos históricos son tipo SALIDA con correlativo
--     REQ-001-2026 … REQ-244-2026 (eran requisición y salida a la vez).
--   · Una solicitud nueva SOL-001-2026 es tipo SALIDA, año 2026, número 1
--     → choca con REQ-001-2026 aunque el papel diga otra cosa.
--
-- La serie de verdad la define el PREFIJO, no el tipo: REQ, SOL, RET, FA, AJ.
-- Así que la unicidad va sobre el correlativo, que es el número que la gente
-- lee y escribe. De paso queda imposible que existan dos papeles rotulados
-- igual, que era el riesgo original.
--
-- Spec: docs/superpowers/specs/2026-08-17-solicitud-almacen-sobrantes-design.md
-- =============================================================================

BEGIN;

ALTER TABLE taller_documento_inventario
  DROP CONSTRAINT IF EXISTS uq_taller_doc_correlativo;

ALTER TABLE taller_documento_inventario
  ADD CONSTRAINT uq_taller_doc_correlativo UNIQUE (correlativo);

COMMENT ON COLUMN taller_documento_inventario.correlativo IS
  'Único en todo el sistema. La serie la define el prefijo (FA compras, REQ requisiciones, SOL solicitudes, RET retornos, AJ ajustes) y reinicia cada año. Los 243 históricos llevan prefijo REQ porque en el Excel la requisición y la salida eran el mismo papel.';

COMMIT;
