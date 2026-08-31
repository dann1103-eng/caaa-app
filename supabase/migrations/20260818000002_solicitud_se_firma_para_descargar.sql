-- La descarga ocurre al FIRMAR la solicitud, no al crearla.
--
-- Dinámica real de la OMA (Daniel, 2026-08-18): "llenan una requisición para
-- especificar por encima lo que necesitan y con eso se crea la solicitud, y
-- cuando firma la solicitud se hace la descarga".
--
-- Antes la solicitud descontaba al crearse y había que crearla a mano. Ahora:
--   requisición (lo que se necesita, aproximado)
--      └─ genera la solicitud, que nace SIN FIRMAR y no toca existencia
--            └─ bodega ajusta lo que de verdad entrega y FIRMA → ahí descarga
BEGIN;

ALTER TABLE taller_documento_inventario
  ADD COLUMN IF NOT EXISTS firmada_en  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS firmada_por INTEGER NULL REFERENCES usuario(id_usuario);

COMMENT ON COLUMN taller_documento_inventario.firmada_en IS
  'Cuándo se firmó la entrega. Una SALIDA sin firmar NO descuenta existencia: es la solicitud armada esperando que bodega la entregue.';

-- Todo lo histórico ya movió existencia (viene del Excel y de los documentos que
-- se crearon con el modelo anterior). Se marca como firmado para que el stock no
-- cambie ni un gramo con esta migración.
UPDATE taller_documento_inventario
   SET firmada_en = COALESCE(firmada_en, creado_en, NOW())
 WHERE firmada_en IS NULL
   AND tipo <> 'REQUISICION';

CREATE INDEX IF NOT EXISTS idx_doc_sin_firmar
  ON taller_documento_inventario(tipo, estado)
  WHERE firmada_en IS NULL;

COMMIT;
