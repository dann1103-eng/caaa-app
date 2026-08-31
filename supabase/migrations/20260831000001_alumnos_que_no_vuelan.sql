-- Alumnos que no vuelan (sobrecargo y cualquier curso de tierra).
--
-- `licencia` ya significa "la habilitacion hacia la que el alumno progresa", y
-- todo el sistema se apoya en ella. Sobrecargo es exactamente eso, solo que no
-- se vuela: gana UNA columna y es una fila mas.
--
-- La bandera va en licencia y no en alumno a proposito: "volar o no" describe al
-- PROGRAMA, no a la persona. Si manana la escuela abre Despachante o Mecanico de
-- linea, es una fila mas y ningun alumno cambia. Los tipos especiales que ya
-- existen (es_practicante, es_externo) si estan sobre alumno porque describen a
-- la persona.

-- 1. La bandera. Aditiva: los 5 programas actuales quedan en true sin tocarlos.
ALTER TABLE licencia
  ADD COLUMN IF NOT EXISTS vuela boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN licencia.vuela IS
  'false = programa de tierra (sobrecargo, despachante...). Su alumno no reserva aeronaves, no aparece en los selectores de vuelo y su panel no muestra bloques de vuelo. El filtro compartido vive en utils/alumnoVuela.js.';

-- 2. El tutor deja de ser obligatorio.
--
-- ⚠️ UNICO cambio no aditivo de esta migracion. El backend viejo lo tolera
-- (nunca inserta NULL), pero todo lo que LEA el instructor de un alumno tiene
-- que aguantar el vacio: un `JOIN instructor` que no sea LEFT JOIN hace
-- desaparecer al alumno de la lista sin que nadie se entere.
ALTER TABLE alumno
  ALTER COLUMN id_instructor DROP NOT NULL;

COMMENT ON COLUMN alumno.id_instructor IS
  'Tutor de vuelo. NULL para alumnos de programas de tierra, que no lo tienen. Decision de Daniel (2026-08-31): sin tutor obligatorio, pero la escuela que quiera asignarlo puede.';

-- 3. La secuencia quedo desincronizada: las filas existentes se insertaron con
-- ids explicitos (1,2,3,5,6) desde seed_alumnos_reales.js, asi que nextval
-- podria devolver un id ya usado y reventar por clave duplicada.
SELECT setval(
  pg_get_serial_sequence('licencia', 'id_licencia'),
  GREATEST((SELECT COALESCE(MAX(id_licencia), 1) FROM licencia), 1)
);

-- 4. El programa. Idempotente: `nombre` no tiene restriccion unica, asi que
-- re-ejecutar la migracion sin esto duplicaria la fila.
--
-- dia_apertura_agenda es NOT NULL y solo tiene sentido para agendar vuelos; se
-- pone 1 porque la columna lo exige, no porque signifique algo aca.
-- Y NO se le asigna ninguna aeronave en licencia_aeronave: por eso el alumno no
-- puede reservar aunque quisiera, el mismo mecanismo que dejo a Bimotor sin
-- aviones durante meses sin romper nada.
INSERT INTO licencia (nombre, nivel, dia_apertura_agenda, vuela)
SELECT 'Sobrecargo', 1, 1, false
 WHERE NOT EXISTS (SELECT 1 FROM licencia WHERE nombre = 'Sobrecargo');
