-- Fase 3 (incremento 3) — Asistencia a clases teóricas
--
-- Una "sesión de clase" es una clase impartida (de una unidad del curso) en una
-- fecha. El instructor pasa lista: por cada alumno del curso registra su estado.

CREATE TABLE IF NOT EXISTS sesion_clase (
  id            BIGSERIAL PRIMARY KEY,
  id_curso      INTEGER NOT NULL REFERENCES curso(id) ON DELETE CASCADE,
  id_unidad     INTEGER REFERENCES unidad_teorica(id) ON DELETE SET NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  tema          VARCHAR(200),
  id_instructor INTEGER,
  creado_por    INTEGER,
  creado_en     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_sesion_curso ON sesion_clase(id_curso, fecha);

CREATE TABLE IF NOT EXISTS asistencia_alumno (
  id             BIGSERIAL PRIMARY KEY,
  id_sesion      INTEGER NOT NULL REFERENCES sesion_clase(id) ON DELETE CASCADE,
  id_alumno      INTEGER NOT NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'PRESENTE'
                 CHECK (estado IN ('PRESENTE','AUSENTE','TARDE','JUSTIFICADO')),
  observacion    VARCHAR(200),
  registrado_por INTEGER,
  registrado_en  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (id_sesion, id_alumno)
);

-- Verificación
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='sesion_clase') AS sesion_clase,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='asistencia_alumno') AS asistencia;
