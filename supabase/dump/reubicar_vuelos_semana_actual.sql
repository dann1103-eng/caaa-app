-- Reubica la semana de prueba (id_semana=4) y sus vuelos a la SEMANA ACTUAL.
-- Dinámico: calcula el lunes de la semana en curso, así no se queda obsoleto.
-- Re-ejecutable. Solo afecta los datos de prueba (semana 4, vuelos 15-20).
DO $$
DECLARE
  lun date := date_trunc('week', (NOW() AT TIME ZONE 'America/El_Salvador'))::date;
BEGIN
  -- Semana actual (lunes a domingo), publicada
  UPDATE public.semana_vuelo
     SET fecha_inicio = lun, fecha_fin = lun + 6, publicada = true
   WHERE id_semana = 4;

  -- Distribuir los vuelos en la semana actual (varios HOY = lunes/dia 1)
  UPDATE public.vuelo SET dia_semana = 1, fecha_vuelo = lun     WHERE id_vuelo = 15; -- Carlos  YS-334-PE (avión) HOY
  UPDATE public.vuelo SET dia_semana = 1, fecha_vuelo = lun     WHERE id_vuelo = 16; -- Daniel  YS-333-PE (avión) HOY
  UPDATE public.vuelo SET dia_semana = 1, fecha_vuelo = lun     WHERE id_vuelo = 17; -- Sofia   SIM-1     (sim)   HOY
  UPDATE public.vuelo SET dia_semana = 3, fecha_vuelo = lun + 2 WHERE id_vuelo = 18; -- Carlos  YS-270-P  (avión) miércoles
  UPDATE public.vuelo SET dia_semana = 4, fecha_vuelo = lun + 3 WHERE id_vuelo = 19; -- Daniel  YS-334-PE (avión) jueves
  UPDATE public.vuelo SET dia_semana = 5, fecha_vuelo = lun + 4 WHERE id_vuelo = 20; -- Sofia   YS-333-PE (compl.) viernes

  -- Mantener consistente la capa de solicitud
  UPDATE public.solicitud_vuelo SET dia_semana = 1 WHERE id_detalle IN (10, 11, 12);
  UPDATE public.solicitud_vuelo SET dia_semana = 3 WHERE id_detalle = 13;
  UPDATE public.solicitud_vuelo SET dia_semana = 4 WHERE id_detalle = 14;
  UPDATE public.solicitud_vuelo SET dia_semana = 5 WHERE id_detalle = 15;
END $$;
