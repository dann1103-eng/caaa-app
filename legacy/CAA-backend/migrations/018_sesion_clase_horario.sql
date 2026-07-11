-- =============================================================================
-- Migración 018: horario de las sesiones de clase (instructor de teoría).
--
-- Las sesiones de clase pasan a ser "citas" con hora (como los vuelos, pero para
-- ir a clase): el instructor de teoría agenda fecha + hora, y el alumno las ve
-- como "Próximas clases" en su dashboard. Aditivo (nullable para compat con las
-- sesiones ya existentes que solo tienen fecha).
-- =============================================================================

BEGIN;

ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS hora_inicio TIME NULL;
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS hora_fin    TIME NULL;

COMMIT;

-- Verificación
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'sesion_clase' AND column_name IN ('hora_inicio','hora_fin');
