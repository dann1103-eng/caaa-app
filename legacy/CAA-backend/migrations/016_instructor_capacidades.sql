-- =============================================================================
-- Migración 016: capacidades del instructor.
--
-- Dos tipos de instructor (un usuario puede ser ambos) + toggle de programación:
--   es_instructor_vuelo:  gestiona vuelos/solicitudes de sus alumnos (lo actual).
--   es_instructor_teoria: gestiona el Aula Virtual (unidades, sesiones, notas).
--   puede_programar:      le habilita las funciones del rol PROGRAMACION
--                         (calendario completo, mover vuelos, publicar semana).
--
-- es_instructor_teoria se AGREGA con DEFAULT TRUE (Postgres rellena a TRUE todas
-- las filas existentes) y LUEGO se baja el default a FALSE: así los instructores
-- EXISTENTES conservan ambas superficies (cero cambio de comportamiento al
-- desplegar; los flags se apagan por persona desde Usuarios) y los NUEVOS nacen
-- solo como instructores de vuelo salvo que se marque lo contrario. No hace
-- falta UPDATE: el backfill del ADD COLUMN ya deja a los existentes en TRUE.
-- =============================================================================

BEGIN;

ALTER TABLE instructor ADD COLUMN IF NOT EXISTS es_instructor_vuelo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE instructor ADD COLUMN IF NOT EXISTS es_instructor_teoria BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE instructor ALTER COLUMN es_instructor_teoria SET DEFAULT FALSE;

ALTER TABLE instructor ADD COLUMN IF NOT EXISTS puede_programar BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- Verificación
SELECT id_instructor, id_usuario, activo,
       es_instructor_vuelo, es_instructor_teoria, puede_programar
FROM instructor
ORDER BY id_instructor;
