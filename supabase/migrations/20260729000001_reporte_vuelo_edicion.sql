-- Auditoría de corrección de vouchera ya firmada (instructor edita antes de que
-- el alumno firme). Mismo patrón que movimiento_cuenta.editado_en/editado_por/
-- motivo_edicion (cuentaController.editarMovimiento).
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS editado_en timestamp without time zone;
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS editado_por integer;
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS motivo_edicion text;
