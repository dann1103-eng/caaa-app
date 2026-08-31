-- =============================================================================
-- Migración 20260817000001 · Inventario del Taller (bodega OMA)
--
-- Convierte el inventario de repuestos (migración 011, hoy con 3 repuestos y 2
-- movimientos de demo) en el modelo que replica el Excel de la bodega OMA:
--
--   catálogo (taller_repuesto)
--     └─ documento (taller_documento_inventario)   ← NUEVO: la FA / la REQ / el AJ
--          └─ renglón (taller_movimiento_inventario)
--
-- Spec: docs/superpowers/specs/2026-08-17-inventario-taller-design.md
--
-- No es 100% aditiva. Los cambios no aditivos, todos autorizados por Daniel:
--   · taller_repuesto.unidad pasa a lista cerrada (normaliza + CHECK nuevo)
--   · taller_movimiento_inventario.cantidad pasa a SIGNADA (+entra / −sale)
--   · se le quitan al renglón las columnas que ahora viven en la cabecera
--     (tipo, fecha, id_aeronave, id_egreso, registrado_por) para que no haya
--     dos fuentes de verdad del mismo dato — la deriva que este repo ya sufrió
--     varias veces.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · Capacidad "jefe de taller"
--
-- Habilita forzar una salida sin existencia y anular documentos. Mismo patrón
-- que puede_programar / puede_operaciones del instructor, pero sobre `usuario`
-- porque el rol TALLER no tiene tabla propia de extensión.
-- ---------------------------------------------------------------------------
ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS puede_forzar_inventario BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 2 · Aeronaves de terceros
--
-- La OMA le da mantenimiento a aviones que no son de la escuela (YS-361-PE
-- tiene hasta una inspección anual completa en el Excel). Necesitan existir
-- para poder requisarles material, pero NO deben aparecer en ningún selector
-- de vuelo.
--
-- ⚠️ No sirve darlas de alta como baja lógica (activa=false, estado='ACTIVO'):
-- sincronizarEstadoFlota() recalcula `activa` según el mantenimiento del día,
-- así que al cerrarle un mantenimiento a un avión de tercero el job lo pondría
-- activa=true y aparecería en los selectores. Por eso es columna propia.
-- ---------------------------------------------------------------------------
ALTER TABLE aeronave
  ADD COLUMN IF NOT EXISTS es_externa BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 3 · Catálogo de repuestos
-- ---------------------------------------------------------------------------
ALTER TABLE taller_repuesto
  ADD COLUMN IF NOT EXISTS codigo               VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ultimo_movimiento_en DATE,
  ADD COLUMN IF NOT EXISTS ultima_entrada_en    DATE,
  ADD COLUMN IF NOT EXISTS es_serializado       BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN taller_repuesto.codigo IS
  'Correlativo interno de 6 dígitos (000039). Es la llave real del ítem: el Excel cruzaba por descripción+PN y eso hacía invisibles los movimientos mal tecleados.';
COMMENT ON COLUMN taller_repuesto.ultimo_movimiento_en IS
  'Mantenida por el sistema. Reemplaza el "SIN MOVIMIENTO" que se tecleaba a mano en el Excel.';
COMMENT ON COLUMN taller_repuesto.ultima_entrada_en IS
  'La "FECHA DE ACTUALIZACION" del Excel, que allá era texto libre.';
COMMENT ON COLUMN taller_repuesto.stock_actual IS
  'Cache de SUM(movimiento.cantidad). Suma con signo => independiente del orden de inserción; no sufre el problema del saldo congelado. Lo necesita el bloqueo por existencia bajo FOR UPDATE.';

-- Único, pero tolera NULL mientras se completa el catálogo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_taller_repuesto_codigo
  ON taller_repuesto(codigo) WHERE codigo IS NOT NULL;

-- Unidad de medida: lista cerrada. En el Excel el mismo aceite entró como
-- UN, QT, QTO y QTS. Primero se normaliza lo que haya, después entra el CHECK.
UPDATE taller_repuesto SET unidad = CASE
    WHEN UPPER(TRIM(COALESCE(unidad,''))) IN ('QT','QTO','QTS','QUART')  THEN 'QT'
    WHEN UPPER(TRIM(COALESCE(unidad,''))) IN ('FT','PIE','PIES','FEET')  THEN 'FT'
    WHEN UPPER(TRIM(COALESCE(unidad,''))) IN ('GAL','GALON','GALLON')    THEN 'GAL'
    WHEN UPPER(TRIM(COALESCE(unidad,''))) IN ('KIT')                     THEN 'KIT'
    WHEN UPPER(TRIM(COALESCE(unidad,''))) IN ('JGO','JUEGO','SET')       THEN 'JGO'
    WHEN UPPER(TRIM(COALESCE(unidad,''))) IN ('LB','LBS','LIBRA')        THEN 'LB'
    ELSE 'UN'
  END;

ALTER TABLE taller_repuesto ALTER COLUMN unidad SET DEFAULT 'UN';
ALTER TABLE taller_repuesto DROP CONSTRAINT IF EXISTS taller_repuesto_unidad_check;
ALTER TABLE taller_repuesto ADD CONSTRAINT taller_repuesto_unidad_check
  CHECK (unidad IN ('UN','QT','GAL','FT','KIT','JGO','LB'));

-- ---------------------------------------------------------------------------
-- 4 · Cabecera de documento (NUEVA)
--
-- Una FA (entrada), una REQ (salida) o un AJ (ajuste) con sus N renglones.
-- En el Excel FA-00001-2026 tiene 357 renglones: sin cabecera, el proveedor y
-- la factura se repetirían 357 veces y podrían contradecirse entre sí.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller_documento_inventario (
  id_documento      SERIAL PRIMARY KEY,
  tipo              VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE')),
  anio              INTEGER     NOT NULL,
  numero            INTEGER     NOT NULL,
  correlativo       VARCHAR(24) NOT NULL,        -- 'FA-00001-2026' | 'REQ-001-2026' | 'AJ-001-2026'
  fecha             DATE        NOT NULL DEFAULT CURRENT_DATE,

  -- ENTRADA -----------------------------------------------------------------
  proveedor         VARCHAR(160),
  factura_no        VARCHAR(60),                 -- el número REAL de la factura del proveedor
  id_egreso         INTEGER NULL REFERENCES egreso(id),

  -- SALIDA ------------------------------------------------------------------
  id_aeronave       INTEGER NULL REFERENCES aeronave(id_aeronave),
  id_cumplimiento   INTEGER NULL REFERENCES taller_cumplimiento(id_cumplimiento),
  id_mantenimiento  INTEGER NULL REFERENCES mantenimiento_aeronave(id_mantenimiento),
  motivo            TEXT,

  -- Siempre -----------------------------------------------------------------
  estado            VARCHAR(12) NOT NULL DEFAULT 'VIGENTE'
                    CHECK (estado IN ('VIGENTE','ANULADO')),
  anulado_en        TIMESTAMP,
  anulado_por       INTEGER NULL REFERENCES usuario(id_usuario),
  motivo_anulacion  TEXT,
  nota              TEXT,
  origen            VARCHAR(20),                 -- 'EXCEL_2026' en lo migrado, NULL en lo nuevo
  registrado_por    INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW(),

  -- El correlativo no se reutiliza ni se repite dentro del año.
  CONSTRAINT uq_taller_doc_correlativo UNIQUE (tipo, anio, numero),
  -- Una salida se cuelga de una inspección cumplida O de un mantenimiento,
  -- nunca de las dos.
  CONSTRAINT ck_taller_doc_origen_mantenimiento
    CHECK (id_cumplimiento IS NULL OR id_mantenimiento IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_taller_doc_fecha     ON taller_documento_inventario(fecha);
CREATE INDEX IF NOT EXISTS idx_taller_doc_tipo      ON taller_documento_inventario(tipo, estado);
CREATE INDEX IF NOT EXISTS idx_taller_doc_aeronave  ON taller_documento_inventario(id_aeronave);

COMMENT ON TABLE taller_documento_inventario IS
  'Cabecera del movimiento de bodega. El correlativo lo genera el servidor dentro de la transacción con pg_advisory_xact_lock por (tipo, año) y reinicia cada año.';

-- ---------------------------------------------------------------------------
-- 5 · Renglón del documento
-- ---------------------------------------------------------------------------
ALTER TABLE taller_movimiento_inventario
  ADD COLUMN IF NOT EXISTS id_documento   INTEGER REFERENCES taller_documento_inventario(id_documento),
  ADD COLUMN IF NOT EXISTS forzado        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_forzado TEXT;

-- Los movimientos que existían antes de la cabecera se reencauzan a un
-- documento de apertura y se les pone signo. Si apareciera un AJUSTE viejo
-- (semántica "fijar stock", no delta) la migración se detiene en vez de
-- convertirlo mal en silencio.
DO $$
DECLARE
  v_doc  INTEGER;
  v_anio INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_aj   INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM taller_movimiento_inventario WHERE id_documento IS NULL) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_aj
    FROM taller_movimiento_inventario
   WHERE id_documento IS NULL AND tipo = 'AJUSTE';
  IF v_aj > 0 THEN
    RAISE EXCEPTION
      'Hay % movimiento(s) AJUSTE con la semántica vieja (fijar stock absoluto). No se pueden convertir a delta automáticamente: revisalos a mano antes de correr esta migración.', v_aj;
  END IF;

  INSERT INTO taller_documento_inventario
    (tipo, anio, numero, correlativo, fecha, motivo, nota, origen)
  VALUES
    ('AJUSTE', v_anio, 0, 'AJ-000-' || v_anio, CURRENT_DATE,
     'Movimientos previos a la cabecera de documento',
     'Creado por la migración 20260817000001: agrupa los movimientos que existían antes de que el inventario trabajara por documentos.',
     'PRE_DOCUMENTO')
  RETURNING id_documento INTO v_doc;

  UPDATE taller_movimiento_inventario
     SET cantidad     = CASE WHEN tipo = 'SALIDA' THEN -ABS(cantidad) ELSE ABS(cantidad) END,
         id_documento = v_doc
   WHERE id_documento IS NULL;
END $$;

ALTER TABLE taller_movimiento_inventario ALTER COLUMN id_documento SET NOT NULL;

-- Estas cinco ahora viven en la cabecera. Mantenerlas duplicadas en el renglón
-- es justo la clase de deriva que ya nos costó caro en este repo.
ALTER TABLE taller_movimiento_inventario
  DROP COLUMN IF EXISTS tipo,
  DROP COLUMN IF EXISTS fecha,
  DROP COLUMN IF EXISTS id_aeronave,
  DROP COLUMN IF EXISTS id_egreso,
  DROP COLUMN IF EXISTS registrado_por;

CREATE INDEX IF NOT EXISTS idx_taller_mov_documento
  ON taller_movimiento_inventario(id_documento);

COMMENT ON COLUMN taller_movimiento_inventario.cantidad IS
  'SIGNADA: + entra, − sale, ± ajusta. Así el saldo del kardex es una suma acumulada calculada AL LEER (window function), nunca congelada — la lección de la cuenta corriente (§26.A): un movimiento con fecha anterior deja mintiendo a todo lo de abajo.';
COMMENT ON COLUMN taller_movimiento_inventario.costo_unitario IS
  'En ENTRADA, el costo de la factura (opcional). En SALIDA, foto del costo vigente del ítem al momento de consumirlo.';

COMMIT;
