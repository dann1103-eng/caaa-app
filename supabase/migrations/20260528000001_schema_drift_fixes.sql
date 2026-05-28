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
