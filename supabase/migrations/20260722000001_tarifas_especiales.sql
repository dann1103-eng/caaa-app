-- Tarifas especiales por avión + asignación por alumno.
--
-- Hasta ahora cada avión tenía UNA tarifa vigente (aeronave_tarifa, versionada
-- por fecha). Ahora un avión puede tener varios PRECIOS con nombre: el Estándar
-- (que conserva su versionado por fecha) + precios especiales fijos ("Precio 1",
-- "Precio 2"…). En el perfil del alumno se le asigna, por avión, qué precio usar.
-- Al cerrar un vuelo, el cargo usa el precio especial asignado al alumno para ese
-- avión; si no tiene ninguno, usa el Estándar (retrocompatible).
--
-- Aditivo. Ver sesión 2026-07-22.

-- 1) Nombre + bandera de "estándar" en aeronave_tarifa.
ALTER TABLE aeronave_tarifa ADD COLUMN IF NOT EXISTS nombre      VARCHAR(60);
ALTER TABLE aeronave_tarifa ADD COLUMN IF NOT EXISTS es_estandar BOOLEAN NOT NULL DEFAULT TRUE;

-- Las filas existentes son el precio estándar.
UPDATE aeronave_tarifa SET nombre = 'Estándar' WHERE nombre IS NULL;

-- 2) Precio asignado a un alumno para un avión concreto (apunta a un precio
--    especial de aeronave_tarifa). Si no hay fila → el alumno paga el estándar.
CREATE TABLE IF NOT EXISTS alumno_tarifa_aeronave (
  id_alumno   INTEGER NOT NULL REFERENCES alumno(id_alumno)         ON DELETE CASCADE,
  id_aeronave INTEGER NOT NULL REFERENCES aeronave(id_aeronave)     ON DELETE CASCADE,
  id_tarifa   INTEGER NOT NULL REFERENCES aeronave_tarifa(id)       ON DELETE CASCADE,
  asignado_por INTEGER REFERENCES usuario(id_usuario),
  asignado_en  TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id_alumno, id_aeronave)
);
