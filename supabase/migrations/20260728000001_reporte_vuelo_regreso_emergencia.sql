-- Regreso por emergencia: el vuelo salió del hangar y se regresó sin llegar a
-- volar (mal clima, falla del avión, etc.). El avión SÍ suma sus horas de TAC
-- (el motor corrió, y de ahí sale el mantenimiento 50/100h), pero no se le cobra
-- al alumno, no se le acreditan horas de licencia, y por lo tanto tampoco se le
-- paga esa hora al instructor.
--
-- Distinto de es_inasistencia (el alumno no llegó): esa pone TAC/Hobbs en NULL
-- porque el avión nunca se movió, y por eso queda excluida sola de la nómina.
-- Ésta lleva el TAC lleno, así que hay que excluirla explícitamente.
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS regreso_emergencia BOOLEAN DEFAULT FALSE;
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS motivo_emergencia  VARCHAR(20);
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS detalle_emergencia TEXT;

-- El CHECK pasa con NULL a propósito: la obligatoriedad del motivo cuando la
-- marca está puesta se valida en el servidor (firmarReporteVuelo), igual que el
-- guard de tipo_vuelo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reporte_vuelo_motivo_emergencia_check') THEN
    ALTER TABLE reporte_vuelo ADD CONSTRAINT reporte_vuelo_motivo_emergencia_check
      CHECK (motivo_emergencia IS NULL OR motivo_emergencia = ANY (ARRAY['CLIMA','FALLA_MECANICA','OTRO']));
  END IF;
END $$;
