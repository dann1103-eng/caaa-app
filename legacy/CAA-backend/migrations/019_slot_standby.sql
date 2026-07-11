-- =============================================================================
-- Migración 019: lista de espera (stand-by) por horario.
--
-- Cuando varios alumnos piden el mismo horario (día + bloque), uno es asignado y
-- los demás quedan en STAND-BY (no se rechazan). Turno ordena la lista. Si el
-- alumno asignado cancela con suficiente anticipación (y no por cierre de
-- operaciones), el sistema ofrece el cupo automáticamente al candidato #1; si
-- rechaza o expira el plazo, pasa al #2, respetando el orden de Turno.
--
-- El "horario" = (id_semana, dia_semana, id_bloque). La aeronave la asigna
-- programación, así que el stand-by es por horario, no por aeronave puntual.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS slot_standby (
  id_standby        SERIAL PRIMARY KEY,
  id_semana         INTEGER NOT NULL REFERENCES semana_vuelo(id_semana),
  dia_semana        INTEGER NOT NULL,
  id_bloque         INTEGER NOT NULL,
  id_alumno         INTEGER NOT NULL REFERENCES alumno(id_alumno),
  id_instructor     INTEGER,           -- instructor sugerido (opcional)
  id_aeronave       INTEGER,           -- aeronave que pidió (referencia, opcional)
  orden             INTEGER NOT NULL DEFAULT 1,
  estado            VARCHAR(20) NOT NULL DEFAULT 'EN_ESPERA'
                    CHECK (estado IN ('EN_ESPERA','OFRECIDO','ACEPTADO','RECHAZADO','EXPIRADO','DESCARTADO')),
  ofrecido_en       TIMESTAMP,
  expira_en         TIMESTAMP,
  respondido_en     TIMESTAMP,
  id_vuelo_generado INTEGER,           -- vuelo creado al aceptar la oferta
  creado_por        INTEGER,           -- id_usuario (Turno) que armó la lista
  creado_en         TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (id_semana, dia_semana, id_bloque, id_alumno)
);

CREATE INDEX IF NOT EXISTS idx_standby_slot   ON slot_standby (id_semana, dia_semana, id_bloque, orden);
CREATE INDEX IF NOT EXISTS idx_standby_alumno ON slot_standby (id_alumno, estado);

COMMIT;

-- Verificación
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'slot_standby' ORDER BY ordinal_position;
