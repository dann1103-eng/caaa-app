-- Data demo del módulo Taller para probar la UI con la aeronave 1 (YS-334-PE, 47h).
-- Idempotente-ish: limpia lo previo de la aeronave 1 antes de re-sembrar.
BEGIN;

DELETE FROM taller_cumplimiento WHERE id_tarea IN (SELECT id_tarea FROM taller_tarea_programada WHERE id_aeronave = 1);
DELETE FROM taller_tarea_programada WHERE id_aeronave = 1;
DELETE FROM taller_componente WHERE id_aeronave = 1;

-- Componentes
INSERT INTO taller_componente (id_aeronave, tipo, nombre, parte_no, serie_no, posicion, fecha_instalacion, horas_aeronave_instalacion, horas_componente_instalacion, ciclos_instalacion)
VALUES
  (1, 'CELULA', 'Cessna 152', 'C152', 'CEL-0001', 'única', '2020-01-01', 0, 0, 0),
  (1, 'MOTOR',  'Lycoming O-235', 'O-235-L2C', 'MOT-7781', 'única', '2020-01-01', 0, 0, 0),
  (1, 'HELICE', 'McCauley 1A103', '1A103/TCM', 'HEL-3320', 'única', '2020-01-01', 0, 0, 0);

-- Tareas programadas (la célula está en 47h)
-- 50HR: próxima a 50h → restan 3h → PROXIMO
INSERT INTO taller_tarea_programada (id_aeronave, nombre, tipo, recurrente, intervalo_horas, ultima_horas, ultima_fecha, proxima_horas)
VALUES (1, 'Inspección 50 horas', 'INSPECCION', TRUE, 50, 0, '2024-06-01', 50);
-- 100HR: próxima a 100h → restan 53h → VIGENTE
INSERT INTO taller_tarea_programada (id_aeronave, nombre, tipo, recurrente, intervalo_horas, ultima_horas, ultima_fecha, proxima_horas)
VALUES (1, 'Inspección 100 horas', 'INSPECCION', TRUE, 100, 0, '2024-06-01', 100);
-- AD recurrente cada 45h: próxima a 45h → restan -2h → VENCIDO
INSERT INTO taller_tarea_programada (id_aeronave, nombre, tipo, referencia, recurrente, intervalo_horas, ultima_horas, ultima_fecha, proxima_horas)
VALUES (1, 'AD magnetos', 'AD', 'AD 2019-08-12', TRUE, 45, 0, '2024-06-01', 45);
-- Inspección anual por calendario: próxima en 15 días → PROXIMO
INSERT INTO taller_tarea_programada (id_aeronave, nombre, tipo, recurrente, intervalo_dias, ultima_fecha, proxima_fecha)
VALUES (1, 'Inspección anual', 'INSPECCION', TRUE, 365, CURRENT_DATE - 350, CURRENT_DATE + 15);

-- Repuestos
INSERT INTO taller_repuesto (parte_no, descripcion, categoria, ubicacion, unidad, stock_actual, stock_minimo, costo_unitario)
VALUES
  ('CH48110-1', 'Filtro de aceite Champion', 'Filtros', 'A-2', 'UNIDAD', 1, 4, 18.50),
  ('REM37BY',   'Bujía Champion REM37BY',    'Encendido', 'A-3', 'UNIDAD', 24, 8, 22.00),
  ('SAE-W100',  'Aceite Aeroshell W100',     'Lubricantes', 'B-1', 'LITRO', 30, 12, 9.75)
ON CONFLICT DO NOTHING;

COMMIT;
