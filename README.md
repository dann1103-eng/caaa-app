# CAAA · Centro de Adiestramiento Aéreo Académico

Sistema de gestión integral para escuela de aviación: agendamiento de vuelos, ciclo de operación, mantenimiento, METAR, reportes con firma digital, módulo de Administración/Contabilidad (cuenta corriente, facturas, recibos, nómina dual, egresos) y Aula Virtual con unidades teóricas + evaluaciones.

## Stack

- **Frontend:** React 19 + Vite + React Router 7 + Bootstrap 5 + Sonner. Deploy en **Vercel**.
- **Backend:** Supabase Edge Functions (Deno + Hono). En migración desde Express Node legacy.
- **DB:** PostgreSQL 17 en **Supabase Pro** + RLS + pg_cron + Realtime + Storage.
- **Auth:** JWT custom firmado con `JWT_SECRET` compartido entre Edge Functions y proyecto Supabase. Login manual desde el backend (no Supabase Auth nativo).

## Estructura del repo

```
caaa-app/
├── CAA-frontend/           ← React SPA (deploy: Vercel)
├── supabase/               ← Backend completo
│   ├── migrations/         ← 6 archivos SQL (corren en orden)
│   ├── functions/          ← Edge Functions (Deno)
│   │   ├── _shared/        ← helpers comunes (db, jwt, auth, cors, etc.)
│   │   ├── auth/           ← login/refresh/logout (portado)
│   │   ├── administracion/ ← cuenta corriente (template del patrón)
│   │   └── …               ← demás dominios pendientes de portar
│   ├── docs/
│   │   ├── PORTING_PLAN.md       ← plan ruta-por-ruta Express→Edge
│   │   └── REALTIME_CHANNELS.md  ← reemplazo de Socket.IO
│   └── dump/               ← schema y data raw (referencia)
├── legacy/
│   └── CAA-backend/        ← backend Node Express original (referencia)
├── PRODUCT.md              ← registro, usuarios, principios de diseño
├── DESIGN.md               ← sistema visual (OKLCH, Inter+JetBrains Mono)
├── PLAN_IMPLEMENTACION.md  ← plan original del módulo Admin/Aula Virtual
├── DEPLOY.md               ← guía paso a paso Vercel + Supabase + GitHub
└── README.md               ← este archivo
```

## Quick links

- **[DEPLOY.md](DEPLOY.md)** — cómo deployar a producción
- **[supabase/README.md](supabase/README.md)** — setup específico de Supabase
- **[supabase/docs/PORTING_PLAN.md](supabase/docs/PORTING_PLAN.md)** — plan de port Express → Edge Functions
- **[supabase/docs/REALTIME_CHANNELS.md](supabase/docs/REALTIME_CHANNELS.md)** — Realtime channels
- **[PRODUCT.md](PRODUCT.md)** — registro, usuarios, principios de diseño
- **[DESIGN.md](DESIGN.md)** — sistema visual y tokens

## Cómo correr localmente

### Frontend (Vite dev)

```bash
cd CAA-frontend
npm install
# Crear public/config.js apuntando a tu Edge Functions URL local o producción
npm run dev
# → http://localhost:3000
```

### Supabase local (con CLI)

```bash
npm i -g supabase
supabase login
supabase link --project-ref <tu-project-ref>

# Aplicar migraciones a tu proyecto Supabase
cd supabase
supabase db push

# Deploy edge functions una por una
supabase functions deploy auth
supabase functions deploy administracion
```

### Backend Node legacy (referencia)

```bash
cd legacy/CAA-backend
cp .env.example .env  # editar con tus credenciales locales
npm install
node server.js
# → http://localhost:5000
```

> El backend Node legacy solo se usa como referencia durante la migración. La meta es que todo viva en Supabase Edge Functions.

## Roles del sistema

| Rol | Acceso |
|---|---|
| `ADMINISTRACION` | Módulo financiero completo (cuentas, facturas, recibos, nómina, egresos, tarifas, cursos). Lectura general. |
| `ADMIN` | Operación + lectura del módulo financiero. |
| `PROGRAMACION` | Agendamiento, semanas, bloques, vuelos. |
| `TURNO` | Estados de vuelos, mensajes de turno, suspender operaciones. |
| `INSTRUCTOR` | Reportes y checklist propios. Aula virtual: calificar. |
| `ALUMNO` | Su propia cuenta, agendar vuelos, plan, reporte, aula virtual personal. |

## Documentación específica del módulo Administración/Contabilidad

Ver [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md) — desglose completo de tablas, controllers, endpoints, frontend, integraciones cruzadas y decisiones de diseño.

---

**Licencia:** interna · proyecto privado de CAAA (Centro de Adiestramiento Aéreo Académico, S.A. de C.V., El Salvador).
