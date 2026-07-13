-- weight_balance.galones_combustible y fuel_burn eran NUMERIC(6,2) (máx
-- 9999.99). Un valor mal tipeado en el input libre de "combustible burn"
-- (sin límite ni validación) revienta ese máximo con "numeric field overflow"
-- en CADA guardado del loadsheet (Guardar borrador / Guardar y enviar), ya
-- que el vuelo queda con ese dato guardado y se reintenta guardar el mismo
-- valor. Se ensancha a NUMERIC(10,2), igual que las demás columnas de
-- combustible del sistema (reporte_vuelo).
ALTER TABLE weight_balance ALTER COLUMN galones_combustible TYPE NUMERIC(10,2);
ALTER TABLE weight_balance ALTER COLUMN fuel_burn TYPE NUMERIC(10,2);
