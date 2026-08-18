-- =============================================================================
-- Migración 20260817000007 · Préstamo de partes entre talleres
--
-- Bitácora bidireccional: la OMA presta a un taller vecino y también pide
-- prestado. Afecta el inventario en tiempo real, con la particularidad de que
-- la entrada no está ligada a una factura y la salida no está ligada a una OT.
--
-- Spec: docs/superpowers/specs/2026-08-17-prestamo-de-partes-design.md
-- =============================================================================

BEGIN;

-- El préstamo mueve stock a través del inventario que ya existe, con un tipo
-- propio. Así reusa la cantidad con signo, el cache de stock, el kardex con
-- saldo corrido y la anulación con recálculo, sin duplicar nada.
ALTER TABLE taller_documento_inventario DROP CONSTRAINT IF EXISTS taller_documento_inventario_tipo_check;
ALTER TABLE taller_documento_inventario
  ADD CONSTRAINT taller_documento_inventario_tipo_check
  CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE','REQUISICION','RETORNO','PRESTAMO'));

CREATE TABLE IF NOT EXISTS taller_prestamo (
  id_prestamo       SERIAL PRIMARY KEY,
  anio              INTEGER NOT NULL,
  numero            INTEGER NOT NULL,
  correlativo       VARCHAR(24) NOT NULL UNIQUE,      -- 'PR-001-2026'

  -- El campo que en el papel hay que deducir de quién figura como solicitante.
  direccion         VARCHAR(10) NOT NULL CHECK (direccion IN ('RECIBIDO','ENTREGADO')),
  contraparte       VARCHAR(160) NOT NULL,            -- el taller vecino

  fecha_entrega     DATE NOT NULL DEFAULT CURRENT_DATE,
  solicitante       VARCHAR(160),
  entregado_por     VARCHAR(160),
  fecha_compromiso  DATE,                             -- nuevo: cuándo vuelve

  fecha_devolucion  DATE,
  devuelto_por      VARCHAR(160),
  recibido_por      VARCHAR(160),

  -- Columna y no derivado: un préstamo puede cerrarse SIN devolución física
  -- (se paga o se cruza en cuenta) y eso no se infiere de las fechas.
  estado            VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','DEVUELTO','ANULADO')),
  nota              TEXT,
  motivo_anulacion  TEXT,
  anulado_en        TIMESTAMP,
  anulado_por       INTEGER NULL REFERENCES usuario(id_usuario),
  creado_por        INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prestamo_estado ON taller_prestamo(estado, fecha_compromiso);

COMMENT ON TABLE taller_prestamo IS
  'Bitácora de préstamos entre talleres del aeropuerto. Bidireccional: RECIBIDO es lo que pedimos prestado, ENTREGADO lo que prestamos.';

CREATE TABLE IF NOT EXISTS taller_prestamo_linea (
  id_linea    SERIAL PRIMARY KEY,
  id_prestamo INTEGER NOT NULL REFERENCES taller_prestamo(id_prestamo) ON DELETE CASCADE,
  -- Si apunta al catálogo mueve existencia. Si es NULL solo queda registrada:
  -- en la misma hoja conviven aceite y filtros con el libro de registro de
  -- horas y el certificado de aeronavegabilidad, que no son stock.
  id_repuesto INTEGER NULL REFERENCES taller_repuesto(id_repuesto),
  descripcion VARCHAR(200) NOT NULL,
  parte_no    VARCHAR(80),
  cantidad    NUMERIC(12,2) NOT NULL,      -- columna propia: en el papel iba dentro del texto
  unidad      VARCHAR(20),
  devuelto    NUMERIC(12,2) NOT NULL DEFAULT 0,
  orden       SMALLINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_prestamo_linea ON taller_prestamo_linea(id_prestamo);

-- Enlace con los documentos de bodega que genera (entrega y devolución).
ALTER TABLE taller_documento_inventario
  ADD COLUMN IF NOT EXISTS id_prestamo INTEGER NULL REFERENCES taller_prestamo(id_prestamo);
CREATE INDEX IF NOT EXISTS idx_taller_doc_prestamo ON taller_documento_inventario(id_prestamo);

INSERT INTO taller_formulario (clave, nombre, codigo, revision)
VALUES ('PRESTAMO', 'PRESTAMO DE PARTES', NULL, NULL)
ON CONFLICT (clave) DO NOTHING;

COMMIT;
