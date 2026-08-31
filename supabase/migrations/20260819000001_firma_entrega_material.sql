-- Firma dibujada de quien entrega el material.
--
-- Pedido de Daniel (2026-08-19): "al firmar la entrega de materiales también
-- debe haber una firma manual de quien entrega". Es el mismo criterio de la
-- orden de trabajo: el papel se imprime ya firmado.
--
-- La solicitud CAAA-004-F lleva las dos partes —quien entrega y quien recibe—
-- así que se guardan las dos.
BEGIN;

ALTER TABLE taller_documento_inventario
  ADD COLUMN IF NOT EXISTS firma_entrega TEXT,
  ADD COLUMN IF NOT EXISTS firma_recibe  TEXT;

COMMENT ON COLUMN taller_documento_inventario.firma_entrega IS
  'Firma dibujada de bodega al entregar (data URL PNG). Va impresa en la solicitud CAAA-004-F.';

COMMIT;
