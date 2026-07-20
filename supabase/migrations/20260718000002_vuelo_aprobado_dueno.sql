-- ---------------------------------------------------------------------------
-- Visto bueno del dueño por vuelo: el Cap. (rol DUENO) marca desde su
-- dashboard los vuelos del día que ya revisó. NULL = sin revisar; timestamp
-- = cuándo lo aprobó. Turno recibe notificación in-app y ve el check en su
-- tarjeta. Aditiva.
-- ---------------------------------------------------------------------------
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS aprobado_dueno_en TIMESTAMPTZ;
