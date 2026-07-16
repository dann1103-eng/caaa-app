-- ============================================================================
-- Persistir la licencia efectivamente chequeada en vuelos categoria=CHEQUEO
-- (override elegido al agendar, o la propia del alumno como fallback), para
-- poder mostrar "SIGLA/CHECK" (ej. "IR/CHECK") en la columna Tipo de Proyección.
-- Sesión 2026-07-16. Cambio ADITIVO.
-- ============================================================================
BEGIN;

ALTER TABLE public.vuelo
  ADD COLUMN IF NOT EXISTS id_licencia_chequeo integer;
ALTER TABLE public.solicitud_vuelo
  ADD COLUMN IF NOT EXISTS id_licencia_chequeo integer;

COMMIT;
