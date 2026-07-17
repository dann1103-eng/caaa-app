-- ---------------------------------------------------------------------------
-- Capacidad "Operaciones" para instructores: le da a un INSTRUCTOR (ej. jefe /
-- sub-jefe de instrucción) las funciones del rol TURNO (mantenimiento
-- imprevisto de flota, ciclo del turno del día, cancelaciones y cambios del
-- programa) sin cambiarle el rol ni tocar sus capacidades existentes — mismo
-- patrón aditivo que puede_programar (mig 016).
-- ---------------------------------------------------------------------------
ALTER TABLE instructor ADD COLUMN IF NOT EXISTS puede_operaciones BOOLEAN NOT NULL DEFAULT FALSE;
