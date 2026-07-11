-- =============================================================================
-- Fix de datos: licencia "Instructor" habilita TODAS las aeronaves.
--
-- Confirmado por Daniel (sesión 2026-07-11): los 4 alumnos con licencia
-- Instructor (id_licencia=6) vuelan cualquier aeronave de la flota, así que
-- licencia_aeronave debe tener las 5 filas (antes tenía 0 → no podían
-- solicitar ninguna aeronave).
--
-- Bimotor (id_licencia=5, 5 alumnos) queda SIN TOCAR a propósito: esos
-- alumnos vuelan bimotor en otras escuelas (la flota de CAAA no tiene
-- bimotor); Daniel todavía tiene que definir cómo se maneja eso en el
-- sistema (¿aeronave externa? ¿no aplica el chequeo de licencia_aeronave?).
-- No modelar nada de Bimotor sin esa aclaración.
-- =============================================================================

BEGIN;

INSERT INTO licencia_aeronave (id_licencia, id_aeronave)
SELECT 6, id_aeronave FROM aeronave
ON CONFLICT (id_licencia, id_aeronave) DO NOTHING;

COMMIT;

-- Verificación: 5 filas para Instructor.
SELECT l.nombre AS licencia, a.codigo
FROM licencia_aeronave la
JOIN licencia l ON l.id_licencia = la.id_licencia
JOIN aeronave a ON a.id_aeronave = la.id_aeronave
WHERE la.id_licencia = 6
ORDER BY a.codigo;
