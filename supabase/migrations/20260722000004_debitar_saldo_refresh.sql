-- Refresh autosolicitado por el instructor (spec 2026-07-22): elección de
-- "debitar de mi saldo" al pedir el vuelo. Solo significativa cuando
-- categoria='CHEQUEO_LINEA' y tipo_instruccion='REFRESH'; NULL en el resto
-- (incluye todo lo creado por staff → comportamiento actual: cobro manual).
-- Aditiva.
ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS debitar_saldo BOOLEAN;
ALTER TABLE vuelo           ADD COLUMN IF NOT EXISTS debitar_saldo BOOLEAN;
