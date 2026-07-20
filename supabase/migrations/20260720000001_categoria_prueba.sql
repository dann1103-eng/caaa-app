-- ============================================================================
-- Nueva categoría de vuelo PRUEBA: vuelo interno de la escuela sin pasajero
-- (ej. chequeo de instructor, prueba tras un arreglo de mantenimiento). Sesión
-- 2026-07-20. Reusa la MISMA ficha placeholder compartida de DEMO
-- (alumno.es_externo) — igual de no facturable — pero es una categoría
-- separada para que Proyección/Turno no la muestren ni reporten como un
-- "demo" (pasajero externo real), que es un concepto operativo distinto.
-- Ensancha el CHECK existente (no es aditivo puro: DROP + ADD).
-- ============================================================================
BEGIN;

ALTER TABLE public.vuelo
  DROP CONSTRAINT IF EXISTS vuelo_categoria_check;
ALTER TABLE public.vuelo
  ADD CONSTRAINT vuelo_categoria_check
  CHECK (categoria IN ('NORMAL', 'DEMO', 'PRUEBA', 'CHEQUEO', 'CHEQUEO_LINEA'));

ALTER TABLE public.solicitud_vuelo
  DROP CONSTRAINT IF EXISTS solicitud_vuelo_categoria_check;
ALTER TABLE public.solicitud_vuelo
  ADD CONSTRAINT solicitud_vuelo_categoria_check
  CHECK (categoria IN ('NORMAL', 'DEMO', 'PRUEBA', 'CHEQUEO', 'CHEQUEO_LINEA'));

-- El vuelo de prueba real ya creado esta sesión (lunes 20/7 06:00, YS-334-PE,
-- instructor Roberto Henriquez) se había guardado como categoria='DEMO'
-- porque PRUEBA todavía no existía. Se recategoriza el mismo vuelo,
-- identificado por fecha+aeronave+texto de referencia (no por id_vuelo, que
-- puede variar entre ambientes), para no dejarlo mal etiquetado.
UPDATE public.vuelo v
   SET categoria = 'PRUEBA'
  FROM public.aeronave a
 WHERE v.id_aeronave = a.id_aeronave
   AND a.codigo = 'YS-334-PE'
   AND v.categoria = 'DEMO'
   AND v.fecha_vuelo = '2026-07-20'
   AND v.nombre_externo ILIKE 'Vuelo de prueba interno%';

COMMIT;
