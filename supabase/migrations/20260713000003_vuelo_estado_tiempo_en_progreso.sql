-- Deriva de esquema: vuelo_estado_check ya permite EN_PROGRESO (migración 009,
-- ver CLAUDE.md sección 6) pero la tabla hermana vuelo_estado_tiempo (bitácora
-- de cambios de estado) NUNCA se actualizó — su CHECK solo permitía el nombre
-- viejo EN_VUELO. Efecto real en producción (confirmado en logs de Railway,
-- vuelo #251, 2026-07-13): CADA transición SALIDA_HANGAR→EN_PROGRESO (botón
-- "avanzar" de Turno e Instructor, y el job de auto-avance en server.js) falla
-- con "violates check constraint vuelo_estado_tiempo_estado_check" y hace
-- ROLLBACK de toda la transacción — el vuelo nunca avanza y el usuario ve un
-- error genérico. Se ensancha el CHECK (no es aditivo puro, pero sigue el
-- mismo patrón ya usado y autorizado en la migración 009).
ALTER TABLE vuelo_estado_tiempo DROP CONSTRAINT IF EXISTS vuelo_estado_tiempo_estado_check;
ALTER TABLE vuelo_estado_tiempo ADD CONSTRAINT vuelo_estado_tiempo_estado_check
  CHECK (estado IN ('PROGRAMADO','SALIDA_HANGAR','EN_VUELO','EN_PROGRESO','REGRESO_HANGAR','COMPLETADO','CANCELADO','FINALIZANDO'));
