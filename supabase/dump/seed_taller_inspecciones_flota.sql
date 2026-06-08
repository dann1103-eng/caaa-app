-- Siembra las inspecciones recurrentes 50h y 100h como tareas del módulo Taller
-- para cada aeronave AVION activa que aún no las tenga, y sincroniza el cache
-- aeronave.horas_proxima_revision con la inspección por horas más próxima del Taller
-- (fuente única: el tablero de /mantenimiento y los widgets de Proyección leen ese campo).
-- Idempotente (NOT EXISTS evita duplicar).
BEGIN;

-- Inspección 50 horas (próxima = siguiente múltiplo de 50 sobre las horas actuales)
INSERT INTO taller_tarea_programada
  (id_aeronave, nombre, tipo, recurrente, intervalo_horas, ultima_horas, ultima_fecha, proxima_horas)
SELECT a.id_aeronave, 'Inspección 50 horas', 'INSPECCION', TRUE, 50,
       FLOOR(COALESCE(a.horas_acumuladas, 0) / 50) * 50,
       CURRENT_DATE,
       FLOOR(COALESCE(a.horas_acumuladas, 0) / 50) * 50 + 50
FROM aeronave a
WHERE a.tipo = 'AVION' AND a.activa = true
  AND NOT EXISTS (
    SELECT 1 FROM taller_tarea_programada t
    WHERE t.id_aeronave = a.id_aeronave AND t.tipo = 'INSPECCION'
      AND t.intervalo_horas = 50 AND t.activo = true
  );

-- Inspección 100 horas
INSERT INTO taller_tarea_programada
  (id_aeronave, nombre, tipo, recurrente, intervalo_horas, ultima_horas, ultima_fecha, proxima_horas)
SELECT a.id_aeronave, 'Inspección 100 horas', 'INSPECCION', TRUE, 100,
       FLOOR(COALESCE(a.horas_acumuladas, 0) / 100) * 100,
       CURRENT_DATE,
       FLOOR(COALESCE(a.horas_acumuladas, 0) / 100) * 100 + 100
FROM aeronave a
WHERE a.tipo = 'AVION' AND a.activa = true
  AND NOT EXISTS (
    SELECT 1 FROM taller_tarea_programada t
    WHERE t.id_aeronave = a.id_aeronave AND t.tipo = 'INSPECCION'
      AND t.intervalo_horas = 100 AND t.activo = true
  );

-- Sincronizar el cache de próxima revisión con la inspección por horas más próxima.
UPDATE aeronave a
SET horas_proxima_revision = sub.m
FROM (
  SELECT id_aeronave, MIN(proxima_horas) AS m
  FROM taller_tarea_programada
  WHERE activo = true AND tipo = 'INSPECCION' AND proxima_horas IS NOT NULL
  GROUP BY id_aeronave
) sub
WHERE a.id_aeronave = sub.id_aeronave;

COMMIT;
