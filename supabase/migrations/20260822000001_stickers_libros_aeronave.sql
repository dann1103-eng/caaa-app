-- =============================================================================
-- Migración 20260822000001 · Stickers de constancia para los libros del avión
--
-- Cada avión lleva tres libros físicos (célula, motor, hélice) exigidos por la
-- AAC, y cada trabajo se acredita pegando un sticker impreso. Hoy se escriben a
-- mano en Word y los números se copian del formato anterior.
--
-- Todo aditivo: ADD COLUMN IF NOT EXISTS y CREATE TABLE IF NOT EXISTS.
--
-- Spec: docs/superpowers/specs/2026-08-22-stickers-libros-aeronave-design.md
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · taller_componente — lo que le falta para poder imprimir la cabecera
--
-- La tabla ya existía desde la migración 011 con la fórmula correcta:
--   horas del componente = aeronave.horas_acumuladas
--                        - horas_aeronave_instalacion
--                        + horas_componente_instalacion
-- Nunca se llenó. Los stickers reales confirman que ese offset es exacto y
-- estable: en el YS-334-PE el motor da +7,088.42 idéntico en tres stickers de
-- fechas distintas, y la hélice -1,846.32 en los tres.
--
-- Leído en clave de sticker:
--   parte_no                     -> M/N
--   serie_no                     -> S/N
--   horas_aeronave_instalacion   -> el TAC del anclaje   (ESCALA CRUDA, ver 2)
--   horas_componente_instalacion -> el T.T. en ese TAC
-- ---------------------------------------------------------------------------
ALTER TABLE taller_componente ADD COLUMN IF NOT EXISTS marca            VARCHAR(80);
ALTER TABLE taller_componente ADD COLUMN IF NOT EXISTS modelo           VARCHAR(80);
ALTER TABLE taller_componente ADD COLUMN IF NOT EXISTS tipo_certificado VARCHAR(40);

-- TSO en el momento del anclaje. NULL = la parte no lleva TSO y el sticker
-- imprime "N/A" — que es el caso de toda célula.
ALTER TABLE taller_componente ADD COLUMN IF NOT EXISTS tso_ancla NUMERIC(10,2);

-- Quién movió el anclaje y desde dónde. El mecánico puede re-anclar al emitir
-- un sticker (el número ya quedó impreso y firmado en un libro oficial), pero
-- el jefe tiene que poder verlo: sin esto el cambio quedaría en silencio.
ALTER TABLE taller_componente ADD COLUMN IF NOT EXISTS ancla_actualizado_en  TIMESTAMP;
ALTER TABLE taller_componente ADD COLUMN IF NOT EXISTS ancla_actualizado_por INTEGER NULL REFERENCES usuario(id_usuario);
ALTER TABLE taller_componente ADD COLUMN IF NOT EXISTS ancla_origen          VARCHAR(160);

COMMENT ON COLUMN taller_componente.horas_aeronave_instalacion IS
  'TAC del anclaje, en la ESCALA CRUDA del sistema (sin aeronave.tac_offset).';
COMMENT ON COLUMN taller_componente.horas_componente_instalacion IS
  'T.T. de la parte en ese TAC, en la escala del libro. T.T. actual = (lectura - este TAC) + este T.T.';

-- ---------------------------------------------------------------------------
-- 2 · aeronave.tac_offset — el tacómetro que dio la vuelta
--
-- El tacómetro del YS-334-PE llegó a 9999.99 entre sep-2025 y feb-2026 y volvió
-- a 0000.03. Los mecánicos le suman 10,000 a mano en los libros; los
-- instructores digitan la lectura cruda (127 lecturas en la BD, todas entre
-- 331.07 y 429.10). Los otros aviones no tienen el problema.
--
-- SE APLICA SOLO AL IMPRIMIR DOCUMENTOS DEL TALLER. No toca horas_acumuladas,
-- ni el ciclo 25/50/100, ni la vouchera: esos trabajan con DIFERENCIAS, y una
-- diferencia no cambia si se le suma una constante a los dos extremos.
-- ---------------------------------------------------------------------------
ALTER TABLE aeronave ADD COLUMN IF NOT EXISTS tac_offset NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN aeronave.tac_offset IS
  'Cuánto sumarle a la lectura del sistema para llegar al TAC que llevan los libros (tacómetro reiniciado). Solo se usa al imprimir documentos del Taller.';

-- ---------------------------------------------------------------------------
-- 3 · Plantillas de texto — la precarga del cuerpo del sticker
--
-- El bloque técnico se repite ("conforme al manual P/N 761-660 capítulo
-- 5-20-00 pág. 3 a 12 y RAC 43 Apéndice D") y cambia por avión: 761-660 el
-- Tomahawk, D2064-1-13 el 152, 753-586 el Cherokee y el Arrow. Lo del día no.
-- Editable desde la app, mismo criterio que taller_formulario: que una
-- redacción nueva no obligue a desplegar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller_sticker_plantilla (
  id_plantilla    SERIAL PRIMARY KEY,
  id_aeronave     INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  parte           VARCHAR(10) NOT NULL CHECK (parte IN ('CELULA','MOTOR','HELICE')),
  tipo            VARCHAR(20) NOT NULL
                  CHECK (tipo IN ('25H','50H','100H','ANUAL','NO_PROGRAMADO','CIERRE','APERTURA')),
  texto           TEXT NOT NULL DEFAULT '',
  actualizado_en  TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador'),
  actualizado_por INTEGER NULL REFERENCES usuario(id_usuario),
  UNIQUE (id_aeronave, parte, tipo)
);

COMMENT ON TABLE taller_sticker_plantilla IS
  'Texto precargado del sticker por avión x parte x tipo de inspección. El mecánico lo edita libremente al emitir.';

-- ---------------------------------------------------------------------------
-- 4 · El sticker emitido — congelado
--
-- No se llama orden_trabajo_sticker porque PUEDE EXISTIR SIN ORDEN: el cierre y
-- la apertura de libro no tienen una.
--
-- Guarda todo lo que se imprimió. Una vez pegado en el libro es un registro
-- legal ante la AAC: si mañana alguien corrige un anclaje, el papel viejo no
-- puede cambiar solo. Misma lógica que nomina_periodo.config_snapshot.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller_sticker (
  id_sticker      SERIAL PRIMARY KEY,
  id_aeronave     INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  id_orden        INTEGER NULL REFERENCES orden_trabajo(id_orden),
  id_componente   INTEGER NULL REFERENCES taller_componente(id_componente),
  parte           VARCHAR(10) NOT NULL CHECK (parte IN ('CELULA','MOTOR','HELICE')),
  tipo            VARCHAR(20) NOT NULL
                  CHECK (tipo IN ('25H','50H','100H','ANUAL','NO_PROGRAMADO','CIERRE','APERTURA')),
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  lugar           VARCHAR(60) NOT NULL DEFAULT 'Ilopango',

  -- Cabecera congelada, tal como salió impresa
  matricula       VARCHAR(20)  NOT NULL,
  marca           VARCHAR(80),
  modelo          VARCHAR(80),
  mn              VARCHAR(80),
  sn              VARCHAR(80),
  tc              VARCHAR(40),
  tac             NUMERIC(10,2) NOT NULL,      -- ya con el tac_offset aplicado
  tt              NUMERIC(10,2),
  tso             NUMERIC(10,2),               -- NULL => se imprime "N/A"

  texto             TEXT NOT NULL,
  orden_trabajo_no  VARCHAR(24),

  -- Firmas congeladas: el nombre y la licencia del día en que se firmó
  id_mecanico          INTEGER NOT NULL REFERENCES usuario(id_usuario),
  mecanico_nombre      VARCHAR(160) NOT NULL,
  mecanico_tma         VARCHAR(40),
  id_aprendiz          INTEGER NULL REFERENCES usuario(id_usuario),
  aprendiz_nombre      VARCHAR(160),
  aprendiz_certificado VARCHAR(40),

  -- Los mini stickers de "próxima inspección" que se imprimen junto al grande
  proxima_25      NUMERIC(10,2),
  proxima_50      NUMERIC(10,2),

  estado           VARCHAR(10) NOT NULL DEFAULT 'EMITIDO'
                   CHECK (estado IN ('EMITIDO','ANULADO')),
  motivo_anulacion TEXT,
  anulado_en       TIMESTAMP,
  anulado_por      INTEGER NULL REFERENCES usuario(id_usuario),

  creado_por      INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en       TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador'),

  -- Un sticker anulado tiene motivo y fecha, sí o sí.
  CONSTRAINT ck_sticker_anulado CHECK (
    estado <> 'ANULADO' OR (motivo_anulacion IS NOT NULL AND anulado_en IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_sticker_libro  ON taller_sticker(id_aeronave, parte, fecha DESC, id_sticker DESC);
CREATE INDEX IF NOT EXISTS idx_sticker_orden  ON taller_sticker(id_orden);

COMMENT ON TABLE taller_sticker IS
  'Sticker impreso y pegado en el libro físico del avión. Registro congelado: se re-imprime tal cual, nunca recalculado.';
COMMENT ON COLUMN taller_sticker.tac IS
  'TAC tal como se imprimió, en la escala del libro (lectura + aeronave.tac_offset).';

-- ---------------------------------------------------------------------------
-- 5 · El certificado de la OMA no va incrustado en el generador
-- ---------------------------------------------------------------------------
INSERT INTO taller_formulario (clave, nombre, codigo, revision) VALUES
  ('STICKER', 'STICKER DE CONSTANCIA PARA LIBROS DE LA AERONAVE', 'CO-OMA-CAAA-014', NULL)
ON CONFLICT (clave) DO NOTHING;

COMMIT;
