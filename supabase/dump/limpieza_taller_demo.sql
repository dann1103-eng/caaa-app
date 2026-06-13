-- Limpieza de datos basura/duplicados del Taller en producción (sesión 2026-06-12).
-- - El seed seed_taller_demo.sql se corrió 4 veces → 4 copias de cada repuesto.
--   Se conservan los originales (ids 1,2,3) y se borran las copias.
-- - Tarea "100 / hfghgfh" (Arrow, id_tarea 9) y cumplimientos de prueba
--   ("juan", "si/sdfsdf", "asd/asdasd") son basura de pruebas tempranas.
-- - Cumplimientos 14,15 (tarea 19, "asd"/"si") también son basura.
-- Se preserva: repuestos 1,2,3; tareas reales 50h/100h/AD; cumplimiento QA 16.

BEGIN;

-- 1) Quitar el movimiento + egreso de la salida QA (apunta al repuesto dup 7)
DELETE FROM taller_movimiento_inventario WHERE id_mov = 7;
DELETE FROM egreso WHERE id = 8 AND categoria = 'REPUESTOS' AND concepto LIKE 'Consumo repuesto%';

-- 2) Borrar duplicados de repuestos (conservar originales 1,2,3)
DELETE FROM taller_repuesto WHERE id_repuesto IN (4,5,6,7,8,9,10,11,12);

-- 3) Borrar tarea basura "100 / hfghgfh" (Arrow) y sus cumplimientos de prueba
DELETE FROM taller_cumplimiento WHERE id_tarea = 9;
DELETE FROM taller_tarea_programada WHERE id_tarea = 9;

-- 4) Borrar cumplimientos basura sueltos ("asd"/"si") de la inspección 50h del Arrow real
DELETE FROM taller_cumplimiento WHERE id_cumplimiento IN (14, 15);

COMMIT;
