-- ADs, boletines de servicio y vida límite de componentes.
--
-- Los renglones viven en taller_tarea_programada, cuyo CHECK ya acepta
-- AD / SB / VIDA_LIMITE desde la migración 011. Estaba vacía: 1 fila AD y 0 de
-- vida límite, contra los 221 renglones que traen los papeles de los 5 aviones.
--
-- Todo aditivo: el backend viejo tolera estas columnas sin cambios.

ALTER TABLE taller_tarea_programada
  ADD COLUMN IF NOT EXISTS aplica                boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS observaciones         text,
  ADD COLUMN IF NOT EXISTS necesita_confirmacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nota_confirmacion     text,
  ADD COLUMN IF NOT EXISTS origen                varchar(20);

COMMENT ON COLUMN taller_tarea_programada.aplica IS
  'false = el renglon no aplica a este avion (N/A por serie, por modelo, no instalado). No alerta y no se borra: el papel lo lista y la lista tiene que seguir calzando.';

COMMENT ON COLUMN taller_tarea_programada.observaciones IS
  'La columna OBSERVACIONES del papel, textual. No se normaliza.';

COMMENT ON COLUMN taller_tarea_programada.necesita_confirmacion IS
  'El papel se contradice consigo mismo (el mismo AD en la lista de ADs y en la de vida limite con datos distintos). nota_confirmacion trae las dos versiones; decide el jefe de taller.';

COMMENT ON COLUMN taller_tarea_programada.origen IS
  'EXCEL_2026 / OCR_2026 / MANUAL. El importador borra y recarga por este campo, asi la carga es re-ejecutable.';

-- Nota sobre las dos escalas del TAC (misma regla que taller_componente):
-- proxima_horas y ultima_horas se guardan en ESCALA DEL SISTEMA, igual que
-- aeronave.horas_acumuladas. Los papeles estan escritos en escala de LIBRO
-- (sistema + aeronave.tac_offset). El importador resta el offset al entrar y la
-- pantalla lo vuelve a sumar al mostrar. Solo el YS-334-PE tiene offset != 0,
-- porque su tacometro dio la vuelta en 9999.99.
