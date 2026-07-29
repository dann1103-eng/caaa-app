-- =============================================================================
-- Migración: Agenda de teoría — salones, ciclo de vida de sesion_clase, firma
-- digital de asistencia, y reserva de salón para uso especial.
-- Aditiva: todas las columnas nuevas son nullable o tienen DEFAULT, así que las
-- filas de sesion_clase/asistencia_alumno que ya existen siguen funcionando.
-- =============================================================================

BEGIN;

-- Catálogo de salones (chico, sembrado a mano; agregar uno nuevo es un INSERT).
CREATE TABLE IF NOT EXISTS salon (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL,
  activo  BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO salon (nombre)
  SELECT x FROM (VALUES ('Salón Arrow'), ('Salón Tomahawk'), ('Salón Cap. Tito Gutiérrez')) AS v(x)
  WHERE NOT EXISTS (SELECT 1 FROM salon);

-- sesion_clase: horario en bloques + salón + examen + ciclo de vida real.
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS id_bloque      INTEGER REFERENCES bloque_horario(id_bloque);
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS id_bloque_fin  INTEGER REFERENCES bloque_horario(id_bloque);
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS id_salon       INTEGER REFERENCES salon(id);
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS examen         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS estado         VARCHAR(15) NOT NULL DEFAULT 'PROGRAMADA';
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS iniciada_en    TIMESTAMP;
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS cerrada_en     TIMESTAMP;

DO $$ BEGIN
  ALTER TABLE sesion_clase ADD CONSTRAINT sesion_clase_estado_check
    CHECK (estado IN ('PROGRAMADA','EN_CURSO','CERRADA','CANCELADA'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: toda fila que ya existía (de antes de este módulo, sin id_bloque) ya ocurrió.
UPDATE sesion_clase SET estado = 'CERRADA' WHERE id_bloque IS NULL AND estado = 'PROGRAMADA';

-- asistencia_alumno: firma digital del alumno confirmando que asistió.
ALTER TABLE asistencia_alumno ADD COLUMN IF NOT EXISTS firma_alumno TEXT;
ALTER TABLE asistencia_alumno ADD COLUMN IF NOT EXISTS firmado_en   TIMESTAMP;

-- Reserva de un salón para uso especial (sin clase real) — mismo concepto que reserva_aeronave.
CREATE TABLE IF NOT EXISTS reserva_salon (
  id            SERIAL PRIMARY KEY,
  id_salon      INTEGER NOT NULL REFERENCES salon(id),
  fecha         DATE NOT NULL,
  id_bloque     INTEGER NOT NULL REFERENCES bloque_horario(id_bloque),
  id_bloque_fin INTEGER REFERENCES bloque_horario(id_bloque),
  motivo        VARCHAR(20) NOT NULL DEFAULT 'OTRO'
                  CHECK (motivo IN ('REUNION','EVENTO','ADMINISTRATIVO','OTRO')),
  descripcion   VARCHAR(200),
  creado_por    INTEGER REFERENCES usuario(id_usuario),
  creado_en     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reserva_salon_fecha ON reserva_salon (id_salon, fecha);

COMMIT;

-- Verificación
SELECT id, nombre FROM salon ORDER BY id;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'sesion_clase' AND column_name IN
    ('id_bloque','id_bloque_fin','id_salon','examen','estado','iniciada_en','cerrada_en');
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'asistencia_alumno' AND column_name IN ('firma_alumno','firmado_en');
SELECT COUNT(*) AS legacy_cerradas FROM sesion_clase WHERE id_bloque IS NULL AND estado = 'CERRADA';
