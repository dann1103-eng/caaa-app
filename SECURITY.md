# Auditoría de Seguridad — CAAA

Fecha: 2026-06-12 · Alcance: backend (Express/`pg`), frontend (React/Vite), repositorio y despliegue (Railway/Vercel/Supabase).

Este documento resume la auditoría exhaustiva, qué se **corrigió en código** en esta sesión, y qué **acciones quedan a cargo del operador** (rotación de secretos, despliegue). Está organizado por el vector de ataque.

---

## Resumen ejecutivo

| Vector | Estado antes | Acción |
|---|---|---|
| **IDOR** (alumno accede a datos de otro alumno) | ❌ Crítico — explotable | ✅ **Corregido** (control de propiedad por rol) |
| **SQL injection** | ✅ Bien (consultas parametrizadas) | Sin cambios — verificado |
| **XSS** | ⚠️ 1 punto (METAR `dangerouslySetInnerHTML`) | ✅ **Corregido** |
| **Rate limiting / DDoS** | ⚠️ Solo en login | ✅ **Añadido límite global** |
| **MITM / HTTPS** | ✅ TLS en plataforma | ✅ **Reforzado con HSTS** |
| **Broken auth / hashing** | ✅ bcrypt + bloqueo de intentos | Sin cambios — verificado |
| **CSRF** | ✅ No aplica (Bearer token, no cookies) | Sin cambios — explicado |
| **CORS** | ✅ Lista blanca por env | Sin cambios — verificado |
| **Secretos en el repo** | ✅ `.env` NO commiteado | ✅ `.gitignore` reforzado |
| **API key en frontend** (`PROYECCION_KEY`) | ⚠️ Hardcodeada (baja sensibilidad) | Documentado — requiere decisión |
| **Rotación de secretos** | — | ⏳ **Acción del operador** |
| **API Gateway / Circuit breaker** | — | Recomendación: no necesario hoy (ver abajo) |

---

## 1. IDOR — el hallazgo más grave (CORREGIDO)

**Qué era:** los endpoints del alumno que operan sobre un vuelo (`/api/alumno/vuelos/:id/...`)
tomaban el `id` de la URL y **nunca verificaban que el vuelo fuera del alumno autenticado**.
Cualquier alumno logueado podía leer o modificar el plan de vuelo, weight & balance, loadsheet,
reporte y solicitudes de cancelación de **otro** alumno simplemente cambiando el número en la URL.

Endpoints afectados (todos corregidos):
- `plan-vuelo` (GET/PUT/PATCH) — `alumnoPlanVueloController.js`
- `weight-balance` y `loadsheet` (GET/PUT/POST/PATCH) — `alumnoWbController.js`
- `reporte-vuelo` (GET/PUT/PATCH/firmar) — `alumnoReporteController.js`
- `solicitar-cancelacion` / `quitar-solicitud` — `alumnoCancelacionController.js`

**Cómo se corrigió:** nuevo helper `utils/ownership.js` → `puedeAccederVuelo(req, res, idVuelo)`,
**consciente del rol**:
- **ALUMNO** → el vuelo debe ser suyo (`vuelo.id_alumno`).
- **INSTRUCTOR** → el vuelo debe ser suyo (`vuelo.id_instructor`) — porque el instructor
  reutiliza `getWB`/`getLoadsheet` en su vista de solo lectura.
- **Staff** (ADMIN, PROGRAMACION, TURNO, ADMINISTRACION, TALLER) → permitido.

Cada controller llama `if (!(await puedeAccederVuelo(req, res, id))) return;` antes de tocar datos.
`quitarSolicitudCancelacion` además verifica que la solicitud pertenezca al alumno (y se cerró de
paso una fuga de transacción: los `return` tempranos no hacían `ROLLBACK`).

**Defensa en profundidad añadida:** las rutas de instructor (`instructorRoutes.js`) solo validaban
el JWT, no el rol → ahora exigen `roleMiddleware(["INSTRUCTOR","ADMIN"])`. (Los controllers de
instructor ya verificaban `id_instructor`, así que el IDOR cruzado entre instructores ya estaba cubierto.)

---

## 2. SQL injection — SIN vulnerabilidades (verificado)

Todo el acceso a datos usa el driver `pg` con **consultas parametrizadas** (`$1, $2, ...` + array de
params). Se auditaron ~50 controllers. Los pocos lugares que construyen el `WHERE` dinámicamente
(`reportesController`, `seguimientoController`, `aulaVirtualController`, etc.) **siguen usando
placeholders** — solo concatenan fragmentos `$N` ya numerados, nunca el valor del usuario. **No se
encontró ninguna interpolación de input de usuario en SQL.** No se necesita un ORM para estar seguro;
la parametrización ya previene la inyección. (Recomendación menor de mantenibilidad: encapsular los
builders de `WHERE`, pero no es un riesgo de seguridad.)

---

## 3. XSS — 1 punto corregido

React escapa el contenido por defecto, así que el riesgo se limita a `dangerouslySetInnerHTML`.
Había **un** uso: la barra METAR de la página de Proyección inyectaba como HTML el resumen del clima,
que proviene de una **API externa** (`aviationweather.gov`). Si esa fuente fuera comprometida o
manipulada en tránsito, podría inyectar HTML/scripts.

**Corregido:** `formatMetarResumen` ahora devuelve datos estructurados `{icon, text}` y el render usa
elementos React (`<i className=...>{text}`), que escapan el texto. Se eliminó el
`dangerouslySetInnerHTML`. (Nota: el proyecto ya incluye **DOMPurify** en el bundle para otros usos.)

---

## 4. Rate limiting / DDoS (REFORZADO)

- **Antes:** solo `/api/auth/login` tenía límite (10 req / 15 min por IP).
- **Ahora:** además un **límite global** sobre toda la API: **600 req/min por IP** (`server.js`).
  El margen es amplio a propósito: en la escuela muchos usuarios comparten la misma IP pública (NAT),
  y un límite bajo los bloquearía. `app.set('trust proxy', 1)` ya estaba, así que el límite usa la IP
  real del cliente detrás del proxy de Railway.

> **Importante:** un límite a nivel de app **mitiga fuerza bruta y picos**, pero **no** detiene un DDoS
> volumétrico real (ese tráfico se absorbe antes, en la red). Para eso, lo efectivo es poner el dominio
> detrás de **Cloudflare** (gratis): protección DDoS L3/L7, WAF y caché. Es la mejor inversión de
> seguridad/€ para este sistema y no requiere cambios de código.

---

## 5. MITM / HTTPS (REFORZADO con HSTS)

El transporte ya va por **HTTPS** (TLS lo terminan Vercel y Railway), así que el contenido viaja
cifrado: un interceptor en la red no puede leerlo. Eso ya cubre tu preocupación de "man in the middle".

**Refuerzo añadido:** se activó **HSTS** explícito en `helmet` (`max-age` 180 días, `includeSubDomains`).
Esto le dice al navegador "para este dominio, usá HTTPS siempre", cerrando el hueco de SSL-stripping
(que alguien fuerce una primera conexión por HTTP). El header `Authorization: Bearer` viaja dentro del
túnel TLS, nunca en claro.

---

## 6. Broken auth / hashing (verificado — bien)

- Contraseñas con **bcrypt** (`authController.js`). El login acepta una contraseña inicial en texto
  plano **una sola vez** y la convierte a bcrypt en el primer ingreso (migración de cuentas viejas).
- **Bloqueo por intentos:** 5 fallos → cuenta bloqueada 3 min (`failed_login_count` / `locked_until`).
- **Sesión única:** el token lleva un `session_id` validado contra la BD; abrir sesión en otro
  dispositivo invalida la anterior.
- **JWT** firmado con `JWT_SECRET` y expiración (`JWT_EXPIRES_IN`). Forjar un token requiere el secreto.

Recomendación menor (no crítica): el `JWT_EXPIRES_IN` está en `8h`; está bien. Si querés, se puede
acortar y apoyarse en el refresh. No es un riesgo.

---

## 7. CSRF — no aplica (explicado)

El CSRF explota que el navegador **adjunta cookies automáticamente** a peticiones cross-site. Esta app
**no usa cookies de sesión**: el JWT se guarda en `localStorage` y se manda explícitamente en el header
`Authorization: Bearer`. Un sitio malicioso no puede leer ese token ni forzar al navegador a adjuntarlo,
así que **el vector CSRF clásico no existe aquí**. (El precio de ese diseño es la exposición a XSS — ver
§3 y §11 — por eso importa mantener cero `dangerouslySetInnerHTML` sin sanitizar.)

---

## 8. CORS (verificado — bien)

`server.js` restringe el origen a una **lista blanca** desde `ALLOWED_ORIGINS` (env), con métodos y
headers acotados. No usa `origin: "*"`. En producción `ALLOWED_ORIGINS` debe contener exactamente la
URL de Vercel (`https://caaa-app.vercel.app`). Correcto.

---

## 9. Secretos y `.env` en el repo (verificado — bien + reforzado)

- ✅ **Ningún `.env` real está versionado ni aparece en el historial de git.** Solo se versiona
  `.env.example` (plantilla con valores dummy como `DB_PASSWORD=postgres`).
- ✅ `setup-railway-vars.ps1` **lee** del `.env` local, no contiene secretos.
- ✅ `config.template.js` usa placeholders (`${VITE_API_URL}`).
- ✅ **Refuerzo:** se amplió `legacy/CAA-backend/.gitignore` para cubrir `.env.*`, `uploads/`, y los
  archivos de PII de carga (`_roster.json`, `_credenciales_carga.csv`, `seed_alumnos_reales.js`) —
  el `.gitignore` raíz ya los cubría, esto es defensa en profundidad.

El único secreto literal en código versionado es la `PROYECCION_KEY` (ver §10).

---

## 10. API key en el frontend — `PROYECCION_KEY` (decisión pendiente)

La clave `caaa_proyeccion_secret_2024` está **hardcodeada** en 3 archivos del frontend
(`AdminSidebar.jsx`, `Header.jsx`, `ProtectedProgramacionPage.jsx`) y se manda por query param / header
para que las **pantallas de TV** (proyección en el hangar) lean datos operativos **sin login**.

**La verdad técnica:** una clave embebida en un frontend que debe autenticar **sin login no se puede
ocultar** — el bundle JS se descarga al navegador, así que cualquiera puede leerla. Moverla a `config.js`
solo la haría rotable, no secreta.

**Mitigante real (evaluá el riesgo):** esa clave **solo da lectura** de datos no sensibles que de todos
modos se muestran en una pantalla pública (estado de flota, METAR, calendario, estado de operaciones,
ticker). No expone PII, finanzas ni permite escribir nada. **El riesgo es bajo.**

**Recomendación (cuando quieras cerrarlo del todo):** reemplazar la clave compartida por una **cuenta de
usuario dedicada `PROYECCION`** con login real (rol de solo lectura), e inyectar sus credenciales en la
TV una sola vez. Así no hay ningún "secreto" en el código. No lo implementé porque cambia el flujo de la
TV y querías mínima intervención; lo dejo listo para decidir.

---

## 11. Nota sobre `localStorage` (token JWT)

El JWT se guarda en `localStorage`, accesible por JavaScript → si algún día se introduce un XSS, el token
es robable. Esto es el trade-off de no usar cookies (ver §7). **Mitigación principal: cero XSS** (ya en
cero tras §3). La alternativa "más segura" (cookie `httpOnly` + `SameSite`) reintroduce la necesidad de
protección CSRF y obliga a rediseñar todo el flujo de auth y el manejo de la TV de proyección. Para el
tamaño y riesgo de este sistema **no lo recomiendo ahora**; mantener el frontend libre de XSS es la
defensa correcta y suficiente.

---

## 12. API Gateway + Circuit Breaker (recomendación honesta)

Pediste evaluar añadir un **API Gateway** y un **circuit breaker**. Mi recomendación de ingeniería:

- **API Gateway: no es necesario hoy.** Un gateway aporta valor cuando hay **muchos microservicios** que
  enrutar/agregar. Acá hay **un** backend Express monolítico detrás de **un** proxy (Railway). Express ya
  hace de "gateway" (rutas, auth, CORS, rate limit, helmet). Añadir un gateway sería infraestructura extra
  para mantener sin beneficio real. Si algún día querés WAF + protección DDoS + caché en el borde, la
  opción correcta y barata es **Cloudflare delante del dominio** (no un gateway propio).

- **Circuit breaker: ya tenés el comportamiento, donde importa.** Un circuit breaker protege contra una
  **dependencia externa lenta/caída**. La única dependencia externa del backend es la **API de METAR**
  (`aviationweather.gov`), y `metarService.js` ya degrada con gracia: **timeout de 10s**, **estación de
  respaldo** (MSSS → MSLP), y **sirve desde caché** si ambas fallan — la app nunca se cae por el METAR.
  Eso es, en la práctica, lo que un circuit breaker te daría. No hace falta añadir la librería.
  (La preocupación de "si el gateway falla" no aplica porque no hay gateway que pueda fallar.)

---

## Acciones que quedan a cargo del operador (no las puedo hacer por vos)

1. **Rotar secretos** (los reales viven en Railway/Supabase, fuera del repo — yo no tengo por qué tocarlos):
   - `SUPABASE_SERVICE_KEY` — el `CLAUDE.md` ya anota que se compartió en chat; **rotala** en Supabase y
     actualizá la variable en Railway.
   - Conviene rotar también `JWT_SECRET` (cierra todas las sesiones; require re-login) y la `PROYECCION_KEY`
     si decidís mantenerla, dado que estuvo en el repo.
2. **Desplegar los cambios de esta sesión:**
   - Backend (rate limit global, HSTS, fixes IDOR): `cd legacy/CAA-backend; railway up --detach`
   - Frontend (METAR XSS, window.open): `git push origin master` (Vercel auto-deploy) tras fusionar la rama.
   - **No hay migraciones** en esta sesión; los fixes son solo de código.
3. **(Opcional, alto valor) Poner el dominio detrás de Cloudflare** para DDoS/WAF reales.

---

## Archivos modificados en esta sesión

**Backend:** `utils/ownership.js` (nuevo), `controllers/alumno/alumnoPlanVueloController.js`,
`controllers/alumno/alumnoWbController.js`, `controllers/alumno/alumnoReporteController.js`,
`controllers/alumno/alumnoCancelacionController.js`, `routes/instructorRoutes.js`, `server.js`,
`.gitignore`.

**Frontend:** `src/pages/Proyeccion/PaginaProgramacion.jsx`, `src/pages/Administracion/AlumnoFicha.jsx`,
`src/pages/Administracion/AulaVirtual.jsx`, `src/pages/Alumno/AulaVirtual.jsx`,
`src/pages/Instructor/AulaVirtual.jsx`, `src/services/turnoApi.js`.
