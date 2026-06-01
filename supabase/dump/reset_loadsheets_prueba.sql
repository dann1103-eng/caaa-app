-- Limpia los loadsheets de prueba: los regresa a BORRADOR para que no aparezcan
-- como "enviados" al instructor. El alumno los completa y envía de verdad.
UPDATE public.loadsheet     SET estado = 'BORRADOR' WHERE id_vuelo IN (15, 18);
UPDATE public.weight_balance SET estado = 'BORRADOR' WHERE id_vuelo IN (15, 18);
