# Deploy · CAAA en Vercel + Supabase + GitHub

Guía end-to-end para llevar la app a producción usando:

- **GitHub** — monorepo único `caaa-app`
- **Supabase Pro** — DB + Storage + Realtime + pg_cron + Edge Functions (backend completo)
- **Vercel** — frontend estático (Vite SPA build)

## Estructura final del monorepo

```
caaa-app/                       ← este repo
├── frontend/                   ← (rename CAA-frontend → frontend)
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json             ← config Vercel
├── supabase/                   ← TODO el backend ahora vive aquí
│   ├── migrations/             ← SQL (6 archivos, ejecutar en orden)
│   ├── functions/              ← Edge Functions (Deno)
│   │   ├── _shared/
│   │   ├── auth/
│   │   ├── administracion/
│   │   ├── alumno/
│   │   └── … (resto)
│   ├── docs/
│   │   ├── PORTING_PLAN.md
│   │   └── REALTIME_CHANNELS.md
│   ├── config.toml             ← Supabase CLI config
│   └── README.md
├── legacy/                     ← (opcional) backup del backend Node viejo
│   └── CAA-backend/
├── PRODUCT.md
├── DESIGN.md
├── PLAN_IMPLEMENTACION.md
├── DEPLOY.md                   ← este archivo
└── README.md
```

## Paso 1 · Preparar el monorepo

```bash
# Desde donde tenés ahora "CAAA modulo op+admin/"
cd "CAAA modulo op+admin"

# Crear nueva estructura
mkdir -p caaa-app/legacy
mv CAA-backend caaa-app/legacy/
mv CAA-frontend caaa-app/frontend
mv supabase caaa-app/supabase
mv PRODUCT.md DESIGN.md PLAN_IMPLEMENTACION.md DEPLOY.md caaa-app/

cd caaa-app
git init
```

Crear `.gitignore` raíz:

```gitignore
# Dependencias
node_modules/
**/node_modules/

# Build
**/dist/
**/build/

# Env
.env
.env.local
.env.*.local
**/.env

# Logs
*.log
npm-debug.log*
.npm/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/

# Supabase CLI cache
.supabase/

# Backend dumps (no commitear)
supabase/dump/*.sql
!supabase/dump/clean.mjs
!supabase/dump/split_data.mjs
```

Crear `frontend/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Crear `supabase/config.toml`:

```toml
project_id = "<tu-project-ref>"

[functions.auth]
verify_jwt = false

[functions.administracion]
verify_jwt = false

[functions.alumno]
verify_jwt = false

[functions.agendar]
verify_jwt = false

[functions.admin]
verify_jwt = false

[functions.programacion]
verify_jwt = false

[functions.turno]
verify_jwt = false

[functions.instructor]
verify_jwt = false

[functions.usuario]
verify_jwt = false

[functions.calendario]
verify_jwt = false

[functions.metar]
verify_jwt = false
```

> `verify_jwt = false` porque tu auth es custom; el JWT lo verificás en `_shared/auth.ts`. Si dejás `true`, Supabase rechaza cualquier request porque el token no es de Supabase Auth.

Crear `README.md` raíz mínimo:

```markdown
# CAAA · Centro de Adiestramiento Aéreo Académico

Sistema de gestión de escuela de aviación.

## Quick links

- [DEPLOY.md](DEPLOY.md) — cómo deployar
- [PRODUCT.md](PRODUCT.md) — registro, usuarios, principios de diseño
- [DESIGN.md](DESIGN.md) — sistema visual
- [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md) — plan original del módulo Admin/Aula Virtual
- [supabase/docs/PORTING_PLAN.md](supabase/docs/PORTING_PLAN.md) — plan de port Express → Edge Functions
- [supabase/docs/REALTIME_CHANNELS.md](supabase/docs/REALTIME_CHANNELS.md) — reemplazo de Socket.IO

## Stack

- **Frontend:** React 19 + Vite + React Router + Bootstrap + Sonner. Deploy: Vercel.
- **Backend:** Supabase Edge Functions (Deno + Hono). DB: PostgreSQL (Supabase). Realtime + Storage + pg_cron + RLS.
- **Auth:** JWT custom firmado con `JWT_SECRET` compartido entre Edge y Supabase. Login manual desde el backend (no Supabase Auth).
```

## Paso 2 · Repo a GitHub

```bash
cd caaa-app

# Primer commit
git add -A
git commit -m "Initial commit: CAAA monorepo (frontend + supabase functions + migrations)"

# Crear repo en GitHub (puede ser privado)
# Vía GitHub UI: https://github.com/new → caaa-app, private
# O via gh CLI:
gh repo create caaa-app --private --source=. --remote=origin --push
```

## Paso 3 · Supabase setup

### 3.1 Migraciones SQL

Si ya creaste el proyecto Supabase, ya tenés la DB vacía esperando.

Vía Supabase CLI (recomendado):

```bash
# Instalar y enlazar (una vez)
npm i -g supabase
supabase login
cd caaa-app/supabase
supabase link --project-ref <tu-project-ref>

# Aplicar las 6 migraciones en orden
supabase db push
```

Vía Dashboard manual (alternativa):

1. SQL Editor → New query
2. Pegar contenido de `migrations/20260527000001_init_schema.sql` → Run
3. Repetir con `_02_seeds_catalog.sql`, `_03_data_operational.sql` (opcional), `_04_rls_policies.sql`, `_05_pg_cron_jobs.sql`, `_06_storage_buckets.sql`

### 3.2 Habilitar Realtime en tablas clave

Dashboard → Database → Replication → activar:
- `vuelo_estado_tiempo`
- `movimiento_cuenta`
- `estado_operaciones`
- `mensaje_turno`
- `notificacion_outbox`

### 3.3 Configurar JWT secret

Dashboard → Project Settings → API → JWT Settings:

- **Custom JWT Secret:** pegar el mismo valor que tenías en `CAA-backend/.env` como `JWT_SECRET`.
- Si no tenés uno fuerte, generar uno: `openssl rand -base64 64` y guardarlo en un gestor de contraseñas.

### 3.4 Setear env vars para Edge Functions

Dashboard → Edge Functions → Secrets → New secret. Crear:

```
JWT_SECRET=<el mismo del paso 3.3>
JWT_EXPIRES_IN=8h
DATABASE_URL=postgres://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres
ALLOWED_ORIGINS=https://<tu-app>.vercel.app,http://localhost:3000,http://localhost:5173
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

> Usá el pooler (puerto 6543) para `DATABASE_URL`. La conexión directa (5432) se agota rápido con Edge Functions cold-starting.

### 3.5 Deploy Edge Functions

Por ahora, solo `auth` y `administracion` (las que portamos):

```bash
cd caaa-app/supabase
supabase functions deploy auth
supabase functions deploy administracion
```

Cuando termines de portar las demás (ver `docs/PORTING_PLAN.md`), repetí el comando con cada una.

### 3.6 Smoke test

```bash
# Generar token de prueba (en el backend Node viejo o con node directo)
node -e "
const jwt = require('jsonwebtoken');
console.log(jwt.sign(
  { id_usuario: 999, username: 'preview_admin', rol: 'ADMINISTRACION' },
  process.env.JWT_SECRET || '<paste aquí>',
  { expiresIn: '1h' }
));
"

# Probar la function de auth (login)
curl -X POST "https://<ref>.supabase.co/functions/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"username":"u_admin_fin","password":"<password>"}'

# Probar administracion con el token
curl "https://<ref>.supabase.co/functions/v1/administracion/cuentas" \
  -H "Authorization: Bearer <token>" \
  -H "apikey: <ANON_KEY>"
```

## Paso 4 · Vercel setup

### 4.1 Conectar el repo

1. https://vercel.com/new
2. Import Git Repository → `<tu-user>/caaa-app`
3. **Root Directory:** `frontend` (importante: subdirectorio)
4. Framework Preset: detecta Vite automáticamente
5. Build & Output: dejá los defaults (`npm run build`, `dist`)

### 4.2 Env vars del frontend

Vercel → Project → Settings → Environment Variables. Agregar:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key del proyecto>
VITE_SUPABASE_FUNCTIONS_URL=https://<ref>.supabase.co/functions/v1
```

> El `LOADSHEET_URL` antiguo deja de aplicar — los PDFs se sirven desde Supabase Storage signed URLs.

### 4.3 Adaptar `frontend/public/config.js` (o reemplazar)

El frontend actual lee de `window.__APP_CONFIG__`. Mantener este patrón:

`frontend/public/config.js`:
```js
window.__APP_CONFIG__ = {
  SUPABASE_URL: "https://<ref>.supabase.co",
  SUPABASE_ANON_KEY: "<anon key>",
  SUPABASE_FUNCTIONS_URL: "https://<ref>.supabase.co/functions/v1"
};
```

**O mejor**: usar las env vars de Vercel directamente en código:

`frontend/src/api/axiosConfig.js` actualizado:

```js
import axios from "axios";

export const FUNCTIONS_URL =
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
  window.__APP_CONFIG__?.SUPABASE_FUNCTIONS_URL ||
  "http://localhost:54321/functions/v1";

export const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  window.__APP_CONFIG__?.SUPABASE_ANON_KEY ||
  "";

// API_URL ahora apunta a Edge Functions
export const API_URL = FUNCTIONS_URL;

// SOCKET_URL desaparece — usar @supabase/supabase-js para Realtime

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers.apikey = ANON_KEY;
  return config;
});
```

### 4.4 Deploy

Vercel hace deploy automático en cada push a la rama main (o la que configures).

## Paso 5 · Migración de uploads/ a Storage

El backend Node guardaba PDFs en `CAA-backend/uploads/`. Hay que moverlos a Storage de Supabase:

```bash
# Script único de migración
cd caaa-app/legacy/CAA-backend
node -e "
require('dotenv').config({ path: '../../supabase/.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const buckets = {
  'uploads/planes-vuelo': 'planes-vuelo',
  'uploads/loadsheets': 'loadsheets',
  'uploads/documentos': 'documentos-alumno'
};

(async () => {
  for (const [local, bucket] of Object.entries(buckets)) {
    if (!fs.existsSync(local)) continue;
    for (const file of fs.readdirSync(local)) {
      const buf = fs.readFileSync(path.join(local, file));
      const { error } = await sb.storage.from(bucket).upload(file, buf, { upsert: true });
      if (error) console.error(file, error.message);
      else console.log('OK', bucket, file);
    }
  }
})();
"
```

## Paso 6 · Cutover

1. Verificar que las Edge Functions están todas deployadas y funcionando con smoke tests
2. Update frontend env vars y redeploy
3. Avisar a usuarios que la app va a estar fuera ~5min
4. Cambiar DNS o dominio personalizado (si aplica) al de Vercel
5. Apagar el backend Node viejo (`CAA-backend`)
6. Mover el código a `legacy/` para referencia

## Costos esperados

| Servicio | Plan | Costo |
|---|---|---|
| Supabase | Pro | $25/mes (ya pago) |
| Vercel | Hobby | $0 (hasta 100GB bandwidth, suficiente para ~30k usuarios MAU) |
| GitHub | Free | $0 (private repos ilimitados) |
| **Total** | | **$25/mes** |

Si pasan de 100k MAU o necesitan analytics avanzados, Vercel Pro: $20/mes.

## Si algo se rompe

Orden de troubleshooting:

1. **Login devuelve 401 con token válido** → JWT_SECRET no coincide entre tu Edge Function y el proyecto Supabase. Verificar ambos.
2. **CORS error en frontend** → `ALLOWED_ORIGINS` no incluye el dominio de Vercel. Agregarlo y redeploy de las functions.
3. **Database connection timeout** → Estás usando puerto 5432 (direct) en vez de 6543 (pooler). Cambiar `DATABASE_URL`.
4. **RLS bloquea queries inesperadamente** → Estás conectándote como `authenticated` o `anon` en vez de `service_role`. Verificar que la Edge Function usa el `DATABASE_URL` con user `postgres`.
5. **Realtime no llega al frontend** → No habilitaste replication para la tabla. Dashboard → Database → Replication.
6. **pg_cron jobs no corren** → Verificar `SELECT * FROM cron.job;` que hay 3 rows. Si no, re-correr migración 05.
7. **Edge Function timeout (150s)** → Alguna query es lenta. Agregar índice o paginación.

## Backup y rollback

- Supabase hace backup diario automático (Pro: retención 7 días, PITR opcional)
- Para snapshot manual: Dashboard → Database → Backups → Create backup
- Si querés volver a Node backend temporalmente: el código sigue en `legacy/CAA-backend/`. Solo cambiar `VITE_SUPABASE_FUNCTIONS_URL` a tu URL Railway/local.
