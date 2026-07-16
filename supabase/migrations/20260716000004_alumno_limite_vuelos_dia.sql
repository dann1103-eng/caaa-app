-- =============================================================================
-- alumno.limite_vuelos_dia — cuántos AVIONES puede pedir el alumno en un MISMO día.
--
-- CONTEXTO (sesión 2026-07-16): hasta ahora el tope era la constante `1`
-- hardcodeada en agendarController.js ("Solo puedes agendar 1 avión por día") y
-- su espejo en AgendarVuelo.jsx. Pero hay alumnos a los que la escuela SÍ les
-- permite volar más de una vez el mismo día, y no había forma de configurarlo:
-- el instructor ya gestiona los límites SEMANALES (limite_vuelos_avion /
-- limite_vuelos_simulador) pero no tenía equivalente por día.
--
-- DEFAULT 1 = el comportamiento actual, exacto. Nadie cambia de conducta al
-- correr esta migración; solo se vuelve configurable lo que antes era constante.
--
-- Semántica (igual que los límites semanales):
--   * Cuenta solo AVIONES. Los simuladores están exentos del tope por día
--     (ya lo estaban: el contador avionesPorDia solo suma no-SIMULADOR).
--   * Los vuelos EXTRACURRICULARES están exentos (el loop hace `continue`).
--   * Nullable + fallback `?? 1` en el backend, como los otros dos límites
--     (que usan `?? 3`), para no depender de que el default llegue a filas viejas.
--
-- Por qué NO se agrega también a solicitud_semana (como sí tienen los semanales,
-- que admiten un override de una semana vía habilitarVueloExtra): Daniel pidió
-- que el instructor lo gestione "así como configuran los vuelos por semana", es
-- decir el límite BASE del alumno. Un override por semana se puede agregar
-- después con el mismo patrón de precedencia (solicitud_semana -> alumno -> 1)
-- si hace falta; hoy sería una columna sin UI.
-- =============================================================================

ALTER TABLE public.alumno
  ADD COLUMN IF NOT EXISTS limite_vuelos_dia integer DEFAULT 1;

COMMENT ON COLUMN public.alumno.limite_vuelos_dia IS
  'Máximo de aviones que el alumno puede solicitar en un mismo día. NULL => 1. No aplica a simuladores ni a vuelos extracurriculares. Lo edita el instructor junto con los límites semanales.';

-- Verificación
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'alumno' AND column_name = 'limite_vuelos_dia';
