-- Firma dibujada a mano en la orden de trabajo, como la vouchera del alumno.
--
-- Pedido de Daniel (2026-08-18): "el mecánico debe poder firmar manualmente como
-- lo hacen los alumnos cuando en operaciones firman la vouchera, además el jefe
-- debe poder editar la descripción y también firmar manualmente para imprimirlo
-- de una vez con la firma".
--
-- Mismo mecanismo que `reporte_vuelo.firma_alumno` / `firma_instructor`: el PNG
-- del canvas guardado como data URL.
BEGIN;

ALTER TABLE orden_trabajo
  ADD COLUMN IF NOT EXISTS firma_mecanico TEXT,
  ADD COLUMN IF NOT EXISTS firma_jefe     TEXT;

COMMENT ON COLUMN orden_trabajo.firma_mecanico IS
  'Firma dibujada del mecánico al terminar el trabajo (data URL PNG). Va impresa en la orden junto a su licencia TMA.';
COMMENT ON COLUMN orden_trabajo.firma_jefe IS
  'Firma dibujada del jefe de taller al aprobar. Es la que respalda la revisión.';

COMMIT;
