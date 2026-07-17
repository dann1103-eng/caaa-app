-- El "instructor de cabecera" (alumno.id_instructor: gestiona límites, roster,
-- historial) y el "instructor de vuelo" (quien realmente vuela con el alumno y
-- por lo tanto debe revisar/enviar a programación sus solicitudes de horas) no
-- siempre son la misma persona. Columna nueva y opcional: si queda NULL, el
-- efectivo sigue siendo el de cabecera (COALESCE en las consultas) — cero
-- cambio de comportamiento hasta que un instructor de cabecera la asigne.
ALTER TABLE alumno ADD COLUMN IF NOT EXISTS id_instructor_vuelo INTEGER REFERENCES instructor(id_instructor);
