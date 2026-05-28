-- =============================================================================
-- Migración 004: Módulo Aula Virtual
--
-- Permite seguir el progreso teórico de cada alumno a través de las unidades
-- de su curso (licencia) y gestionar evaluaciones con notas.
--
-- Tablas:
--   * unidad_teorica            — catálogo de unidades por curso
--   * progreso_unidad_alumno    — estado por unidad de cada alumno
--   * evaluacion                — evaluaciones programadas
--   * evaluacion_alumno         — resultado/nota por alumno
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS unidad_teorica (
  id                  SERIAL PRIMARY KEY,
  id_curso            INTEGER NOT NULL REFERENCES curso(id) ON DELETE CASCADE,
  numero              INTEGER NOT NULL,
  nombre              VARCHAR(160) NOT NULL,
  descripcion         TEXT,
  horas_estimadas     NUMERIC(5,1) DEFAULT 0,
  orden               INTEGER NOT NULL DEFAULT 0,
  recursos_url        TEXT,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_unidad_curso ON unidad_teorica (id_curso, orden);

CREATE TABLE IF NOT EXISTS progreso_unidad_alumno (
  id                  SERIAL PRIMARY KEY,
  id_alumno           INTEGER NOT NULL,
  id_unidad           INTEGER NOT NULL REFERENCES unidad_teorica(id) ON DELETE CASCADE,
  id_inscripcion      INTEGER NULL REFERENCES inscripcion_curso(id) ON DELETE SET NULL,
  estado              VARCHAR(20) NOT NULL DEFAULT 'NO_INICIADA'
                      CHECK (estado IN ('NO_INICIADA','EN_PROGRESO','COMPLETADA','REPROBADA')),
  fecha_inicio        DATE NULL,
  fecha_completada    DATE NULL,
  horas_acumuladas    NUMERIC(5,1) DEFAULT 0,
  observaciones       TEXT,
  actualizado_por     INTEGER NULL,
  actualizado_en      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (id_alumno, id_unidad)
);

CREATE TABLE IF NOT EXISTS evaluacion (
  id                  SERIAL PRIMARY KEY,
  id_curso            INTEGER NOT NULL REFERENCES curso(id) ON DELETE CASCADE,
  id_unidad           INTEGER NULL REFERENCES unidad_teorica(id) ON DELETE SET NULL,
  nombre              VARCHAR(180) NOT NULL,
  tipo                VARCHAR(20) NOT NULL DEFAULT 'EXAMEN'
                      CHECK (tipo IN ('EXAMEN','QUIZ','TAREA','PRACTICA','FINAL')),
  fecha_programada    DATE NULL,
  puntos_max          NUMERIC(5,1) NOT NULL DEFAULT 100,
  nota_aprobacion     NUMERIC(5,1) NOT NULL DEFAULT 70,
  id_instructor       INTEGER NULL,
  descripcion         TEXT,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_evaluacion_curso ON evaluacion (id_curso, fecha_programada);

CREATE TABLE IF NOT EXISTS evaluacion_alumno (
  id                  SERIAL PRIMARY KEY,
  id_evaluacion       INTEGER NOT NULL REFERENCES evaluacion(id) ON DELETE CASCADE,
  id_alumno           INTEGER NOT NULL,
  estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE','PRESENTADA','CALIFICADA','AUSENTE','ANULADA')),
  nota                NUMERIC(5,1) NULL,
  fecha_presentacion  DATE NULL,
  observaciones       TEXT,
  archivo_path        VARCHAR(255) NULL,
  calificado_por      INTEGER NULL,
  calificado_en       TIMESTAMP NULL,
  UNIQUE (id_evaluacion, id_alumno)
);
CREATE INDEX IF NOT EXISTS ix_evaluacion_alumno ON evaluacion_alumno (id_alumno);

-- ---------------------------------------------------------------------------
-- Seeds: unidades por curso
-- ---------------------------------------------------------------------------

-- Piloto Privado (10 unidades estándar OACI)
INSERT INTO unidad_teorica (id_curso, numero, nombre, horas_estimadas, orden)
SELECT id, 1,  'Regulaciones aéreas',                 4, 1  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 2, 'Conocimiento general de aeronaves',   4, 2  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 3, 'Performance y planeamiento de vuelo', 4, 3  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 4, 'Capacidades humanas (Factores)',      3, 4  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 5, 'Meteorología',                        5, 5  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 6, 'Navegación',                          6, 6  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 7, 'Procedimientos operacionales',        3, 7  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 8, 'Principios de vuelo',                 4, 8  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 9, 'Comunicaciones y radiotelefonía',     3, 9  FROM curso WHERE codigo = 'PP'
UNION ALL SELECT id, 10,'Examen integrador AAC',               4, 10 FROM curso WHERE codigo = 'PP';

-- Habilitación por Instrumentos (8 unidades)
INSERT INTO unidad_teorica (id_curso, numero, nombre, horas_estimadas, orden)
SELECT id, 1, 'Reglamentación IFR',                      4, 1 FROM curso WHERE codigo = 'IFR'
UNION ALL SELECT id, 2, 'Sistema y procedimientos IFR',  6, 2 FROM curso WHERE codigo = 'IFR'
UNION ALL SELECT id, 3, 'Cartas de aproximación',        6, 3 FROM curso WHERE codigo = 'IFR'
UNION ALL SELECT id, 4, 'Meteorología avanzada',         5, 4 FROM curso WHERE codigo = 'IFR'
UNION ALL SELECT id, 5, 'Sistemas de navegación',        6, 5 FROM curso WHERE codigo = 'IFR'
UNION ALL SELECT id, 6, 'Performance aeronave IFR',      4, 6 FROM curso WHERE codigo = 'IFR'
UNION ALL SELECT id, 7, 'Factores humanos en IFR',       3, 7 FROM curso WHERE codigo = 'IFR'
UNION ALL SELECT id, 8, 'Examen integrador IFR',         6, 8 FROM curso WHERE codigo = 'IFR';

-- Piloto Comercial (8 unidades)
INSERT INTO unidad_teorica (id_curso, numero, nombre, horas_estimadas, orden)
SELECT id, 1, 'Reglamentación CPL',                       4, 1 FROM curso WHERE codigo = 'CPL'
UNION ALL SELECT id, 2, 'Performance y limitaciones',     5, 2 FROM curso WHERE codigo = 'CPL'
UNION ALL SELECT id, 3, 'Sistemas avanzados de aeronaves',5, 3 FROM curso WHERE codigo = 'CPL'
UNION ALL SELECT id, 4, 'Meteorología operacional',       5, 4 FROM curso WHERE codigo = 'CPL'
UNION ALL SELECT id, 5, 'Navegación avanzada',            5, 5 FROM curso WHERE codigo = 'CPL'
UNION ALL SELECT id, 6, 'Procedimientos comerciales',     5, 6 FROM curso WHERE codigo = 'CPL'
UNION ALL SELECT id, 7, 'CRM y factores humanos',         4, 7 FROM curso WHERE codigo = 'CPL'
UNION ALL SELECT id, 8, 'Examen integrador CPL',          7, 8 FROM curso WHERE codigo = 'CPL';

-- Bimotor (4 unidades)
INSERT INTO unidad_teorica (id_curso, numero, nombre, horas_estimadas, orden)
SELECT id, 1, 'Sistemas bimotor',                         3, 1 FROM curso WHERE codigo = 'MULTI'
UNION ALL SELECT id, 2, 'Procedimientos asimétricos',     3, 2 FROM curso WHERE codigo = 'MULTI'
UNION ALL SELECT id, 3, 'Performance multimotor',         2, 3 FROM curso WHERE codigo = 'MULTI'
UNION ALL SELECT id, 4, 'Examen bimotor',                 2, 4 FROM curso WHERE codigo = 'MULTI';

-- Piloto Instructor (8 unidades)
INSERT INTO unidad_teorica (id_curso, numero, nombre, horas_estimadas, orden)
SELECT id, 1, 'Pedagogía aeronáutica',                    5, 1 FROM curso WHERE codigo = 'INST'
UNION ALL SELECT id, 2, 'Técnicas de enseñanza',          5, 2 FROM curso WHERE codigo = 'INST'
UNION ALL SELECT id, 3, 'Briefings y debriefings',        4, 3 FROM curso WHERE codigo = 'INST'
UNION ALL SELECT id, 4, 'Evaluación de progreso',         4, 4 FROM curso WHERE codigo = 'INST'
UNION ALL SELECT id, 5, 'Seguridad en instrucción',       5, 5 FROM curso WHERE codigo = 'INST'
UNION ALL SELECT id, 6, 'Maniobras avanzadas',            5, 6 FROM curso WHERE codigo = 'INST'
UNION ALL SELECT id, 7, 'Gestión de aula y vuelo',        5, 7 FROM curso WHERE codigo = 'INST'
UNION ALL SELECT id, 8, 'Examen instructor',              7, 8 FROM curso WHERE codigo = 'INST';

COMMIT;
