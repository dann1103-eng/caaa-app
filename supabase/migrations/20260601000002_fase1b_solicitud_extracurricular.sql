-- Fase 1B — Agendamiento de vuelos extracurriculares
--
-- (a) Corrige deriva: el código de agendar/publicar inserta y lee columnas en
--     solicitud_vuelo que no existían en Supabase (las 15 filas actuales se
--     sembraron por SQL directo, sin pasar por el controlador). Sin esto, un
--     alumno que guarda una solicitud desde la app falla con "column does not exist".
-- (b) Agrega es_extracurricular para marcar la práctica extra.
--
-- Aditivo y reejecutable.

ALTER TABLE solicitud_vuelo
  ADD COLUMN IF NOT EXISTS tipo_vuelo         VARCHAR(20) DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS id_bloque_fin      INTEGER,
  ADD COLUMN IF NOT EXISTS id_instructor      INTEGER,
  ADD COLUMN IF NOT EXISTS estado             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS es_extracurricular BOOLEAN NOT NULL DEFAULT FALSE;

-- Verificación
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='solicitud_vuelo'
ORDER BY ordinal_position;
