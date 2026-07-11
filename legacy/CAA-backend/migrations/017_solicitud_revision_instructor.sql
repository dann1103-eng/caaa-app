-- =============================================================================
-- Migración 017: revisión del instructor + comentario del alumno.
--
-- Nuevo flujo de agenda: alumno solicita → su instructor de vuelo revisa/edita
-- y ENVÍA a programación → programación audita y publica.
--
--   comentario_alumno:     nota libre del alumno para su instructor al guardar
--                          (p.ej. "tengo disponible también el jueves 10am").
--   enviada_instructor_en: timestamp en que el instructor envió el basket a
--                          programación (estado pasa a EN_REVISION).
--   enviada_por:           id_usuario del instructor que envió.
--
-- El estado EN_REVISION ya existía en el CHECK pero NO se usaba; ahora significa
-- "enviada a programación por el instructor" (candadea al alumno, que solo edita
-- en BORRADOR/RECHAZADA). El CHECK vivo en Supabase solo permitía
-- BORRADOR/EN_REVISION/PUBLICADO, pero el código ya escribía RECHAZADA/CANCELADA
-- → se recrea el constraint para incluirlos (canonicalización).
-- =============================================================================

BEGIN;

ALTER TABLE solicitud_semana ADD COLUMN IF NOT EXISTS comentario_alumno     TEXT;
ALTER TABLE solicitud_semana ADD COLUMN IF NOT EXISTS enviada_instructor_en TIMESTAMP;
ALTER TABLE solicitud_semana ADD COLUMN IF NOT EXISTS enviada_por           INTEGER;

ALTER TABLE solicitud_semana DROP CONSTRAINT IF EXISTS solicitud_semana_estado_check;
ALTER TABLE solicitud_semana ADD CONSTRAINT solicitud_semana_estado_check
  CHECK (estado IN ('BORRADOR','EN_REVISION','PUBLICADO','RECHAZADA','CANCELADA'));

COMMIT;

-- Verificación
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'solicitud_semana'::regclass AND conname = 'solicitud_semana_estado_check';
