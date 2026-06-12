-- =============================================================================
-- Migración 014: robapantallas de primer login.
--
-- usuario.datos_confirmados: alumnos e instructores deben confirmar sus datos
-- generales/fiscales (contacto + DUI + dirección) la primera vez que entran.
-- El gate se calcula en authController (must_confirm_data). Aditivo.
-- =============================================================================

BEGIN;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS datos_confirmados BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
