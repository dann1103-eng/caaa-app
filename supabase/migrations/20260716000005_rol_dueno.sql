-- ---------------------------------------------------------------------------
-- Rol DUENO — dueño de la escuela (Cap. Tito Gutiérrez). Cuenta de solo
-- lectura: ve un dashboard simplificado tipo Proyección (optimizado para
-- móvil, letra grande) y recibe push notifications de todo lo que Turno va
-- actualizando. No opera nada — mismo patrón aditivo que TALLER (mig 011).
-- ---------------------------------------------------------------------------
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_rol_check;
ALTER TABLE usuario
  ADD CONSTRAINT usuario_rol_check
  CHECK (rol IN ('ADMIN','PROGRAMACION','TURNO','ALUMNO','INSTRUCTOR','ADMINISTRACION','TALLER','DUENO'));
