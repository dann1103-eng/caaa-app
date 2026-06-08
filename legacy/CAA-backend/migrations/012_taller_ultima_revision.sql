-- =============================================================================
-- Migración 012: cache aeronave.horas_ultima_revision
--
-- La barra de progreso de /mantenimiento debe medir el avance DENTRO del intervalo
-- de inspección actual: desde las horas de la última revisión hasta la próxima.
-- Antes solo existía horas_proxima_revision (y la barra calculaba acum/proxima,
-- que daba un % erróneo). Agregamos el extremo inferior del intervalo, también
-- sincronizado desde la inspección por horas más próxima del módulo Taller.
-- Aditivo.
-- =============================================================================

BEGIN;

ALTER TABLE aeronave ADD COLUMN IF NOT EXISTS horas_ultima_revision NUMERIC(8,2);

-- Backfill: por aeronave, tomar la inspección por horas más próxima del Taller
-- y copiar su ultima_horas / proxima_horas al cache de la aeronave.
UPDATE aeronave a
SET horas_proxima_revision = sub.proxima,
    horas_ultima_revision  = sub.ultima
FROM (
  SELECT DISTINCT ON (id_aeronave)
         id_aeronave,
         proxima_horas AS proxima,
         ultima_horas  AS ultima
  FROM taller_tarea_programada
  WHERE activo = true AND tipo = 'INSPECCION' AND proxima_horas IS NOT NULL
  ORDER BY id_aeronave, proxima_horas ASC
) sub
WHERE a.id_aeronave = sub.id_aeronave;

COMMIT;
