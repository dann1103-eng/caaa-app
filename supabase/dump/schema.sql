--
-- PostgreSQL database dump
--

\restrict eY3Uj0ujw5rdipSkVnccod0FWneGD9tqYFs2C18ht7lgWmc6RG6zYerNlJB9Kyj

-- Dumped from database version 17.9
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_action AS ENUM (
    'LOGIN_OK',
    'LOGIN_FAIL',
    'PUBLICAR_SEMANA',
    'GUARDAR_CAMBIOS',
    'CANCELAR_VUELO',
    'CAMBIAR_PASSWORD',
    'CAMBIAR_CORREO',
    'CREAR_SOLICITUD',
    'EDITAR_SOLICITUD',
    'BORRAR_SOLICITUD',
    'OTRO',
    'SOLICITAR_CANCELACION',
    'CANCELACION_EMERGENCIA',
    'CAMBIAR_INSTRUCTOR_VUELO',
    'HABILITAR_VUELO_EXTRA',
    'FILL_PLAN_VUELO',
    'FILL_WEIGHT_BALANCE',
    'FILL_LOADSHEET',
    'CAMBIAR_ESTADO_VUELO',
    'FILL_REPORTE_VUELO',
    'FILL_CHECKLIST_POSTVUELO'
);


--
-- Name: audit_actor_rol; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_actor_rol AS ENUM (
    'ALUMNO',
    'PROGRAMACION',
    'ADMIN',
    'SYSTEM',
    'TURNO',
    'INSTRUCTOR'
);


--
-- Name: notif_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notif_estado AS ENUM (
    'PENDIENTE',
    'PROCESANDO',
    'ENVIADO',
    'ERROR'
);


--
-- Name: notif_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notif_tipo AS ENUM (
    'VUELO_CANCELADO_POR_ALUMNO',
    'VUELO_CANCELADO_POR_PROGRAMACION',
    'VUELO_REPROGRAMADO',
    'SEMANA_PUBLICADA'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: aeronave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aeronave (
    id_aeronave integer NOT NULL,
    codigo character varying(50) NOT NULL,
    modelo character varying(50) NOT NULL,
    tipo character varying(30) NOT NULL,
    activa boolean DEFAULT true,
    color character varying(50),
    id_wb_plantilla integer,
    frecuencias_default jsonb DEFAULT '[]'::jsonb,
    horas_acumuladas numeric(8,2) DEFAULT 0,
    horas_proxima_revision numeric(8,2),
    tipo_proxima_revision character varying(10),
    estado character varying(20) DEFAULT 'ACTIVO'::character varying,
    CONSTRAINT aeronave_estado_check CHECK (((estado)::text = ANY (ARRAY[('ACTIVO'::character varying)::text, ('MANTENIMIENTO'::character varying)::text]))),
    CONSTRAINT aeronave_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('AVION'::character varying)::text, ('SIMULADOR'::character varying)::text]))),
    CONSTRAINT aeronave_tipo_proxima_revision_check CHECK (((tipo_proxima_revision)::text = ANY (ARRAY[('50HR'::character varying)::text, ('100HR'::character varying)::text])))
);


--
-- Name: aeronave_id_aeronave_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aeronave_id_aeronave_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aeronave_id_aeronave_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aeronave_id_aeronave_seq OWNED BY public.aeronave.id_aeronave;


--
-- Name: aeronave_tarifa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aeronave_tarifa (
    id integer NOT NULL,
    id_aeronave integer,
    modelo_aeronave character varying(60) NOT NULL,
    tarifa_hora_usd numeric(10,2) NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    creado_por integer,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT aeronave_tarifa_tarifa_hora_usd_check CHECK ((tarifa_hora_usd >= (0)::numeric))
);


--
-- Name: aeronave_tarifa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aeronave_tarifa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aeronave_tarifa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aeronave_tarifa_id_seq OWNED BY public.aeronave_tarifa.id;


--
-- Name: alumno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alumno (
    id_alumno integer NOT NULL,
    id_usuario integer NOT NULL,
    id_instructor integer NOT NULL,
    id_licencia integer NOT NULL,
    numero_licencia character varying(10),
    activo boolean DEFAULT true,
    soleado boolean DEFAULT false,
    telefono character varying(20),
    certificado_medico date,
    horas_acumuladas numeric(8,2) DEFAULT 0
);


--
-- Name: alumno_id_alumno_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alumno_id_alumno_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alumno_id_alumno_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alumno_id_alumno_seq OWNED BY public.alumno.id_alumno;


--
-- Name: auditoria_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria_evento (
    id_auditoria bigint NOT NULL,
    accion public.audit_action NOT NULL,
    entidad character varying(60) NOT NULL,
    id_entidad bigint,
    id_semana integer,
    actor_id_usuario integer,
    actor_rol public.audit_actor_rol DEFAULT 'SYSTEM'::public.audit_actor_rol NOT NULL,
    ip inet,
    user_agent text,
    request_id uuid DEFAULT gen_random_uuid(),
    origen character varying(30) DEFAULT 'API'::character varying,
    descripcion text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    before_data jsonb,
    after_data jsonb,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: auditoria_evento_id_auditoria_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_evento_id_auditoria_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_evento_id_auditoria_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_evento_id_auditoria_seq OWNED BY public.auditoria_evento.id_auditoria;


--
-- Name: bloque_bloqueado_dia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bloque_bloqueado_dia (
    id_bloque integer NOT NULL,
    dia_semana integer NOT NULL,
    motivo character varying(30) DEFAULT 'ALMUERZO'::character varying,
    CONSTRAINT bloque_bloqueado_dia_dia_semana_check CHECK (((dia_semana >= 1) AND (dia_semana <= 6)))
);


--
-- Name: bloque_horario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bloque_horario (
    id_bloque integer NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    es_almuerzo boolean DEFAULT false
);


--
-- Name: bloque_horario_id_bloque_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bloque_horario_id_bloque_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bloque_horario_id_bloque_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bloque_horario_id_bloque_seq OWNED BY public.bloque_horario.id_bloque;


--
-- Name: checklist_postvuelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_postvuelo (
    id_checklist integer NOT NULL,
    id_vuelo integer NOT NULL,
    freno_parqueo boolean DEFAULT false NOT NULL,
    mezcla_corte boolean DEFAULT false NOT NULL,
    magnetos_off boolean DEFAULT false NOT NULL,
    master_switch_off boolean DEFAULT false NOT NULL,
    llaves_removidas boolean DEFAULT false NOT NULL,
    calzos_colocados boolean DEFAULT false NOT NULL,
    fuselaje_sin_danos boolean DEFAULT false NOT NULL,
    bordes_ataque_sin_impactos boolean DEFAULT false NOT NULL,
    alerones_libres boolean DEFAULT false NOT NULL,
    tapas_combustible boolean DEFAULT false NOT NULL,
    sin_fugas_combustible boolean DEFAULT false NOT NULL,
    llantas_buen_estado boolean DEFAULT false NOT NULL,
    helice_sin_melladuras boolean DEFAULT false NOT NULL,
    aceite_en_rango boolean DEFAULT false NOT NULL,
    cowling_asegurado boolean DEFAULT false NOT NULL,
    switches_breakers_off boolean DEFAULT false NOT NULL,
    horas_registradas boolean DEFAULT false NOT NULL,
    combustible_anotado boolean DEFAULT false NOT NULL,
    discrepancias_reportadas boolean DEFAULT false NOT NULL,
    comentarios text,
    firma_piloto text,
    licencia_numero character varying(20),
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: checklist_postvuelo_id_checklist_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checklist_postvuelo_id_checklist_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checklist_postvuelo_id_checklist_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checklist_postvuelo_id_checklist_seq OWNED BY public.checklist_postvuelo.id_checklist;


--
-- Name: condiciones_cancelacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.condiciones_cancelacion (
    id_condicion integer NOT NULL,
    texto text NOT NULL,
    activa boolean DEFAULT true,
    orden smallint DEFAULT 0 NOT NULL
);


--
-- Name: condiciones_cancelacion_id_condicion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.condiciones_cancelacion_id_condicion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: condiciones_cancelacion_id_condicion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.condiciones_cancelacion_id_condicion_seq OWNED BY public.condiciones_cancelacion.id_condicion;


--
-- Name: cuenta_corriente_alumno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuenta_corriente_alumno (
    id_alumno integer NOT NULL,
    saldo_actual_usd numeric(12,2) DEFAULT 0 NOT NULL,
    ultimo_movimiento_en timestamp without time zone,
    ultima_factura_correlativo bigint,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: curso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curso (
    id integer NOT NULL,
    codigo character varying(20) NOT NULL,
    nombre character varying(120) NOT NULL,
    descripcion text,
    gastos_administrativos_usd numeric(10,2) DEFAULT 0 NOT NULL,
    costo_teorico_usd numeric(10,2) DEFAULT 0 NOT NULL,
    horas_teoricas integer DEFAULT 0 NOT NULL,
    total_usd_estimado numeric(10,2) DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: curso_componente_practico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curso_componente_practico (
    id integer NOT NULL,
    id_curso integer NOT NULL,
    tipo_aeronave character varying(60) NOT NULL,
    horas_requeridas integer NOT NULL,
    tarifa_hora_usd_referencia numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT curso_componente_practico_horas_requeridas_check CHECK ((horas_requeridas >= 0))
);


--
-- Name: curso_componente_practico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.curso_componente_practico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: curso_componente_practico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.curso_componente_practico_id_seq OWNED BY public.curso_componente_practico.id;


--
-- Name: curso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.curso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: curso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.curso_id_seq OWNED BY public.curso.id;


--
-- Name: documento_alumno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documento_alumno (
    id integer NOT NULL,
    id_alumno integer NOT NULL,
    id_documento_requerido integer NOT NULL,
    fecha_entrega date,
    fecha_vencimiento date,
    archivo_path character varying(255),
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    revisado_por integer,
    observaciones text,
    actualizado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT documento_alumno_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'ENTREGADO'::character varying, 'VENCIDO'::character varying, 'RECHAZADO'::character varying])::text[])))
);


--
-- Name: documento_alumno_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documento_alumno_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documento_alumno_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documento_alumno_id_seq OWNED BY public.documento_alumno.id;


--
-- Name: documento_requerido_catalogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documento_requerido_catalogo (
    id integer NOT NULL,
    codigo character varying(40) NOT NULL,
    nombre character varying(160) NOT NULL,
    autoridad character varying(20) NOT NULL,
    aplica_a_menores boolean DEFAULT false NOT NULL,
    aplica_a_extranjeros boolean DEFAULT false NOT NULL,
    descripcion text,
    frecuencia_renovacion_meses integer,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT documento_requerido_catalogo_autoridad_check CHECK (((autoridad)::text = ANY ((ARRAY['CAAA'::character varying, 'AAC'::character varying])::text[])))
);


--
-- Name: documento_requerido_catalogo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documento_requerido_catalogo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documento_requerido_catalogo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documento_requerido_catalogo_id_seq OWNED BY public.documento_requerido_catalogo.id;


--
-- Name: egreso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.egreso (
    id integer NOT NULL,
    categoria character varying(30) NOT NULL,
    proveedor character varying(120),
    concepto character varying(255) NOT NULL,
    monto_usd numeric(12,2) NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    pdf_comprobante_path character varying(255),
    id_mantenimiento integer,
    id_nomina integer,
    registrado_por integer,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT egreso_categoria_check CHECK (((categoria)::text = ANY ((ARRAY['COMBUSTIBLE'::character varying, 'MANTENIMIENTO'::character varying, 'NOMINA'::character varying, 'SUMINISTROS'::character varying, 'PROVEEDOR'::character varying, 'SERVICIOS'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT egreso_monto_usd_check CHECK ((monto_usd > (0)::numeric))
);


--
-- Name: egreso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.egreso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: egreso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.egreso_id_seq OWNED BY public.egreso.id;


--
-- Name: estado_operaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estado_operaciones (
    id_estado integer NOT NULL,
    beacon boolean DEFAULT true,
    viento character varying(50),
    clima character varying(100),
    estado_general character varying(20) DEFAULT 'NORMAL'::character varying,
    observaciones text,
    actualizado_por integer,
    actualizado_en timestamp without time zone DEFAULT now(),
    motivo_inactivo character varying(30),
    CONSTRAINT estado_operaciones_estado_general_check CHECK (((estado_general)::text = ANY (ARRAY[('ACTIVO'::character varying)::text, ('INACTIVO'::character varying)::text]))),
    CONSTRAINT estado_operaciones_motivo_inactivo_check CHECK (((motivo_inactivo)::text = ANY (ARRAY[('CLIMA'::character varying)::text, ('VIENTO'::character varying)::text, ('VISIBILIDAD'::character varying)::text, ('REVISION_PISTA'::character varying)::text])))
);


--
-- Name: estado_operaciones_id_estado_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estado_operaciones_id_estado_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: estado_operaciones_id_estado_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.estado_operaciones_id_estado_seq OWNED BY public.estado_operaciones.id_estado;


--
-- Name: evaluacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluacion (
    id integer NOT NULL,
    id_curso integer NOT NULL,
    id_unidad integer,
    nombre character varying(180) NOT NULL,
    tipo character varying(20) DEFAULT 'EXAMEN'::character varying NOT NULL,
    fecha_programada date,
    puntos_max numeric(5,1) DEFAULT 100 NOT NULL,
    nota_aprobacion numeric(5,1) DEFAULT 70 NOT NULL,
    id_instructor integer,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT evaluacion_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['EXAMEN'::character varying, 'QUIZ'::character varying, 'TAREA'::character varying, 'PRACTICA'::character varying, 'FINAL'::character varying])::text[])))
);


--
-- Name: evaluacion_alumno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluacion_alumno (
    id integer NOT NULL,
    id_evaluacion integer NOT NULL,
    id_alumno integer NOT NULL,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    nota numeric(5,1),
    fecha_presentacion date,
    observaciones text,
    archivo_path character varying(255),
    calificado_por integer,
    calificado_en timestamp without time zone,
    CONSTRAINT evaluacion_alumno_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'PRESENTADA'::character varying, 'CALIFICADA'::character varying, 'AUSENTE'::character varying, 'ANULADA'::character varying])::text[])))
);


--
-- Name: evaluacion_alumno_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluacion_alumno_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluacion_alumno_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluacion_alumno_id_seq OWNED BY public.evaluacion_alumno.id;


--
-- Name: evaluacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluacion_id_seq OWNED BY public.evaluacion.id;


--
-- Name: factura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factura (
    id integer NOT NULL,
    numero_correlativo bigint NOT NULL,
    id_alumno integer NOT NULL,
    fecha_emision timestamp without time zone DEFAULT now() NOT NULL,
    subtotal_usd numeric(12,2) NOT NULL,
    iva_usd numeric(12,2) DEFAULT 0 NOT NULL,
    total_usd numeric(12,2) NOT NULL,
    estado character varying(20) DEFAULT 'EMITIDA'::character varying NOT NULL,
    id_vuelo integer,
    concepto character varying(255),
    pdf_path character varying(255),
    emitida_por integer,
    motivo_anulacion text,
    CONSTRAINT factura_estado_check CHECK (((estado)::text = ANY ((ARRAY['EMITIDA'::character varying, 'ANULADA'::character varying])::text[])))
);


--
-- Name: factura_correlativo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factura_correlativo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factura_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factura_detalle (
    id integer NOT NULL,
    id_factura integer NOT NULL,
    descripcion character varying(255) NOT NULL,
    cantidad_horas numeric(6,2) NOT NULL,
    tarifa_hora_usd numeric(10,2) NOT NULL,
    subtotal_usd numeric(12,2) NOT NULL,
    id_aeronave_tarifa integer,
    id_vuelo integer
);


--
-- Name: factura_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factura_detalle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factura_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factura_detalle_id_seq OWNED BY public.factura_detalle.id;


--
-- Name: factura_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factura_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factura_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factura_id_seq OWNED BY public.factura.id;


--
-- Name: horas_vuelo_aeronave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.horas_vuelo_aeronave (
    id_registro integer NOT NULL,
    id_aeronave integer NOT NULL,
    id_vuelo integer,
    horas_voladas numeric(5,2) NOT NULL,
    horas_acumuladas numeric(8,2) NOT NULL,
    registrado_en timestamp without time zone DEFAULT now()
);


--
-- Name: horas_vuelo_aeronave_id_registro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.horas_vuelo_aeronave_id_registro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: horas_vuelo_aeronave_id_registro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.horas_vuelo_aeronave_id_registro_seq OWNED BY public.horas_vuelo_aeronave.id_registro;


--
-- Name: inscripcion_curso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inscripcion_curso (
    id integer NOT NULL,
    id_alumno integer NOT NULL,
    id_curso integer NOT NULL,
    fecha_inicio date DEFAULT CURRENT_DATE NOT NULL,
    estado character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    horas_practicas_completadas numeric(7,2) DEFAULT 0 NOT NULL,
    fecha_finalizacion date,
    observaciones text,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT inscripcion_curso_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'COMPLETADO'::character varying, 'SUSPENDIDO'::character varying, 'CANCELADO'::character varying])::text[])))
);


--
-- Name: inscripcion_curso_avance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inscripcion_curso_avance (
    id integer NOT NULL,
    id_inscripcion integer NOT NULL,
    tipo_aeronave character varying(60) NOT NULL,
    horas_requeridas numeric(6,2) NOT NULL,
    horas_acumuladas numeric(6,2) DEFAULT 0 NOT NULL
);


--
-- Name: inscripcion_curso_avance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inscripcion_curso_avance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inscripcion_curso_avance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inscripcion_curso_avance_id_seq OWNED BY public.inscripcion_curso_avance.id;


--
-- Name: inscripcion_curso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inscripcion_curso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inscripcion_curso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inscripcion_curso_id_seq OWNED BY public.inscripcion_curso.id;


--
-- Name: instructor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor (
    id_instructor integer NOT NULL,
    id_usuario integer NOT NULL,
    activo boolean DEFAULT true
);


--
-- Name: instructor_id_instructor_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instructor_id_instructor_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instructor_id_instructor_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instructor_id_instructor_seq OWNED BY public.instructor.id_instructor;


--
-- Name: instructor_tarifa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_tarifa (
    id integer NOT NULL,
    id_instructor integer NOT NULL,
    tarifa_hora_usd numeric(10,2) NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    creado_por integer,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    tipo_pago character varying(20) DEFAULT 'POR_HORA'::character varying NOT NULL,
    salario_mensual_fijo numeric(10,2) DEFAULT 0 NOT NULL,
    tarifa_hora_vuelo numeric(10,2) DEFAULT 0 NOT NULL,
    tarifa_hora_teoria numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT instructor_tarifa_tarifa_hora_usd_check CHECK ((tarifa_hora_usd >= (0)::numeric)),
    CONSTRAINT instructor_tarifa_tipo_pago_check CHECK (((tipo_pago)::text = ANY ((ARRAY['MENSUAL_FIJO'::character varying, 'POR_HORA'::character varying, 'MIXTO'::character varying])::text[])))
);


--
-- Name: instructor_tarifa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instructor_tarifa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instructor_tarifa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instructor_tarifa_id_seq OWNED BY public.instructor_tarifa.id;


--
-- Name: licencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licencia (
    id_licencia integer NOT NULL,
    nombre character varying(50) NOT NULL,
    nivel integer NOT NULL,
    dia_apertura_agenda integer NOT NULL
);


--
-- Name: licencia_aeronave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licencia_aeronave (
    id_licencia integer NOT NULL,
    id_aeronave integer NOT NULL
);


--
-- Name: licencia_id_licencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.licencia_id_licencia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: licencia_id_licencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.licencia_id_licencia_seq OWNED BY public.licencia.id_licencia;


--
-- Name: loadsheet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loadsheet (
    id_loadsheet integer NOT NULL,
    id_vuelo integer NOT NULL,
    power_setting character varying(10),
    fuel_flow numeric(6,2),
    dep_atis character varying(10),
    arr_atis character varying(10),
    taxi_fuel numeric(6,2),
    trip_fuel numeric(6,2),
    reserve_rr numeric(6,2),
    alt1_fuel numeric(6,2),
    alt2_fuel numeric(6,2),
    final_reserve numeric(6,2),
    min_req numeric(6,2),
    extra numeric(6,2),
    tfob numeric(6,2),
    tod_min numeric(6,2),
    ld_min numeric(6,2),
    etd time without time zone,
    eta time without time zone,
    eet interval,
    atd time without time zone,
    ata time without time zone,
    notas text,
    estado character varying(20) DEFAULT 'BORRADOR'::character varying,
    archivo_pdf text,
    creado_en timestamp without time zone DEFAULT now(),
    actualizado_en timestamp without time zone DEFAULT now(),
    CONSTRAINT loadsheet_estado_check CHECK (((estado)::text = ANY (ARRAY[('BORRADOR'::character varying)::text, ('COMPLETADO'::character varying)::text, ('ENVIADO'::character varying)::text])))
);


--
-- Name: loadsheet_id_loadsheet_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loadsheet_id_loadsheet_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loadsheet_id_loadsheet_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loadsheet_id_loadsheet_seq OWNED BY public.loadsheet.id_loadsheet;


--
-- Name: loadsheet_waypoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loadsheet_waypoint (
    id_waypoint integer NOT NULL,
    id_loadsheet integer NOT NULL,
    orden smallint NOT NULL,
    waypoint character varying(20),
    altitud_fl character varying(10),
    wind_vel character varying(10),
    tc numeric(6,2),
    variacion numeric(5,2),
    mc numeric(6,2),
    wca numeric(5,2),
    mh numeric(6,2),
    desviacion numeric(5,2),
    ch numeric(6,2),
    tas numeric(6,2),
    gs numeric(6,2),
    distancia_nm numeric(6,2),
    eta time without time zone,
    ata time without time zone,
    fuel_req numeric(6,2),
    fuel_act numeric(6,2)
);


--
-- Name: loadsheet_waypoint_id_waypoint_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loadsheet_waypoint_id_waypoint_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loadsheet_waypoint_id_waypoint_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loadsheet_waypoint_id_waypoint_seq OWNED BY public.loadsheet_waypoint.id_waypoint;


--
-- Name: mantenimiento_aeronave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mantenimiento_aeronave (
    id_mantenimiento integer NOT NULL,
    id_aeronave integer NOT NULL,
    tipo character varying(30) NOT NULL,
    fecha_programada date NOT NULL,
    horas_actuales numeric(8,2),
    horas_proxima numeric(8,2),
    descripcion text,
    completado boolean DEFAULT false,
    fecha_completado date,
    creado_en timestamp without time zone DEFAULT now(),
    CONSTRAINT mantenimiento_aeronave_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('50HR'::character varying)::text, ('100HR'::character varying)::text, ('ANUAL'::character varying)::text, ('AD'::character varying)::text, ('PREVENTIVO'::character varying)::text, ('CORRECTIVO'::character varying)::text])))
);


--
-- Name: mantenimiento_aeronave_id_mantenimiento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mantenimiento_aeronave_id_mantenimiento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mantenimiento_aeronave_id_mantenimiento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mantenimiento_aeronave_id_mantenimiento_seq OWNED BY public.mantenimiento_aeronave.id_mantenimiento;


--
-- Name: medico_autorizado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medico_autorizado (
    id integer NOT NULL,
    especialidad character varying(30) NOT NULL,
    nombre character varying(160) NOT NULL,
    telefonos character varying(120),
    correo character varying(160),
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT medico_autorizado_especialidad_check CHECK (((especialidad)::text = ANY ((ARRAY['CARDIOLOGO'::character varying, 'OTORRINO'::character varying, 'OFTALMOLOGO'::character varying])::text[])))
);


--
-- Name: medico_autorizado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medico_autorizado_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medico_autorizado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medico_autorizado_id_seq OWNED BY public.medico_autorizado.id;


--
-- Name: mensaje_turno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensaje_turno (
    id_mensaje bigint NOT NULL,
    id_usuario_origen integer,
    contenido text NOT NULL,
    tipo character varying(20) DEFAULT 'INFO'::character varying,
    para_rol character varying(30),
    leido_por jsonb DEFAULT '[]'::jsonb,
    activo boolean DEFAULT true,
    creado_en timestamp without time zone DEFAULT now(),
    CONSTRAINT mensaje_turno_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('TURNO'::character varying)::text, ('ALERTA'::character varying)::text, ('INFO'::character varying)::text])))
);


--
-- Name: mensaje_turno_id_mensaje_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mensaje_turno_id_mensaje_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mensaje_turno_id_mensaje_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mensaje_turno_id_mensaje_seq OWNED BY public.mensaje_turno.id_mensaje;


--
-- Name: movimiento_cuenta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimiento_cuenta (
    id bigint NOT NULL,
    id_alumno integer NOT NULL,
    tipo character varying(30) NOT NULL,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    descripcion character varying(255) NOT NULL,
    monto_usd numeric(12,2) NOT NULL,
    saldo_resultante_usd numeric(12,2) NOT NULL,
    id_vuelo integer,
    id_factura integer,
    id_recibo integer,
    generado_automatico boolean DEFAULT false NOT NULL,
    registrado_por integer,
    anulado boolean DEFAULT false NOT NULL,
    motivo_anulacion text,
    instructor_nombre character varying(120),
    avion_codigo character varying(40),
    horas_vuelo numeric(5,2),
    horas_totales numeric(7,2),
    editado_en timestamp without time zone,
    editado_por integer,
    motivo_edicion text,
    CONSTRAINT movimiento_cuenta_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['DEPOSITO'::character varying, 'CARGO_VUELO'::character varying, 'CARGO_CURSO'::character varying, 'CARGO_OTRO'::character varying, 'AJUSTE_DEBE'::character varying, 'AJUSTE_HABER'::character varying, 'ANULACION'::character varying])::text[])))
);


--
-- Name: movimiento_cuenta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimiento_cuenta_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimiento_cuenta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimiento_cuenta_id_seq OWNED BY public.movimiento_cuenta.id;


--
-- Name: nomina_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomina_detalle (
    id integer NOT NULL,
    id_periodo integer NOT NULL,
    id_instructor integer NOT NULL,
    horas_voladas numeric(7,2) DEFAULT 0 NOT NULL,
    tarifa_hora numeric(10,2) DEFAULT 0 NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    bonos numeric(12,2) DEFAULT 0 NOT NULL,
    descuentos numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    pdf_recibo_path character varying(255),
    tipo_pago character varying(20) DEFAULT 'POR_HORA'::character varying,
    horas_teoricas numeric(7,2) DEFAULT 0 NOT NULL,
    tarifa_hora_teoria numeric(10,2) DEFAULT 0 NOT NULL,
    monto_vuelo numeric(12,2) DEFAULT 0 NOT NULL,
    monto_teorico numeric(12,2) DEFAULT 0 NOT NULL,
    salario_mensual numeric(12,2) DEFAULT 0 NOT NULL,
    observaciones text
);


--
-- Name: nomina_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomina_detalle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomina_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomina_detalle_id_seq OWNED BY public.nomina_detalle.id;


--
-- Name: nomina_detalle_vuelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomina_detalle_vuelo (
    id integer NOT NULL,
    id_nomina_detalle integer NOT NULL,
    id_vuelo integer NOT NULL,
    horas numeric(5,2) NOT NULL,
    monto numeric(10,2) NOT NULL
);


--
-- Name: nomina_detalle_vuelo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomina_detalle_vuelo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomina_detalle_vuelo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomina_detalle_vuelo_id_seq OWNED BY public.nomina_detalle_vuelo.id;


--
-- Name: nomina_periodo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomina_periodo (
    id integer NOT NULL,
    periodo_inicio date NOT NULL,
    periodo_fin date NOT NULL,
    estado character varying(20) DEFAULT 'BORRADOR'::character varying NOT NULL,
    creado_por integer,
    aprobado_por integer,
    fecha_pago date,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT nomina_periodo_estado_check CHECK (((estado)::text = ANY ((ARRAY['BORRADOR'::character varying, 'APROBADA'::character varying, 'PAGADA'::character varying])::text[])))
);


--
-- Name: nomina_periodo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomina_periodo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomina_periodo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomina_periodo_id_seq OWNED BY public.nomina_periodo.id;


--
-- Name: notificacion_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacion_outbox (
    id_outbox bigint NOT NULL,
    tipo text NOT NULL,
    para_correo character varying(200),
    para_id_usuario integer,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    procesado boolean DEFAULT false NOT NULL,
    procesado_en timestamp without time zone,
    error text
);


--
-- Name: notificacion_outbox_id_outbox_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificacion_outbox_id_outbox_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificacion_outbox_id_outbox_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificacion_outbox_id_outbox_seq OWNED BY public.notificacion_outbox.id_outbox;


--
-- Name: plan_vuelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_vuelo (
    id_plan_vuelo integer NOT NULL,
    id_vuelo integer NOT NULL,
    reglas character varying(3) DEFAULT 'VFR'::character varying NOT NULL,
    hora_salida time without time zone,
    altitud character varying(20),
    ruta character varying(200),
    tiempo_ruta interval,
    combustible_abordo character varying(20),
    personas_abordo smallint DEFAULT 1,
    velocidad_verdadera character varying(20),
    destino character varying(10) DEFAULT 'MSSS'::character varying,
    aeropuerto_alterno character varying(10) DEFAULT 'MSLP'::character varying,
    frecuencias jsonb DEFAULT '[]'::jsonb,
    tiene_vor boolean DEFAULT false,
    tiene_dme boolean DEFAULT false,
    tiene_adf boolean DEFAULT false,
    observaciones text,
    piloto_al_mando character varying(100),
    estado character varying(20) DEFAULT 'BORRADOR'::character varying,
    archivo_pdf text,
    creado_en timestamp without time zone DEFAULT now(),
    actualizado_en timestamp without time zone DEFAULT now(),
    CONSTRAINT plan_vuelo_estado_check CHECK (((estado)::text = ANY (ARRAY[('BORRADOR'::character varying)::text, ('COMPLETADO'::character varying)::text]))),
    CONSTRAINT plan_vuelo_reglas_check CHECK (((reglas)::text = ANY (ARRAY[('VFR'::character varying)::text, ('IFR'::character varying)::text])))
);


--
-- Name: plan_vuelo_id_plan_vuelo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plan_vuelo_id_plan_vuelo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plan_vuelo_id_plan_vuelo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plan_vuelo_id_plan_vuelo_seq OWNED BY public.plan_vuelo.id_plan_vuelo;


--
-- Name: progreso_unidad_alumno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.progreso_unidad_alumno (
    id integer NOT NULL,
    id_alumno integer NOT NULL,
    id_unidad integer NOT NULL,
    id_inscripcion integer,
    estado character varying(20) DEFAULT 'NO_INICIADA'::character varying NOT NULL,
    fecha_inicio date,
    fecha_completada date,
    horas_acumuladas numeric(5,1) DEFAULT 0,
    observaciones text,
    actualizado_por integer,
    actualizado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT progreso_unidad_alumno_estado_check CHECK (((estado)::text = ANY ((ARRAY['NO_INICIADA'::character varying, 'EN_PROGRESO'::character varying, 'COMPLETADA'::character varying, 'REPROBADA'::character varying])::text[])))
);


--
-- Name: progreso_unidad_alumno_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.progreso_unidad_alumno_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: progreso_unidad_alumno_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.progreso_unidad_alumno_id_seq OWNED BY public.progreso_unidad_alumno.id;


--
-- Name: recibo_correlativo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recibo_correlativo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recibo_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recibo_pago (
    id integer NOT NULL,
    numero_correlativo bigint NOT NULL,
    id_alumno integer NOT NULL,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    monto_usd numeric(12,2) NOT NULL,
    metodo character varying(20) NOT NULL,
    referencia character varying(80),
    descripcion character varying(255),
    pdf_path character varying(255),
    registrado_por integer,
    anulado boolean DEFAULT false NOT NULL,
    motivo_anulacion text,
    CONSTRAINT recibo_pago_metodo_check CHECK (((metodo)::text = ANY ((ARRAY['EFECTIVO'::character varying, 'TRANSFERENCIA'::character varying, 'CHEQUE'::character varying, 'TARJETA'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT recibo_pago_monto_usd_check CHECK ((monto_usd > (0)::numeric))
);


--
-- Name: recibo_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recibo_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recibo_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recibo_pago_id_seq OWNED BY public.recibo_pago.id;


--
-- Name: reporte_vuelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reporte_vuelo (
    id_reporte integer NOT NULL,
    id_vuelo integer NOT NULL,
    tipo_vuelo character varying(20),
    tacometro_salida numeric(10,2),
    tacometro_llegada numeric(10,2),
    hobbs_salida numeric(10,2),
    hobbs_llegada numeric(10,2),
    combustible_salida numeric(10,2),
    combustible_llegada numeric(10,2),
    cantidad_combustible numeric(10,2),
    firma_alumno text,
    firma_instructor text,
    estado character varying(30) DEFAULT 'BORRADOR'::character varying NOT NULL,
    archivo_pdf text,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT reporte_vuelo_estado_check CHECK (((estado)::text = ANY ((ARRAY['BORRADOR'::character varying, 'PENDIENTE_INSTRUCTOR'::character varying, 'COMPLETADO'::character varying])::text[]))),
    CONSTRAINT reporte_vuelo_tipo_vuelo_check CHECK (((tipo_vuelo)::text = ANY ((ARRAY['PASAJERO'::character varying, 'CARGA'::character varying, 'SOLO'::character varying, 'DOBLE'::character varying, 'FERRY'::character varying, 'LOCAL'::character varying])::text[])))
);


--
-- Name: reporte_vuelo_id_reporte_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reporte_vuelo_id_reporte_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reporte_vuelo_id_reporte_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reporte_vuelo_id_reporte_seq OWNED BY public.reporte_vuelo.id_reporte;


--
-- Name: semana_vuelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semana_vuelo (
    id_semana integer NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    publicada boolean DEFAULT false,
    fecha_publicacion timestamp without time zone
);


--
-- Name: semana_vuelo_id_semana_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.semana_vuelo_id_semana_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: semana_vuelo_id_semana_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.semana_vuelo_id_semana_seq OWNED BY public.semana_vuelo.id_semana;


--
-- Name: solicitud_semana; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitud_semana (
    id_solicitud integer NOT NULL,
    id_semana integer NOT NULL,
    id_alumno integer NOT NULL,
    estado character varying(20) NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    limite_vuelos integer,
    CONSTRAINT solicitud_semana_estado_check CHECK (((estado)::text = ANY (ARRAY[('BORRADOR'::character varying)::text, ('EN_REVISION'::character varying)::text, ('PUBLICADO'::character varying)::text])))
);


--
-- Name: solicitud_semana_id_solicitud_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitud_semana_id_solicitud_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitud_semana_id_solicitud_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitud_semana_id_solicitud_seq OWNED BY public.solicitud_semana.id_solicitud;


--
-- Name: solicitud_vuelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitud_vuelo (
    id_detalle integer NOT NULL,
    id_solicitud integer NOT NULL,
    id_aeronave integer NOT NULL,
    dia_semana integer NOT NULL,
    id_bloque integer,
    id_semana integer NOT NULL,
    CONSTRAINT solicitud_vuelo_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))
);


--
-- Name: solicitud_vuelo_id_detalle_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitud_vuelo_id_detalle_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitud_vuelo_id_detalle_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitud_vuelo_id_detalle_seq OWNED BY public.solicitud_vuelo.id_detalle;


--
-- Name: unidad_teorica; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidad_teorica (
    id integer NOT NULL,
    id_curso integer NOT NULL,
    numero integer NOT NULL,
    nombre character varying(160) NOT NULL,
    descripcion text,
    horas_estimadas numeric(5,1) DEFAULT 0,
    orden integer DEFAULT 0 NOT NULL,
    recursos_url text,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: unidad_teorica_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unidad_teorica_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unidad_teorica_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unidad_teorica_id_seq OWNED BY public.unidad_teorica.id;


--
-- Name: usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario (
    id_usuario integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    correo character varying(200),
    password_hash text NOT NULL,
    rol character varying(30) NOT NULL,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    must_change_password boolean DEFAULT true,
    username character varying(60) NOT NULL,
    must_set_email boolean DEFAULT true,
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp without time zone,
    CONSTRAINT usuario_rol_check CHECK (((rol)::text = ANY ((ARRAY['ADMIN'::character varying, 'PROGRAMACION'::character varying, 'TURNO'::character varying, 'ALUMNO'::character varying, 'INSTRUCTOR'::character varying, 'ADMINISTRACION'::character varying])::text[])))
);


--
-- Name: usuario_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_id_usuario_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_id_usuario_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_id_usuario_seq OWNED BY public.usuario.id_usuario;


--
-- Name: vuelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vuelo (
    id_vuelo integer NOT NULL,
    id_semana integer NOT NULL,
    id_alumno integer NOT NULL,
    id_instructor integer NOT NULL,
    id_aeronave integer NOT NULL,
    dia_semana integer NOT NULL,
    id_bloque integer NOT NULL,
    estado character varying(30) NOT NULL,
    creado_por character varying(30) NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    id_detalle integer,
    fecha_vuelo date,
    tipo_cancelacion character varying(20),
    justificacion_cancelacion text,
    archivo_cancelacion text,
    cancelado_por_id_usuario integer,
    fecha_cancelacion timestamp without time zone,
    duracion_estimada_min integer,
    tiempo_vuelo_min numeric(6,2),
    CONSTRAINT vuelo_creado_por_check CHECK (((creado_por)::text = ANY (ARRAY[('ALUMNO'::character varying)::text, ('PROGRAMACION'::character varying)::text, ('ADMIN'::character varying)::text]))),
    CONSTRAINT vuelo_dia_semana_check CHECK (((dia_semana >= 1) AND (dia_semana <= 6))),
    CONSTRAINT vuelo_estado_check CHECK (((estado)::text = ANY (ARRAY[('SOLICITADO'::character varying)::text, ('AJUSTADO'::character varying)::text, ('PUBLICADO'::character varying)::text, ('EN_VUELO'::character varying)::text, ('COMPLETADO'::character varying)::text, ('CANCELADO'::character varying)::text, ('SALIDA_HANGAR'::character varying)::text, ('REGRESO_HANGAR'::character varying)::text, ('FINALIZANDO'::character varying)::text]))),
    CONSTRAINT vuelo_tipo_cancelacion_check CHECK (((tipo_cancelacion)::text = ANY (ARRAY[('NORMAL'::character varying)::text, ('EMERGENCIA'::character varying)::text])))
);


--
-- Name: vuelo_estado_tiempo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vuelo_estado_tiempo (
    id_registro integer NOT NULL,
    id_vuelo integer NOT NULL,
    estado character varying(30) NOT NULL,
    registrado_por integer,
    registrado_en timestamp without time zone DEFAULT now(),
    CONSTRAINT vuelo_estado_tiempo_estado_check CHECK (((estado)::text = ANY (ARRAY[('PROGRAMADO'::character varying)::text, ('SALIDA_HANGAR'::character varying)::text, ('EN_VUELO'::character varying)::text, ('REGRESO_HANGAR'::character varying)::text, ('COMPLETADO'::character varying)::text, ('CANCELADO'::character varying)::text, ('FINALIZANDO'::character varying)::text])))
);


--
-- Name: vuelo_estado_tiempo_id_registro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vuelo_estado_tiempo_id_registro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vuelo_estado_tiempo_id_registro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vuelo_estado_tiempo_id_registro_seq OWNED BY public.vuelo_estado_tiempo.id_registro;


--
-- Name: vuelo_id_vuelo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vuelo_id_vuelo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vuelo_id_vuelo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vuelo_id_vuelo_seq OWNED BY public.vuelo.id_vuelo;


--
-- Name: wb_plantilla; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wb_plantilla (
    id_wb_plantilla integer NOT NULL,
    nombre character varying(50) NOT NULL,
    unidad_arm character varying(10) DEFAULT 'inches'::character varying NOT NULL,
    empty_weight numeric(8,2) NOT NULL,
    empty_weight_arm numeric(8,3) NOT NULL,
    empty_weight_moment numeric(12,2) NOT NULL,
    max_takeoff_weight numeric(8,2) NOT NULL,
    max_landing_weight numeric(8,2) NOT NULL,
    fuel_capacity_gal numeric(6,2) NOT NULL,
    fuel_usable_gal numeric(6,2) NOT NULL,
    fuel_burn_gal_hr numeric(5,2) NOT NULL,
    estaciones jsonb DEFAULT '[]'::jsonb NOT NULL,
    creado_en timestamp without time zone DEFAULT now(),
    limits_normal jsonb,
    limits_utility jsonb,
    fuel_lb_gal numeric(5,2) DEFAULT 6.0,
    moment_div1000 boolean DEFAULT false,
    fuel_burn_note character varying(120),
    CONSTRAINT wb_plantilla_unidad_arm_check CHECK (((unidad_arm)::text = ANY (ARRAY[('inches'::character varying)::text, ('mm'::character varying)::text])))
);


--
-- Name: wb_plantilla_id_wb_plantilla_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wb_plantilla_id_wb_plantilla_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wb_plantilla_id_wb_plantilla_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wb_plantilla_id_wb_plantilla_seq OWNED BY public.wb_plantilla.id_wb_plantilla;


--
-- Name: webhook_endpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_endpoint (
    id_webhook bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    url text NOT NULL,
    secret_token text,
    activo boolean DEFAULT true NOT NULL,
    timeout_ms integer DEFAULT 5000 NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: webhook_endpoint_id_webhook_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_endpoint_id_webhook_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhook_endpoint_id_webhook_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_endpoint_id_webhook_seq OWNED BY public.webhook_endpoint.id_webhook;


--
-- Name: webhook_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_evento (
    id_webhook bigint NOT NULL,
    evento character varying(50) NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: weight_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weight_balance (
    id_wb integer NOT NULL,
    id_vuelo integer NOT NULL,
    id_wb_plantilla integer NOT NULL,
    pesos_ingresados jsonb DEFAULT '[]'::jsonb NOT NULL,
    galones_combustible numeric(6,2),
    tow_calculado numeric(8,2),
    lw_calculado numeric(8,2),
    cg_calculado numeric(8,3),
    dentro_envelope boolean,
    estado character varying(20) DEFAULT 'BORRADOR'::character varying,
    creado_en timestamp without time zone DEFAULT now(),
    actualizado_en timestamp without time zone DEFAULT now(),
    CONSTRAINT weight_balance_estado_check CHECK (((estado)::text = ANY (ARRAY[('BORRADOR'::character varying)::text, ('COMPLETADO'::character varying)::text])))
);


--
-- Name: weight_balance_id_wb_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.weight_balance_id_wb_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: weight_balance_id_wb_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.weight_balance_id_wb_seq OWNED BY public.weight_balance.id_wb;


--
-- Name: aeronave id_aeronave; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aeronave ALTER COLUMN id_aeronave SET DEFAULT nextval('public.aeronave_id_aeronave_seq'::regclass);


--
-- Name: aeronave_tarifa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aeronave_tarifa ALTER COLUMN id SET DEFAULT nextval('public.aeronave_tarifa_id_seq'::regclass);


--
-- Name: alumno id_alumno; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alumno ALTER COLUMN id_alumno SET DEFAULT nextval('public.alumno_id_alumno_seq'::regclass);


--
-- Name: auditoria_evento id_auditoria; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_evento ALTER COLUMN id_auditoria SET DEFAULT nextval('public.auditoria_evento_id_auditoria_seq'::regclass);


--
-- Name: bloque_horario id_bloque; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bloque_horario ALTER COLUMN id_bloque SET DEFAULT nextval('public.bloque_horario_id_bloque_seq'::regclass);


--
-- Name: checklist_postvuelo id_checklist; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_postvuelo ALTER COLUMN id_checklist SET DEFAULT nextval('public.checklist_postvuelo_id_checklist_seq'::regclass);


--
-- Name: condiciones_cancelacion id_condicion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condiciones_cancelacion ALTER COLUMN id_condicion SET DEFAULT nextval('public.condiciones_cancelacion_id_condicion_seq'::regclass);


--
-- Name: curso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curso ALTER COLUMN id SET DEFAULT nextval('public.curso_id_seq'::regclass);


--
-- Name: curso_componente_practico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curso_componente_practico ALTER COLUMN id SET DEFAULT nextval('public.curso_componente_practico_id_seq'::regclass);


--
-- Name: documento_alumno id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_alumno ALTER COLUMN id SET DEFAULT nextval('public.documento_alumno_id_seq'::regclass);


--
-- Name: documento_requerido_catalogo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_requerido_catalogo ALTER COLUMN id SET DEFAULT nextval('public.documento_requerido_catalogo_id_seq'::regclass);


--
-- Name: egreso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.egreso ALTER COLUMN id SET DEFAULT nextval('public.egreso_id_seq'::regclass);


--
-- Name: estado_operaciones id_estado; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estado_operaciones ALTER COLUMN id_estado SET DEFAULT nextval('public.estado_operaciones_id_estado_seq'::regclass);


--
-- Name: evaluacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion ALTER COLUMN id SET DEFAULT nextval('public.evaluacion_id_seq'::regclass);


--
-- Name: evaluacion_alumno id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_alumno ALTER COLUMN id SET DEFAULT nextval('public.evaluacion_alumno_id_seq'::regclass);


--
-- Name: factura id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura ALTER COLUMN id SET DEFAULT nextval('public.factura_id_seq'::regclass);


--
-- Name: factura_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_detalle ALTER COLUMN id SET DEFAULT nextval('public.factura_detalle_id_seq'::regclass);


--
-- Name: horas_vuelo_aeronave id_registro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horas_vuelo_aeronave ALTER COLUMN id_registro SET DEFAULT nextval('public.horas_vuelo_aeronave_id_registro_seq'::regclass);


--
-- Name: inscripcion_curso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_curso ALTER COLUMN id SET DEFAULT nextval('public.inscripcion_curso_id_seq'::regclass);


--
-- Name: inscripcion_curso_avance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_curso_avance ALTER COLUMN id SET DEFAULT nextval('public.inscripcion_curso_avance_id_seq'::regclass);


--
-- Name: instructor id_instructor; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor ALTER COLUMN id_instructor SET DEFAULT nextval('public.instructor_id_instructor_seq'::regclass);


--
-- Name: instructor_tarifa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_tarifa ALTER COLUMN id SET DEFAULT nextval('public.instructor_tarifa_id_seq'::regclass);


--
-- Name: licencia id_licencia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licencia ALTER COLUMN id_licencia SET DEFAULT nextval('public.licencia_id_licencia_seq'::regclass);


--
-- Name: loadsheet id_loadsheet; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loadsheet ALTER COLUMN id_loadsheet SET DEFAULT nextval('public.loadsheet_id_loadsheet_seq'::regclass);


--
-- Name: loadsheet_waypoint id_waypoint; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loadsheet_waypoint ALTER COLUMN id_waypoint SET DEFAULT nextval('public.loadsheet_waypoint_id_waypoint_seq'::regclass);


--
-- Name: mantenimiento_aeronave id_mantenimiento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mantenimiento_aeronave ALTER COLUMN id_mantenimiento SET DEFAULT nextval('public.mantenimiento_aeronave_id_mantenimiento_seq'::regclass);


--
-- Name: medico_autorizado id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medico_autorizado ALTER COLUMN id SET DEFAULT nextval('public.medico_autorizado_id_seq'::regclass);


--
-- Name: mensaje_turno id_mensaje; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_turno ALTER COLUMN id_mensaje SET DEFAULT nextval('public.mensaje_turno_id_mensaje_seq'::regclass);


--
-- Name: movimiento_cuenta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_cuenta ALTER COLUMN id SET DEFAULT nextval('public.movimiento_cuenta_id_seq'::regclass);


--
-- Name: nomina_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_detalle ALTER COLUMN id SET DEFAULT nextval('public.nomina_detalle_id_seq'::regclass);


--
-- Name: nomina_detalle_vuelo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_detalle_vuelo ALTER COLUMN id SET DEFAULT nextval('public.nomina_detalle_vuelo_id_seq'::regclass);


--
-- Name: nomina_periodo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_periodo ALTER COLUMN id SET DEFAULT nextval('public.nomina_periodo_id_seq'::regclass);


--
-- Name: notificacion_outbox id_outbox; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacion_outbox ALTER COLUMN id_outbox SET DEFAULT nextval('public.notificacion_outbox_id_outbox_seq'::regclass);


--
-- Name: plan_vuelo id_plan_vuelo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_vuelo ALTER COLUMN id_plan_vuelo SET DEFAULT nextval('public.plan_vuelo_id_plan_vuelo_seq'::regclass);


--
-- Name: progreso_unidad_alumno id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progreso_unidad_alumno ALTER COLUMN id SET DEFAULT nextval('public.progreso_unidad_alumno_id_seq'::regclass);


--
-- Name: recibo_pago id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibo_pago ALTER COLUMN id SET DEFAULT nextval('public.recibo_pago_id_seq'::regclass);


--
-- Name: reporte_vuelo id_reporte; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporte_vuelo ALTER COLUMN id_reporte SET DEFAULT nextval('public.reporte_vuelo_id_reporte_seq'::regclass);


--
-- Name: semana_vuelo id_semana; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semana_vuelo ALTER COLUMN id_semana SET DEFAULT nextval('public.semana_vuelo_id_semana_seq'::regclass);


--
-- Name: solicitud_semana id_solicitud; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_semana ALTER COLUMN id_solicitud SET DEFAULT nextval('public.solicitud_semana_id_solicitud_seq'::regclass);


--
-- Name: solicitud_vuelo id_detalle; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_vuelo ALTER COLUMN id_detalle SET DEFAULT nextval('public.solicitud_vuelo_id_detalle_seq'::regclass);


--
-- Name: unidad_teorica id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_teorica ALTER COLUMN id SET DEFAULT nextval('public.unidad_teorica_id_seq'::regclass);


--
-- Name: usuario id_usuario; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario ALTER COLUMN id_usuario SET DEFAULT nextval('public.usuario_id_usuario_seq'::regclass);


--
-- Name: vuelo id_vuelo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo ALTER COLUMN id_vuelo SET DEFAULT nextval('public.vuelo_id_vuelo_seq'::regclass);


--
-- Name: vuelo_estado_tiempo id_registro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo_estado_tiempo ALTER COLUMN id_registro SET DEFAULT nextval('public.vuelo_estado_tiempo_id_registro_seq'::regclass);


--
-- Name: wb_plantilla id_wb_plantilla; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wb_plantilla ALTER COLUMN id_wb_plantilla SET DEFAULT nextval('public.wb_plantilla_id_wb_plantilla_seq'::regclass);


--
-- Name: webhook_endpoint id_webhook; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoint ALTER COLUMN id_webhook SET DEFAULT nextval('public.webhook_endpoint_id_webhook_seq'::regclass);


--
-- Name: weight_balance id_wb; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_balance ALTER COLUMN id_wb SET DEFAULT nextval('public.weight_balance_id_wb_seq'::regclass);


--
-- Name: aeronave aeronave_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aeronave
    ADD CONSTRAINT aeronave_codigo_key UNIQUE (codigo);


--
-- Name: aeronave aeronave_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aeronave
    ADD CONSTRAINT aeronave_pkey PRIMARY KEY (id_aeronave);


--
-- Name: aeronave_tarifa aeronave_tarifa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aeronave_tarifa
    ADD CONSTRAINT aeronave_tarifa_pkey PRIMARY KEY (id);


--
-- Name: alumno alumno_id_usuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alumno
    ADD CONSTRAINT alumno_id_usuario_key UNIQUE (id_usuario);


--
-- Name: alumno alumno_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alumno
    ADD CONSTRAINT alumno_pkey PRIMARY KEY (id_alumno);


--
-- Name: auditoria_evento auditoria_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_evento
    ADD CONSTRAINT auditoria_evento_pkey PRIMARY KEY (id_auditoria);


--
-- Name: bloque_bloqueado_dia bloque_bloqueado_dia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bloque_bloqueado_dia
    ADD CONSTRAINT bloque_bloqueado_dia_pkey PRIMARY KEY (id_bloque, dia_semana);


--
-- Name: bloque_horario bloque_horario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bloque_horario
    ADD CONSTRAINT bloque_horario_pkey PRIMARY KEY (id_bloque);


--
-- Name: checklist_postvuelo checklist_postvuelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_postvuelo
    ADD CONSTRAINT checklist_postvuelo_pkey PRIMARY KEY (id_checklist);


--
-- Name: condiciones_cancelacion condiciones_cancelacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condiciones_cancelacion
    ADD CONSTRAINT condiciones_cancelacion_pkey PRIMARY KEY (id_condicion);


--
-- Name: cuenta_corriente_alumno cuenta_corriente_alumno_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_corriente_alumno
    ADD CONSTRAINT cuenta_corriente_alumno_pkey PRIMARY KEY (id_alumno);


--
-- Name: curso curso_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curso
    ADD CONSTRAINT curso_codigo_key UNIQUE (codigo);


--
-- Name: curso_componente_practico curso_componente_practico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curso_componente_practico
    ADD CONSTRAINT curso_componente_practico_pkey PRIMARY KEY (id);


--
-- Name: curso curso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curso
    ADD CONSTRAINT curso_pkey PRIMARY KEY (id);


--
-- Name: documento_alumno documento_alumno_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_alumno
    ADD CONSTRAINT documento_alumno_pkey PRIMARY KEY (id);


--
-- Name: documento_requerido_catalogo documento_requerido_catalogo_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_requerido_catalogo
    ADD CONSTRAINT documento_requerido_catalogo_codigo_key UNIQUE (codigo);


--
-- Name: documento_requerido_catalogo documento_requerido_catalogo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_requerido_catalogo
    ADD CONSTRAINT documento_requerido_catalogo_pkey PRIMARY KEY (id);


--
-- Name: egreso egreso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.egreso
    ADD CONSTRAINT egreso_pkey PRIMARY KEY (id);


--
-- Name: estado_operaciones estado_operaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estado_operaciones
    ADD CONSTRAINT estado_operaciones_pkey PRIMARY KEY (id_estado);


--
-- Name: evaluacion_alumno evaluacion_alumno_id_evaluacion_id_alumno_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_alumno
    ADD CONSTRAINT evaluacion_alumno_id_evaluacion_id_alumno_key UNIQUE (id_evaluacion, id_alumno);


--
-- Name: evaluacion_alumno evaluacion_alumno_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_alumno
    ADD CONSTRAINT evaluacion_alumno_pkey PRIMARY KEY (id);


--
-- Name: evaluacion evaluacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion
    ADD CONSTRAINT evaluacion_pkey PRIMARY KEY (id);


--
-- Name: factura_detalle factura_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_detalle
    ADD CONSTRAINT factura_detalle_pkey PRIMARY KEY (id);


--
-- Name: factura factura_numero_correlativo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura
    ADD CONSTRAINT factura_numero_correlativo_key UNIQUE (numero_correlativo);


--
-- Name: factura factura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura
    ADD CONSTRAINT factura_pkey PRIMARY KEY (id);


--
-- Name: horas_vuelo_aeronave horas_vuelo_aeronave_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horas_vuelo_aeronave
    ADD CONSTRAINT horas_vuelo_aeronave_pkey PRIMARY KEY (id_registro);


--
-- Name: inscripcion_curso_avance inscripcion_curso_avance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_curso_avance
    ADD CONSTRAINT inscripcion_curso_avance_pkey PRIMARY KEY (id);


--
-- Name: inscripcion_curso inscripcion_curso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_curso
    ADD CONSTRAINT inscripcion_curso_pkey PRIMARY KEY (id);


--
-- Name: instructor instructor_id_usuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor
    ADD CONSTRAINT instructor_id_usuario_key UNIQUE (id_usuario);


--
-- Name: instructor instructor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor
    ADD CONSTRAINT instructor_pkey PRIMARY KEY (id_instructor);


--
-- Name: instructor_tarifa instructor_tarifa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_tarifa
    ADD CONSTRAINT instructor_tarifa_pkey PRIMARY KEY (id);


--
-- Name: licencia_aeronave licencia_aeronave_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licencia_aeronave
    ADD CONSTRAINT licencia_aeronave_pkey PRIMARY KEY (id_licencia, id_aeronave);


--
-- Name: licencia licencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licencia
    ADD CONSTRAINT licencia_pkey PRIMARY KEY (id_licencia);


--
-- Name: loadsheet loadsheet_id_vuelo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loadsheet
    ADD CONSTRAINT loadsheet_id_vuelo_key UNIQUE (id_vuelo);


--
-- Name: loadsheet loadsheet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loadsheet
    ADD CONSTRAINT loadsheet_pkey PRIMARY KEY (id_loadsheet);


--
-- Name: loadsheet_waypoint loadsheet_waypoint_id_loadsheet_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loadsheet_waypoint
    ADD CONSTRAINT loadsheet_waypoint_id_loadsheet_orden_key UNIQUE (id_loadsheet, orden);


--
-- Name: loadsheet_waypoint loadsheet_waypoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loadsheet_waypoint
    ADD CONSTRAINT loadsheet_waypoint_pkey PRIMARY KEY (id_waypoint);


--
-- Name: mantenimiento_aeronave mantenimiento_aeronave_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mantenimiento_aeronave
    ADD CONSTRAINT mantenimiento_aeronave_pkey PRIMARY KEY (id_mantenimiento);


--
-- Name: medico_autorizado medico_autorizado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medico_autorizado
    ADD CONSTRAINT medico_autorizado_pkey PRIMARY KEY (id);


--
-- Name: mensaje_turno mensaje_turno_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_turno
    ADD CONSTRAINT mensaje_turno_pkey PRIMARY KEY (id_mensaje);


--
-- Name: movimiento_cuenta movimiento_cuenta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_cuenta
    ADD CONSTRAINT movimiento_cuenta_pkey PRIMARY KEY (id);


--
-- Name: nomina_detalle nomina_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_detalle
    ADD CONSTRAINT nomina_detalle_pkey PRIMARY KEY (id);


--
-- Name: nomina_detalle_vuelo nomina_detalle_vuelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_detalle_vuelo
    ADD CONSTRAINT nomina_detalle_vuelo_pkey PRIMARY KEY (id);


--
-- Name: nomina_periodo nomina_periodo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_periodo
    ADD CONSTRAINT nomina_periodo_pkey PRIMARY KEY (id);


--
-- Name: notificacion_outbox notificacion_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacion_outbox
    ADD CONSTRAINT notificacion_outbox_pkey PRIMARY KEY (id_outbox);


--
-- Name: plan_vuelo plan_vuelo_id_vuelo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_vuelo
    ADD CONSTRAINT plan_vuelo_id_vuelo_key UNIQUE (id_vuelo);


--
-- Name: plan_vuelo plan_vuelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_vuelo
    ADD CONSTRAINT plan_vuelo_pkey PRIMARY KEY (id_plan_vuelo);


--
-- Name: progreso_unidad_alumno progreso_unidad_alumno_id_alumno_id_unidad_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progreso_unidad_alumno
    ADD CONSTRAINT progreso_unidad_alumno_id_alumno_id_unidad_key UNIQUE (id_alumno, id_unidad);


--
-- Name: progreso_unidad_alumno progreso_unidad_alumno_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progreso_unidad_alumno
    ADD CONSTRAINT progreso_unidad_alumno_pkey PRIMARY KEY (id);


--
-- Name: recibo_pago recibo_pago_numero_correlativo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibo_pago
    ADD CONSTRAINT recibo_pago_numero_correlativo_key UNIQUE (numero_correlativo);


--
-- Name: recibo_pago recibo_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibo_pago
    ADD CONSTRAINT recibo_pago_pkey PRIMARY KEY (id);


--
-- Name: reporte_vuelo reporte_vuelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporte_vuelo
    ADD CONSTRAINT reporte_vuelo_pkey PRIMARY KEY (id_reporte);


--
-- Name: semana_vuelo semana_vuelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semana_vuelo
    ADD CONSTRAINT semana_vuelo_pkey PRIMARY KEY (id_semana);


--
-- Name: solicitud_semana solicitud_semana_id_semana_id_alumno_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_semana
    ADD CONSTRAINT solicitud_semana_id_semana_id_alumno_key UNIQUE (id_semana, id_alumno);


--
-- Name: solicitud_semana solicitud_semana_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_semana
    ADD CONSTRAINT solicitud_semana_pkey PRIMARY KEY (id_solicitud);


--
-- Name: solicitud_vuelo solicitud_vuelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_vuelo
    ADD CONSTRAINT solicitud_vuelo_pkey PRIMARY KEY (id_detalle);


--
-- Name: unidad_teorica unidad_teorica_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_teorica
    ADD CONSTRAINT unidad_teorica_pkey PRIMARY KEY (id);


--
-- Name: checklist_postvuelo uq_checklist_vuelo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_postvuelo
    ADD CONSTRAINT uq_checklist_vuelo UNIQUE (id_vuelo);


--
-- Name: reporte_vuelo uq_reporte_vuelo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporte_vuelo
    ADD CONSTRAINT uq_reporte_vuelo UNIQUE (id_vuelo);


--
-- Name: usuario usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id_usuario);


--
-- Name: vuelo_estado_tiempo vuelo_estado_tiempo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo_estado_tiempo
    ADD CONSTRAINT vuelo_estado_tiempo_pkey PRIMARY KEY (id_registro);


--
-- Name: vuelo vuelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo
    ADD CONSTRAINT vuelo_pkey PRIMARY KEY (id_vuelo);


--
-- Name: wb_plantilla wb_plantilla_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wb_plantilla
    ADD CONSTRAINT wb_plantilla_pkey PRIMARY KEY (id_wb_plantilla);


--
-- Name: webhook_endpoint webhook_endpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoint
    ADD CONSTRAINT webhook_endpoint_pkey PRIMARY KEY (id_webhook);


--
-- Name: webhook_evento webhook_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_evento
    ADD CONSTRAINT webhook_evento_pkey PRIMARY KEY (id_webhook, evento);


--
-- Name: weight_balance weight_balance_id_vuelo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_balance
    ADD CONSTRAINT weight_balance_id_vuelo_key UNIQUE (id_vuelo);


--
-- Name: weight_balance weight_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_balance
    ADD CONSTRAINT weight_balance_pkey PRIMARY KEY (id_wb);


--
-- Name: idx_auditoria_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_actor ON public.auditoria_evento USING btree (actor_id_usuario, creado_en DESC);


--
-- Name: idx_auditoria_entidad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_entidad ON public.auditoria_evento USING btree (entidad, id_entidad, creado_en DESC);


--
-- Name: idx_auditoria_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_fecha ON public.auditoria_evento USING btree (creado_en DESC);


--
-- Name: idx_auditoria_semana; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_semana ON public.auditoria_evento USING btree (id_semana, creado_en DESC);


--
-- Name: idx_checklist_postvuelo_id_vuelo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_postvuelo_id_vuelo ON public.checklist_postvuelo USING btree (id_vuelo);


--
-- Name: idx_horas_aeronave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_horas_aeronave ON public.horas_vuelo_aeronave USING btree (id_aeronave, registrado_en DESC);


--
-- Name: idx_mant_aeronave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mant_aeronave ON public.mantenimiento_aeronave USING btree (id_aeronave, completado, fecha_programada);


--
-- Name: idx_mensaje_turno_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensaje_turno_fecha ON public.mensaje_turno USING btree (creado_en DESC);


--
-- Name: idx_mensaje_turno_rol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensaje_turno_rol ON public.mensaje_turno USING btree (para_rol, creado_en DESC);


--
-- Name: idx_outbox_pendientes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_pendientes ON public.notificacion_outbox USING btree (procesado, creado_en);


--
-- Name: idx_reporte_vuelo_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reporte_vuelo_estado ON public.reporte_vuelo USING btree (estado);


--
-- Name: idx_reporte_vuelo_id_vuelo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reporte_vuelo_id_vuelo ON public.reporte_vuelo USING btree (id_vuelo);


--
-- Name: idx_vuelo_estado_tiempo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vuelo_estado_tiempo ON public.vuelo_estado_tiempo USING btree (id_vuelo, registrado_en DESC);


--
-- Name: ix_aeronave_tarifa_vigencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_aeronave_tarifa_vigencia ON public.aeronave_tarifa USING btree (modelo_aeronave, vigente_desde);


--
-- Name: ix_egreso_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_egreso_fecha ON public.egreso USING btree (fecha DESC);


--
-- Name: ix_evaluacion_alumno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evaluacion_alumno ON public.evaluacion_alumno USING btree (id_alumno);


--
-- Name: ix_evaluacion_curso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evaluacion_curso ON public.evaluacion USING btree (id_curso, fecha_programada);


--
-- Name: ix_factura_alumno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_factura_alumno ON public.factura USING btree (id_alumno);


--
-- Name: ix_inscripcion_alumno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_inscripcion_alumno ON public.inscripcion_curso USING btree (id_alumno);


--
-- Name: ix_instructor_tarifa_vigencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_instructor_tarifa_vigencia ON public.instructor_tarifa USING btree (id_instructor, vigente_desde);


--
-- Name: ix_mov_alumno_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_mov_alumno_fecha ON public.movimiento_cuenta USING btree (id_alumno, fecha DESC);


--
-- Name: ix_unidad_curso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_unidad_curso ON public.unidad_teorica USING btree (id_curso, orden);


--
-- Name: uq_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_slot ON public.solicitud_vuelo USING btree (id_semana, dia_semana, id_bloque, id_aeronave);


--
-- Name: uq_usuario_correo_not_null; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_usuario_correo_not_null ON public.usuario USING btree (correo) WHERE (correo IS NOT NULL);


--
-- Name: uq_usuario_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_usuario_username ON public.usuario USING btree (username);


--
-- Name: uq_vuelo_detalle; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_vuelo_detalle ON public.vuelo USING btree (id_detalle);


--
-- Name: alumno alumno_id_instructor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alumno
    ADD CONSTRAINT alumno_id_instructor_fkey FOREIGN KEY (id_instructor) REFERENCES public.instructor(id_instructor);


--
-- Name: alumno alumno_id_licencia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alumno
    ADD CONSTRAINT alumno_id_licencia_fkey FOREIGN KEY (id_licencia) REFERENCES public.licencia(id_licencia);


--
-- Name: alumno alumno_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alumno
    ADD CONSTRAINT alumno_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: bloque_bloqueado_dia bloque_bloqueado_dia_id_bloque_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bloque_bloqueado_dia
    ADD CONSTRAINT bloque_bloqueado_dia_id_bloque_fkey FOREIGN KEY (id_bloque) REFERENCES public.bloque_horario(id_bloque);


--
-- Name: checklist_postvuelo checklist_postvuelo_id_vuelo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_postvuelo
    ADD CONSTRAINT checklist_postvuelo_id_vuelo_fkey FOREIGN KEY (id_vuelo) REFERENCES public.vuelo(id_vuelo) ON DELETE CASCADE;


--
-- Name: curso_componente_practico curso_componente_practico_id_curso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curso_componente_practico
    ADD CONSTRAINT curso_componente_practico_id_curso_fkey FOREIGN KEY (id_curso) REFERENCES public.curso(id) ON DELETE CASCADE;


--
-- Name: documento_alumno documento_alumno_id_documento_requerido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_alumno
    ADD CONSTRAINT documento_alumno_id_documento_requerido_fkey FOREIGN KEY (id_documento_requerido) REFERENCES public.documento_requerido_catalogo(id);


--
-- Name: estado_operaciones estado_operaciones_actualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estado_operaciones
    ADD CONSTRAINT estado_operaciones_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES public.usuario(id_usuario);


--
-- Name: evaluacion_alumno evaluacion_alumno_id_evaluacion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_alumno
    ADD CONSTRAINT evaluacion_alumno_id_evaluacion_fkey FOREIGN KEY (id_evaluacion) REFERENCES public.evaluacion(id) ON DELETE CASCADE;


--
-- Name: evaluacion evaluacion_id_curso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion
    ADD CONSTRAINT evaluacion_id_curso_fkey FOREIGN KEY (id_curso) REFERENCES public.curso(id) ON DELETE CASCADE;


--
-- Name: evaluacion evaluacion_id_unidad_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion
    ADD CONSTRAINT evaluacion_id_unidad_fkey FOREIGN KEY (id_unidad) REFERENCES public.unidad_teorica(id) ON DELETE SET NULL;


--
-- Name: factura_detalle factura_detalle_id_factura_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_detalle
    ADD CONSTRAINT factura_detalle_id_factura_fkey FOREIGN KEY (id_factura) REFERENCES public.factura(id) ON DELETE CASCADE;


--
-- Name: aeronave fk_aeronave_wb_plantilla; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aeronave
    ADD CONSTRAINT fk_aeronave_wb_plantilla FOREIGN KEY (id_wb_plantilla) REFERENCES public.wb_plantilla(id_wb_plantilla);


--
-- Name: vuelo fk_vuelo_detalle; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo
    ADD CONSTRAINT fk_vuelo_detalle FOREIGN KEY (id_detalle) REFERENCES public.solicitud_vuelo(id_detalle);


--
-- Name: horas_vuelo_aeronave horas_vuelo_aeronave_id_aeronave_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horas_vuelo_aeronave
    ADD CONSTRAINT horas_vuelo_aeronave_id_aeronave_fkey FOREIGN KEY (id_aeronave) REFERENCES public.aeronave(id_aeronave);


--
-- Name: horas_vuelo_aeronave horas_vuelo_aeronave_id_vuelo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horas_vuelo_aeronave
    ADD CONSTRAINT horas_vuelo_aeronave_id_vuelo_fkey FOREIGN KEY (id_vuelo) REFERENCES public.vuelo(id_vuelo);


--
-- Name: inscripcion_curso_avance inscripcion_curso_avance_id_inscripcion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_curso_avance
    ADD CONSTRAINT inscripcion_curso_avance_id_inscripcion_fkey FOREIGN KEY (id_inscripcion) REFERENCES public.inscripcion_curso(id) ON DELETE CASCADE;


--
-- Name: inscripcion_curso inscripcion_curso_id_curso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_curso
    ADD CONSTRAINT inscripcion_curso_id_curso_fkey FOREIGN KEY (id_curso) REFERENCES public.curso(id);


--
-- Name: instructor instructor_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor
    ADD CONSTRAINT instructor_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: licencia_aeronave licencia_aeronave_id_aeronave_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licencia_aeronave
    ADD CONSTRAINT licencia_aeronave_id_aeronave_fkey FOREIGN KEY (id_aeronave) REFERENCES public.aeronave(id_aeronave);


--
-- Name: licencia_aeronave licencia_aeronave_id_licencia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licencia_aeronave
    ADD CONSTRAINT licencia_aeronave_id_licencia_fkey FOREIGN KEY (id_licencia) REFERENCES public.licencia(id_licencia);


--
-- Name: loadsheet loadsheet_id_vuelo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loadsheet
    ADD CONSTRAINT loadsheet_id_vuelo_fkey FOREIGN KEY (id_vuelo) REFERENCES public.vuelo(id_vuelo) ON DELETE CASCADE;


--
-- Name: loadsheet_waypoint loadsheet_waypoint_id_loadsheet_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loadsheet_waypoint
    ADD CONSTRAINT loadsheet_waypoint_id_loadsheet_fkey FOREIGN KEY (id_loadsheet) REFERENCES public.loadsheet(id_loadsheet) ON DELETE CASCADE;


--
-- Name: mantenimiento_aeronave mantenimiento_aeronave_id_aeronave_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mantenimiento_aeronave
    ADD CONSTRAINT mantenimiento_aeronave_id_aeronave_fkey FOREIGN KEY (id_aeronave) REFERENCES public.aeronave(id_aeronave);


--
-- Name: mensaje_turno mensaje_turno_id_usuario_origen_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_turno
    ADD CONSTRAINT mensaje_turno_id_usuario_origen_fkey FOREIGN KEY (id_usuario_origen) REFERENCES public.usuario(id_usuario);


--
-- Name: nomina_detalle nomina_detalle_id_periodo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_detalle
    ADD CONSTRAINT nomina_detalle_id_periodo_fkey FOREIGN KEY (id_periodo) REFERENCES public.nomina_periodo(id) ON DELETE CASCADE;


--
-- Name: nomina_detalle_vuelo nomina_detalle_vuelo_id_nomina_detalle_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_detalle_vuelo
    ADD CONSTRAINT nomina_detalle_vuelo_id_nomina_detalle_fkey FOREIGN KEY (id_nomina_detalle) REFERENCES public.nomina_detalle(id) ON DELETE CASCADE;


--
-- Name: plan_vuelo plan_vuelo_id_vuelo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_vuelo
    ADD CONSTRAINT plan_vuelo_id_vuelo_fkey FOREIGN KEY (id_vuelo) REFERENCES public.vuelo(id_vuelo) ON DELETE CASCADE;


--
-- Name: progreso_unidad_alumno progreso_unidad_alumno_id_inscripcion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progreso_unidad_alumno
    ADD CONSTRAINT progreso_unidad_alumno_id_inscripcion_fkey FOREIGN KEY (id_inscripcion) REFERENCES public.inscripcion_curso(id) ON DELETE SET NULL;


--
-- Name: progreso_unidad_alumno progreso_unidad_alumno_id_unidad_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progreso_unidad_alumno
    ADD CONSTRAINT progreso_unidad_alumno_id_unidad_fkey FOREIGN KEY (id_unidad) REFERENCES public.unidad_teorica(id) ON DELETE CASCADE;


--
-- Name: reporte_vuelo reporte_vuelo_id_vuelo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporte_vuelo
    ADD CONSTRAINT reporte_vuelo_id_vuelo_fkey FOREIGN KEY (id_vuelo) REFERENCES public.vuelo(id_vuelo) ON DELETE CASCADE;


--
-- Name: solicitud_semana solicitud_semana_id_alumno_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_semana
    ADD CONSTRAINT solicitud_semana_id_alumno_fkey FOREIGN KEY (id_alumno) REFERENCES public.alumno(id_alumno);


--
-- Name: solicitud_semana solicitud_semana_id_semana_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_semana
    ADD CONSTRAINT solicitud_semana_id_semana_fkey FOREIGN KEY (id_semana) REFERENCES public.semana_vuelo(id_semana);


--
-- Name: solicitud_vuelo solicitud_vuelo_id_aeronave_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_vuelo
    ADD CONSTRAINT solicitud_vuelo_id_aeronave_fkey FOREIGN KEY (id_aeronave) REFERENCES public.aeronave(id_aeronave);


--
-- Name: solicitud_vuelo solicitud_vuelo_id_bloque_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_vuelo
    ADD CONSTRAINT solicitud_vuelo_id_bloque_fkey FOREIGN KEY (id_bloque) REFERENCES public.bloque_horario(id_bloque);


--
-- Name: solicitud_vuelo solicitud_vuelo_id_semana_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_vuelo
    ADD CONSTRAINT solicitud_vuelo_id_semana_fkey FOREIGN KEY (id_semana) REFERENCES public.semana_vuelo(id_semana);


--
-- Name: solicitud_vuelo solicitud_vuelo_id_solicitud_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_vuelo
    ADD CONSTRAINT solicitud_vuelo_id_solicitud_fkey FOREIGN KEY (id_solicitud) REFERENCES public.solicitud_semana(id_solicitud) ON DELETE CASCADE;


--
-- Name: unidad_teorica unidad_teorica_id_curso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_teorica
    ADD CONSTRAINT unidad_teorica_id_curso_fkey FOREIGN KEY (id_curso) REFERENCES public.curso(id) ON DELETE CASCADE;


--
-- Name: vuelo vuelo_cancelado_por_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo
    ADD CONSTRAINT vuelo_cancelado_por_id_usuario_fkey FOREIGN KEY (cancelado_por_id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: vuelo_estado_tiempo vuelo_estado_tiempo_id_vuelo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo_estado_tiempo
    ADD CONSTRAINT vuelo_estado_tiempo_id_vuelo_fkey FOREIGN KEY (id_vuelo) REFERENCES public.vuelo(id_vuelo);


--
-- Name: vuelo_estado_tiempo vuelo_estado_tiempo_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo_estado_tiempo
    ADD CONSTRAINT vuelo_estado_tiempo_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuario(id_usuario);


--
-- Name: vuelo vuelo_id_aeronave_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo
    ADD CONSTRAINT vuelo_id_aeronave_fkey FOREIGN KEY (id_aeronave) REFERENCES public.aeronave(id_aeronave);


--
-- Name: vuelo vuelo_id_alumno_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo
    ADD CONSTRAINT vuelo_id_alumno_fkey FOREIGN KEY (id_alumno) REFERENCES public.alumno(id_alumno);


--
-- Name: vuelo vuelo_id_bloque_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo
    ADD CONSTRAINT vuelo_id_bloque_fkey FOREIGN KEY (id_bloque) REFERENCES public.bloque_horario(id_bloque);


--
-- Name: vuelo vuelo_id_instructor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo
    ADD CONSTRAINT vuelo_id_instructor_fkey FOREIGN KEY (id_instructor) REFERENCES public.instructor(id_instructor);


--
-- Name: vuelo vuelo_id_semana_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuelo
    ADD CONSTRAINT vuelo_id_semana_fkey FOREIGN KEY (id_semana) REFERENCES public.semana_vuelo(id_semana);


--
-- Name: webhook_evento webhook_evento_id_webhook_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_evento
    ADD CONSTRAINT webhook_evento_id_webhook_fkey FOREIGN KEY (id_webhook) REFERENCES public.webhook_endpoint(id_webhook) ON DELETE CASCADE;


--
-- Name: weight_balance weight_balance_id_vuelo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_balance
    ADD CONSTRAINT weight_balance_id_vuelo_fkey FOREIGN KEY (id_vuelo) REFERENCES public.vuelo(id_vuelo) ON DELETE CASCADE;


--
-- Name: weight_balance weight_balance_id_wb_plantilla_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_balance
    ADD CONSTRAINT weight_balance_id_wb_plantilla_fkey FOREIGN KEY (id_wb_plantilla) REFERENCES public.wb_plantilla(id_wb_plantilla);


--
-- PostgreSQL database dump complete
--

\unrestrict eY3Uj0ujw5rdipSkVnccod0FWneGD9tqYFs2C18ht7lgWmc6RG6zYerNlJB9Kyj

