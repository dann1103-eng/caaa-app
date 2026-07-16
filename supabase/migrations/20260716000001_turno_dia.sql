-- =============================================================================
-- Ciclo operativo del día de TURNO: apertura / pausa de almuerzo / cambio de
-- turno / cierre, con timestamps reales de todo, y asistencia de los
-- instructores en turno (mañana/tarde) con entrada y salida.
-- Independiente de estado_operaciones (esa es la suspensión extraordinaria
-- por clima/NOTAM); esto es el ciclo NORMAL del día. 100% aditivo.
-- =============================================================================

BEGIN;

-- Una fila por fecha: el estado vigente del turno y sus hitos principales.
CREATE TABLE IF NOT EXISTS turno_dia (
  id_turno_dia SERIAL PRIMARY KEY,
  fecha        DATE NOT NULL UNIQUE,
  estado       VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
               CHECK (estado IN ('ABIERTO', 'EN_PAUSA', 'CERRADO')),
  apertura_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  abierto_por  INTEGER REFERENCES usuario(id_usuario),
  cierre_en    TIMESTAMPTZ,
  cerrado_por  INTEGER REFERENCES usuario(id_usuario)
);

-- Bitácora completa del día: cada acción queda con su timestamp real y quién
-- la registró. Sirve de auditoría y para reportes de jornada.
CREATE TABLE IF NOT EXISTS turno_evento (
  id_evento      SERIAL PRIMARY KEY,
  fecha          DATE NOT NULL,
  tipo           VARCHAR(20) NOT NULL
                 CHECK (tipo IN ('APERTURA', 'PAUSA', 'REANUDACION', 'CAMBIO_TURNO', 'CIERRE')),
  detalle        TEXT,
  registrado_por INTEGER REFERENCES usuario(id_usuario),
  registrado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_turno_evento_fecha ON turno_evento (fecha);

-- Asistencia de los instructores en turno. La asistencia ES el par de
-- timestamps entrada/salida; turno = MANANA o TARDE (cambio de turno).
CREATE TABLE IF NOT EXISTS turno_asistencia (
  id_asistencia  SERIAL PRIMARY KEY,
  fecha          DATE NOT NULL,
  turno          VARCHAR(10) NOT NULL CHECK (turno IN ('MANANA', 'TARDE')),
  id_instructor  INTEGER NOT NULL REFERENCES instructor(id_instructor),
  entrada_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  salida_en      TIMESTAMPTZ,
  registrado_por INTEGER REFERENCES usuario(id_usuario),
  UNIQUE (fecha, turno, id_instructor)
);
CREATE INDEX IF NOT EXISTS idx_turno_asistencia_fecha ON turno_asistencia (fecha);

COMMIT;

-- Verificación
SELECT to_regclass('turno_dia') AS turno_dia,
       to_regclass('turno_evento') AS turno_evento,
       to_regclass('turno_asistencia') AS turno_asistencia;
