-- Manuales del taller: biblioteca, paquetes por inspección y páginas por orden.
-- Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md
--
-- ADITIVA y re-ejecutable. Sin índices extra: son tablas de cientos de filas.
-- Todo "creado_en" lleva la zona FIJADA en el DEFAULT (CLAUDE.md §35.A).

BEGIN;

CREATE TABLE IF NOT EXISTS public.taller_manual (
  id_manual             SERIAL PRIMARY KEY,
  titulo                VARCHAR(200) NOT NULL,
  categoria             VARCHAR(20)  NOT NULL CHECK (categoria IN
                          ('MANTENIMIENTO','PARTES','OVERHAUL','OPERACION','BOLETINES','NORMATIVA','CATALOGO')),
  fabricante            VARCHAR(80),
  numero_parte          VARCHAR(40),
  revision              VARCHAR(80),
  paginas               INTEGER NOT NULL CHECK (paginas > 0),
  tamano_bytes          BIGINT  NOT NULL,
  sha256                CHAR(64) NOT NULL UNIQUE,
  archivo_path          TEXT NOT NULL,
  es_general            BOOLEAN NOT NULL DEFAULT false,
  estado                VARCHAR(12) NOT NULL DEFAULT 'VIGENTE'
                          CHECK (estado IN ('VIGENTE','REEMPLAZADO','ARCHIVADO')),
  id_reemplazado_por    INTEGER NULL REFERENCES public.taller_manual(id_manual),
  necesita_confirmacion BOOLEAN NOT NULL DEFAULT false,
  nota_confirmacion     TEXT,
  origen                VARCHAR(40),
  subido_por            INTEGER NULL REFERENCES public.usuario(id_usuario),
  creado_en             TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador')
);

CREATE TABLE IF NOT EXISTS public.taller_manual_aeronave (
  id_manual   INTEGER NOT NULL REFERENCES public.taller_manual(id_manual) ON DELETE CASCADE,
  id_aeronave INTEGER NOT NULL REFERENCES public.aeronave(id_aeronave),
  PRIMARY KEY (id_manual, id_aeronave)
);

CREATE TABLE IF NOT EXISTS public.taller_paquete_manual (
  id_paquete         SERIAL PRIMARY KEY,
  id_aeronave        INTEGER NOT NULL REFERENCES public.aeronave(id_aeronave),
  tipo_mantenimiento VARCHAR(10) NOT NULL CHECK (tipo_mantenimiento IN ('25HR','50HR','100HR','ANUAL')),
  estado             VARCHAR(12) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','CONFIRMADO')),
  confirmado_por     INTEGER NULL REFERENCES public.usuario(id_usuario),
  confirmado_en      TIMESTAMP,
  actualizado_por    INTEGER NULL REFERENCES public.usuario(id_usuario),
  actualizado_en     TIMESTAMP,
  UNIQUE (id_aeronave, tipo_mantenimiento)
);

-- Dos tablas con la misma forma, y no una con "paquete O orden": los renglones
-- de un paquete son configuración (sobreviven al reinicio del demo) y los de una
-- orden son operación (se vacían). Una sola tabla con un CHECK de "uno u otro"
-- abortaba el reinicio del demo (spec §12).
CREATE TABLE IF NOT EXISTS public.taller_paquete_extracto (
  id_extracto  SERIAL PRIMARY KEY,
  id_paquete   INTEGER NOT NULL REFERENCES public.taller_paquete_manual(id_paquete) ON DELETE CASCADE,
  id_manual    INTEGER NOT NULL REFERENCES public.taller_manual(id_manual),
  pagina_desde INTEGER NOT NULL CHECK (pagina_desde >= 1),
  pagina_hasta INTEGER NOT NULL,
  titulo       VARCHAR(200),
  orden        SMALLINT NOT NULL DEFAULT 0,
  origen       VARCHAR(10) NOT NULL CHECK (origen IN ('MANUAL','SUGERIDO')),
  agregado_por INTEGER NULL REFERENCES public.usuario(id_usuario),
  creado_en    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador'),
  CHECK (pagina_hasta >= pagina_desde)
);

CREATE TABLE IF NOT EXISTS public.taller_orden_extracto (
  id_extracto  SERIAL PRIMARY KEY,
  id_orden     INTEGER NOT NULL REFERENCES public.orden_trabajo(id_orden),
  id_manual    INTEGER NOT NULL REFERENCES public.taller_manual(id_manual),
  pagina_desde INTEGER NOT NULL CHECK (pagina_desde >= 1),
  pagina_hasta INTEGER NOT NULL,
  titulo       VARCHAR(200),
  orden        SMALLINT NOT NULL DEFAULT 0,
  origen       VARCHAR(10) NOT NULL CHECK (origen IN ('MANUAL','PAQUETE')),
  agregado_por INTEGER NULL REFERENCES public.usuario(id_usuario),
  creado_en    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador'),
  CHECK (pagina_hasta >= pagina_desde)
);

-- Bucket privado, sin tope propio (manda el global del plan de Supabase).
INSERT INTO storage.buckets (id, name, public)
VALUES ('manuales-taller', 'manuales-taller', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
