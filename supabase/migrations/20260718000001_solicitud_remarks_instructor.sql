-- ---------------------------------------------------------------------------
-- Remarks del instructor por vuelo solicitado: comentario libre que el
-- instructor de cabecera deja en cada solicitud de vuelo de sus alumnos
-- (ej. "necesita practicar aterrizajes con viento cruzado") para que
-- Programación lo tenga a la vista antes de aprobar/rechazar. Aditiva.
-- A diferencia de solicitud_semana.comentario_alumno (nota del alumno por
-- semana), esto es POR VUELO y lo escribe el instructor.
-- ---------------------------------------------------------------------------
ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS remarks_instructor TEXT;
