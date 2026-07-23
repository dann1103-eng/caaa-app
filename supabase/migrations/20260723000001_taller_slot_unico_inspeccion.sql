-- Cupo único de mantenimiento periódico (25/50/100HR, Anual, Overhaul) por avión.
--
-- Hasta ahora un avión podía tener varias filas tipo='INSPECCION' abiertas a la
-- vez en taller_tarea_programada (ej. una de 50h y otra de 100h en paralelo,
-- cada una calculando su "próxima" por intervalo). Eso generaba números que no
-- coincidían entre pantallas. Se simplifica a: como mucho UNA fila activa
-- tipo='INSPECCION' por avión, que se define directamente por TAC (sin
-- intervalo) y que al cumplirse se reemplaza en el mismo lugar por la
-- siguiente (tipo + TAC objetivo que decida quien la cumple). AD/SB/VIDA_LIMITE/OTRO
-- no se tocan: siguen su propio seguimiento en paralelo, sin límite de filas.

-- 1) Colapsar duplicados existentes: por avión, dejar activa solo la fila
--    tipo='INSPECCION' con proxima_horas más chica (las calendario-only, con
--    proxima_horas NULL, quedan últimas y por lo tanto se desactivan si hay
--    alguna con TAC definido). Empate -> menor id_tarea. Se desactiva, no se
--    borra, para no romper el historial de taller_cumplimiento (FK a id_tarea).
WITH ranked AS (
  SELECT id_tarea,
         ROW_NUMBER() OVER (
           PARTITION BY id_aeronave
           ORDER BY (proxima_horas IS NULL) ASC, proxima_horas ASC, id_tarea ASC
         ) AS rn
    FROM taller_tarea_programada
   WHERE tipo = 'INSPECCION' AND activo = true
)
UPDATE taller_tarea_programada t
   SET activo = false
  FROM ranked r
 WHERE t.id_tarea = r.id_tarea AND r.rn > 1;

-- 2) Red de seguridad a nivel BD: nunca más de una fila INSPECCION activa por avión.
CREATE UNIQUE INDEX IF NOT EXISTS uq_taller_tarea_inspeccion_activa
    ON taller_tarea_programada(id_aeronave)
 WHERE tipo = 'INSPECCION' AND activo = true;

-- 3) Ensanchar el CHECK legado de aeronave.tipo_proxima_revision (hoy solo
--    admitía '50HR'/'100HR') para los 5 tipos periódicos + "otro" libre.
ALTER TABLE aeronave DROP CONSTRAINT IF EXISTS aeronave_tipo_proxima_revision_check;
ALTER TABLE aeronave ADD CONSTRAINT aeronave_tipo_proxima_revision_check
  CHECK (tipo_proxima_revision IS NULL OR tipo_proxima_revision = ANY (
    ARRAY['25HR','50HR','100HR','ANUAL','OVERHAUL','OTRO']::character varying[]
  ));

-- 4) Backfill de la etiqueta a partir del nombre de la fila que quedó activa
--    (mismo mapeo que usará el sync automático en aeronaveUtils.js de ahora en más).
UPDATE aeronave a
   SET tipo_proxima_revision = CASE t.nombre
         WHEN 'Inspección 25 horas'  THEN '25HR'
         WHEN 'Inspección 50 horas'  THEN '50HR'
         WHEN 'Inspección 100 horas' THEN '100HR'
         WHEN 'Anual'                THEN 'ANUAL'
         WHEN 'Overhaul'             THEN 'OVERHAUL'
         ELSE 'OTRO'
       END
  FROM taller_tarea_programada t
 WHERE t.id_aeronave = a.id_aeronave
   AND t.tipo = 'INSPECCION' AND t.activo = true;
