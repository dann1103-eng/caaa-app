-- =============================================================================
-- Migración 007: Módulo Usuarios + categorías de egreso ampliadas
--
--   * empleado.id_usuario: enlaza al personal con su cuenta de login (usuario).
--   * egreso.categoria: amplía el CHECK con más categorías contables.
--
-- El cambio del CHECK de egreso requiere DROP + ADD (no es aditivo puro), pero
-- es no destructivo: solo amplía el conjunto de valores permitidos.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enlace empleado ↔ usuario (login del personal)
-- ---------------------------------------------------------------------------
ALTER TABLE empleado
  ADD COLUMN IF NOT EXISTS id_usuario INTEGER NULL REFERENCES usuario(id_usuario);

-- ---------------------------------------------------------------------------
-- 2. Categorías de egreso ampliadas
-- ---------------------------------------------------------------------------
ALTER TABLE egreso DROP CONSTRAINT IF EXISTS egreso_categoria_check;
ALTER TABLE egreso
  ADD CONSTRAINT egreso_categoria_check
  CHECK (categoria IN (
    'COMBUSTIBLE','MANTENIMIENTO','REPUESTOS','NOMINA','HONORARIOS',
    'SUMINISTROS','PROVEEDOR','SERVICIOS','SERVICIOS_BASICOS','ALQUILER',
    'HANGAR','IMPUESTOS','SEGUROS','TASAS_AAC','PUBLICIDAD','VIATICOS',
    'CAPACITACION','BANCARIO','OTRO'
  ));

COMMIT;
