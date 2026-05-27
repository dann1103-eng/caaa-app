# Porting Plan · Express → Supabase Edge Functions

Plan ejecutable para terminar la migración del backend Node Express a Edge Functions (Deno + Hono). El scaffolding y dos ejemplos ya están listos. Este documento te lleva desde donde quedamos hasta producción.

## Lo que ya está hecho

| Pieza | Path | Estado |
|---|---|---|
| Shared helpers | `supabase/functions/_shared/` | ✅ |
| Auth (login/refresh/logout) | `supabase/functions/auth/index.ts` | ✅ |
| Plantilla Administración (cuenta) | `supabase/functions/administracion/index.ts` | ✅ ejemplo |
| pg_cron · 3 jobs | `supabase/migrations/20260527000005_pg_cron_jobs.sql` | ✅ |
| Storage buckets + policies | `supabase/migrations/20260527000006_storage_buckets.sql` | ✅ |
| Realtime channels (doc) | `supabase/docs/REALTIME_CHANNELS.md` | ✅ |

## Lo que falta

| Function | Endpoints a portar | LOC origen aprox |
|---|---|---|
| `administracion` | terminar: tarifas, cursos, recibos, facturas, egresos, nómina, documentos, médicos, aula virtual, reportes | ~1,800 |
| `agendar` | mis-solicitudes, solicitar-vuelos, bloques-ocupados, bloques-bloqueados, aeronaves-permitidas, bloques-horario | ~360 |
| `alumno` | mi-horario, licencia, mi-info, plan-vuelo, weight-balance, reporte-vuelo, cancelaciones, mi-cuenta, mi-aula-virtual | ~700 |
| `admin` | usuarios, mantenimiento, aeronaves, vuelos, cancelaciones, auditoría | ~1,100 |
| `programacion` | calendario, aprobación solicitudes, reasignación aeronave, mantenimiento resumen | ~500 |
| `turno` | vuelos-hoy, avanzar-estado, mensajes, suspender operaciones | ~600 |
| `instructor` | reportes pendientes, checklist post-vuelo, firmar reporte (incluye cargo automático) | ~400 |
| `usuario` | perfil, cambiar-password, cambiar-correo, update-info | ~150 |
| `calendario` | calendario público | ~80 |
| `metar` | get-metar (consume servicio externo) | ~100 |
| `outbox-process` | scheduled function que drena notificacion_outbox a Realtime broadcast | ~50 |

**Total estimado:** ~5,800 líneas de port directo. Trabajo: **8-12 días-persona** con el scaffolding listo.

## Patrón a seguir (regla de oro)

Cada controller Express se convierte a una ruta Hono dentro del archivo `supabase/functions/<dominio>/index.ts`. El mapeo es 1:1:

| Express | Edge (Hono) |
|---|---|
| `router.get("/path", auth, role, handler)` | `app.get("/path", requireRole([...]), handler)` |
| `req.body` | `await c.req.json()` |
| `req.params.x` | `c.req.param("x")` |
| `req.query.x` | `c.req.query("x")` |
| `req.user.id_usuario` | `getClaims(c).id_usuario` |
| `res.status(401).json({...})` | `c.json({...}, 401)` |
| `db.query("SELECT...", [params])` | `await sql\`SELECT...\`` (tagged template) o `await query("SELECT...", [params])` |
| `db.connect() + BEGIN/COMMIT` | `await withTransaction(async (tx) => { ... })` |
| `req.app.get("io").emit(...)` | `await broadcast("canal", "evento", payload)` o sin nada (postgres_changes lo automatiza) |
| `utils/auditoria.logAuditoria(client, {...})` | `await logAuditoria(tx, {...})` |

### Ejemplo concreto

**Antes (Node Express):**
```js
exports.list = async (req, res) => {
  try {
    const r = await db.query(`SELECT * FROM curso WHERE activo = TRUE ORDER BY id`);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// en routes:
router.get("/cursos", authMiddleware, roleMiddleware(["ADMIN","ADMINISTRACION"]), cursos.list);
```

**Después (Edge Function):**
```ts
app.get("/cursos", requireRole(["ADMIN","ADMINISTRACION"]), async (c) => {
  try {
    const rows = await sql`SELECT * FROM public.curso WHERE activo = TRUE ORDER BY id`;
    return c.json({ ok: true, data: rows });
  } catch (e) {
    return c.json({ ok: false, message: (e as Error).message }, 500);
  }
});
```

### Patrón crítico: transacciones

**Antes:**
```js
const client = await db.connect();
try {
  await client.query("BEGIN");
  // ... múltiples queries ...
  await client.query("COMMIT");
  res.json({ ok: true });
} catch (e) {
  await client.query("ROLLBACK");
  res.status(500).json({ message: e.message });
} finally {
  client.release();
}
```

**Después:**
```ts
try {
  await withTransaction(async (tx) => {
    // ... múltiples queries con tx en vez de sql ...
  });
  return c.json({ ok: true });
} catch (e) {
  return c.json({ message: (e as Error).message }, 500);
}
```

`withTransaction` hace BEGIN/COMMIT/ROLLBACK automático según resuelva o rechace la promesa.

## Pasos para portar un controller

1. **Abrir el archivo Express original** (ej. `CAA-backend/controllers/admin/adminMantenimientoController.js`).
2. **Identificar cada `exports.X`** y su firma.
3. **Buscar la ruta correspondiente** en `CAA-backend/routes/adminRoutes.js` para saber método + path + middlewares.
4. **Abrir el archivo Edge correspondiente** (`supabase/functions/admin/index.ts`).
5. **Por cada exports.X, crear `app.METHOD("/path", requireRole([...]), async (c) => {...})`**.
6. **Traducir cada `db.query(SQL, [params])` a `sql\`SQL\`` con interpolación de parámetros.**
7. **Si hay transacción, envolverla en `withTransaction`.**
8. **Si hay `io.emit`, reemplazar por `broadcast` o nada (postgres_changes).**
9. **Si hay `logAuditoria`, importar y usar igual.**
10. **Si hay `req.file` (multer), reemplazar con Storage SDK (`@supabase/supabase-js`).**

## Adaptación del frontend

Cuando todas las Edge Functions estén deployadas, el frontend cambia URL base:

```js
// CAA-frontend/src/api/axiosConfig.js
// Antes:
const getRawBaseUrl = () => window.__APP_CONFIG__?.API_URL || "http://localhost:5000";

// Después:
const getRawBaseUrl = () =>
  window.__APP_CONFIG__?.SUPABASE_FUNCTIONS_URL ||
  "https://<tu-project-ref>.supabase.co/functions/v1";
```

Las rutas en los servicios cambian de `${API_URL}/administracion/cuentas` a `${SUPABASE_FUNCTIONS_URL}/administracion/cuentas` — el path interno se preserva.

**Headers obligatorios** en cada request:
- `Authorization: Bearer <tu-jwt-custom>` (igual que antes)
- `apikey: <SUPABASE_ANON_KEY>` (nuevo — Supabase lo exige)

Agregar a `axiosConfig.js` el interceptor de `apikey`:

```js
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers.apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return config;
});
```

## Deploy de las Edge Functions

### Pre-requisitos
- Supabase CLI instalado: `npm i -g supabase`
- Logueado: `supabase login`
- Proyecto enlazado: `supabase link --project-ref <tu-project-ref>`

### Setear env vars en el proyecto Supabase

Dashboard → Edge Functions → Settings → Add new secret:

```
JWT_SECRET=<el mismo de tu .env actual>
JWT_EXPIRES_IN=8h
DATABASE_URL=postgres://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres
ALLOWED_ORIGINS=https://tu-frontend.vercel.app,http://localhost:3000
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

> **Nota:** `DATABASE_URL` también puede ir al pooler de Supabase si esperás muchas conexiones concurrentes: `postgres://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres`.

### Deploy

```bash
# Desde la raíz del proyecto, donde está supabase/
cd supabase/

# Deploy una por una
supabase functions deploy auth --no-verify-jwt
supabase functions deploy administracion --no-verify-jwt
supabase functions deploy agendar --no-verify-jwt
# ... etc

# O todas de un golpe (cuando estén listas)
supabase functions deploy --no-verify-jwt
```

> **¿Por qué `--no-verify-jwt`?** Supabase intenta verificar el JWT con su Auth nativa por default. Como nosotros tenemos JWT custom y verificamos manualmente en `_shared/auth.ts`, deshabilitamos su verificación.

### Probar localmente antes de deploy

```bash
supabase functions serve auth --env-file ../CAA-backend/.env
# En otra terminal:
curl -X POST http://localhost:54321/functions/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"u_admin_fin","password":"admin123"}'
```

## URLs finales

Tras deploy, cada function vive en:

```
https://<project-ref>.supabase.co/functions/v1/<nombre-function>/<path>
```

Ejemplos:
- `POST https://abc.supabase.co/functions/v1/auth/login`
- `GET  https://abc.supabase.co/functions/v1/administracion/cuentas`
- `POST https://abc.supabase.co/functions/v1/administracion/cuenta/123/cargo-manual`

## Mapeo completo de routes

### auth/
- POST `/login` ✅
- GET `/refresh` ✅
- POST `/logout` ✅

### administracion/
- GET `/cuentas` ✅
- GET `/cuenta/:id_alumno` ✅
- GET `/cuenta/:id_alumno/extracto` ✅
- POST `/cuenta/:id_alumno/cargo-manual` ✅
- PATCH `/movimientos/:id` ✅
- ⏳ PATCH `/movimientos/:id/anular`
- ⏳ POST `/cuenta/:id_alumno/ajuste`
- ⏳ GET/PUT `/tarifas/aeronaves` + `/tarifas/aeronaves/historial`
- ⏳ GET `/tarifas/instructores`, `/tarifas/instructores/disponibles`, PUT `/tarifas/instructores`
- ⏳ GET/POST `/cursos`, PATCH `/cursos/:id`
- ⏳ GET/POST `/inscripciones`, PATCH `/inscripciones/:id/finalizar`
- ⏳ GET/POST `/recibos`, GET `/recibos/:id/pdf`, PATCH `/recibos/:id/anular`
- ⏳ GET/POST `/facturas`, GET `/facturas/:id/pdf`, PATCH `/facturas/:id/anular`
- ⏳ Helper interno: `emitirFacturaVueloDentroTx` (lo importa la function `instructor`)
- ⏳ GET/POST/PATCH `/egresos`
- ⏳ GET `/nomina/periodos`, GET `/nomina/periodos/:id/detalles`
- ⏳ POST `/nomina/calcular`, PATCH `/nomina/detalles/:idDet`, `/aprobar`, `/pagar`
- ⏳ GET `/documentos/catalogo`, GET `/documentos/alumno/:id_alumno`
- ⏳ POST `/documentos/alumno/:id_alumno` (con Storage upload)
- ⏳ PATCH `/documentos/:id`, GET `/documentos/alertas`
- ⏳ GET/POST/PATCH `/medicos`
- ⏳ GET/POST/PATCH/DELETE `/aula/unidades`
- ⏳ GET `/aula/alumnos/:id_alumno/progreso`, POST `/aula/progreso`
- ⏳ GET/POST `/aula/evaluaciones`, GET `/aula/evaluaciones/:id/alumnos`, PATCH `/aula/evaluacion-alumno/:id`
- ⏳ GET `/reportes/{ingresos,egresos,pyl,morosos,kpis-dashboard}`

### agendar/
- ⏳ GET `/aeronaves-permitidas`
- ⏳ GET `/mis-solicitudes`
- ⏳ POST `/solicitar-vuelos` (incluye bloqueo por saldo — usa `verificarSaldoSuficiente`)
- ⏳ GET `/bloques-ocupados`, `/bloques-bloqueados`, `/bloques-horario`

### alumno/
- ⏳ GET `/mi-horario`, `/licencia`, `/mi-info`, `/mi-proximo-mantenimiento`
- ⏳ GET `/bloques-bloqueados`, `/condiciones-cancelacion`
- ⏳ POST/DELETE `/vuelos/:id_vuelo/solicitar-cancelacion`, GET `/mis-solicitudes-cancelacion`
- ⏳ GET/PUT/PATCH `/vuelos/:id/plan-vuelo` (con Storage)
- ⏳ GET/PUT/PATCH `/vuelos/:id/weight-balance`, `/loadsheet`, `/send-loadsheet`
- ⏳ GET/PUT/PATCH `/vuelos/:id/reporte-vuelo`, `/enviar`, `/firmar`
- ⏳ GET `/mi-cuenta`, `/mi-cuenta/extracto`, `/mi-avance-curso`, `/mis-documentos`
- ⏳ GET `/mi-aula-virtual`

### instructor/
- ⏳ Reportes pendientes, get/save/firmar reporte (con `emitirFacturaVueloDentroTx`)
- ⏳ Checklist post-vuelo

### admin/, programacion/, turno/, usuario/, calendario/, metar/, outbox-process/
- Todas siguiendo el mismo patrón.

## Checklist final pre-producción

- [ ] Las 11 Edge Functions deployadas
- [ ] Env vars seteadas (JWT_SECRET, DATABASE_URL, ALLOWED_ORIGINS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- [ ] Migraciones 01-06 corridas en orden
- [ ] Realtime habilitado en tablas (Dashboard → Database → Replication)
- [ ] Webhook de outbox configurado o scheduled function `outbox-process` corriendo
- [ ] Uploads históricos migrados a Storage (script de migración aparte)
- [ ] Frontend con `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_FUNCTIONS_URL` en `.env.production`
- [ ] CORS_ORIGINS incluye el dominio final de Vercel
- [ ] Smoke test: login → ver cuenta → cargar movimiento → verificar broadcast
- [ ] Eliminar el backend Node viejo (`CAA-backend/`) del repo o moverlo a `legacy/` para referencia

## Estimación cierre

Si trabajás de tiempo completo:
- Semana 1: terminar `administracion` + `auth` + `alumno` + frontend adapt + deploy de los 4
- Semana 2: `agendar` + `instructor` (cargo automático crítico) + `admin` + `programacion` + `turno`
- Semana 3: `usuario` + `calendario` + `metar` + `outbox-process` + Realtime end-to-end + QA + cutover

Si trabajás part-time, multiplicá x2-x3.
