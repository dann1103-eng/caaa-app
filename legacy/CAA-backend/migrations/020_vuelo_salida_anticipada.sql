-- Marca informativa de "salida anticipada": Turno/Instructor pueden dar
-- salida a hangar (o iniciar sesión de simulador) antes de la hora programada
-- del bloque sin cambiar el bloque asignado ni el horario del vuelo. Este
-- flag solo registra que esa salida puntual fue anticipada (para reportes /
-- trazabilidad); no altera el flujo de estados ni la aeronave/bloque.
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS salida_anticipada boolean NOT NULL DEFAULT false;
