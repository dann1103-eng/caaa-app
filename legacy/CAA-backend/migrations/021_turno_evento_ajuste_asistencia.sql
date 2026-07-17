-- Turno necesita poder agregar o dar salida a un instructor puntual DESPUÉS de
-- abierto el turno (llegó tarde, se retira antes, o se reemplaza a alguien),
-- sin tener que forzar un "cambio de turno" completo (que cierra a TODA la
-- mañana y exige elegir la tarde). Se amplía el CHECK de turno_evento para
-- registrar ese ajuste puntual en la bitácora.
ALTER TABLE turno_evento DROP CONSTRAINT IF EXISTS turno_evento_tipo_check;

ALTER TABLE turno_evento ADD CONSTRAINT turno_evento_tipo_check CHECK (
  tipo IN ('APERTURA', 'PAUSA', 'REANUDACION', 'CAMBIO_TURNO', 'CIERRE', 'AJUSTE_ASISTENCIA')
);
