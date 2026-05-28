-- =============================================================================
-- Migración: Módulo Administración / Contabilidad CAAA
-- Fecha: 2026-05-19
-- Autor: Equipo CAAA
--
-- Crea:
--   * Rol ADMINISTRACION
--   * Tarifas (aeronave / instructor) con historial
--   * Catálogo de cursos y componentes prácticos
--   * Inscripciones de alumnos a cursos
--   * Cuenta corriente (saldo + movimientos)
--   * Recibos de pago y Facturas con secuencias correlativas
--   * Egresos y Nómina de instructores
--   * Documentación CAAA/AAC y Médicos autorizados
--   * Seeds iniciales (tarifas 2026, cursos, médicos, catálogo documentos,
--     saldo provisional de $10,000 para todos los alumnos existentes)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rol ADMINISTRACION
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'usuario_rol_check'
  ) THEN
    ALTER TABLE usuario DROP CONSTRAINT usuario_rol_check;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usuario') THEN
    ALTER TABLE usuario
      ADD CONSTRAINT usuario_rol_check
      CHECK (rol IN ('ADMIN','PROGRAMACION','TURNO','ALUMNO','INSTRUCTOR','ADMINISTRACION'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Tarifas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aeronave_tarifa (
  id              SERIAL PRIMARY KEY,
  id_aeronave     INTEGER NULL,
  modelo_aeronave VARCHAR(60) NOT NULL,
  tarifa_hora_usd NUMERIC(10,2) NOT NULL CHECK (tarifa_hora_usd >= 0),
  vigente_desde   DATE NOT NULL,
  vigente_hasta   DATE NULL,
  creado_por      INTEGER NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_aeronave_tarifa_vigencia
  ON aeronave_tarifa (modelo_aeronave, vigente_desde);

CREATE TABLE IF NOT EXISTS instructor_tarifa (
  id              SERIAL PRIMARY KEY,
  id_instructor   INTEGER NOT NULL,
  tarifa_hora_usd NUMERIC(10,2) NOT NULL CHECK (tarifa_hora_usd >= 0),
  vigente_desde   DATE NOT NULL,
  vigente_hasta   DATE NULL,
  creado_por      INTEGER NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_instructor_tarifa_vigencia
  ON instructor_tarifa (id_instructor, vigente_desde);

-- ---------------------------------------------------------------------------
-- 3. Cursos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curso (
  id                          SERIAL PRIMARY KEY,
  codigo                      VARCHAR(20) UNIQUE NOT NULL,
  nombre                      VARCHAR(120) NOT NULL,
  descripcion                 TEXT,
  gastos_administrativos_usd  NUMERIC(10,2) NOT NULL DEFAULT 0,
  costo_teorico_usd           NUMERIC(10,2) NOT NULL DEFAULT 0,
  horas_teoricas              INTEGER NOT NULL DEFAULT 0,
  total_usd_estimado          NUMERIC(10,2) NOT NULL DEFAULT 0,
  activo                      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en                   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS curso_componente_practico (
  id                        SERIAL PRIMARY KEY,
  id_curso                  INTEGER NOT NULL REFERENCES curso(id) ON DELETE CASCADE,
  tipo_aeronave             VARCHAR(60) NOT NULL,
  horas_requeridas          INTEGER NOT NULL CHECK (horas_requeridas >= 0),
  tarifa_hora_usd_referencia NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inscripcion_curso (
  id                          SERIAL PRIMARY KEY,
  id_alumno                   INTEGER NOT NULL,
  id_curso                    INTEGER NOT NULL REFERENCES curso(id),
  fecha_inicio                DATE NOT NULL DEFAULT CURRENT_DATE,
  estado                      VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
                              CHECK (estado IN ('ACTIVO','COMPLETADO','SUSPENDIDO','CANCELADO')),
  horas_practicas_completadas NUMERIC(7,2) NOT NULL DEFAULT 0,
  fecha_finalizacion          DATE NULL,
  observaciones               TEXT,
  creado_en                   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_inscripcion_alumno ON inscripcion_curso (id_alumno);

CREATE TABLE IF NOT EXISTS inscripcion_curso_avance (
  id                 SERIAL PRIMARY KEY,
  id_inscripcion     INTEGER NOT NULL REFERENCES inscripcion_curso(id) ON DELETE CASCADE,
  tipo_aeronave      VARCHAR(60) NOT NULL,
  horas_requeridas   NUMERIC(6,2) NOT NULL,
  horas_acumuladas   NUMERIC(6,2) NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- 4. Cuenta corriente + movimientos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuenta_corriente_alumno (
  id_alumno                   INTEGER PRIMARY KEY,
  saldo_actual_usd            NUMERIC(12,2) NOT NULL DEFAULT 0,
  ultimo_movimiento_en        TIMESTAMP NULL,
  ultima_factura_correlativo  BIGINT NULL,
  creado_en                   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimiento_cuenta (
  id                    BIGSERIAL PRIMARY KEY,
  id_alumno             INTEGER NOT NULL,
  tipo                  VARCHAR(30) NOT NULL
                        CHECK (tipo IN ('DEPOSITO','CARGO_VUELO','CARGO_CURSO','CARGO_OTRO',
                                        'AJUSTE_DEBE','AJUSTE_HABER','ANULACION')),
  fecha                 TIMESTAMP NOT NULL DEFAULT NOW(),
  descripcion           VARCHAR(255) NOT NULL,
  monto_usd             NUMERIC(12,2) NOT NULL,
  saldo_resultante_usd  NUMERIC(12,2) NOT NULL,
  id_vuelo              INTEGER NULL,
  id_factura            INTEGER NULL,
  id_recibo             INTEGER NULL,
  generado_automatico   BOOLEAN NOT NULL DEFAULT FALSE,
  registrado_por        INTEGER NULL,
  anulado               BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_anulacion      TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_mov_alumno_fecha ON movimiento_cuenta (id_alumno, fecha DESC);

-- ---------------------------------------------------------------------------
-- 5. Recibos y Facturas con secuencias correlativas
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS recibo_correlativo_seq START 1;
CREATE SEQUENCE IF NOT EXISTS factura_correlativo_seq START 1;

CREATE TABLE IF NOT EXISTS recibo_pago (
  id                   SERIAL PRIMARY KEY,
  numero_correlativo   BIGINT UNIQUE NOT NULL,
  id_alumno            INTEGER NOT NULL,
  fecha                TIMESTAMP NOT NULL DEFAULT NOW(),
  monto_usd            NUMERIC(12,2) NOT NULL CHECK (monto_usd > 0),
  metodo               VARCHAR(20) NOT NULL
                       CHECK (metodo IN ('EFECTIVO','TRANSFERENCIA','CHEQUE','TARJETA','OTRO')),
  referencia           VARCHAR(80) NULL,
  descripcion          VARCHAR(255) NULL,
  pdf_path             VARCHAR(255) NULL,
  registrado_por       INTEGER NULL,
  anulado              BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_anulacion     TEXT NULL
);

CREATE TABLE IF NOT EXISTS factura (
  id                   SERIAL PRIMARY KEY,
  numero_correlativo   BIGINT UNIQUE NOT NULL,
  id_alumno            INTEGER NOT NULL,
  fecha_emision        TIMESTAMP NOT NULL DEFAULT NOW(),
  subtotal_usd         NUMERIC(12,2) NOT NULL,
  iva_usd              NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_usd            NUMERIC(12,2) NOT NULL,
  estado               VARCHAR(20) NOT NULL DEFAULT 'EMITIDA'
                       CHECK (estado IN ('EMITIDA','ANULADA')),
  id_vuelo             INTEGER NULL,
  concepto             VARCHAR(255) NULL,
  pdf_path             VARCHAR(255) NULL,
  emitida_por          INTEGER NULL,
  motivo_anulacion     TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_factura_alumno ON factura (id_alumno);

CREATE TABLE IF NOT EXISTS factura_detalle (
  id                 SERIAL PRIMARY KEY,
  id_factura         INTEGER NOT NULL REFERENCES factura(id) ON DELETE CASCADE,
  descripcion        VARCHAR(255) NOT NULL,
  cantidad_horas     NUMERIC(6,2) NOT NULL,
  tarifa_hora_usd    NUMERIC(10,2) NOT NULL,
  subtotal_usd       NUMERIC(12,2) NOT NULL,
  id_aeronave_tarifa INTEGER NULL,
  id_vuelo           INTEGER NULL
);

-- ---------------------------------------------------------------------------
-- 6. Egresos y Nómina
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS egreso (
  id                       SERIAL PRIMARY KEY,
  categoria                VARCHAR(30) NOT NULL
                           CHECK (categoria IN ('COMBUSTIBLE','MANTENIMIENTO','NOMINA','SUMINISTROS',
                                                'PROVEEDOR','SERVICIOS','OTRO')),
  proveedor                VARCHAR(120) NULL,
  concepto                 VARCHAR(255) NOT NULL,
  monto_usd                NUMERIC(12,2) NOT NULL CHECK (monto_usd > 0),
  fecha                    DATE NOT NULL DEFAULT CURRENT_DATE,
  pdf_comprobante_path     VARCHAR(255) NULL,
  id_mantenimiento         INTEGER NULL,
  id_nomina                INTEGER NULL,
  registrado_por           INTEGER NULL,
  creado_en                TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_egreso_fecha ON egreso (fecha DESC);

CREATE TABLE IF NOT EXISTS nomina_periodo (
  id              SERIAL PRIMARY KEY,
  periodo_inicio  DATE NOT NULL,
  periodo_fin     DATE NOT NULL,
  estado          VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'
                  CHECK (estado IN ('BORRADOR','APROBADA','PAGADA')),
  creado_por      INTEGER NULL,
  aprobado_por    INTEGER NULL,
  fecha_pago      DATE NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nomina_detalle (
  id               SERIAL PRIMARY KEY,
  id_periodo       INTEGER NOT NULL REFERENCES nomina_periodo(id) ON DELETE CASCADE,
  id_instructor    INTEGER NOT NULL,
  horas_voladas    NUMERIC(7,2) NOT NULL DEFAULT 0,
  tarifa_hora      NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonos            NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuentos       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  pdf_recibo_path  VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS nomina_detalle_vuelo (
  id                  SERIAL PRIMARY KEY,
  id_nomina_detalle   INTEGER NOT NULL REFERENCES nomina_detalle(id) ON DELETE CASCADE,
  id_vuelo            INTEGER NOT NULL,
  horas               NUMERIC(5,2) NOT NULL,
  monto               NUMERIC(10,2) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 7. Documentación CAAA / AAC y Médicos autorizados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documento_requerido_catalogo (
  id                          SERIAL PRIMARY KEY,
  codigo                      VARCHAR(40) UNIQUE NOT NULL,
  nombre                      VARCHAR(160) NOT NULL,
  autoridad                   VARCHAR(20) NOT NULL CHECK (autoridad IN ('CAAA','AAC')),
  aplica_a_menores            BOOLEAN NOT NULL DEFAULT FALSE,
  aplica_a_extranjeros        BOOLEAN NOT NULL DEFAULT FALSE,
  descripcion                 TEXT,
  frecuencia_renovacion_meses INTEGER NULL,
  activo                      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS documento_alumno (
  id                      SERIAL PRIMARY KEY,
  id_alumno               INTEGER NOT NULL,
  id_documento_requerido  INTEGER NOT NULL REFERENCES documento_requerido_catalogo(id),
  fecha_entrega           DATE NULL,
  fecha_vencimiento       DATE NULL,
  archivo_path            VARCHAR(255) NULL,
  estado                  VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                          CHECK (estado IN ('PENDIENTE','ENTREGADO','VENCIDO','RECHAZADO')),
  revisado_por            INTEGER NULL,
  observaciones           TEXT,
  actualizado_en          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medico_autorizado (
  id           SERIAL PRIMARY KEY,
  especialidad VARCHAR(30) NOT NULL CHECK (especialidad IN ('CARDIOLOGO','OTORRINO','OFTALMOLOGO')),
  nombre       VARCHAR(160) NOT NULL,
  telefonos    VARCHAR(120),
  correo       VARCHAR(160),
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 8. Seeds: Tarifas 2026
-- ---------------------------------------------------------------------------
INSERT INTO aeronave_tarifa (modelo_aeronave, tarifa_hora_usd, vigente_desde) VALUES
  ('Cessna 152',          135.00, '2026-01-01'),
  ('Tomahawk',            135.00, '2026-01-01'),
  ('Cherokee 180',        200.00, '2026-01-01'),
  ('Cherokee Arrow',      220.00, '2026-01-01'),
  ('Bimotor',             600.00, '2026-01-01'),
  ('BATD II',              90.00, '2026-01-01'),
  ('BATD II Bimotor',     105.00, '2026-01-01')
ON CONFLICT DO NOTHING;

-- Tarifas históricas 2025 (para vuelos pasados)
INSERT INTO aeronave_tarifa (modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta) VALUES
  ('Cessna 152',          130.00, '2025-01-01', '2025-12-31'),
  ('Tomahawk',            130.00, '2025-01-01', '2025-12-31'),
  ('BATD II',              85.00, '2025-01-01', '2025-12-31')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Seeds: Cursos CAAA 2026
-- ---------------------------------------------------------------------------
INSERT INTO curso (codigo, nombre, descripcion, gastos_administrativos_usd, costo_teorico_usd, horas_teoricas, total_usd_estimado)
VALUES
  ('PP',    'Piloto Privado',              'Licencia base de piloto privado.',                250.00, 870.00, 40, 7645.00),
  ('IFR',   'Habilitación por Instrumentos','Habilitación de vuelo por instrumentos.',          0.00, 955.00, 40, 7905.00),
  ('CPL',   'Piloto Comercial',            'Licencia comercial de piloto.',                     0.00, 720.00, 40, 8745.00),
  ('MULTI', 'Piloto Bimotor',              'Habilitación bimotor.',                             0.00, 250.00, 10, 4765.00),
  ('INST',  'Piloto Instructor',           'Habilitación de instructor de vuelo.',              0.00, 500.00, 40, 4550.00)
ON CONFLICT (codigo) DO NOTHING;

-- Componentes prácticos por curso
INSERT INTO curso_componente_practico (id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia)
SELECT id, 'Cessna 152 / Tomahawk', 45, 135.00 FROM curso WHERE codigo='PP'
UNION ALL SELECT id, 'BATD II', 5, 90.00 FROM curso WHERE codigo='PP'
UNION ALL SELECT id, 'Cessna 152 / Tomahawk', 30, 135.00 FROM curso WHERE codigo='IFR'
UNION ALL SELECT id, 'Cherokee 180', 10, 200.00 FROM curso WHERE codigo='IFR'
UNION ALL SELECT id, 'BATD II', 10, 90.00 FROM curso WHERE codigo='IFR'
UNION ALL SELECT id, 'Cessna 152 / Tomahawk', 25, 135.00 FROM curso WHERE codigo='CPL'
UNION ALL SELECT id, 'Cherokee 180', 10, 200.00 FROM curso WHERE codigo='CPL'
UNION ALL SELECT id, 'Cherokee Arrow', 10, 220.00 FROM curso WHERE codigo='CPL'
UNION ALL SELECT id, 'BATD II', 5, 90.00 FROM curso WHERE codigo='CPL'
UNION ALL SELECT id, 'Bimotor', 7, 600.00 FROM curso WHERE codigo='MULTI'
UNION ALL SELECT id, 'BATD II Bimotor', 3, 105.00 FROM curso WHERE codigo='MULTI'
UNION ALL SELECT id, 'Cessna 152 / Tomahawk', 30, 135.00 FROM curso WHERE codigo='INST';

-- ---------------------------------------------------------------------------
-- 10. Seeds: Documentación
-- ---------------------------------------------------------------------------
INSERT INTO documento_requerido_catalogo (codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, frecuencia_renovacion_meses)
VALUES
  ('CAAA_INSCRIPCION', 'Hoja de inscripción CAAA',                  'CAAA', FALSE, FALSE, NULL),
  ('CAAA_FOTO',        'Fotografía en digital',                     'CAAA', FALSE, FALSE, NULL),
  ('CAAA_DUI',         'DUI homologado / Pasaporte / Carnet residente','CAAA', FALSE, FALSE, NULL),
  ('CAAA_NIT',         'NIT (extranjeros)',                         'CAAA', FALSE, TRUE,  NULL),
  ('CAAA_BITACORA',    'Bitácora de vuelo',                         'CAAA', FALSE, FALSE, NULL),
  ('CAAA_ANTECEDENTES','Antecedentes policiales y penales',         'CAAA', FALSE, FALSE, 12),
  ('CAAA_ANTIDOPAJE',  'Prueba antidopaje (CME)',                   'CAAA', FALSE, FALSE, 12),
  ('AAC_PARTIDA',      'Partida de nacimiento (menores de 18 años)','AAC',  TRUE,  FALSE, NULL),
  ('AAC_BACHILLER',    'Título de bachiller completado',            'AAC',  FALSE, FALSE, NULL),
  ('AAC_EXAMENES',     'Exámenes por especialista y de laboratorio','AAC',  FALSE, FALSE, 24),
  ('AAC_SEGURO',       'Seguro de vida (carrera de piloto)',        'AAC',  FALSE, FALSE, 12),
  ('AAC_FORMULARIO',   'Formulario de aplicación AAC',              'AAC',  FALSE, FALSE, NULL),
  ('AAC_PERMISO',      'Permiso ambos padres notariado (<18)',      'AAC',  TRUE,  FALSE, NULL),
  ('AAC_MEDICO_II',    'Certificado médico clase II',               'AAC',  FALSE, FALSE, 24)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 11. Seeds: Médicos autorizados
-- ---------------------------------------------------------------------------
INSERT INTO medico_autorizado (especialidad, nombre, telefonos, correo) VALUES
  ('CARDIOLOGO',  'Dr. Juan Francisco Escolán',          '2263-4212 / 7938-0217', 'sanmia78@yahoo.com'),
  ('CARDIOLOGO',  'Dr. Manuel Rivera Castaneda',         '2555-3700',             'mariveracastaneda@gmail.com'),
  ('CARDIOLOGO',  'Dr. Fidel Candray',                   '2235-5881 / 2235-5882', 'marcialcabrera@hotmail.com'),
  ('OTORRINO',    'Dr. Fernando Godoy Aparicio',         '2235-0524 / 2225-0122', 'godoyyori@yahoo.com'),
  ('OTORRINO',    'Dr. Juan Caballero',                  '2525-0900 / 2525-0918', 'atencion@audiomed.com.sv'),
  ('OTORRINO',    'Dra. Alicia Marisol Galán Campos',    '2304-4090 / 7284-3022', 'alexagalan86@gmail.com'),
  ('OTORRINO',    'Dr. Alex Wilfredo Minero Ortiz',      '2264-4658 / 2200-3208', 'audiolabcentroamerica@gmail.com'),
  ('OFTALMOLOGO', 'Dr. Mario Rene Tevez',                '2225-3356 / 7934-2562', 'mariotevezmolina@gmail.com'),
  ('OFTALMOLOGO', 'Dra. Evelin Regina Portillo de Quezada','2264-4151 / 2264-5241','evelynportillo@hotmail.com'),
  ('OFTALMOLOGO', 'Dr. Manuel Cruz Cerna Guzmán',        '2225-3079 / 7150-7686', 'manuel.ccg@gmail.com'),
  ('OFTALMOLOGO', 'Dr. Mario Roberto García Rivas',      '2519-4949 / 7930-1529', 'c@vivasinlentes.com')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12. Seeds: Cuenta corriente provisional ($10,000 por cada alumno existente)
-- ---------------------------------------------------------------------------
-- Solo se ejecuta si existe la tabla alumno
DO $$
DECLARE
  v_id_alumno INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alumno') THEN
    FOR v_id_alumno IN SELECT id_alumno FROM alumno LOOP
      INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd, ultimo_movimiento_en)
      VALUES (v_id_alumno, 10000.00, NOW())
      ON CONFLICT (id_alumno) DO NOTHING;

      INSERT INTO movimiento_cuenta
        (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, generado_automatico, registrado_por)
      VALUES
        (v_id_alumno, 'AJUSTE_HABER',
         'Saldo inicial provisional - pendiente de reemplazar con datos reales',
         10000.00, 10000.00, TRUE, NULL);
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 13. Usuario seed ADMINISTRACION (si no existe)
-- ---------------------------------------------------------------------------
-- Usuario u_admin_fin / password "admin123" (hash bcrypt - se cambiará en primer login).
-- El INSERT detecta dinámicamente las columnas NOT NULL no defaulteadas y completa
-- valores razonables para no fallar contra esquemas que tengan campos extra obligatorios.
DO $$
DECLARE
  v_cols TEXT[];
  v_vals TEXT[];
  v_sql  TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usuario') THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM usuario WHERE username = 'u_admin_fin') THEN
    RETURN;
  END IF;

  -- Construir INSERT dinámico: columnas base + cualquier columna NOT NULL adicional
  -- detectada en el esquema actual (nombre, apellido, etc.).
  v_cols := ARRAY['username','password_hash','rol','correo','must_change_password'];
  v_vals := ARRAY['u_admin_fin',
                  '$2b$10$Rp.1FrHhKmwQuVwxFw0Lhe6T6q2hxqXLvfXf1g.0LBP1tCdLhYxYa',
                  'ADMINISTRACION',
                  'administracion@caaa-sv.com',
                  'TRUE'];

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'nombre') THEN
    v_cols := array_append(v_cols, 'nombre');
    v_vals := array_append(v_vals, '''Administración Financiera''');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'apellido') THEN
    v_cols := array_append(v_cols, 'apellido');
    v_vals := array_append(v_vals, '''CAAA''');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'dui') THEN
    v_cols := array_append(v_cols, 'dui');
    v_vals := array_append(v_vals, '''00000000-0''');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'telefono') THEN
    v_cols := array_append(v_cols, 'telefono');
    v_vals := array_append(v_vals, '''0000-0000''');
  END IF;

  -- En las primeras 5 posiciones envolvemos strings con comillas
  v_sql := 'INSERT INTO usuario (' || array_to_string(v_cols, ', ') ||
           ') VALUES (' ||
           '''u_admin_fin''' || ', ' ||
           '''$2b$10$Rp.1FrHhKmwQuVwxFw0Lhe6T6q2hxqXLvfXf1g.0LBP1tCdLhYxYa''' || ', ' ||
           '''ADMINISTRACION''' || ', ' ||
           '''administracion@caaa-sv.com''' || ', ' ||
           'TRUE';
  -- Agregar columnas adicionales detectadas (vals 6+ ya vienen pre-quotados)
  FOR i IN 6..array_length(v_vals, 1) LOOP
    v_sql := v_sql || ', ' || v_vals[i];
  END LOOP;
  v_sql := v_sql || ')';

  EXECUTE v_sql;
END $$;

COMMIT;
