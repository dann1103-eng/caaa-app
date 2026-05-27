# CAAA · Migración a Supabase

Paquete completo para llevar la base de datos local PostgreSQL del proyecto CAAA a un proyecto Supabase de producción o staging.

**Snapshot capturado:** 27 de mayo de 2026, DB local `CAAA` en PostgreSQL 17.
**Contenido:** 51 tablas, 49 secuencias, 4 ENUMs, 401 registros operativos, 38 unidades teóricas seed, 11 médicos AAC, 14 documentos catálogo, 5 cursos, 10 tarifas vigentes.

---

## Estructura del paquete

```
supabase/
├── README.md                         ← este archivo
├── dump/                             ← outputs raw de pg_dump (referencia)
│   ├── schema.sql                    ← pg_dump original
│   ├── schema_clean.sql              ← schema sin headers psql-only
│   ├── data_all.sql                  ← pg_dump --data-only completo
│   ├── data_catalog.sql              ← solo tablas catálogo (idempotente)
│   ├── data_operational.sql          ← datos operativos (alumnos/vuelos/etc.)
│   ├── clean.mjs                     ← script de limpieza del schema
│   └── split_data.mjs                ← script de partición de datos
└── migrations/                       ← LO QUE CORRES EN SUPABASE
    ├── 20260527000001_init_schema.sql
    ├── 20260527000002_seeds_catalog.sql
    ├── 20260527000003_data_operational.sql  ← OPCIONAL (solo staging)
    └── 20260527000004_rls_policies.sql
```

---

## Paso 1 · Crear proyecto Supabase

1. Entrar a https://app.supabase.com y crear un proyecto nuevo.
2. Anotar la región (recomendado: `us-east-1` por proximidad a El Salvador).
3. Anotar la contraseña del usuario `postgres` que se genera. La vas a usar para conectar con `psql` o el SQL Editor.

---

## Paso 2 · Configurar el JWT secret

El backend Node sigue firmando los tokens con `process.env.JWT_SECRET`. Para que las políticas RLS funcionen, Supabase debe usar **exactamente el mismo secret** al validar el JWT.

1. En el dashboard de Supabase: **Project Settings → API → JWT Settings**.
2. Click **Generate a new JWT secret** y copiar uno generado.
3. Pegar ese valor en tu `.env` del backend como `JWT_SECRET=...`.
   Alternativamente: usar el JWT secret que ya tenés en `.env` y pegarlo en Supabase con **Set custom JWT secret**.
4. Verificar que ambos coinciden. **Si no coinciden, todos los GET fallan con RLS habilitado.**

> **Nota:** Supabase emite claims `aud`, `exp`, `iat`, `role`. Tu backend ya emite `id_usuario`, `username`, `rol`. Estos claims se exponen vía `auth.jwt()` en SQL. Las políticas usan `request.jwt.claims` (formato del PostgREST/Postgres-builtin) que es equivalente.

---

## Paso 3 · Correr las migraciones

### Opción A — Vía SQL Editor (más simple, manual)

En el dashboard de Supabase: **SQL Editor → New query**. Pegar el contenido de cada archivo en orden y ejecutar:

1. `20260527000001_init_schema.sql` — crea schema (51 tablas, ENUMs, secuencias, índices).
2. `20260527000002_seeds_catalog.sql` — pobla catálogos (cursos, tarifas, médicos, etc.).
3. `20260527000003_data_operational.sql` — **OPCIONAL**. Solo si querés un clon exacto del estado local actual. **En producción NO correr este**; deja que la app pueble las tablas naturalmente.
4. `20260527000004_rls_policies.sql` — habilita RLS y crea las políticas por rol.

### Opción B — Vía Supabase CLI (recomendado para versionado)

```bash
# Instalar CLI (solo primera vez)
npm i -g supabase

# Loguear y enlazar al proyecto
supabase login
supabase link --project-ref <tu-project-ref>

# Aplicar migraciones
supabase db push
```

El CLI lee los archivos en `supabase/migrations/` en orden alfabético (de ahí el prefijo timestamped). Si querés re-aplicar solo una, usá `supabase migration repair`.

---

## Paso 4 · Conectar el backend Node a Supabase

Editá `CAA-backend/.env`:

```env
# Quitar (o comentar) los DB_* locales
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=postgres
# DB_NAME=CAAA

# Conexión Supabase (Project Settings → Database → Connection string)
DB_HOST=db.<tu-project-ref>.supabase.co
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<la-pwd-que-anotaste-en-paso-1>
DB_NAME=postgres
DB_SSL=true
```

El backend ya soporta SSL con `DB_SSL=true` (ver `config/db.js`). Reiniciar `node server.js`.

> **Importante:** el backend Node usa la conexión `postgres` directa con el rol `postgres`, que **bypasea RLS** (es service_role). Esto es lo correcto: el backend ya valida JWT + rol antes de tocar la DB. RLS te protege únicamente si alguien expone la REST API de Supabase directamente (lo cual normalmente no pasa).

---

## Paso 5 · Migrar archivos subidos (uploads/)

Tu app guarda PDFs en `CAA-backend/uploads/planes-vuelo/`, `loadsheets/`, `documentos/`. Estos archivos **no están en la DB**; viven en el filesystem del servidor.

Para producción seria, moverlos a **Supabase Storage**:

1. En el dashboard: **Storage → Create bucket**. Crear:
   - `planes-vuelo` (privado)
   - `loadsheets` (privado)
   - `documentos-alumno` (privado)
   - `recibos-pdf` (privado)
   - `facturas-pdf` (privado)
2. Subir manualmente los archivos existentes desde `CAA-backend/uploads/` o automatizarlo con un script `node` que itere y use el SDK de Supabase.
3. Modificar el backend para escribir nuevos uploads en Storage en vez de disco:

   ```js
   const { createClient } = require("@supabase/supabase-js");
   const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
   await sb.storage.from("planes-vuelo").upload(filename, fileBuffer);
   ```

   El backend ya tiene `@supabase/supabase-js` en `package.json` — solo falta usarlo.

4. Cambiar las columnas `pdf_path`, `archivo_path`, etc. para que apunten a URLs de Storage en vez de paths locales.

> **Plazo sugerido:** esto puede quedar como Fase 2 de la migración. Por ahora, los archivos pueden seguir en el filesystem mientras la DB ya vive en Supabase.

---

## Paso 6 · Validación post-migración

### Verificar schema

En SQL Editor:

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Esperado: 51
SELECT COUNT(*) FROM curso;                          -- 5
SELECT COUNT(*) FROM aeronave_tarifa;                -- 10
SELECT COUNT(*) FROM unidad_teorica;                 -- 38
SELECT COUNT(*) FROM medico_autorizado;              -- 11
SELECT COUNT(*) FROM documento_requerido_catalogo;   -- 14
```

### Verificar RLS

```sql
SELECT relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
-- Esperado: 0 filas (todas las tablas con RLS activado)
```

### Probar autenticación con JWT custom

```bash
# Generar un JWT con el mismo secret
node -e "
require('dotenv').config();
const jwt = require('jsonwebtoken');
console.log(jwt.sign(
  { id_usuario: 999, username: 'preview_admin', rol: 'ADMINISTRACION' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
));
"

# Probar contra REST API de Supabase
curl -H "Authorization: Bearer <TOKEN>" \
     -H "apikey: <ANON_KEY>" \
     "https://<project-ref>.supabase.co/rest/v1/cuenta_corriente_alumno?select=*"
# Esperado: lista de cuentas (con rol ADMINISTRACION ve todo)

# Con rol ALUMNO, solo ve su propia cuenta
```

---

## Paso 7 · Rollback / re-correr

Las migraciones de schema **no son idempotentes** (no usan `CREATE TABLE IF NOT EXISTS`). Si necesitás re-correr:

1. **Borrar y empezar de cero** (staging):
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres;
   GRANT ALL ON SCHEMA public TO public;
   ```
2. Volver a correr migraciones 01 → 04.

Las migraciones **02 (seeds catalog)** y **04 (RLS)** son idempotentes (ON CONFLICT DO NOTHING en seeds, `CREATE OR REPLACE FUNCTION` y `CREATE POLICY` falla si ya existe — drop antes si necesitás reaplicar).

---

## Paso 8 · Consideraciones de seguridad

1. **JWT secret rotation:** si rotás el JWT secret, todos los tokens existentes invalidan. Coordiná un deploy backend simultáneo.
2. **Service role key:** la usás solo desde el backend. **NUNCA** la expongas al frontend. La key correcta para el frontend es la `anon key` pública.
3. **RLS bypasea con service_role:** el backend usa conexión postgres directa (service role). Si querés que el backend **respete RLS** también, debe pasar el JWT del usuario en cada query. Esto requiere refactor de `config/db.js` para hacer `SET LOCAL "request.jwt.claims" = '...'` por request. **Recomendación:** dejá el backend con service role; la seguridad ya está en tu middleware Node.
4. **Backups:** Supabase hace backups automáticos diarios en el plan free/pro. Para staging-clone seguro, usa **Database Branching** (plan Pro).
5. **Conexiones:** Supabase impone límite de conexiones según plan. Si tu backend usa connection pooling (pg.Pool), reducí el `max` a 10-15 en pool config para no agotar el cupo.

---

## Estructura del JWT custom esperado

Las políticas RLS esperan estos claims:

```json
{
  "id_usuario": 123,
  "username": "u_admin_fin",
  "rol": "ADMINISTRACION",
  "iat": 1715000000,
  "exp": 1715028800
}
```

Si el backend cambia el formato del JWT (por ejemplo agrega `sub`, `aud`), las políticas seguirán funcionando porque solo leen `id_usuario` y `rol`. **No quites estos dos campos** del JWT.

---

## Resumen de roles soportados por las políticas

| Rol | Acceso |
|---|---|
| `ADMINISTRACION` | Total en módulo financiero (cuentas, facturas, recibos, nómina, egresos, tarifas, cursos). Lectura todo el resto. |
| `ADMIN` | Lectura completa de todo. Escritura en operación (vuelos, semanas, mantenimiento). **Solo lectura** del módulo financiero. |
| `PROGRAMACION` | Escritura en agendamiento, semanas, bloques, vuelos. Lectura general. |
| `TURNO` | Escritura en estado de vuelos, mensajes de turno. Lectura general. |
| `INSTRUCTOR` | Lectura propios vuelos + alumnos asignados. Escritura en reportes/checklist propios. Calificar evaluaciones del aula virtual. |
| `ALUMNO` | Ve solo su propia data: cuenta, vuelos, plan, reporte, documentos, aula virtual. Crea solicitudes de vuelo. |
| _sin token_ | Sin acceso. |

---

## Contacto

Cualquier inconsistencia detectada después de la migración, abrir issue en el repo principal del proyecto con el log SQL del error.
