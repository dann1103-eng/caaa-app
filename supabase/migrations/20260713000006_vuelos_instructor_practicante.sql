-- ============================================================================
-- Vuelos instructor-con-instructor (CHEQUEO / REFRESH) + ficha espejo
-- Sesión 2026-07-13. Cambios ADITIVOS (ADD COLUMN IF NOT EXISTS + CHECK nuevo).
--
-- Modelo:
--  * El instructor que RECIBE instrucción (el "practicante") ocupa el slot de
--    estudiante con una fila `alumno` marcada es_practicante = true, ligada a su
--    mismo usuario (UNIQUE(id_usuario) ⇒ una sola por instructor).
--  * `vuelo.tipo_instruccion` gobierna el cobro:
--      NORMAL   → alumno real, cobro automático como siempre.
--      CHEQUEO  → la escuela paga: NO se debita a nadie.
--      REFRESH  → el practicante paga: NO se auto-debita (cobro manual de admin).
--    En ambos especiales SÍ se registran TAC/HOBBS, horas de aeronave y
--    mantenimiento, y el PIC (id_instructor) cobra la hora por nómina.
-- ============================================================================
BEGIN;

-- Ficha espejo: aísla al practicante del roster real de alumnos.
ALTER TABLE public.alumno
  ADD COLUMN IF NOT EXISTS es_practicante boolean NOT NULL DEFAULT false;

-- Tipo de instrucción del vuelo y de la solicitud de respaldo.
ALTER TABLE public.vuelo
  ADD COLUMN IF NOT EXISTS tipo_instruccion varchar(20) NOT NULL DEFAULT 'NORMAL';

ALTER TABLE public.solicitud_vuelo
  ADD COLUMN IF NOT EXISTS tipo_instruccion varchar(20) NOT NULL DEFAULT 'NORMAL';

-- CHECKs idempotentes (solo si no existen).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vuelo_tipo_instruccion_check') THEN
    ALTER TABLE public.vuelo
      ADD CONSTRAINT vuelo_tipo_instruccion_check
      CHECK (tipo_instruccion IN ('NORMAL', 'CHEQUEO', 'REFRESH'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitud_vuelo_tipo_instruccion_check') THEN
    ALTER TABLE public.solicitud_vuelo
      ADD CONSTRAINT solicitud_vuelo_tipo_instruccion_check
      CHECK (tipo_instruccion IN ('NORMAL', 'CHEQUEO', 'REFRESH'));
  END IF;
END $$;

COMMIT;
