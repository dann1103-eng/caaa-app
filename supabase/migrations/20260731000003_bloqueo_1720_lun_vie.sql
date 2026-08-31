-- Lunes y viernes el aeropuerto de Ilopango cierra más temprano: el bloque de
-- las 17:20 (id_bloque 9) NO se puede volar esos días. Reusa la tabla
-- bloque_bloqueado_dia (la misma del ALMUERZO): las grillas del alumno,
-- Programación y Admin ya pintan bloqueada cualquier fila de esta tabla, y el
-- backend (guardarSolicitud / agendarVueloDirecto) valida contra ella.
-- Aditiva e idempotente.

INSERT INTO bloque_bloqueado_dia (id_bloque, dia_semana, motivo)
SELECT 9, d, 'AEROPUERTO CERRADO'
FROM (VALUES (1), (5)) AS dias(d)
WHERE NOT EXISTS (
  SELECT 1 FROM bloque_bloqueado_dia bb
  WHERE bb.id_bloque = 9 AND bb.dia_semana = dias.d
);
