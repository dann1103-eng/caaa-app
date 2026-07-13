-- Turno necesita poder anotar pasajeros extra en vuelos demo (personas que no
-- están registradas como alumno en el sistema). Columnas aditivas, nullable —
-- solo se llenan cuando Turno las usa.
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS almas_a_bordo SMALLINT;
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS pasajeros_extra TEXT;
