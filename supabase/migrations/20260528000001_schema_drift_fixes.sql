-- Correcciones de deriva de esquema: columnas que el backend espera pero que
-- el dump inicial (init_schema) no incluyó. Idempotente (IF NOT EXISTS).
-- Se irá ampliando conforme aparezcan más diferencias durante las pruebas.

-- ── Tabla alumno: documentos de seguro y certificado médico ──────────────
ALTER TABLE public.alumno
  ADD COLUMN IF NOT EXISTS seguro_vida               varchar(120),
  ADD COLUMN IF NOT EXISTS seguro_vida_vencimiento   date,
  ADD COLUMN IF NOT EXISTS seguro_vida_numero        varchar(20),
  ADD COLUMN IF NOT EXISTS certificado_medico_numero varchar(20);

-- ── Tabla usuario: control de sesión única (single session) ──────────────
ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS current_session_id varchar(64);

-- ── Tabla aeronave: foto ──────────────────────────────────────────────────
ALTER TABLE public.aeronave
  ADD COLUMN IF NOT EXISTS foto_url text;

-- ── Tabla mantenimiento_aeronave: estado/fechas/horas estimadas ───────────
ALTER TABLE public.mantenimiento_aeronave
  ADD COLUMN IF NOT EXISTS estado          varchar(20) DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS fecha_inicio    timestamp without time zone,
  ADD COLUMN IF NOT EXISTS fecha_fin       timestamp without time zone,
  ADD COLUMN IF NOT EXISTS horas_estimadas numeric(8,2);

-- ── Tabla estado_operaciones: clima/suspensión de bloques ─────────────────
ALTER TABLE public.estado_operaciones
  ADD COLUMN IF NOT EXISTS temperatura          varchar(20),
  ADD COLUMN IF NOT EXISTS bloques_suspendidos  jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS explicacion_detallada text;

-- ── Tabla mensaje_turno: expiración del ticker ────────────────────────────
ALTER TABLE public.mensaje_turno
  ADD COLUMN IF NOT EXISTS expira_en timestamp without time zone;

-- ── Tabla mantenimiento_bloque: NO existía (la usa el módulo mantenimiento) ─
CREATE TABLE IF NOT EXISTS public.mantenimiento_bloque (
  id               bigserial PRIMARY KEY,
  id_mantenimiento integer NOT NULL,
  fecha            date NOT NULL,
  id_bloque        integer NOT NULL
);

-- ── Límites de vuelos por tipo (avión / simulador) ────────────────────────
ALTER TABLE public.alumno
  ADD COLUMN IF NOT EXISTS limite_vuelos_avion     integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS limite_vuelos_simulador integer DEFAULT 3;

ALTER TABLE public.solicitud_semana
  ADD COLUMN IF NOT EXISTS limite_vuelos_avion     integer,
  ADD COLUMN IF NOT EXISTS limite_vuelos_simulador integer;

-- ── Tabla vuelo: tipo y bloque de fin (usados por el calendario) ──────────
ALTER TABLE public.vuelo
  ADD COLUMN IF NOT EXISTS tipo_vuelo    varchar(20) DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS id_bloque_fin integer;

-- ── Tabla reporte_vuelo: marca y motivo de inasistencia + observaciones ──
ALTER TABLE public.reporte_vuelo
  ADD COLUMN IF NOT EXISTS es_inasistencia     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_inasistencia text,
  ADD COLUMN IF NOT EXISTS observaciones       text;

-- Ampliar el CHECK de estado para incluir PENDIENTE_ALUMNO (el código lo usa al
-- firmar/enviar el reporte al alumno). Solo amplía los valores permitidos.
ALTER TABLE public.reporte_vuelo DROP CONSTRAINT IF EXISTS reporte_vuelo_estado_check;
ALTER TABLE public.reporte_vuelo ADD CONSTRAINT reporte_vuelo_estado_check
  CHECK (estado IN ('BORRADOR','PENDIENTE_INSTRUCTOR','PENDIENTE_ALUMNO','COMPLETADO'));

-- ── Tabla instructor: número de licencia (usado en W&B / loadsheet) ──────
ALTER TABLE public.instructor
  ADD COLUMN IF NOT EXISTS licencia varchar(30);

-- ── Loadsheet / Weight & Balance: columnas que el backend escribe ────────
ALTER TABLE public.weight_balance
  ADD COLUMN IF NOT EXISTS fuel_burn numeric(6,2);

ALTER TABLE public.loadsheet
  ADD COLUMN IF NOT EXISTS ops_data            jsonb,
  ADD COLUMN IF NOT EXISTS identification_data jsonb;
-- (Los índices únicos en id_vuelo ya existen: weight_balance_id_vuelo_key, loadsheet_id_vuelo_key)

ALTER TABLE public.loadsheet_waypoint
  ADD COLUMN IF NOT EXISTS data jsonb;

-- ── Tabla solicitud_cancelacion: NO existía (subsistema de cancelaciones) ──
CREATE TABLE IF NOT EXISTS public.solicitud_cancelacion (
  id_solicitud_cancelacion bigserial PRIMARY KEY,
  id_vuelo     integer NOT NULL,
  id_alumno    integer NOT NULL,
  motivo       text,
  estado       varchar(20) DEFAULT 'PENDIENTE',
  tiene_multa  boolean DEFAULT false,
  monto_multa  numeric(10,2) DEFAULT 0,
  resuelto_en  timestamp without time zone,
  resuelto_por integer,
  creado_en    timestamp without time zone DEFAULT now()
);

-- ── Sesión 2026-06-12 (testing E2E): valores faltantes del enum audit_action ──
-- El código audita la resolución de solicitudes de cancelación (admin) y el
-- retiro de la solicitud (alumno) con valores que el enum viejo no tiene;
-- aceptar/rechazar una cancelación fallaba con
-- "invalid input value for enum audit_action".
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'RESOLVER_SOLICITUD_CANCELACION';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'QUITAR_SOLICITUD_CANCELACION';
