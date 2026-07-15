-- ============================================================================
-- Selector "Tipo de vuelo" en programación (NORMAL / DEMO / CHEQUEO /
-- CHEQUEO_LINEA) + columna de tipo en Proyección. Sesión 2026-07-14.
-- Cambios ADITIVOS (ADD COLUMN IF NOT EXISTS + CHECK nuevo, seed idempotente).
--
-- categoria:
--   NORMAL         alumno real, precarga su propia licencia. Cobro normal.
--   DEMO           pasajero externo (no registrado); ocupa una ficha placeholder
--                   compartida (alumno.es_externo). Sin auto-cargo — se factura
--                   manual con los datos que se anoten en nombre_externo.
--   CHEQUEO        alumno real, pero se elige una licencia "a chequear" que
--                   filtra las aeronaves disponibles (no tiene que ser la propia
--                   del alumno). Cobro normal (igual que NORMAL).
--   CHEQUEO_LINEA  instructor-con-instructor (ya existente vía tipo_instruccion
--                   CHEQUEO/REFRESH). Sin auto-cargo.
-- RUTA sigue siendo tipo_vuelo (checkbox), ortogonal a categoria.
-- ============================================================================
BEGIN;

ALTER TABLE public.vuelo
  ADD COLUMN IF NOT EXISTS categoria varchar(20) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE public.solicitud_vuelo
  ADD COLUMN IF NOT EXISTS categoria varchar(20) NOT NULL DEFAULT 'NORMAL';

ALTER TABLE public.vuelo
  ADD COLUMN IF NOT EXISTS nombre_externo varchar(120);
ALTER TABLE public.solicitud_vuelo
  ADD COLUMN IF NOT EXISTS nombre_externo varchar(120);

-- Ficha placeholder compartida para DEMO: aislada del roster real, distinta de
-- es_practicante (que sí representa a una persona real -el instructor- y sí se
-- factura individualmente).
ALTER TABLE public.alumno
  ADD COLUMN IF NOT EXISTS es_externo boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vuelo_categoria_check') THEN
    ALTER TABLE public.vuelo
      ADD CONSTRAINT vuelo_categoria_check
      CHECK (categoria IN ('NORMAL', 'DEMO', 'CHEQUEO', 'CHEQUEO_LINEA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitud_vuelo_categoria_check') THEN
    ALTER TABLE public.solicitud_vuelo
      ADD CONSTRAINT solicitud_vuelo_categoria_check
      CHECK (categoria IN ('NORMAL', 'DEMO', 'CHEQUEO', 'CHEQUEO_LINEA'));
  END IF;
END $$;

-- Seed idempotente del usuario+alumno placeholder "sistema.externo" (una sola
-- fila compartida por TODOS los vuelos DEMO). activo=false ⇒ nunca puede hacer
-- login (authController exige u.activo=true); password_hash no es un hash real
-- ya que el login queda bloqueado de todos modos por activo=false.
DO $$
DECLARE
  v_uid integer;
  v_alumno_id integer;
  v_lic integer;
  v_instructor integer;
BEGIN
  SELECT id_usuario INTO v_uid FROM usuario WHERE username = 'sistema.externo';

  IF v_uid IS NULL THEN
    INSERT INTO usuario (nombre, apellido, correo, password_hash, rol, activo, must_change_password, username, must_set_email)
    VALUES ('Pasajero', 'Externo (Demo)', NULL, 'DISABLED_SYSTEM_ACCOUNT', 'ALUMNO', false, false, 'sistema.externo', false)
    RETURNING id_usuario INTO v_uid;
  END IF;

  SELECT id_alumno INTO v_alumno_id FROM alumno WHERE id_usuario = v_uid;

  IF v_alumno_id IS NULL THEN
    SELECT id_licencia INTO v_lic FROM licencia ORDER BY nivel DESC LIMIT 1;
    SELECT id_instructor INTO v_instructor FROM instructor ORDER BY id_instructor LIMIT 1;

    IF v_lic IS NOT NULL AND v_instructor IS NOT NULL THEN
      INSERT INTO alumno (id_usuario, id_instructor, id_licencia, es_externo, activo, horas_acumuladas)
      VALUES (v_uid, v_instructor, v_lic, true, true, 0);
    END IF;
  ELSE
    UPDATE alumno SET es_externo = true WHERE id_alumno = v_alumno_id;
  END IF;
END $$;

COMMIT;
