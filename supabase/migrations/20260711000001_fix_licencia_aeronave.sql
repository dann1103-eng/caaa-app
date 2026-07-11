-- =============================================================================
-- Fix de datos: distribución correcta de aeronaves por licencia.
--
-- La tabla licencia_aeronave (usada para validar qué aeronaves puede solicitar
-- un alumno según su licencia, en agendarController.guardarSolicitud y en el
-- modal "Agendar" del calendario) tenía datos incorrectos: Privado tenía de más
-- (YS-127-P, YS-270-PE no le corresponden), Comercial le faltaban YS-333-PE y
-- YS-334-PE, e Instrumentos le faltaban YS-270-PE y SIM-1 — por eso a un alumno
-- de Instrumentos no le aparecía el YS-270-PE como opción al agendar.
--
-- Distribución correcta (confirmada por Daniel, sesión 2026-07-11):
--   Piloto Privado          → YS-333-PE, YS-334-PE, SIM-1
--   Habilitación Instrumentos → YS-333-PE, YS-334-PE, YS-270-PE, SIM-1
--   Piloto Comercial        → YS-333-PE, YS-334-PE, YS-270-PE, YS-127-P, SIM-1
--
-- Referencia de ids en esta BD: aeronave 1=YS-334-PE, 2=YS-333-PE, 3=YS-270-PE,
-- 4=YS-127-P, 5=SIM-1; licencia 1=Privado, 2=Comercial, 3=Instrumentos.
--
-- No toca las licencias Bimotor (5) ni Instructor (6): hoy no tienen ninguna
-- aeronave asignada en licencia_aeronave (la flota no tiene bimotor) — hay 5
-- alumnos con licencia Bimotor y 4 con Instructor que por lo tanto no pueden
-- solicitar ninguna aeronave por licencia todavía; queda pendiente definir con
-- Daniel qué aeronaves (o si ninguna, por diseño) les corresponde.
-- =============================================================================

BEGIN;

-- Privado: quitar lo que no corresponde (le sobraban 127-P y 270-PE).
DELETE FROM licencia_aeronave WHERE id_licencia = 1 AND id_aeronave IN (3, 4);

-- Comercial: agregar lo que faltaba (333-PE y 334-PE).
INSERT INTO licencia_aeronave (id_licencia, id_aeronave)
SELECT 2, x FROM unnest(ARRAY[1, 2]) AS x
ON CONFLICT (id_licencia, id_aeronave) DO NOTHING;

-- Instrumentos: agregar lo que faltaba (270-PE y el simulador).
INSERT INTO licencia_aeronave (id_licencia, id_aeronave)
SELECT 3, x FROM unnest(ARRAY[3, 5]) AS x
ON CONFLICT (id_licencia, id_aeronave) DO NOTHING;

COMMIT;

-- Verificación: debe coincidir exactamente con la distribución de arriba.
SELECT l.nombre AS licencia, a.codigo
FROM licencia_aeronave la
JOIN licencia l ON l.id_licencia = la.id_licencia
JOIN aeronave a ON a.id_aeronave = la.id_aeronave
WHERE la.id_licencia IN (1, 2, 3)
ORDER BY la.id_licencia, a.codigo;
