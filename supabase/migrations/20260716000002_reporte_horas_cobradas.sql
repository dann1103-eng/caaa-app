-- =============================================================================
-- reporte_vuelo.horas_cobradas — las horas que el instructor decide cobrar.
--
-- CONTEXTO (sesión 2026-07-16): hasta ahora el cobro salía del tacómetro
-- (tacometro_llegada - tacometro_salida). Pero al cobrarle al alumno se hacen
-- estimaciones subjetivas que no coinciden con el TAC, así que el instructor
-- necesita digitar aparte cuántas horas se cobran. Ese número es el que dispara
-- el débito: horas_cobradas × tarifa_hora_usd del avión → se debita del saldo.
--
-- Qué queda alimentado por qué (decisión de Daniel, 2026-07-16):
--   * Horas del AVIÓN (aeronave.horas_acumuladas, que dispara los mantenimientos
--     50/100h)      → siguen saliendo del TAC. El motor corrió lo que corrió.
--   * Horas de LICENCIA del alumno (alumno.horas_acumuladas)
--                   → pasan a salir de horas_cobradas. Daniel eligió que al alumno
--                     se le acredite exactamente lo que se le cobra.
--   * El COBRO      → horas_cobradas.
--
-- Nullable a propósito: los reportes viejos no la tienen, y una inasistencia no
-- cobra nada. Cuando viene NULL, el backend cae al TAC (comportamiento anterior),
-- así que ningún reporte queda sin cobrar por este cambio.
--
-- NUMERIC(5,2) = hasta 999.99 h, consistente con movimiento_cuenta.cantidad_horas.
-- =============================================================================

ALTER TABLE reporte_vuelo
  ADD COLUMN IF NOT EXISTS horas_cobradas NUMERIC(5,2);

COMMENT ON COLUMN reporte_vuelo.horas_cobradas IS
  'Horas que el instructor decide cobrar, independientes del TAC/Hobbs. Disparan el débito al saldo del alumno (horas x tarifa) y le suman a sus horas de licencia. Si es NULL se cae al TAC.';

-- Verificación
SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'reporte_vuelo' AND column_name = 'horas_cobradas';
