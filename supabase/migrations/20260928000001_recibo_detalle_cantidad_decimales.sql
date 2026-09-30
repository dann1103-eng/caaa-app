-- ---------------------------------------------------------------------------
-- La cantidad del detalle de un recibo de ingreso admite 6 decimales.
--
-- Administración suele partir del MONTO depositado y despejar las horas:
-- $1,976.25 a $135 la hora son 14.638888… horas. Con NUMERIC(10,2) la base
-- guardaba 14.64 y el recibo quedaba "14.64 × $135.00 = $1,976.25", que no
-- multiplica (da $1,976.40). Para acertar cualquier centavo el paso de la
-- cantidad tiene que valer menos de un centavo: con 6 decimales alcanza hasta
-- $10,000 por unidad (el bimotor cobra $600).
--
-- Solo ENSANCHA: conserva los 8 dígitos enteros de antes y ningún valor
-- existente cambia (los 25 renglones de hoy tienen 2 decimales). El backend
-- redondea a 6 antes de calcular el subtotal (utils/reciboItems.js).
--
-- Después de aplicarla hay que REGENERAR el esquema `demo`
-- (docs/demo/RUNBOOK.md §3), que conserva la columna vieja.
-- ---------------------------------------------------------------------------
ALTER TABLE public.recibo_detalle
  ALTER COLUMN cantidad TYPE NUMERIC(14,6);
