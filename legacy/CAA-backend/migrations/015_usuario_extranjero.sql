-- =============================================================================
-- Migración 015: alumnos/usuarios extranjeros.
--
-- Para facturar a extranjeros (El Salvador) se usa pasaporte + nacionalidad en
-- lugar del DUI. Aditivo.
--   es_extranjero: marca al usuario como extranjero (tag en la lista).
--   pasaporte:     número de pasaporte / documento de identificación extranjero.
--   nacionalidad:  país / nacionalidad del extranjero.
-- =============================================================================

BEGIN;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS es_extranjero BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS pasaporte    VARCHAR(40);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS nacionalidad VARCHAR(80);

COMMIT;
