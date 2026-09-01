-- Esquema `demo`: una copia vacía de la estructura de `public`, en la MISMA
-- base, para que el usuario de demostraciones vea datos ficticios sin que exista
-- ninguna forma de alcanzar los datos reales de CAAA.
--
-- Por qué un esquema y no una bandera `es_demo` con filtros: son 87 tablas y del
-- orden de 600 consultas. Un solo filtro olvidado le mostraría a un prospecto el
-- saldo real de un alumno. Con esquemas separados no hay filtro que olvidar: son
-- objetos distintos, y una consulta sin filtro -- porque no hay filtro -- no
-- puede ver los datos de CAAA aunque quiera.
--
-- ⚠️ El esquema demo NO se migra: se REGENERA. Sus datos son desechables por
-- definición, así que después de cada migración sobre `public` se vuelve a
-- correr clonar_demo() y a sembrar. Un solo paso, y la deriva entre los dos
-- esquemas se vuelve imposible por construcción. Intentar mantenerlos en
-- paralelo a mano no es viable: las migraciones nombran `public.` explícitamente
-- casi 100 veces.

CREATE SCHEMA IF NOT EXISTS demo;

COMMENT ON SCHEMA demo IS
  'Copia vacia de la estructura de public para el usuario de demostraciones. Se REGENERA con clonar_demo(); nunca se migra a mano. Ver docs/demo/RUNBOOK.md.';

-- ── El clonador ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clonar_demo()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  t            record;
  col          record;
  fk           record;
  sec_nueva    text;
  n_tablas     int := 0;
  n_secuencias int := 0;
  n_fks        int := 0;
BEGIN
  -- Se tira entero y se rehace. Es lo que garantiza que sea un espejo exacto.
  DROP SCHEMA IF EXISTS demo CASCADE;
  CREATE SCHEMA demo;

  -- 1. Tablas. INCLUDING ALL trae columnas, defaults, CHECKs, índices, PK,
  --    comentarios e identidades. NO trae las claves foráneas: van en el paso 3.
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  LOOP
    EXECUTE format('CREATE TABLE demo.%I (LIKE public.%I INCLUDING ALL)', t.tablename, t.tablename);
    n_tablas := n_tablas + 1;
  END LOOP;

  -- 2. Secuencias propias.
  --    INCLUDING ALL copió el default `nextval('public.x_seq')` tal cual, así que
  --    sin este paso el demo CONSUMIRÍA la secuencia de producción y los ids se
  --    entremezclarían entre los dos esquemas. Cada columna serial recibe su
  --    propia secuencia dentro de demo.
  FOR col IN
    SELECT c.table_name, c.column_name,
           pg_get_serial_sequence('public.' || quote_ident(c.table_name), c.column_name) AS sec
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND pg_get_serial_sequence('public.' || quote_ident(c.table_name), c.column_name) IS NOT NULL
  LOOP
    sec_nueva := 'demo.' || split_part(col.sec, '.', 2);
    EXECUTE format('CREATE SEQUENCE %s', sec_nueva);
    EXECUTE format('ALTER TABLE demo.%I ALTER COLUMN %I SET DEFAULT nextval(%L)',
                   col.table_name, col.column_name, sec_nueva);
    EXECUTE format('ALTER SEQUENCE %s OWNED BY demo.%I.%I', sec_nueva, col.table_name, col.column_name);
    n_secuencias := n_secuencias + 1;
  END LOOP;

  -- 3. Claves foráneas, reescritas para que apunten DENTRO de demo.
  --    Si se copiaran tal cual, una fila de demo referenciaría una fila de
  --    public: exactamente la fuga que este diseño existe para impedir.
  FOR fk IN
    SELECT c.conname, c.conrelid::regclass::text AS tabla,
           pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public' AND c.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE demo.%I ADD CONSTRAINT %I %s',
                   split_part(fk.tabla, '.', greatest(1, array_length(string_to_array(fk.tabla, '.'), 1))),
                   fk.conname,
                   replace(fk.def, 'REFERENCES ', 'REFERENCES demo.'));
    n_fks := n_fks + 1;
  END LOOP;

  RETURN format('demo regenerado: %s tablas, %s secuencias, %s claves foraneas',
                n_tablas, n_secuencias, n_fks);
END;
$$;

COMMENT ON FUNCTION public.clonar_demo() IS
  'Regenera el esquema demo como copia VACIA de la estructura de public. Destructivo sobre demo, no toca public. Correr despues de cada migracion.';

-- ── Qué cuentas son de demostración ───────────────────────────────────────
-- El login corre ANTES de saber quién es el usuario, así que no puede resolverse
-- solo con el esquema. Esta tabla, que vive en `public`, dice qué nombres de
-- usuario se autentican contra `demo`. Es la única pieza compartida.
CREATE TABLE IF NOT EXISTS public.demo_cuenta (
  username   varchar(80) PRIMARY KEY,
  creada_en  timestamptz NOT NULL DEFAULT now(),
  nota       text
);

COMMENT ON TABLE public.demo_cuenta IS
  'Usuarios que se autentican y operan contra el esquema demo. El login consulta esto ANTES de buscar la cuenta, porque hasta ese momento no sabe en que esquema mirar.';
