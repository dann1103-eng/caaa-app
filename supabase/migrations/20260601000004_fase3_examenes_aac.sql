-- Fase 3 (incremento 1) — Exámenes internos vs autoridad (AAC) y "listo para comité"
--
-- - evaluacion.origen: 'INTERNO' (examen de la escuela) o 'AAC' (chequeo de la
--   autoridad de aviación civil). El alumno ve ambos por separado.
-- - inscripcion_curso.listo_para_comite: se marca cuando el alumno aprueba el
--   examen FINAL interno de su curso (habilita solicitar comité con la AAC).
--
-- Aditivo y reejecutable.

ALTER TABLE evaluacion
  ADD COLUMN IF NOT EXISTS origen VARCHAR(10) NOT NULL DEFAULT 'INTERNO';

ALTER TABLE evaluacion DROP CONSTRAINT IF EXISTS evaluacion_origen_check;
ALTER TABLE evaluacion
  ADD CONSTRAINT evaluacion_origen_check CHECK (origen IN ('INTERNO', 'AAC'));

ALTER TABLE inscripcion_curso
  ADD COLUMN IF NOT EXISTS listo_para_comite   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_listo_comite  TIMESTAMP NULL;

-- Verificación
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='evaluacion' AND column_name='origen') AS evaluacion_origen,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='inscripcion_curso' AND column_name='listo_para_comite') AS listo_comite;
