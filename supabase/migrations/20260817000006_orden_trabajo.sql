-- =============================================================================
-- Migración 20260817000006 · Orden de Trabajo, Reporte de Inspección y rol TECNICO
--
-- Fase 2 del papeleo del Taller. La Orden de Trabajo pasa a ser la columna
-- vertebral: el trabajo que el técnico abre y del que cuelga todo lo demás.
--
--   REPORTE DE INSPECCIÓN ──► ORDEN DE TRABAJO ──┬──► requisición → solicitud → retorno
--        (dispara)              (el trabajo)     └──► parte reemplazada
--
-- Spec: docs/superpowers/specs/2026-08-17-orden-trabajo-e-interfaz-taller-design.md
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · Roles
--
-- 🚨 El enum audit_actor_rol va PRIMERO y sin falta. Si un rol existe en
-- usuario.rol pero no en el enum, CUALQUIER acción auditada de ese usuario hace
-- rollback en silencio. Ya está documentado como el tropiezo de ADMINISTRACION.
--
-- De paso entra DUENO, que se agregó al CHECK de usuario.rol pero nunca al
-- enum: hoy un dueño que ejecute una acción auditada la pierde.
-- ---------------------------------------------------------------------------
ALTER TYPE audit_actor_rol ADD VALUE IF NOT EXISTS 'DUENO';
ALTER TYPE audit_actor_rol ADD VALUE IF NOT EXISTS 'TECNICO';

COMMIT;

-- ADD VALUE de un enum no puede usarse en la misma transacción que lo amplía,
-- así que el resto va en un bloque nuevo.
BEGIN;

ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_rol_check;
ALTER TABLE usuario
  ADD CONSTRAINT usuario_rol_check
  CHECK (rol IN ('ADMIN','PROGRAMACION','TURNO','ALUMNO','INSTRUCTOR',
                 'ADMINISTRACION','TALLER','DUENO','TECNICO'));

-- ---------------------------------------------------------------------------
-- 2 · Datos que el papel pide de las personas y de la aeronave
-- ---------------------------------------------------------------------------
ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS licencia_tma         VARCHAR(40),
  ADD COLUMN IF NOT EXISTS certificado_aprendiz VARCHAR(40);

COMMENT ON COLUMN usuario.licencia_tma IS
  'Licencia del mecánico (TMA 915). Va en la firma de la Orden de Trabajo: firmar es una acción del sistema, no un nombre tecleado.';

ALTER TABLE aeronave
  ADD COLUMN IF NOT EXISTS designacion VARCHAR(60);

COMMENT ON COLUMN aeronave.designacion IS
  'Designación del fabricante (PA-28R-180), que es lo que pide la Orden de Trabajo. `modelo` guarda el código interno (ARROW).';

-- Lo que ya se sabe de la flota, del cotejo con las órdenes en papel.
UPDATE aeronave SET designacion = 'PA-28R-180' WHERE codigo = 'YS-127-P'  AND designacion IS NULL;
UPDATE aeronave SET designacion = 'PA-28-180'  WHERE codigo = 'YS-361-PE' AND designacion IS NULL;

-- ---------------------------------------------------------------------------
-- 3 · Reporte de Inspección — el disparador
--
-- Es la entrega del avión de Operaciones al Taller. Lo llena el Taller,
-- anotando qué piloto reportó (decisión de Daniel): no se toca ninguna
-- pantalla de Operaciones.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reporte_inspeccion (
  id_reporte        SERIAL PRIMARY KEY,
  anio              INTEGER NOT NULL,
  numero            INTEGER NOT NULL,
  correlativo       VARCHAR(24) NOT NULL UNIQUE,      -- 'RI-001-2026'
  id_aeronave       INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  tacometro         NUMERIC(10,2),
  id_piloto         INTEGER NULL REFERENCES usuario(id_usuario),
  piloto_nombre     VARCHAR(160),                     -- si no es usuario del sistema
  tipo_inspeccion   VARCHAR(60),                      -- '100 hrs', 'Correctivo'
  observaciones     TEXT,
  trabajo_realizado TEXT,
  recibido_por      INTEGER NULL REFERENCES usuario(id_usuario),
  estado            VARCHAR(12) NOT NULL DEFAULT 'VIGENTE'
                    CHECK (estado IN ('VIGENTE','ANULADO')),
  motivo_anulacion  TEXT,
  anulado_en        TIMESTAMP,
  anulado_por       INTEGER NULL REFERENCES usuario(id_usuario),
  creado_por        INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reporte_insp_aeronave ON reporte_inspeccion(id_aeronave, fecha DESC);

-- ---------------------------------------------------------------------------
-- 4 · Orden de Trabajo — el trabajo
--
-- ⚠️ Se numera al ABRIR, aunque el papel se llene al final. Su número ya
-- aparece en la Solicitud al Almacén, que se hace antes: en el trabajo del
-- YS-127-P la solicitud del 09-jul lleva CAAA/2026-0049 mientras la cabecera de
-- la OT dice 06-jul.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orden_trabajo (
  id_orden          SERIAL PRIMARY KEY,
  anio              INTEGER NOT NULL,
  numero            INTEGER NOT NULL,
  correlativo       VARCHAR(24) NOT NULL UNIQUE,      -- 'CAAA/2026-0049'
  id_aeronave       INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,   -- apertura del trabajo
  tacometro         NUMERIC(10,2),
  piloto_operador   VARCHAR(160),

  discrepancia      TEXT NOT NULL,       -- "Trabajo a efectuar" o la falla
  accion_correctiva TEXT,                -- se escribe al cerrar

  -- Firma. Los mecánicos son usuarios: queda quién firmó y cuándo.
  id_mecanico       INTEGER NULL REFERENCES usuario(id_usuario),
  id_aprendiz       INTEGER NULL REFERENCES usuario(id_usuario),
  r_ii              VARCHAR(40),         -- sigla del formato; nadie supo explicarla
  fecha_firma       DATE,
  firmado_en        TIMESTAMP,

  -- De dónde viene y con qué se relaciona
  id_reporte        INTEGER NULL REFERENCES reporte_inspeccion(id_reporte),
  id_cumplimiento   INTEGER NULL REFERENCES taller_cumplimiento(id_cumplimiento),
  id_mantenimiento  INTEGER NULL REFERENCES mantenimiento_aeronave(id_mantenimiento),

  estado            VARCHAR(12) NOT NULL DEFAULT 'ABIERTA'
                    CHECK (estado IN ('ABIERTA','CERRADA','ANULADA')),
  motivo_anulacion  TEXT,
  anulado_en        TIMESTAMP,
  anulado_por       INTEGER NULL REFERENCES usuario(id_usuario),
  creado_por        INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Una OT cerrada tiene mecánico y fecha de firma, sí o sí.
  CONSTRAINT ck_ot_cerrada CHECK (
    estado <> 'CERRADA' OR (id_mecanico IS NOT NULL AND fecha_firma IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_ot_aeronave ON orden_trabajo(id_aeronave, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ot_estado   ON orden_trabajo(estado);

COMMENT ON TABLE orden_trabajo IS
  'El trabajo del taller. Se abre al recibir el avión (ahí toma su correlativo) y se cierra al firmarlo. De ella cuelgan las requisiciones, solicitudes y retornos.';

-- ---------------------------------------------------------------------------
-- 5 · Parte Reemplazada — el rastreo de rotables ON/OFF
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orden_trabajo_parte (
  id_parte    SERIAL PRIMARY KEY,
  id_orden    INTEGER NOT NULL REFERENCES orden_trabajo(id_orden) ON DELETE CASCADE,
  cantidad    NUMERIC(10,2) NOT NULL DEFAULT 1,
  nombre      VARCHAR(200) NOT NULL,
  pn_on       VARCHAR(80),
  sn_on       VARCHAR(80),
  pn_off      VARCHAR(80),
  sn_off      VARCHAR(80),
  -- Si la pieza salió de bodega, se enlaza para poder cruzarlo con el kardex.
  id_repuesto INTEGER NULL REFERENCES taller_repuesto(id_repuesto),
  orden       SMALLINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_ot_parte_orden ON orden_trabajo_parte(id_orden);

-- ---------------------------------------------------------------------------
-- 6 · El amarre con bodega
--
-- En la Fase 1 el N° de orden de trabajo quedó como TEXTO en la solicitud,
-- porque la OT no existía. Ahora se agrega el enlace real; el texto se conserva
-- para los documentos históricos, que no tienen OT y no se les inventa una.
-- ---------------------------------------------------------------------------
ALTER TABLE taller_documento_inventario
  ADD COLUMN IF NOT EXISTS id_orden_trabajo INTEGER NULL REFERENCES orden_trabajo(id_orden);

CREATE INDEX IF NOT EXISTS idx_taller_doc_orden ON taller_documento_inventario(id_orden_trabajo);

-- ---------------------------------------------------------------------------
-- 7 · Formularios impresos de esta fase
-- ---------------------------------------------------------------------------
INSERT INTO taller_formulario (clave, nombre, codigo, revision) VALUES
  ('ORDEN_TRABAJO',      'ORDEN DE TRABAJO',      'CAAA-006-F', 'Rev.02 21/Jul/2025'),
  ('REPORTE_INSPECCION', 'REPORTE DE INSPECCION',  NULL,         NULL)
ON CONFLICT (clave) DO NOTHING;

COMMIT;
