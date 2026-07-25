-- Columnas aditivas en wb_plantilla para el editor de peso y balance (admin) y el
-- modo DB-first del loadsheet. No pierde nada de la forma de aircraft.js.
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS default_power    numeric;
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS default_flow_gal numeric;
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS oil              jsonb;
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS model            varchar(120);
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS sheet            varchar(120);
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS max_useful_load  numeric;
