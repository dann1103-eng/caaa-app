-- Limpia el vuelo 16 (consumido al probar inasistencia) para volver a probarlo.
DELETE FROM public.vuelo_estado_tiempo WHERE id_vuelo = 16;
DELETE FROM public.reporte_vuelo        WHERE id_vuelo = 16;
UPDATE public.vuelo SET estado = 'PUBLICADO', tiempo_vuelo_min = NULL WHERE id_vuelo = 16;
