-- plan_vuelo nunca se actualizó para tener todos los campos que el formulario
-- del alumno (PlanVueloModal.jsx) recolecta: nombre/licencia/domicilio de los
-- 2 pilotos, lugar de salida, fecha, colores de la aeronave, despacho, y el
-- campo combinado VOR/DME/ADF. El controller ignoraba estos datos en
-- silencio (ni siquiera daba error) y ADEMÁS usaba nombres de columna que no
-- coinciden con lo que manda el frontend (reglas vs reglas_vuelo, hora_salida
-- vs hora_vuelo) -- fix de columnas + controller en el mismo cambio.
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS lugar_salida VARCHAR(100);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS fecha_vuelo DATE;
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS colores VARCHAR(100);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS ilop_radio VARCHAR(100);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS vor_dme_adf VARCHAR(100);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS despacho VARCHAR(150);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS pilot1_nombre VARCHAR(150);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS pilot1_licencia VARCHAR(50);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS pilot1_domicilio VARCHAR(200);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS pilot2_nombre VARCHAR(150);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS pilot2_licencia VARCHAR(50);
ALTER TABLE plan_vuelo ADD COLUMN IF NOT EXISTS pilot2_domicilio VARCHAR(200);

-- tiempo_ruta era INTERVAL pero el formulario lo trata como texto libre
-- ("1:30", "1h30", etc.) -- cambiar a VARCHAR evita errores de parseo de
-- Postgres por formatos que no son un INTERVAL válido.
ALTER TABLE plan_vuelo ALTER COLUMN tiempo_ruta TYPE VARCHAR(30) USING tiempo_ruta::text;
