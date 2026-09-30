-- solicitud_vuelo nunca tuvo marca de tiempo: no hay forma de saber cuándo se
-- pidió CADA hora de vuelo, solo cuándo se creó la canasta de la semana
-- (solicitud_semana.fecha_creacion). Esto lo agrega para las solicitudes nuevas.
--
-- Va en DOS pasos a propósito: un "ADD COLUMN ... DEFAULT now()" rellena las
-- filas existentes con la hora de la migración, o sea afirmaría que todas las
-- solicitudes históricas se pidieron hoy. Agregando la columna primero SIN
-- default, las viejas quedan en NULL —que es la verdad, no se sabe— y solo las
-- nuevas traen su hora real.
--
-- La sesión del backend fija America/El_Salvador, así que now() guarda hora
-- local, igual que el resto de las marcas de este esquema.
ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS creado_en timestamp without time zone;
ALTER TABLE solicitud_vuelo ALTER COLUMN creado_en SET DEFAULT now();
