-- =============================================================================
-- Fix: el modal "Iniciar mantenimiento" ofrece el tipo "25HR" (inspección de 25
-- horas) pero el CHECK de mantenimiento_aeronave.tipo no lo permitía → al
-- elegirlo, el INSERT fallaba con "violates check constraint". Se amplía el
-- CHECK (widening, ninguna fila existente lo viola) para incluir 25HR.
-- =============================================================================

BEGIN;

ALTER TABLE mantenimiento_aeronave DROP CONSTRAINT IF EXISTS mantenimiento_aeronave_tipo_check;
ALTER TABLE mantenimiento_aeronave ADD CONSTRAINT mantenimiento_aeronave_tipo_check
  CHECK (tipo IN ('25HR','50HR','100HR','ANUAL','AD','PREVENTIVO','CORRECTIVO'));

COMMIT;

-- Verificación
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conname = 'mantenimiento_aeronave_tipo_check';
