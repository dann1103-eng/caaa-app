-- =============================================================================
-- Migración 011: Módulo Taller (mantenimiento / aeronavegabilidad)
--
--   Fase 0  · rol TALLER (mecánico) — ADMIN sigue siendo super-usuario.
--   Fase 1A · seguimiento programado: componentes (célula/motor/hélice),
--             tareas programadas (inspecciones recurrentes, AD, SB, vida límite)
--             y su historial de cumplimiento.
--   Fase 1B · inventario de repuestos: catálogo/stock + kardex (entradas/salidas/
--             ajustes), con consumo opcional enlazado a `egreso`.
--
-- Casi todo es aditivo (CREATE TABLE IF NOT EXISTS). El único cambio no-aditivo
-- es ampliar el CHECK de `usuario.rol` con 'TALLER' (DROP + ADD), no destructivo:
-- solo agrega un valor permitido. Autorizado por el usuario.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Fase 0 · Rol TALLER
-- ---------------------------------------------------------------------------
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_rol_check;
ALTER TABLE usuario
  ADD CONSTRAINT usuario_rol_check
  CHECK (rol IN ('ADMIN','PROGRAMACION','TURNO','ALUMNO','INSTRUCTOR','ADMINISTRACION','TALLER'));

-- ---------------------------------------------------------------------------
-- Fase 1A · Componentes rastreables (célula / motor / hélice / componente)
--
-- Permite que motor y hélice lleven sus propias horas/ciclos, independientes de
-- la célula. Horas actuales del componente =
--   aeronave.horas_acumuladas - horas_aeronave_instalacion + horas_componente_instalacion
-- (la célula apunta a su propia aeronave con offsets en 0).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller_componente (
  id_componente               SERIAL PRIMARY KEY,
  id_aeronave                 INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  tipo                        VARCHAR(20) NOT NULL
                              CHECK (tipo IN ('CELULA','MOTOR','HELICE','COMPONENTE')),
  nombre                      VARCHAR(120) NOT NULL,
  parte_no                    VARCHAR(80),
  serie_no                    VARCHAR(80),
  posicion                    VARCHAR(60),
  fecha_instalacion           DATE,
  horas_aeronave_instalacion  NUMERIC(10,2) NOT NULL DEFAULT 0,
  horas_componente_instalacion NUMERIC(10,2) NOT NULL DEFAULT 0,
  ciclos_instalacion          INTEGER NOT NULL DEFAULT 0,
  activo                      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en                   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taller_componente_aeronave ON taller_componente(id_aeronave);

-- ---------------------------------------------------------------------------
-- Fase 1A · Tareas programadas (inspecciones recurrentes, AD, SB, vida límite)
--
-- El vencimiento es el más próximo de las dimensiones aplicables (horas, ciclos,
-- calendario). proxima_* se deriva de ultima_* + intervalo_* y se recalcula al
-- registrar un cumplimiento. El "estado" (VIGENTE/PROXIMO/VENCIDO) se calcula en
-- consulta contra las horas actuales de la aeronave (no se almacena para evitar
-- que quede obsoleto).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller_tarea_programada (
  id_tarea          SERIAL PRIMARY KEY,
  id_aeronave       INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  id_componente     INTEGER NULL REFERENCES taller_componente(id_componente),
  nombre            VARCHAR(160) NOT NULL,
  descripcion       TEXT,
  tipo              VARCHAR(20) NOT NULL DEFAULT 'INSPECCION'
                    CHECK (tipo IN ('INSPECCION','AD','SB','VIDA_LIMITE','OTRO')),
  referencia        VARCHAR(120),               -- nº de AD / SB / nota
  recurrente        BOOLEAN NOT NULL DEFAULT TRUE,
  intervalo_horas   NUMERIC(10,2),
  intervalo_ciclos  INTEGER,
  intervalo_dias    INTEGER,
  ultima_fecha      DATE,
  ultima_horas      NUMERIC(10,2),
  ultima_ciclos     INTEGER,
  proxima_fecha     DATE,
  proxima_horas     NUMERIC(10,2),
  proxima_ciclos    INTEGER,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taller_tarea_aeronave ON taller_tarea_programada(id_aeronave);

-- ---------------------------------------------------------------------------
-- Fase 1A · Historial de cumplimiento (cada vez que se cumple una tarea)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller_cumplimiento (
  id_cumplimiento   SERIAL PRIMARY KEY,
  id_tarea          INTEGER NOT NULL REFERENCES taller_tarea_programada(id_tarea),
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  horas_aeronave    NUMERIC(10,2),
  ciclos            INTEGER,
  descripcion       TEXT,
  realizado_por     VARCHAR(160),               -- mecánico / licencia
  id_usuario        INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taller_cumplimiento_tarea ON taller_cumplimiento(id_tarea);

-- ---------------------------------------------------------------------------
-- Fase 1B · Inventario de repuestos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller_repuesto (
  id_repuesto       SERIAL PRIMARY KEY,
  parte_no          VARCHAR(80),
  descripcion       VARCHAR(200) NOT NULL,
  categoria         VARCHAR(60),
  ubicacion         VARCHAR(80),
  unidad            VARCHAR(20) NOT NULL DEFAULT 'UNIDAD',
  stock_actual      NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_minimo      NUMERIC(12,2) NOT NULL DEFAULT 0,
  costo_unitario    NUMERIC(12,2) NOT NULL DEFAULT 0,
  serie_no          VARCHAR(80),                -- para repuestos serializados
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Fase 1B · Kardex de inventario (entradas / salidas / ajustes)
--
-- Una SALIDA hacia una aeronave puede generar un `egreso` (categoría REPUESTOS),
-- enlazado por id_egreso. La columna registrado_por guarda al usuario TALLER/ADMIN.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller_movimiento_inventario (
  id_mov            SERIAL PRIMARY KEY,
  id_repuesto       INTEGER NOT NULL REFERENCES taller_repuesto(id_repuesto),
  tipo              VARCHAR(12) NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE')),
  cantidad          NUMERIC(12,2) NOT NULL,
  costo_unitario    NUMERIC(12,2),
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  id_aeronave       INTEGER NULL REFERENCES aeronave(id_aeronave),
  id_egreso         INTEGER NULL REFERENCES egreso(id),
  nota              TEXT,
  registrado_por    INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taller_mov_repuesto ON taller_movimiento_inventario(id_repuesto);

COMMIT;
