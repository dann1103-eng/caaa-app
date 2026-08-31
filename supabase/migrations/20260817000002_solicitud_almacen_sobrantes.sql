-- =============================================================================
-- Migración 20260817000002 · Solicitud al almacén, sobrantes y datos del papel
--
-- Fase 1 del papeleo del Taller. Convierte el único documento de salida en la
-- cadena real que usa la OMA:
--
--   REQUISICION  (borrador del técnico, NO mueve stock)
--        ↓ despachar
--   SALIDA       (la Solicitud al almacén CAAA-004-F, descarga el inventario)
--        ↓ sobrantes
--   RETORNO      (lo que vuelve, con su fecha real)
--
-- Spec: docs/superpowers/specs/2026-08-17-solicitud-almacen-sobrantes-design.md
--
-- Aditiva salvo el ensanche del CHECK de `tipo` (DROP + ADD), que solo agrega
-- valores permitidos. Autorizado por Daniel.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · Dos tipos de documento nuevos
--
-- REQUISICION no mueve stock: es el borrador que el técnico llena ANTES de ir
-- a bodega, cuando todavía no hay número de orden de trabajo.
-- RETORNO son los sobrantes del apartado "PARTES PARA RETORNAR AL ALMACEN".
-- ---------------------------------------------------------------------------
ALTER TABLE taller_documento_inventario DROP CONSTRAINT IF EXISTS taller_documento_inventario_tipo_check;
ALTER TABLE taller_documento_inventario
  ADD CONSTRAINT taller_documento_inventario_tipo_check
  CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE','REQUISICION','RETORNO'));

-- ---------------------------------------------------------------------------
-- 2 · Encadenado entre documentos
-- ---------------------------------------------------------------------------
ALTER TABLE taller_documento_inventario
  ADD COLUMN IF NOT EXISTS id_requisicion       INTEGER NULL REFERENCES taller_documento_inventario(id_documento),
  ADD COLUMN IF NOT EXISTS id_solicitud_origen  INTEGER NULL REFERENCES taller_documento_inventario(id_documento);

COMMENT ON COLUMN taller_documento_inventario.id_requisicion IS
  'La requisición de la que nació esta solicitud. NULL cuando se despacha directo de mostrador (el aceite diario no lleva requisición).';
COMMENT ON COLUMN taller_documento_inventario.id_solicitud_origen IS
  'La solicitud cuyo sobrante vuelve. El retorno además imprime su correlativo.';

-- ---------------------------------------------------------------------------
-- 3 · Los datos que el papel pide y el sistema no tenía
-- ---------------------------------------------------------------------------
ALTER TABLE taller_documento_inventario
  ADD COLUMN IF NOT EXISTS orden_trabajo_no  VARCHAR(40),
  ADD COLUMN IF NOT EXISTS numero_solicitud  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tacometro         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cliente           VARCHAR(160),
  ADD COLUMN IF NOT EXISTS solicitante       VARCHAR(160),
  ADD COLUMN IF NOT EXISTS entregado_por     VARCHAR(160),
  ADD COLUMN IF NOT EXISTS entregado_a       VARCHAR(160),
  ADD COLUMN IF NOT EXISTS observaciones     TEXT;

COMMENT ON COLUMN taller_documento_inventario.orden_trabajo_no IS
  'N° de orden de trabajo (CAAA/2026-0049). Texto por ahora; en la Fase 2 pasa a ser enlace real a la OT. Opcional: el aceite diario no lleva OT.';
COMMENT ON COLUMN taller_documento_inventario.numero_solicitud IS
  'N° de solicitud del CAAA-004-F, que son los últimos dígitos de la orden de trabajo (0049).';
COMMENT ON COLUMN taller_documento_inventario.tacometro IS
  'Tacómetro del avión al momento del trabajo. En el papel se escribe a mano en tres formatos distintos; acá se teclea una vez y se hereda.';
COMMENT ON COLUMN taller_documento_inventario.entregado_a IS
  'A quién se le entrega el material. Texto libre a propósito: reciben instructores, mecánicos y gente que puede no tener usuario en el sistema.';
COMMENT ON COLUMN taller_documento_inventario.observaciones IS
  'El recuadro "Observaciones y Correcciones" de la requisición. Distinto de `motivo`, que es el trabajo en una línea.';

-- Un retorno, y solo un retorno, puede apuntar a una solicitud de origen.
ALTER TABLE taller_documento_inventario DROP CONSTRAINT IF EXISTS ck_taller_doc_retorno;
ALTER TABLE taller_documento_inventario
  ADD CONSTRAINT ck_taller_doc_retorno
  CHECK (id_solicitud_origen IS NULL OR tipo = 'RETORNO');

CREATE INDEX IF NOT EXISTS idx_taller_doc_requisicion ON taller_documento_inventario(id_requisicion);
CREATE INDEX IF NOT EXISTS idx_taller_doc_sol_origen  ON taller_documento_inventario(id_solicitud_origen);

-- ---------------------------------------------------------------------------
-- 4 · Corrección de datos: el aceite se mide en cuartos, no en unidades
--
-- El normalizador de la carga del Excel tomó la última unidad que veía, y ese
-- ítem estaba escrito como UN, QT, QTO y QTS. Sin esto la hoja de entrega de
-- aceites diría "8 UN" donde el cuaderno dice "8 Qts".
-- ---------------------------------------------------------------------------
UPDATE taller_repuesto SET unidad = 'QT'
 WHERE codigo IN ('000038','000039') AND unidad <> 'QT';

COMMIT;
