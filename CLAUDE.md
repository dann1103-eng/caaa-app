# CAAA — Sistema de Gestión de Centro de Adiestramiento Aéreo Académico

Contexto del proyecto para continuar en cualquier sesión. **Léelo completo antes de trabajar.**

---

## 1. Qué es

App full-stack para una escuela de aviación (CAAA, Ilopango, El Salvador). Gestiona
alumnos, instructores, programación de vuelos, mantenimiento de aeronaves, módulo de
administración/contabilidad, y un **loadsheet (peso & balance)** integrado.

Roles: `ADMIN`, `PROGRAMACION`, `TURNO`, `ALUMNO`, `INSTRUCTOR`, `ADMINISTRACION`, `TALLER`
(fuente única: `legacy/CAA-backend/middlewares/roleMiddleware.js` → `VALID_ROLES`). `ADMIN` es
super-usuario: entra a Administración y a Taller además de Operaciones.

---

## 2. Arquitectura en producción

```
Usuario → VERCEL (frontend React) → RAILWAY (backend Express) → SUPABASE (PostgreSQL)
```

| Pieza | Tecnología | Dónde vive | URL |
|---|---|---|---|
| Frontend | React 19 + Vite + Bootstrap + algo de Tailwind v3 | **Vercel** (equipo `caaa`, proyecto `caaa-app`) | https://caaa-app.vercel.app |
| Backend | Node.js + Express + `pg` + socket.io | **Railway** (proyecto `caaa-backend`) | https://caaa-backend-production.up.railway.app |
| Base de datos | PostgreSQL | **Supabase** (proyecto `titwxdsevyfvqfazvbkc`) | — |

- Health check backend: `GET /api/health` → `{"ok":true,"db_time":"..."}`
- El backend **NO puede vivir en Supabase ni Vercel** (necesita servidor siempre encendido para socket.io + jobs de cron cada minuto). Por eso Railway.

### Repos
- Monorepo GitHub: **`dann1103-eng/caaa-app`** (rama `master`).
- Estructura: `CAA-frontend/` (frontend), `legacy/CAA-backend/` (backend — **ya consolidado** dentro del monorepo; antes era un gitlink a `Rafael1236/CAA-backend`, su `.git` anidado está respaldado en `C:\Users\Daniel\Desktop\CAA-backend-git-backup`).
- `supabase/migrations/` (esquema + seeds), `supabase/dump/` (seeds de prueba y scripts utilitarios).

---

## 3. Despliegue (IMPORTANTE)

**✅ Auto-deploy configurado en AMBOS lados desde el 2026-07-18.** Cada `git push origin master`:
- **Vercel** auto-construye el frontend. Root Directory = `CAA-frontend` (Settings → Build and
  Deployment). `CAA-frontend/vercel.json` tiene el rewrite SPA (`/(.*) → /index.html`).
- **Railway también auto-construye el backend.** Daniel conectó el servicio `caaa-backend` al repo
  de GitHub (`dann1103-eng/caaa-app`, rama `master`, **Root Directory = `legacy/CAA-backend`**)
  desde el dashboard de Railway (Settings → Source → Connect Repo) — `railway status` ahora muestra
  una línea `repo: dann1103-eng/caaa-app` que antes no aparecía. **Verificado real** el mismo día:
  Samuel pusheó la sección Voucheras (nueva ruta `/administracion/voucheras`) y quedó viva en
  producción (401, no 404) sin que nadie corriera `railway up`.

**Ya NO hace falta `railway up` manual para el flujo normal.** Un simple `git push origin master`
alcanza para desplegar frontend y backend. Esto también **elimina la vieja asimetría** (Vercel
tomaba de GitHub, Railway tomaba de tu carpeta local) que causó más de un incidente de "el cambio
del otro desaparece de producción" (ver histórico abajo) — ya no puede pasar: ambos toman siempre
del mismo commit de `origin/master`.

**Flujo normal para un cambio:**
1. `git fetch origin; git merge origin/master` (traer lo del otro antes de nada — sigue siendo
   buena práctica para no pisar trabajo en un merge feo, aunque el deploy ya no dependa de esto).
2. Editar código.
3. `cd CAA-frontend; $env:VITE_API_URL="https://caaa-backend-production.up.railway.app"; npm run build` (verificar que compila).
4. Si hay migración: `node run-sql.js "..."` (**siempre antes** del deploy, si el código nuevo ya lee las columnas).
5. `git add ... && git commit -F <archivo-msg> && git push origin master` — esto solo ya dispara
   **ambos** despliegues.

**Diagnóstico rápido** (sigue siendo útil): `curl https://caaa-backend-production.up.railway.app/api/<ruta>`
→ **404** = la ruta no existe (código no llegó / deploy no corrió) · **401** = existe y pide auth
(está bien). `railway status` para ver el `deployment ID` vivo y compararlo con el último commit.

**Si alguna vez el auto-deploy de Railway pareciera no dispararse** (poco probable ya verificado,
pero por si la conexión GitHub se cae): `railway up --detach` desde `legacy/CAA-backend` sigue
funcionando como respaldo manual — en ese caso sí aplica la regla vieja de sincronizar primero
(`git fetch; git merge origin/master` antes de `railway up`, porque ese comando manual vuelve a
subir tu carpeta local, no GitHub).

<details>
<summary>Histórico: por qué antes esto era crítico (pre 2026-07-18, ya no aplica)</summary>

Antes Railway **no** auto-desplegaba desde git — solo Vercel lo hacía. `railway up` subía la
carpeta LOCAL tal cual estuviera, así que si tu local estaba atrasado respecto a `origin/master`,
desplegar **borraba de producción el backend que otro ya había subido**, sin avisar. Pasó el
2026-07-16: Samuel pusheó el ciclo de turno, Vercel compiló su frontend, pero Daniel corrió
`railway up` con un local viejo → el controller de Samuel desapareció del backend
(`GET /api/turno/dia` → 404) aunque el frontend ya lo mostraba. La regla de la época era
"`railway up` SIEMPRE al final, después del `git push`" — ya no hace falta seguirla para el flujo
normal, pero explica por qué el diagnóstico 404-vs-401 sigue siendo el primer chequeo ante "el
cambio se ve pero no funciona".
</details>

### CLI
- Vercel CLI logueado como `danielmancia111203-2224`. Equipo de deploy: `--scope caaa`.
- Railway CLI logueado. Proyecto `caaa-backend` ya linkeado en `legacy/CAA-backend` (ya no
  necesario para el flujo normal, solo como respaldo manual — ver arriba).

---

## 4. Variables de entorno (NO commitear secretos)

Los secretos viven en **Railway** (backend) y **Vercel** (frontend) y en `legacy/CAA-backend/.env` (gitignored). Plantilla en `legacy/CAA-backend/.env.example`.

**Railway (backend)** — claves: `DB_HOST` (= `aws-1-us-east-2.pooler.supabase.com`), `DB_PORT=5432`, `DB_USER=postgres.titwxdsevyfvqfazvbkc`, `DB_PASSWORD`, `DB_NAME=postgres`, `DB_SSL=true`, `JWT_SECRET`, `PROYECCION_KEY=caaa_proyeccion_secret_2024`, `ALLOWED_ORIGINS`, `MAIL_ENABLED=false`.

**Vercel (frontend)** — `VITE_API_URL=https://caaa-backend-production.up.railway.app` (production). El script `CAA-frontend/scripts/generate-config.mjs` (prebuild) genera `public/config.js` con esta URL. Ya está blindado para recortar BOM/comillas/espacios.

---

## 5. Conexión a Supabase desde local (clave para arreglar la BD)

La BD de Supabase tiene 2 hosts:
- Directo (`db.titwxdsevyfvqfazvbkc.supabase.co`) → **solo IPv6**, NO funciona desde la máquina local ni desde Railway.
- **Session pooler** (`aws-1-us-east-2.pooler.supabase.com:5432`, user `postgres.titwxdsevyfvqfazvbkc`) → **IPv4, SÍ funciona** desde local y Railway. **Usar siempre este.**

Utilidades en `legacy/CAA-backend/` (leen credenciales del `.env`, sin secretos hardcodeados):
- **`node run-sql.js <ruta.sql>`** — ejecuta un archivo SQL contra Supabase (para migraciones/seeds).
- **`node query.js "SELECT ..."`** — consulta de solo lectura, imprime filas en JSON (para inspeccionar el esquema/datos).

Ejemplo: `node run-sql.js "../../supabase/migrations/20260528000001_schema_drift_fixes.sql"`

---

## 6. Deriva de esquema (schema drift) — CONTEXTO CRÍTICO

El backend evolucionó más allá del volcado de esquema que se aplicó a Supabase
(`supabase/migrations/20260527000001_init_schema.sql` y `supabase/dump/schema.sql` son
el MISMO snapshot viejo). **No existe un esquema canónico completo.** Por eso el backend
referencia columnas/tablas que no existían en Supabase, causando errores 500
(`column ... does not exist`, `relation ... does not exist`).

**Cómo se arregla:** al encontrar un 500, revisar logs (`railway logs`), identificar la
columna/tabla faltante, y agregarla de forma **ADITIVA** (`ADD COLUMN IF NOT EXISTS` /
`CREATE TABLE IF NOT EXISTS`) en `supabase/migrations/20260528000001_schema_drift_fixes.sql`,
luego `node run-sql.js`. El usuario autorizó cambios aditivos de esquema durante la sesión.

**Ya corregido en `20260528000001_schema_drift_fixes.sql`:**
- `alumno`: seguro_vida, seguro_vida_vencimiento, seguro_vida_numero, certificado_medico_numero, limite_vuelos_avion, limite_vuelos_simulador
- `usuario`: current_session_id (sesión única)
- `aeronave`: foto_url
- `mantenimiento_aeronave`: estado, fecha_inicio, fecha_fin, horas_estimadas
- `estado_operaciones`: temperatura, bloques_suspendidos, explicacion_detallada
- `mensaje_turno`: expira_en
- `solicitud_semana`: limite_vuelos_avion, limite_vuelos_simulador
- `vuelo`: tipo_vuelo, id_bloque_fin
- `reporte_vuelo`: es_inasistencia, motivo_inasistencia, observaciones
- `instructor`: licencia
- `weight_balance`: fuel_burn
- `loadsheet`: ops_data, identification_data
- `loadsheet_waypoint`: data
- Tablas nuevas: `mantenimiento_bloque`, `solicitud_cancelacion`

La deriva también afecta **CHECK constraints** (no solo columnas): el código a veces
usa valores que el constraint viejo no permite (error `violates check constraint`). Fix:
ampliar el constraint con DROP + ADD (requiere autorización del usuario, no es aditivo).
Ya corregido: `reporte_vuelo_estado_check` ahora incluye `PENDIENTE_ALUMNO`; y
`vuelo_estado_check` ahora incluye `EN_PROGRESO` (migración 009, sesión 2026-06-04):
el código avanza `SALIDA_HANGAR → EN_PROGRESO` pero el constraint viejo solo permitía
`EN_VUELO`, así que el instructor no podía avanzar etapas de vuelo (la barra de
progreso quedaba clavada). **Nota de nombres:** el código usa `EN_PROGRESO`; el
constraint conserva además `EN_VUELO` por compat. Si algún estado nuevo no avanza,
revisar primero este constraint.

**Es muy probable que aparezcan MÁS columnas/constraints faltantes** al probar módulos no
ejercitados aún (administración/contabilidad, aula virtual, nómina, etc.). Mismo proceso.

---

## 7. Usuarios de prueba (todos password `demo123`)

| Usuario | Rol | Notas |
|---|---|---|
| `u1` | ADMIN | Admin Sistema |
| `u2` | PROGRAMACION | |
| `u3` | ALUMNO | ⚠️ **mal formado**: rol ALUMNO pero SIN ficha en tabla `alumno` → siempre bloqueado. NO usar. |
| `u4` | ALUMNO | Carlos Quevedo (alumno id 1, instructor 1). **Usar para probar alumno/loadsheet.** |
| `u5` | ALUMNO | Daniel Aguilar (alumno id 2) |
| `u6` | INSTRUCTOR | Ricardo Henríquez (instructor id 1) — **tiene a los 3 alumnos**. Usar para probar instructor. |
| `u7` | ALUMNO | Sofia Hernandez (alumno id 3) |
| `u8` | INSTRUCTOR | Alfredo (instructor id 2) |
| `u9` | TURNO | **Usar para probar el reporte "Vuelos por avión"** (sección 15). |
| `u_admin_fin` | ADMINISTRACION | Administración Financiera. Reseteado a `demo123` (flags de bloqueo limpios) vía `supabase/dump/reset_admin_fin.sql`. **Usar para probar administración/contabilidad.** |
| `u_taller` | TALLER | Taller Prueba (**jefe de taller**, id_usuario 111). Seed `supabase/dump/seed_usuario_taller.sql`. Licencia **TMA 002** cargada el 2026-08-18 (antes NULL ⇒ no podía firmar nada). Es quien **anula** órdenes. |
| `u_mecanico` | TECNICO | Mecánico Prueba (id_usuario 170), licencia **TMA 001**. **Primer ingreso ya resuelto**: entra directo, sin el modal que bloquea. **Usar para probar el día a día del mecánico** (§33). |

- El login acepta password en **texto plano** (`demo123`) y lo convierte a bcrypt al primer login (`authController.js`).
- **⚠️ Robapantallas de primer login (desde sesión 2026-06-12, ver sección 15):** alumnos e instructores con `usuario.datos_confirmados = false` ven un modal bloqueante al entrar. Todas las cuentas demo de alumno/instructor (u4–u8 y los 104 reales) están **sin confirmar**, así que verás el modal. Para saltarlo en pruebas: `node query.js "UPDATE usuario SET datos_confirmados=true WHERE username='uX'"`. El viejo gate de documentos de vuelo del alumno se retiró del bloqueo (ahora es recordatorio en /perfil).
- **Flota (al 2026-07-16, verificada en BD)** — 7 aeronaves. Las 3 últimas **no tienen plantilla de
  peso & balance** (`id_wb_plantilla NULL`) ⇒ el loadsheet digital avisa "no aplica/no disponible":

  | id | código | modelo (BD) | W&B | licencias que la vuelan |
  |---|---|---|---|---|
  | 1 | YS-334-PE | `TOMAHAWK` (PA-38) | ✔ | Privado, Instrumentos, Comercial, Instructor |
  | 2 | YS-333-PE | `CESSNA-152` | ✔ | Privado, Instrumentos, Comercial, Instructor |
  | 3 | YS-270-PE | `CHEROKEE` (PA-28) | ✔ | Instrumentos, Comercial, Instructor |
  | 4 | YS-127-P | `ARROW` (PA-28R) | ✔ | Comercial, Instructor |
  | 5 | SIM-1 | `SIMULADOR` (BATD II) | — | Privado, Instrumentos, Comercial, Instructor |
  | 6 | YS-155-PE | `CHEROKEE-140` | — | Instrumentos, Comercial, Instructor |
  | 7 | YS-259-PE | `CESSNA-310` (bimotor) | — | **solo Bimotor** |

  ⚠️ La matrícula correcta es **`YS-270-PE`** (no `YS-270-P`, error histórico ya corregido). `activa`
  es **estado derivado**, no lo edites a mano: lo sincroniza `sincronizarEstadoFlota` según haya un
  mantenimiento cubriendo HOY (§19.C).

---

## 8. Vuelos de prueba (seed)

- `supabase/dump/seed_vuelos_prueba.sql` — crea semana 4 + vuelos 15-20 (alumnos 1/2/3, instructor 1).
- `supabase/dump/reubicar_vuelos_semana_actual.sql` — **re-ejecutar cuando los vuelos no aparezcan** (la semana sembrada se vuelve "pasada" con el tiempo). Recalcula el lunes de la semana actual dinámicamente y reubica semana 4 + vuelos. La fecha del sistema avanza entre sesiones (ej. ya estuvo en 2026-05-28 y 2026-06-01).
- `supabase/dump/reset_loadsheets_prueba.sql` — regresa loadsheets de prueba a BORRADOR.

---

## 9. Loadsheet (peso & balance) — INTEGRADO en la app

Antes era una app separada (`C:\Users\Daniel\Desktop\loadsheet_calculator`, corría en localhost:5174). **Se portó completa dentro de `CAA-frontend/src/loadsheet/`.**

- **Ruta alumno (edición):** `/alumno/loadsheet/:id_vuelo` (ProtectedAlumno).
- **Ruta instructor (solo lectura):** `/instructor/loadsheet/:id_vuelo` (ProtectedInstructor).
- `LoadsheetPage.jsx` carga el vuelo del backend (`getWB`), mapea la aeronave a su plantilla por matrícula (`data/aircraft.js`, idéntico a la tabla `wb_plantilla`), restaura datos guardados, e inicializa el wizard de 5 pasos.
- **Persistencia real** en el backend (tablas `weight_balance`, `loadsheet`, `loadsheet_waypoint`) vía `loadsheetApi.js` → endpoints del alumno (`PUT /alumno/vuelos/:id/weight-balance`, `/loadsheet`, `POST .../send-loadsheet`).
- **Flujo alumno→instructor:** alumno da "✉ Guardar y enviar" → loadsheet queda `ENVIADO` → el instructor ve el botón "Ver Loadsheet del alumno" en su tarjeta de vuelo (`pages/Instructor/Dashboard.jsx`, `VueloCard`), que abre la vista de solo-lectura.
- **Modo lectura:** banner amarillo + `fieldset disabled` en pasos 1-4; el Paso 5 NO se deshabilita (el instructor puede Vista previa / Imprimir / Descargar PDF); los botones Guardar/Enviar se ocultan (`state.readOnly`).
- El envío **ya no depende del PDF** (html-to-image es frágil): el PDF es "mejor esfuerzo", el `ENVIADO` se marca siempre.
- Mensajes con **toasts de sonner** (no `alert()`).
- SIM-1 (simulador) no tiene plantilla W&B → muestra aviso "no aplica".
- El instructor reutiliza los controllers del alumno vía rutas read-only: `GET /instructor/vuelos/:id/weight-balance` y `/loadsheet`.
- El backend manda correo al instructor solo si `MAIL_ENABLED` + SMTP configurado (hoy NO lo está; el envío en-app funciona igual).

---

## 10. Gotchas / lecciones aprendidas

- **✅ RESUELTO el 2026-07-18: Railway ya auto-despliega desde GitHub** (Root Directory
  `legacy/CAA-backend`), igual que Vercel. Ya no hace falta `railway up` manual para el flujo
  normal — un `git push origin master` alcanza para ambos. El viejo riesgo de "`railway up` pisa
  el backend del otro con tu carpeta local atrasada" (pasó el 2026-07-16 con el ciclo de turno de
  Samuel) ya no aplica porque ambos servicios toman siempre del mismo commit de GitHub. Detalle y
  respaldo manual (por si la conexión se cae) en la sección 3.
- **Alias de Vercel:** con Root Directory bien configurado, `git push` auto-actualiza `caaa-app.vercel.app`. Si alguna vez sale 404 en todo, un deploy se apoderó del alias; restaurar con `vercel alias set <deploy-bueno> caaa-app.vercel.app --scope caaa`.
- **BOM en config.js:** definir variables de entorno desde PowerShell puede colar un BOM. Ya blindado en `generate-config.mjs`. Si el login falla, revisar `https://caaa-app.vercel.app/config.js` (API_URL debe empezar con `h`, no con un char invisible).
- **PowerShell here-strings (`@'...'@`) rompen `git commit -m`.** Usar `git commit -F <archivo>` (escribir el mensaje a un archivo temporal y commitear con `-F`).
- **Mensajes de commit:** terminar con `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- **`toTime()` en `alumnoWbController.js`** solo acepta `HH:MM[:SS]`; valores inválidos → null (evita `invalid input syntax for type time`).
- **El clasificador de auto-mode** bloquea: push a `master`, deploys, borrar `.git`, `CREATE INDEX`, migraciones de esquema. Pedir autorización o usar alternativas no destructivas.
- **Fecha del sistema avanza** entre sesiones → re-correr `reubicar_vuelos_semana_actual.sql` si los vuelos de prueba no aparecen.
- **Columna de fecha del vuelo:** la canónica es `vuelo.fecha_vuelo` (NO existe `vuelo.fecha`). Cuidado al copiar queries del módulo contabilidad.
- **Modelo de aeronave vs tarifa:** `aeronave.modelo` usa códigos (`CESSNA-152`, `TOMAHAWK`, `CHEROKEE`, `ARROW`); las tarifas se vinculan por `aeronave_tarifa.id_aeronave` (no por texto de modelo). El cargo automático al cerrar un vuelo busca tarifa por `id_aeronave` con fallback al texto de modelo.

---

## 11. Estado actual / pendientes

**Funcionando en producción:** login, dashboard admin (mantenimiento, perfiles, alumnos, cancelaciones), ADMIN puede agendar vuelos, proyección + ticker de TURNO, dashboard alumno + horario, dashboard instructor (marcar vuelos, reportes, checklists), loadsheet completo (alumno edita/envía, instructor ve en lectura con PDF).

**Módulo Administración/Contabilidad (sesión 2026-06-01):** barrido de los GET → todos 200.
Corregidos dos bugs que lo rompían: (1) `v.fecha`→`v.fecha_vuelo` (nómina 500 + cargo
automático a cuenta corriente fallaba en silencio al cerrar vuelos), (2) match de tarifa
por texto de modelo → ahora por `id_aeronave` (UI de Tarifas usa selector de aeronave;
`emitirFacturaVueloDentroTx` busca por id con fallback). Desplegado (commit d4e44b5).
Backfill `backfill_tarifa_id_aeronave.sql` ya ejecutado (tarifas existentes vinculadas).

**Plan "enrobustecer administración"** (`~/.claude/plans/los-siguientes-cambios-que-federated-quilt.md`):
3 fases — (1) Cuenta+Tarifas → (2) Ficha de alumno → (3) Aula Virtual. Decisiones: archivos en
**Supabase Storage**; extracurricular = facturación + prioridad de agenda; notificaciones in-app + correo después.
- **Fase 1A+1B (facturación) HECHO y desplegado** (commit d32713a, migración 20260601000001):
  `movimiento_cuenta.nota` (columna entre H.T. y Debe), tipo `CARGO_MULTA` (multa no-show, sin horas),
  `vuelo.es_extracurricular` (cobra a tarifa pero NO suma a horas de licencia ni avance de curso).
  Botón "Multa (no-show)" en CuentaDetalle. Tarifa de simulador se da de alta por `id_aeronave`.
- **Fase 1B (agenda extracurricular) HECHO y desplegado** (commits 198ed27 + 2f98fb3,
  migración 20260601000002): el agendado es **100% manual** (no hay algoritmo de prioridad), así
  que "prioridad menor" = reglas duras + marca visual. Extracurriculares no cuentan al límite
  semanal, usan cualquier aeronave, y solo se habilitan al alumno cuando completó sus horas de
  licencia (`agendarController.alumnoCompletoHorasLicencia`). Creables por alumno (pestaña
  "Extracurricular" en Agendar, gated por endpoint `GET /agendar/extracurricular-info`) y por
  staff (checkbox en `Programacion/AgendarVuelo`). Insignia "EXC" en `AdminCalendar`. La migración
  además **reparó deriva** de `solicitud_vuelo` (faltaban tipo_vuelo, id_bloque_fin, id_instructor,
  estado, que el código ya usaba → el guardado de solicitudes desde la app estaba roto).
  **FASE 1 COMPLETA.**
- **Fase 2 (ficha de alumno consolidada) HECHO y desplegado** (commits 83a57b4 + d7dc3c9,
  migración 20260601000003 contratos): nueva página `/administracion/alumnos/:id_alumno`
  (`AlumnoFicha.jsx`, acceso "Ficha" desde Cuentas) con tabs **Perfil** (admin edita teléfono,
  licencia, certificado médico, seguro, límites, soleado vía `PUT /administracion/alumnos/:id` →
  `adminUsuarioController.actualizarAlumnoFull`), **Documentos/contratos** y **Cuenta** (enlace al
  extracto). **Archivos en Supabase Storage** (`utils/storage.js`, bucket `documentos-alumno`):
  `documentosController.subirDocumento` sube el buffer (multer en memoria) y
  `GET /documentos/:id/archivo-url` da URL firmada. Env en Railway: `SUPABASE_URL` +
  `SUPABASE_SERVICE_KEY` (⚠️ la service key se compartió en chat — conviene rotarla en Supabase).
  Buckets en Supabase: `documentos-alumno` (pdf/jpeg/png, usado), `caaa-archivos`, etc.
  **FASE 2 COMPLETA.**
- **Fase 3 (Aula Virtual tipo Moodle) HECHO y desplegado** (commits 053fa61, 931906d, f0c9252,
  cf96aaa, 7eb3040; migraciones 20260601000004–8). Por incrementos:
  - **Exámenes internos vs AAC**: `evaluacion.origen` (INTERNO/AAC). Al aprobar el FINAL interno →
    `inscripcion_curso.listo_para_comite` + banner al alumno. Vista alumno separa notas AAC.
  - **Material por unidad**: tabla `material_unidad`, subida a Storage (`caaa-archivos`), URL firmada.
  - **Asistencia**: `sesion_clase` + `asistencia_alumno` (instructor pasa lista; precarga PRESENTE).
  - **Página de instructor** `/instructor/aula-virtual` (`pages/Instructor/AulaVirtual.jsx`, link en
    Header): material + calificar + asistencia. Reusa endpoints `/administracion/aula/*` (AULA_READ/WRITE
    incluyen INSTRUCTOR; ALUMNO en AULA_VIEW para material).
  - **Notificaciones in-app**: tabla `notificacion`, `utils/notificaciones.js`, `/api/notificaciones`,
    componente `NotificationBell` (campana en Header y en topbar de AdministracionLayout). Aviso al
    aprobar el FINAL. Correo pendiente de SMTP.
  - **Pago de teoría**: `curso.pago_teoria_instructor_usd` (monto fijo por curso, editable en Cursos) +
    `pago_teoria_pendiente`. Al aprobar el FINAL se genera pago al instructor del examen; la nómina lo
    suma a `monto_teorico` y lo marca PAGADO al pagar el periodo.
  **FASE 3 COMPLETA — plan "enrobustecer administración" terminado.**
  Nota: para probar el aula con datos reales falta sembrar inscripciones de alumnos demo a un curso
  (`inscripcion_curso` + `inscripcion_curso_avance`); hoy los alumnos demo no están inscritos.

**Sesión 2026-06-03 — Consolidación "Contabilidad" + módulo "Usuarios" + nómina dual + historiales.**
Migraciones nuevas del módulo admin: `legacy/CAA-backend/migrations/006`, `007`, `008` (las tres
**aplicadas en prod**). Estas migraciones numeradas se corren con `node run-sql.js "migrations/00X_*.sql"`.

- **Contabilidad consolidada** (`CAA-frontend/src/pages/Administracion/Contabilidad.jsx`): una sola
  pestaña con sub-navegación **Ingresos (Recibos|Facturas) · Egresos · Nómina · Tarifas**. El sidebar
  (`AdministracionSidebar.jsx`) ya NO tiene Recibos/Facturas/Tarifas/Egresos/Nómina sueltos: hay un solo
  ítem **Contabilidad**. Las rutas viejas `/administracion/{recibos,facturas,tarifas,egresos,nomina}`
  **redirigen** a `…/contabilidad?tab=…` (no romper enlaces). Las páginas viejas se embeben como paneles.

- **Módulo "Usuarios"** (ítem nuevo en sidebar; `pages/Administracion/Usuarios.jsx`,
  `controllers/administracion/usuariosController.js`, rutas `/administracion/usuarios/*`): selector
  **Alumnos | Personal**.
  - Crear **alumno**: `usuario` rol ALUMNO + ficha `alumno` (instructor+licencia) + cuenta corriente en 0.
  - Crear **personal**: `usuario` (rol configurable) + `empleado` + **login bcrypt** (debe cambiar pass al
    1er ingreso). Si el rol es INSTRUCTOR se crea su fila `instructor` (`asegurarInstructorTx`).
  - **`listPersonal` sale FROM `usuario`** (rol de personal), NO FROM `empleado` — así aparecen los
    instructores sembrados (u6 Ricardo, u8 Alfredo) que no tienen fila `empleado`. `empleado` es extensión
    opcional de nómina. Editar/reset-password operan por **`id_usuario`**.
  - **Asignar/reasignar alumnos a instructores** desde ambos lados: edición del instructor (Usuarios) y
    selector "Instructor asignado" en la ficha del alumno (`AlumnoFicha` → Perfil; `actualizarAlumnoFull`
    ahora acepta `id_instructor`). `alumno.id_instructor` es NOT NULL → "desasignar" = reasignar a otro.

- **Nómina dual** (migración 006, `utils/deducciones.js`): **dos planillas separadas**:
  `nomina_periodo.tipo_planilla` = **PLANTA** (mensual fijo → ISR por tramos + ISSS 3% tope $30 + AFP 6.25%)
  o **SERVICIOS** (10% retención). Columnas en `nomina_detalle`: bruto/isr/isss/afp/retencion (total=neto).
  `nomina_detalle.id_instructor` ahora nullable + `id_empleado`. Selector booleano
  `instructor_tarifa.es_servicios_profesionales` y tabla `empleado` (personal admin) deciden la planilla.
  ISR oficial El Salvador (verificado: sueldo $1000 → ISR $63.30, ISSS $30, AFP $62.50).

- **Aula virtual por instructor** (migración 008, tabla `instructor_curso`): el instructor puede tener
  cursos asignados (checkboxes en su edición); `aulaVirtualController.listCursos` le muestra solo esos
  (si no tiene ninguno → todos, retrocompat). Admin/Administración ven todos.

- **Desacople vuelo ↔ factura (IMPORTANTE)**: el cierre de vuelo del instructor ya **NO crea factura
  formal** — solo **debita la cuenta corriente** (`movimiento_cuenta` tipo `CARGO_VUELO`) y avanza el curso.
  `facturasController.emitirFacturaVueloDentroTx` → renombrada **`cargarVueloACuentaDentroTx`** (sin
  factura/correlativo); `instructorReporteController` usa `cargoAutomatico.id_alumno`/`.saldo_resultante`.
  **Modelo de negocio = saldo prepagado**: el alumno deposita (recibo) y se le va debitando por vuelos,
  cursos teóricos, etc. Conceptos: **Recibo = DEPÓSITO (haber, +saldo)** vs **Factura = CARGO (debe,
  -saldo)**; ambos escriben en `movimiento_cuenta`. Las facturas quedan como documentos fiscales que se
  emiten **manualmente** (`emitirManual`, ~30/mes). ⚠️ `emitirManual` TODAVÍA debita (`CARGO_OTRO`);
  pendiente decidir si debe ser puro documento sin tocar saldo.

- **Egresos**: 19 categorías (CHECK ampliado en migración 007): + Repuestos, Honorarios, Servicios básicos,
  Alquiler, Hangar, Impuestos, Seguros, Tasas AAC, Publicidad, Viáticos, Capacitación, Bancario.

- **Historiales por persona** (solo lectura; endpoints `/usuarios/instructores/:id/historial` y
  `/usuarios/alumnos/:id/historial`):
  - **Instructor** (en su edición): horas instruidas, clases dadas (`sesion_clase`), exámenes creados
    (`evaluacion`), pago de teoría (pagado/pendiente) + tabla de planillas (`nomina_detalle`+`nomina_periodo`).
  - **Alumno** (pestaña "Historial" en `AlumnoFicha`): bitácora de vuelos (`reporte_vuelo`), cursos
    (`inscripcion_curso`), exámenes/notas (`evaluacion_alumno`), facturas y recibos.

- **Sistema de referencia de nómina**: `C:\Users\Daniel\Desktop\Gestión ML` (Next.js+Prisma, centro
  cultural El Molino). De ahí se portó la tabla de ISR (`src/lib/planillas/deducciones.ts`). NO se copió
  código (stacks distintos), solo la lógica.

**Pendiente / siguiente (sesión 2026-06-03):**
- **Reportes generales (fase 2 de historiales)**: horas voladas por aeronave/mes/instructor, cursos
  completados del año, historial global de planillas pagadas por periodo y tipo. (El usuario pidió empezar
  por los historiales por persona, ya hechos.)
- **Botón "crear acceso"** para personal sin login (empleados creados por la pestaña vieja Tarifas →
  Empleados, que tienen `empleado` pero no `usuario`).
- **Decisión factura manual**: ¿`emitirManual` deja de debitar el saldo (puro documento fiscal)? Los cargos
  manuales al saldo ya existen vía `cuentaController.cargoManual`.
- **Rotar `SUPABASE_SERVICE_KEY`**: la service role key se compartió en el chat al configurarla.
  Cuando el usuario la rote en Supabase, actualizar la variable en Railway (`railway variables --set`)
  y redeployar.
- **Sembrar datos demo del Aula Virtual**: los alumnos demo NO están inscritos en ningún curso
  (`inscripcion_curso` vacío para ellos), así que el aula se ve vacía. Para probar de extremo a extremo
  (material/asistencia/exámenes/pago de teoría) hay que sembrar una inscripción + `inscripcion_curso_avance`
  + `unidad_teorica`. El usuario aún no lo pidió.
- **Configurar SMTP** (`MAIL_ENABLED` + credenciales) si se quiere correo real: notificación de examen
  final aprobado y envío del loadsheet. Hoy todo funciona in-app sin correo.
- **Observaciones del instructor sobre el loadsheet** (el instructor escribe comentarios que el alumno ve).
  Aún no implementado.
- Seguir probando módulos no ejercitados → si aparece deriva de esquema, arreglar con el proceso de la sección 6.
- `PLAN_IMPLEMENTACION.md` es el plan original (referencia histórica).

---

## 12. Sesión 2026-06-04 — Rediseño visual integral (DESPLEGADO) + fixes funcionales

**TODO esto ya está en `master` y en producción** (Vercel auto-deploy del frontend;
backend por `railway up` cuando aplica; la migración 009 ya corrió contra Supabase).

### Rediseño visual "aviónica de precisión" (white-label) — desplegado
- **Identidad nueva** en `CAA-frontend/src/styles/tokens.css` (fuente única, OKLCH):
  navy CAAA + **rojo del logo como acento temeable** (`--academy-accent-h/c`, una variable
  por academia) + verde éxito + semánticos. Retirados Exo 2 / Outfit → **Inter** (UI) +
  **JetBrains Mono** (datos). `index.css` es shim: `--primary/--secondary` legacy → tokens.
- **Reglas** (ver `DESIGN.md` y `PRODUCT.md` en la **raíz del repo**, contexto de la skill
  `/impeccable`): **botón primario navy**, destructivo **rojo en contorno**, positivo **verde**;
  rojo acento ≤10% (nav/tab activa marcada con indicador rojo, "en vivo", alertas). Sin
  side-stripes, sin gradientes en headers, sin glassmorphism, sin emojis (→ Bootstrap Icons),
  tablas con `tabular-nums`.
- **Alcance:** TODO el front (Login, Alumno, Instructor, Programación, Turno, Admin,
  Administración, modales, widgets, loadsheet) + la **Proyección** (que al principio se excluyó
  y luego se rediseñó a pedido del usuario, ver abajo).
- **Galería de capturas:** `design-mockups/final/index.html` (34 capturas por rol).

### Acceso ADMIN = super-usuario (admin + administración) — desplegado
- Backend: `administracionRoutes.js` → `WRITE_ROLES = ["ADMINISTRACION","ADMIN"]` (antes ADMIN
  solo leía). `ProtectedAdministracion` ya permitía ADMIN. Requirió `railway up`.
- Nav: `AdminSidebar` tiene ítem **"Administración"** → `/administracion/dashboard`;
  `AdministracionSidebar` muestra **"Panel del sistema"** → `/admin` (solo si rol ADMIN).

### Layout dashboards (menos scroll) — desplegado
- **Alumno** (`pages/Alumno/Dashboard.css`): sidebar (METAR/operaciones) **sticky**, cards compactas.
- **Instructor** (`pages/Instructor/Dashboard.*`): "Reportes" + "Mis alumnos" lado a lado (2 col);
  tarjetas de vuelo **compactas** + columnas `minmax(280px) auto-fit` → los días caben en una fila.

### Proyección / Operaciones (modo oscuro) — rediseñada y desplegada
- Los widgets compartidos (MetarWidget, EstadoFlota, Mantenimiento) salían **blancos** sobre el
  tablero: fix = **scope de paleta oscura en `.pp`** (sobreescribe `--c-surface/-ink/-line` y, para
  que las píldoras no se vean pastel, también los **semánticos `-50/-100/-700`** a translúcido+brillante).
- **Cabe sin scroll**: se compactaron flota/mantenimiento, se recuperó altura del header
  (`--pp-header-h`), se ocultó "Próximos vuelos" (redundante con la tabla) y el METAR **codificado**
  (ya está en la topbar). El METAR **decodificado** sí se conserva en el sidebar.
- **Tiempo real arreglado** (`PaginaProgramacion.jsx`): la proyección es vista pasiva y dependía 100%
  del socket, que tras el proxy de Railway no entregaba eventos confiables → ahora **refresco
  periódico cada 20s** (red de seguridad: refleja agendados/estados en ≤20s aunque el socket falle) +
  socket **`transports: ["polling","websocket"]`** (recomendado tras proxies) + `reconnectionAttempts: Infinity`.

### Fix funcional: el instructor no podía avanzar etapas de vuelo (migración 009)
- Causa: `vuelo_estado_check` no incluía `EN_PROGRESO` (ver sección 6). Migración 009 aplicada.
- La **barra de progreso "buggeada"** era síntoma: el vuelo quedaba clavado en SALIDA_HANGAR.

### Andamiaje DEV-only que vive en el repo (revisar/quitar si molesta, no afecta prod)
- `CAA-frontend/capture.mjs`, `capture-all.mjs`, `gen-index.mjs` (Playwright; `playwright` ya **NO**
  está en devDependencies — reinstalar si se quieren correr). `.claude/launch.json` (dev server).
- **Pipeline de capturas con datos reales sin CORS:** proxy de Vite (`vite.config.js`) → Railway +
  `public/config.js` con `API_URL: "http://localhost:5179"`. En `master` quedó **sin** proxy y con la
  URL de prod (limpio); para volver a capturar, re-agregar el proxy + config localhost (ver memoria
  `ui-capture-pipeline`). Login local vía API: `fetch('/api/auth/login')` con el proxy; en prod usar
  la URL absoluta de Railway (CORS permite el origen de Vercel).

**Pendiente / siguiente:**
- Si el usuario quiere, aplicar el mismo **refresco periódico** al dashboard de **Turno** (también
  vista pasiva). Confirmar si el socket en tiempo real ya entrega bien tras el cambio a polling-first.
- Theming por academia: el sistema ya es white-label (cambiar `--academy-accent-h/c` + logo);
  falta, si se vende a otra academia, exponer ese cambio (config por tenant).
- Revisar si hay **más deriva de constraints** al ejercitar estados nuevos (mismo patrón que 009).

---

## 13. Sesión 2026-06-08 — Data real, /perfil, logo oficial, Planillas v2, estilo Core Admin

**IMPORTANTE — DEPLOY PENDIENTE.** Todo esto está commiteado en `master` pero (salvo que
el usuario ya lo haya hecho) **falta desplegar**:
```powershell
cd "C:\Users\Daniel\Desktop\CAAA modulo op+admin\legacy\CAA-backend"; railway up --detach   # backend (Planillas v2 + endpoints self)
cd "C:\Users\Daniel\Desktop\CAAA modulo op+admin"; git push origin master                    # frontend (Vercel)
```
La migración **010 ya corrió** en Supabase. El backend del límite-instructor y de `/perfil`
(endpoints self) también requieren `railway up`. Commits de la sesión (en orden):
`1c51def` límites instructor · `f435c54` shell unificado · `24fc843` /perfil ficha ·
`baeebdb` login bg · `f6e8418` logo oficial · `ce81102` Usuarios colapsable ·
`08b6959` Usuarios modal centrado · `f2424c9` Planillas v2 · `dba3f2d` estilo Core Admin ·
`688081c` isotipo favicon/in-app.

### Data real cargada (producción)
- Desde `C:\Users\Daniel\Downloads\SALDOS 2026.xlsx` (hoja `REPORTE SALDOS ACTIVOS 2026`,
  col "Saldos al 01 de Junio de 2026") se cargaron **17 instructores + 80 alumnos** reales con su
  **saldo de cuenta corriente** (movimiento `AJUSTE_HABER/DEBE` "Saldo inicial migrado", 01-jun-2026;
  total $324,629.14). Script reutilizable: `legacy/CAA-backend/seed_alumnos_reales.js` (gitignored);
  roster + credenciales en `_roster.json` / `_credenciales_carga.csv` (gitignored, PII).
- **Usuarios** = `nombre.apellido` (sin tildes); colisiones con sufijo (`julio.santillana2`).
  **Contraseña inicial de todos: `caaa2026`** (must_change_password). Licencias nuevas sembradas:
  Bimotor (id nivel 4), Instructor (nivel 5). "Julio Santillana" se fusionó en una sola cuenta de
  instructor (se descartó su saldo de $1758 como alumno).

### Instructor edita el límite base de vuelos de sus alumnos
- `PATCH /instructor/alumnos/:id_alumno/limites` (actualiza `alumno.limite_vuelos_avion/simulador`,
  verifica pertenencia, 0-6). En el dashboard del instructor el editor ya no depende de "semana próxima".

### Shell unificado del ADMIN — 3 secciones (base del módulo Taller)
- `AdminSidebar.jsx` reorganizado en **Operaciones · Administración · Taller**. **Solo ADMIN** ve las 3.
  `AdministracionLayoutAuto.jsx` hace el layout role-aware en `/administracion/*` (ADMIN → shell unificado;
  ADMINISTRACION → su sidebar). `/admin/agendar` renderiza el calendario de programación embebido
  (`DashboardProgramacion embedded`) sin perder sidebar. Stubs `/admin/perfiles` y `/admin/alumnos`
  eliminados (redirigen a `/administracion/*`).
- **TALLER = placeholder "Próximamente"** en `AdminSidebar.jsx` (sección sin rutas todavía). Es lo que
  sigue: ver "Próxima sesión: módulo Taller" abajo.

### /perfil enriquecido (solo lectura) — alumno e instructor (por pestañas)
- Alumno: Cuenta(editable) · Datos de vuelo(editable+lectura) · Documentos · Cuenta corriente · Historial.
- Instructor: Cuenta · Datos y nómina(lectura) · Historial (incl. planillas con **Recibo PDF + Firmar**).
- Endpoints self nuevos: `/alumno/mi-historial`, `/alumno/mis-documentos/:id/archivo-url`,
  `/instructor/mi-ficha`, `/instructor/mi-historial`, `/instructor/recibo/:idDet(+/firmar)`.

### Branding
- **Login** (`public/login-bg.jpg`): foto de avioneta al atardecer en el panel izquierdo (anclada a la
  derecha, degradado navy). El login conserva el **logo con letras** (emblema en chip blanco + "CAAA").
- **Logo oficial CAAA** en toda la app + PDFs: `public/logo-caaa.png` (completo), `logo-caaa-mark.png`
  (emblema), `src/assets/logoCaaa.js` (base64 para pdfmake), `legacy/CAA-backend/assets/*` (PDFKit).
- **Isotipo** (`Isotipo-en-positivo--CAAA-.png`, blanco/transparente) → **favicon** (`favicon-caaa.png`,
  blanco sobre cuadro navy) y **logos in-app**: topbars navy usan `iso-caaa-white.png`; Header/Footer
  (claros) usan `iso-caaa-navy.png` (recoloreado). El login NO usa el isotipo.

### Usuarios — modal de edición de personal
- Secciones del instructor (alumnos/asignar/cursos/historial) ahora **colapsables** (cerradas por
  defecto) + buscador en "asignar otros". El editor abre como **modal centrado** (no salta arriba).

### Planillas v2 (réplica del módulo de Kinetic) — migración 010
- **`config_fiscal`** (versionable por `vigente_desde`): ISSS emp/patrono + tope, AFP emp/patrono + tope,
  tramos ISR en JSONB, retención servicios. Sembrada con la **tabla oficial El Salvador** (ISSS 3% tope
  $1000, AFP 7.25%, ISR 17.67/60/288.57, servicios 10%). **ISR sobre base = bruto − ISSS − AFP.**
- `nomina_periodo` += anio, mes, config_snapshot, fecha/motivo/anulado_por; estado admite **ANULADA**.
  `nomina_detalle` += isss_patrono, afp_patrono, costo_patronal, user_snapshot, firmado_en/ip.
- `nominaController`: get/update config fiscal; **generación por MES** (anio+mes, evita duplicados);
  **costo patronal**; aprobar congela snapshot; **anular** (revierte egreso + teoría si estaba PAGADA);
  **PDF de planilla** (apaisado) y **recibo individual** (`utils/pdfGenerator.js`).
- Frontend `Nomina.jsx`: config fiscal editable (tramos ISR), selector Mes/Año, etiqueta "Mayo 2026",
  estado ANULADA, costo patronal, botones Anular/PDF/Recibo. El instructor firma su recibo desde `/perfil`.

### Estilo "Core Admin" + GUÍA DE DISEÑO (seguir en lo nuevo, incl. Taller)
- Referencia guardada en **`design-mockups/admin-ui-reference/`** (HTML + README) y resumen en
  **`DESIGN.md`**. Look: tarjetas con sombra suave, acordeones con chip de ícono + animación, tablas
  tenues con badges píldora, **botones de solo ícono** (`.adf-icon-btn`), notas azules (`.adf-note`),
  modales limpios. Utilidades en `AdministracionLayout.css` (clases `adf-*`).

---

## 14. Módulo **Taller** — ✅ HECHO (Fase 1), ver sección 15

> **Esta sección era el plan; el módulo Taller ya se construyó y desplegó en la sesión 2026-06-12.**
> El detalle de lo implementado está en la **sección 15**. Lo de abajo queda como referencia histórica del plan.

**Estado original (planeación):** la sección "Taller" existía como **placeholder "Próximamente"** en el sidebar unificado del
ADMIN (`CAA-frontend/src/components/AdminSidebar/AdminSidebar.jsx`, arreglo `secciones[].Taller`). No
tiene rutas ni páginas todavía.

**Qué falta (a definir con el usuario):**
- Definir las interfaces del taller (probablemente: órdenes de trabajo / mantenimiento de aeronaves,
  inventario de repuestos, bitácora del hangar, programación de revisiones 50/100HR, etc.).
- Ya existe lógica relacionada: `mantenimiento_aeronave` (50/100HR automáticos por TAC, ver
  `utils/aeronaveUtils.js`), `horas_vuelo_aeronave`, `mantenimiento_bloque`, y el dashboard admin de
  Mantenimiento (`pages/Admin/Mantenimiento.jsx`). El módulo Taller probablemente consolida/expande eso.
- **Seguir el estilo "Core Admin"** (sección 13 / `design-mockups/admin-ui-reference/`): clases `adf-*`,
  tarjetas suaves, acordeones, botones de ícono, modales centrados limpios.
- Rutas nuevas irían bajo el shell unificado (sección Taller del `AdminSidebar`); usar
  `AdministracionLayoutAuto`/`AdminLayout` según corresponda, o rutas `/admin/taller/*` con `AdminLayout`.

**Antes de empezar:** confirmar con el usuario el alcance exacto de las pantallas del taller.

---

## 15. Sesión 2026-06-12 — Taller, reporte de Turno, contabilidad, robapantallas, extranjeros

**TODO desplegado en producción** (master + `railway up` + migraciones 011–015 corridas). Para retomar:
**lo que sigue son PRUEBAS de usuario** (ver lista al final). Commits clave en orden:
`06579a9`/`1418f5a`/`4b6ab37`/`d1357ad`/`69da29d` (Taller) · `f202734`/`ac34269` (reporte Turno) ·
`903070a` (contab.) · `1cf07ac`/`675e8b0` (robapantallas) · `0fb1434`/`88817c3` (extranjeros).

### A. Módulo Taller (mantenimiento / aeronavegabilidad) — Fase 1, rol TALLER nuevo
- **Rol `TALLER`** (mecánico): `usuario_rol_check` ampliado (mig 011), `roleMiddleware.VALID_ROLES` +
  `usuariosController.ROLES_PERSONAL`. ADMIN es super-usuario (mismo patrón que ADMINISTRACION).
  `ProtectedTaller` + `TallerLayout`/`TallerSidebar`/`TallerLayoutAuto` (reusan shell `adf-*`). Login y
  `Perfil.goDashboard` → `/taller/dashboard`. Sidebar ADMIN: sección Taller con Dashboard/Aeronavegabilidad/
  Mantenimiento/Inventario. Usuario de prueba **`u_taller` / `demo123`** (sección 7).
- **Backend**: `routes/tallerRoutes.js` (`/api/taller`, roles `["TALLER","ADMIN"]`), `controllers/taller/*`
  (componente, seguimiento, inventario, dashboard). **Tablas** (mig 011): `taller_componente` (célula/motor/
  hélice, horas por offset de instalación), `taller_tarea_programada` (INSPECCION/AD/SB/VIDA_LIMITE por
  horas·ciclos·calendario), `taller_cumplimiento`, `taller_repuesto`, `taller_movimiento_inventario` (kardex).
- **Seguimiento programado**: estado VIGENTE/PROXIMO/VENCIDO derivado; "Cumplir" reinicia el reloj
  (proxima_* = ultima + intervalo). Páginas `pages/Taller/{TallerDashboard,Aeronavegabilidad,Inventario}.jsx`.
- **Inventario**: movimientos entrada/salida/ajuste; consumo (SALIDA) crea **egreso** categoría REPUESTOS
  (enlazado por `id_egreso`). ⚠️ bug arreglado: `$4::numeric` en UPDATE de stock (could not determine type).
- **Taller = FUENTE ÚNICA del ciclo de inspecciones** (mig 012): `aeronave.horas_proxima_revision` y
  `horas_ultima_revision` son **cache** sincronizado desde la inspección 50/100h más próxima del Taller, vía
  `aeronaveUtils.syncProximaRevisionAeronave` (se llama al cerrar vuelo y al cumplir/crear/editar tareas). Así
  el tablero **/mantenimiento** y los **widgets de Proyección** reflejan el Taller sin cambiar sus queries.
  La **barra de progreso** mide `(acum − ultima)/(proxima − ultima)` (antes `acum/proxima`, daba % erróneo).
  Seed `supabase/dump/seed_taller_inspecciones_flota.sql` (50/100h por aeronave + sync) y
  `seed_taller_demo.sql` (aeronave 1: componentes + tareas con AD vencida/anual + repuestos).
- **Historial de mantenimientos** por aeronave: `GET /taller/aeronaves/:id/historial` + tarjeta "Últimos
  mantenimientos realizados" en Aeronavegabilidad; toast al cumplir muestra el nuevo vencimiento.
- **Pendiente del Taller**: la pantalla Mantenimiento operativa (iniciar/completar) sigue en `/api/admin` →
  solo ADMIN; para que un TALLER puro la opere habría que exponerla bajo `/api/taller`. Fases 2 (órdenes de
  trabajo + squawks + MEL) y 3 (libros del avión firmados con PDF) **no hechas**.

### B. Reporte de cierre del día de TURNO — "Vuelos por avión" (PDF)
- Réplica del formato Sistekk `rptcaVuelos` (`C:\Users\Daniel\Downloads\vuelos 03 de junio de 2026.pdf`):
  vuelos **COMPLETADOS** del día agrupados por aeronave (tac/hobbs inicial-final-horas, monto devengado,
  instructor) + subtotales + gran total. `generarReporteVuelosDiaPDF` en `utils/pdfGenerator.js` (apaisado).
- `GET /api/turno/reporte-vuelos-dia?fecha=YYYY-MM-DD` (default hoy SV), roles **TURNO/ADMIN/ADMINISTRACION**.
  Monto = `movimiento_cuenta` CARGO_VUELO no anulado del vuelo; excluye inasistencias.
- Acceso: botón "Reporte del día" en el dashboard de **Turno**, y tarjeta "Vuelos por avión" en
  **Administración → Reportes** (mismo PDF). Es su "reporte de ventas" para debitar saldos.

### C. Contabilidad — egresos, conceptos de cobro, datos fiscales (mig 013)
- **3 egresos nuevos**: `GASTOS_FINANCIEROS`, `IMPUESTOS_TRIBUTARIOS`, `GASTOS_NO_DEDUCIBLES` (CHECK
  `egreso_categoria_check` ampliado + etiquetas en `Egresos.jsx`).
- **Catálogo de conceptos de cobro** (tabla `concepto_cobro`, configurable): sembrado "Reposición de examen"
  $60. CRUD en **Contabilidad → Ingresos → Conceptos de cobro** (`ConceptosCobro.jsx`,
  `conceptoCobroController.js`). Cobro desde la cuenta del alumno (`CuentaDetalle` panel "Cobrar concepto"
  → `cuentaController.cobrarConcepto`) que debita el saldo prepagado (movimiento `CARGO_OTRO` enlazado por
  `movimiento_cuenta.id_concepto_cobro`).
- **Datos fiscales** en `usuario`: `dui`, `direccion`, `telefono` (mig 013, backfill telefono desde alumno).

### D. Robapantallas de primer login (mig 014) — alumnos e instructores
- Modal **bloqueante** (`ConfirmDataModal` + `ForcePasswordChange` ahora renderiza modal en vez de redirigir)
  en el primer login: confirman **nombre/apellido/correo/teléfono + DUI/dirección** (+ contraseña/correo
  inicial). `usuario.datos_confirmados`; authController calcula `must_confirm_data` (rol ALUMNO/INSTRUCTOR &&
  !datos_confirmados) y lo mete en `must_complete_profile`. Endpoint `PUT /usuario/confirmar-datos` (permitido
  durante el bloqueo en `authMiddleware`). Personal (admin) que cae por contraseña/correo ve modo reducido.
- **Se retiró** el gate viejo de documentos de vuelo del alumno (licencia/médico/seguro) del bloqueo; queda
  como recordatorio en /perfil.
- ⚠️ **Lección**: un controller `async` SIN try/catch que lanza → *unhandled rejection* → `server.js` hace
  `process.exit` → **backend en loop de caída**. Pasó con `confirmarDatos` (+ `$2 IS NOT NULL` tipo ambiguo).
  **Siempre** try/catch en controllers nuevos y castear params que puedan llegar NULL.

### E. Alumnos extranjeros (mig 015)
- `usuario.es_extranjero` / `pasaporte` / `nacionalidad`. **Tag azul "Extranjero"** junto al nombre en la
  lista de Alumnos. Toggle "extranjero" → muestra **pasaporte + nacionalidad** en vez de DUI (facturar
  extranjeros en El Salvador). Configurable desde **3 lugares que escriben las mismas columnas de `usuario`**
  (quedan consistentes/precargados): (1) expand "Ver datos fiscales" en la lista (`Cuentas.jsx`), (2) sección
  "Datos fiscales / facturación" en la **Ficha del alumno** Perfil (`AlumnoFicha.jsx` →
  `adminUsuarioController.actualizarAlumnoFull` que ahora también actualiza `usuario`), (3) el robapantallas
  (toggle "Soy extranjero"). Pendiente opcional: selector tipo-documento DTE + NIT.

### Notas de despliegue de esta sesión
- **Migraciones se corren ANTES del `railway up`** cuando el código nuevo ya lee las columnas (si no, el
  backend crashea). Verificación E2E contra prod con scripts `node` (fetch a la URL de Railway, login con
  usuarios demo) — patrón muy útil para validar sin UI.
- Datos demo de prueba quedaron sembrados (Carlos Quevedo con cargo $60 y datos fiscales; alumnos 2/3 y
  Daniel Aguilar marcados extranjeros). Inocuos, editables/anulables desde la UI.

### 🔬 PRUEBAS PENDIENTES (próxima sesión)
1. **Taller**: login `u_taller`; en Aeronavegabilidad cumplir la inspección 50h de YS-334-PE y ver que la
   barra de /mantenimiento se reinicia; probar inventario (entrada/salida + egreso REPUESTOS); ver el
   historial de mantenimientos. ADMIN (`u1`) ve Taller desde el sidebar.
2. **Reporte Turno**: `u9` → "Reporte del día" (probar fecha 8/4/2026 que tiene vuelos); y desde
   Administración → Reportes.
3. **Contabilidad**: crear egreso con las 3 categorías nuevas; en Conceptos de cobro agregar uno; cobrarlo a
   un alumno y ver que baja su saldo.
4. **Robapantallas**: entrar con `u5`/`u7`/`u8` (sin confirmar) y verificar que el modal bloquea hasta
   confirmar; un extranjero con toggle "Soy extranjero" (pasaporte en vez de DUI).
5. **Extranjeros**: marcar/desmarcar desde la Ficha y desde "Ver datos fiscales"; ver el tag azul y la
   consistencia entre ambas vistas.

---

## 16. Sesión 2026-07-06 — PDF P&L, coherencia Tarifas↔Usuarios, buscador, fixes Proyección, carga semana real

**Frontend desplegado a `master` (Vercel auto). Backend PENDIENTE `railway up`** (cambió `pdfGenerator.js`,
`reportesController.js`, `administracionRoutes.js`, `usuariosController.js`):
```powershell
cd "C:\Users\Daniel\Desktop\CAAA modulo op+admin\legacy\CAA-backend"; railway up --detach
```

### A. PDF "Estado de Resultados" (P&L) configurable
- El botón de **Administración → Reportes** que "no hacía nada" ahora genera un PDF. Endpoint
  `GET /administracion/reportes/pyl-pdf?desde&hasta&mensual&categorias`; `generarPyLPDF` en
  `utils/pdfGenerator.js` (header CAAA, 4 KPI-cards, tabla ingresos-por-mes + tabla egresos-por-categoría,
  **ambas opcionales** vía checkboxes en la UI). UI en `pages/Administracion/Reportes.jsx` (rango fechas +
  checkboxes); `abrirPyLPDF` en `services/administracionApi.js` (blob→window.open).
- ⚠️ 2 bugs corregidos: (a) `date_trunc` en node-postgres devuelve **objeto `Date`**, no string → `.split`
  rompía con 500 (fix: `d instanceof Date ? d.toISOString() : String(d)`); (b) título largo se superponía
  en el header → título corto `"P & L"` + subtítulo "ESTADO DE RESULTADOS" centrado.
- **Los otros 3 botones de exportar (Excel Ingresos, Excel Egresos, PDF Estado-de-cuentas) siguen siendo
  placeholders SIN acción** — pendientes de implementar.

### B. Coherencia Tarifas ↔ Usuarios (personal unificado)
- Antes **Contabilidad→Tarifas→Empleados** leía la tabla `empleado` standalone y **Usuarios→Personal** leía
  `usuario` LEFT JOIN `empleado` → dos universos. Ahora Tarifas→Empleados usa `getUsuariosPersonal()`
  (MISMO origen), se quitó el botón "Nuevo empleado" (solo se crean desde Usuarios), y editar solo toca
  campos de nómina. Backend: `usuariosController.editarPersonal` hace **UPSERT** de `empleado` (si no tiene
  ficha la crea al guardar). Sin ficha → badge "Sin configurar".

### C. Buscador en Usuarios
- Input client-side en ambos tabs de `pages/Administracion/Usuarios.jsx`: Alumnos (nombre/apellido/usuario/
  instructor) y Personal (nombre/apellido/usuario/rol/cargo).

### D. Proyección — fix EN_PROGRESO falso + widget "Próximo Bloque"
- **Bug raíz** (`pages/Proyeccion/PaginaProgramacion.jsx`): `getEstadoDinamico()` sobreescribía el estado
  real de la BD calculando `EN_VUELO` por la hora del reloj → vuelos solo PROGRAMADO se veían "en progreso"
  en el widget. Ahora devuelve SIEMPRE `v.estado` (solo instructor/turno avanza el estado manualmente).
- **Nuevo widget "Próximo Bloque"** entre "Vuelos en Curso" y el Schedule: detecta el siguiente bloque del
  día que aún no inició y lista sus vuelos. CSS `.pp__tbl-badge--programado`.
- ⚠️ **Casi-incidente:** al quitar el arg de `getEstadoDinamico` borré de más el `useMemo` de
  `proximosVuelos` que el sidebar seguía usando → **pantalla en blanco** (ReferenceError). Restaurado.
  **Lección: al borrar un useMemo, grep sus usos primero.**

### E. Carga del programa semanal 22-27 jun 2026 (semana 6) — "a la fuerza" para pruebas E2E
Meta de Daniel: cargar la programación real de la semana (hoy en Excel) para probar la plataforma antes de
que la próxima semana ya programen desde la web.
- **Fuente autoritativa:** `C:\Users\Daniel\Downloads\PROGRAMA DE VUELO DEL 22 AL 27 DE JUNIO 2026.xlsx`
  (hoja PROGRAMA). Leer con **openpyxl** (`python -c "import openpyxl..."`) — **no hay módulo `xlsx` en
  node**; **WebFetch NO sirve** para Google Sheets (solo devuelve el título).
- **Estructura:** col A=horario, B=aeronave; días en tríos de columnas (Lun C/D/E … Sáb R/S/T) =
  Alumno/Instructor/Status. Filas por bloque (6:00→blk1 … 17:20→blk9, alineados con `bloque_horario`) y
  dentro de cada bloque una fila por aeronave.
- **Abreviaturas = inicial + apellido, PERO muchas usan 2º nombre / 2º apellido** (típico SV): A.ZAVALA=
  Angeline, G.MENA=Gisell, S.SANTA CRUZ=Santiago, F.GUILLEN=Francisco, L.VANEGAS/K.CASTANEDA/G.MIJANGOS=2º
  apellido, S.FLORES=Samuel. `V.PERRZ`=Victor Perez (typo). `S.ALVARENGA`=el alumno "S. Alvarado".
- **Correcciones BD:** matrícula `YS-270-P`→`YS-270-PE`; **BATD II = SIM-1 (id 5)**; YS-155-PE/YS-259-P/
  YS-04-P **ya no existen** → se OMITEN.
- **4 alumnos nuevos** (pass inicial `caaa2026`): `f.melgar`=90, `r.echegoyen`=91, `s.alvarado`=92,
  `v.valencia`=93 (creados solo con inicial+apellido; Daniel edita luego).
- **OMITIDOS** (requieren fichas/decisión): instructores tomando **recurrente/refresh** (L.Rodas,
  J.Santillana, J.Burgos, E.Artiga, F.Abarca, J.Hernandez, G.Murillo — sin ficha `alumno`) y **E.Roeder en
  YS-259-P** (instructor no está en sistema + avión inexistente).
- **SQL final:** `supabase/migrations/20260624000004_semana_22jun_completa.sql` (idempotente: DELETE vuelos
  sem6 + publica semana 6 + 112 INSERT hardcodeados; cancelados con `estado='CANCELADO'`) + 1 INSERT suelto
  de S.Alvarado (Vie 14:50) = **113 vuelos**. Daniel los corre en el editor de Supabase. `vuelo` requiere
  `creado_por` NOT NULL ∈ {ALUMNO,PROGRAMACION,ADMIN} → usar `'PROGRAMACION'`.
- **Lección carga masiva:** un INSERT malo aborta TODA la transacción ("current transaction is aborted") y
  arrastra los demás. Para cargas grandes: generar SQL con IDs verificados (`node query.js` para confirmar
  alumnos/matrícula/vuelos previos) y correrlo en el editor de Supabase; o SAVEPOINTs por fila.

### 🔬 PRUEBAS/PENDIENTES (próxima sesión)
1. Confirmar que Daniel corrió el SQL de la semana + el INSERT de S.Alvarado, y que hizo `railway up`.
2. **Pruebas E2E de la semana cargada:** loadsheets, reportes post-vuelo, descuento de saldos, reporte
   "Vuelos por avión", contabilidad — el objetivo central de la carga.
3. Implementar los 3 botones de export que faltan en Reportes (Excel Ingresos, Excel Egresos, PDF Estado
   de cuentas alumnos).
4. Decidir si se cargan los vuelos de instructores-recurrentes / E.Roeder (crear fichas de alumno u omitir
   definitivo).

---

## 17. Sesión 2026-07-10 — Fixes de operación (semana futura, ticker, rate-limit login), drop uq_slot, editar usuarios

**7 commits en `master`** (`c94532c..edc8e44`). Frontend auto-desplegado (Vercel).
**⚠️ DEPLOY DE BACKEND PENDIENTE:** Daniel redesplegó una vez (tras `9ae595b`), pero los últimos commits de
backend (`4727358`, `516cf25`, `edc8e44`) **muy probablemente NO están vivos** → al retomar, `railway up`
desde `legacy/CAA-backend`. Commits en orden: `73a23fb`/`9ae595b` (semana futura) · `f128648` (ticker) ·
`4727358` (mensajes agendar) · `516cf25` (rate-limit login) · `ba8e49a` (migración drop uq_slot) ·
`edc8e44` (editar usuarios).

### A. Semana futura automática (arregla "Semana no encontrada" al agendar)
- **Bug:** al guardar una solicitud, `agendarController.guardarSolicitud` busca `semana_vuelo` con
  `fecha_inicio > CURRENT_DATE`; si no existe → 400 **"Semana no encontrada"**. Esa semana siguiente solo se
  creaba como **efecto secundario de publicar** una semana (`publicarSemana`). Si nadie publicaba, se rompía.
- **Fix:** `utils/adminHelpers.js` → `asegurarProximaSemanaDisponible()` corre **al arrancar el server y
  1×/día** (`server.js`, patrón como el poller de METAR). **Rellena en bucle** (tope 60) semanas hasta que
  exista una con `fecha_inicio > hoy` — cubre el caso de que la última semana esté varias semanas ATRÁS.
  `crearSemanaFutura()` extraída y reusada por el endpoint manual `POST /admin/asegurar-semana-futura`.
  Alineación al lunes: BD vacía → lunes actual (atrás); con datos → próximo lunes (adelante, evita solape).

### B. Ticker de avisos de Turno expiraba casi al instante
- **Bug:** `turnoController.publicarTicker` calculaba `expira_en` contra el **bloque horario ACTIVO**; un aviso
  publicado cerca del fin de su bloque quedaba con expiración a segundos y nunca llegaba a mostrarse en el
  ticker de Proyección (rota 1 mensaje cada 15-90s). El de "OPERACIONES SUSPENDIDAS" nunca falló porque se
  inserta con `expira_en=NULL`.
- **Fix:** expira al fin del **último bloque del día** (`ORDER BY hora_fin DESC LIMIT 1`), con
  `GREATEST(..., NOW()+2h)` por si se publica fuera de horario.

### C. Mensajes de error claros al guardar solicitud de vuelo
- `agendarController.guardarSolicitud`: aeronave fuera de licencia → **400** con motivo; violación de unicidad
  `23505` → **409**. Antes todo caía en el genérico "Error al guardar solicitud" (500).

### D. 🚨 EMERGENCIA: el rate-limit de login bloqueaba a TODA la escuela
- **Síntoma:** todos los logins (incl. `u1`, sin cambiar contraseña) daban "credenciales inválidas".
- **Diagnóstico (patrón útil):** `curl /api/health` → `ok:true` (DB viva) + `curl -X POST /api/auth/login` →
  **HTTP 429** "Demasiadas peticiones". No era ni BD ni contraseñas.
- **Causa raíz:** `routes/authRoutes.js` limitaba **10 req/IP/15min contando éxitos Y fallos**; como la escuela
  comparte una IP pública (NAT), unos pocos ingresos legítimos bloqueaban a toda la red.
- **Fix:** `skipSuccessfulRequests: true` (solo cuentan los FALLIDOS) + `max: 50`. La protección de fuerza
  bruta por-cuenta (5 fallos → bloqueo 3 min en `authController`) queda intacta. **Desbloqueo inmediato =
  reiniciar backend** (el contador vive en memoria) o esperar 15 min.
- **Lección:** rate-limit por IP contando éxitos es tóxico con IP compartida; siempre `skipSuccessfulRequests`.

### E. Drop `uq_slot` de solicitud_vuelo (permitir solicitudes encimadas)
- Migración `supabase/migrations/20260710000001_drop_uq_slot_solicitud.sql` (**ya corrida en prod por Daniel**):
  quita el índice único `(id_semana,dia_semana,id_bloque,id_aeronave)` que impedía que **dos alumnos** pidieran
  la misma aeronave/hora — bloqueo que contradecía el flujo de diseño "solicitar encimado → programación
  resuelve" (al alumno `getBloquesOcupados` solo le muestra SUS bloques; a programación le muestra todo).
  `publicarSemana` (adminVueloController) sigue **contando conflictos y negándose a publicar** si hay
  duplicados sin resolver (red de seguridad). Ningún `ON CONFLICT` dependía de `uq_slot`.

### F. Admin puede editar nombre de usuario y correo de los usuarios
- **Backend** `usuariosController`: `editarPersonal` ahora acepta `username`; nuevo endpoint
  `PATCH /administracion/usuarios/alumnos/:id_alumno` = `editarAlumnoCuenta` (username/correo/nombre/apellido
  de la fila `usuario` del alumno). Username se guarda **en minúsculas + trim** (coincide con el login que usa
  `LOWER()`); `23505` → 409 "ese nombre de usuario ya existe". Ruta en `administracionRoutes.js`. Acceso
  **ADMIN + ADMINISTRACION** (acceso actual del módulo).
- **Frontend** `pages/Administracion/Usuarios.jsx`: pestaña Personal → campo "Usuario (login)" en el modal de
  edición; pestaña Alumnos → botón **"Editar"** por fila con modal usuario/correo/nombre/apellido. El correo
  ya se editaba a nivel de API (personal vía `editarPersonal`, alumno vía ficha `actualizarAlumnoFull`); ahora
  queda expuesto también en la lista de Alumnos. Servicio `editarUsuarioAlumno` en `administracionApi.js`.
- Cambiar el username **no cierra la sesión** del usuario (login valida por id + `session_id`, no por texto).

### G. Pendiente que Daniel pidió — configurar envío de correo (Outlook / Microsoft 365)
- `utils/mailer.js` **ya es SMTP genérico** (nodemailer, fuerza IPv4 por Railway), con `MAIL_ENABLED=false` hoy
  → todo sale como `[MAIL-SILENCED]`. El miedo de que Railway bloquee SMTP es real solo para el **puerto 25**,
  no 587/465. El problema típico con M365 institucional es que **Microsoft desactiva Basic Auth SMTP por
  defecto** (requiere que un admin habilite SMTP AUTH por buzón).
- **Recomendación acordada: usar un servicio transaccional (Resend/Brevo)** en vez de Outlook directo — no toca
  código, solo env vars en Railway: `MAIL_HOST=smtp.resend.com`, `MAIL_PORT=587`, `MAIL_USER=resend`,
  `MAIL_PASSWORD=<api key>`, `MAIL_FROM=notificaciones@<subdominio>`, `MAIL_ENABLED=true`. **Falta que Daniel dé
  el dominio de su correo y dónde administra el DNS** para los registros SPF/DKIM exactos (usar un **subdominio
  dedicado** para no arriesgar el DNS de recepción de M365).

### Nota: `SAAS_BLUEPRINT.md` (documento SaaS de 25 secciones)
Se generó un documento técnico exhaustivo (~19k palabras, 25 secciones) para fusionar CAAA en una plataforma
SaaS modular (resumen ejecutivo, arquitectura, módulos, modelos de datos, APIs, componentes reutilizables,
módulos SaaS candidatos, casos de uso, limitaciones, evolución), con 7 agentes de investigación en paralelo.
**No quedó commiteado** (existe solo en el transcript de la sesión). Regenerar/commitear si se quiere conservar.

---

## 18. Sesión 2026-07-11 — Flujo instructor→programación, tipos de instructor, agendar desde calendario, cancelaciones, teoría, responsive, fixes UX y STAND-BY

**Rama `claude/focused-lederberg-90ed0b` (worktree), 9 commits `022909d..68c6a27` sobre master. NO
fusionada. Migraciones 016-019 YA aplicadas a Supabase por Claude (aditivas + 1 ensanche de CHECK; el
backend viejo las tolera).** Deploy pendiente (Daniel): fusionar rama a master + `git push` (Vercel
frontend) + `railway up --detach` desde `legacy/CAA-backend`. Verificación E2E hecha contra Supabase con
backend local (junction de node_modules + copia de .env al worktree, `PORT=5099 node server.js`, scripts).

### Tipos de instructor + capacidad programación (mig 016)
`instructor.es_instructor_vuelo / es_instructor_teoria / puede_programar` (existentes con ambos tipos en
true). **`utils/capacidades.js`** = fuente única de gates, **respaldados en BD** (aplican sin re-login;
tokens viejos no otorgan de más). `requireCapacidad(roles, cap)` reemplaza roleMiddleware en `/admin`;
`aulaInstructorGate` (es_instructor_teoria) en `/administracion/aula/*`. JWT (login+refresh) expone los
flags (solo UX). Toggles en Usuarios. **PROGRAMACION deja de ser solo un rol**: un instructor con
`puede_programar` entra al calendario/publica.

### Flujo alumno → instructor → programación (mig 017)
`solicitud_semana += comentario_alumno / enviada_instructor_en / enviada_por`; **EN_REVISION** = "enviada
a programación por el instructor" (candadea al alumno). **`services/solicitudService.js`** centraliza
validación de conflictos (aparcar→validar→colocar) e inserción aditiva (un INSERT, NO delete-all).
Endpoints `/instructor/solicitudes/*` (calendario con `es_mio`, resumen, guardar-cambios, crear, eliminar,
enviar/enviar-todas). Página **`/instructor/solicitudes`** (AdminCalendar editable solo `es_mio` + lista
de baskets con comentario y "Enviar a programación"). **Precheck de publicación** (avisa cuántas van sin
revisión; nunca bloquea). **FIX bug latente**: `publicarSemana` ya NO publica filas RECHAZADA/CANCELADA
(conteo/CTE/INSERT ahora filtran estado como getCalendario).

### Agendar desde el calendario del dashboard (Fase 3, sin migración)
Click en celda vacía → **`AgendarVueloModal`** (alumno libre, instructor default cambiable, aeronave con
validación de licencia salvo extracurricular, LOCAL/RUTA). `AdminCalendar.onEmptyCellClick`. Backend:
`POST /programacion/solicitudes` (semana no publicada, aditivo) y `/programacion/vuelos` (publicada, vuelo
directo con `solicitud_vuelo` de respaldo para editabilidad, `creado_por='PROGRAMACION'`, notifica).
Instructor crea para sus alumnos con `createFn`. Quitado el botón "Agendar Vuelo" del nav de programación
(ruta `/programacion/agendar` deprecada pero viva).

### Reglas de cancelación (Fase 4, sin migración)
**`services/cancelacionService.getEstadoCancelaciones`** = `{count_mes, racha_semanas,
ya_cancelo_esta_semana, proxima_tiene_multa, motivo, monto}`. **1 cancelación por semana (409)**; fix
off-by-one mensual (`>=3` → la 4ª del mes tiene multa); **racha** (4ª semana consecutiva = multa). Cobro
sigue **MANUAL** (solo marca `tiene_multa/monto/motivo`). Modal/dashboard-alumno/admin con contadores y
avisos. `getCondicionesCancelacion?id_vuelo`.

### Lado teoría (mig 018)
`sesion_clase.hora_inicio/hora_fin` → sesiones = "citas de clase". `crearSesion` fuerza `id_instructor`
del token para INSTRUCTOR (antes spoofeable). `GET /alumno/mis-clases` (cursos con inscripción activa).
Header/redirects por flags (solo-teoría → /instructor/aula-virtual; solo-vuelo no ve aula). Card "Próximas
clases" (alumno) + panel "Mis próximas clases" (instructor, `?mias=1`).

### Responsive (Fase 6, solo frontend)
`.adf-table` → `.adf-table-wrap` + red de seguridad `@media(<=1024)` (scroll horizontal de toda tabla no
envuelta; antes desbordaban). Shells AdminLayout/Sidebar colapsan a **1024** (antes 768). AdminCalendar
`isMobile` 640→**768**. **Header hamburguesa real** (dropdown ícono+etiqueta) ≤768. Modales anchos ≤640
una columna. Loadsheet `p-2 sm:p-5`.

### Fixes UX
- **Primer login móvil**: `ForcePasswordChange` ya NO excluye `/perfil` (el robapantallas aparece en
  cualquier ruta) + Login manda al dashboard en vez de `/perfil` → el modal sale de inmediato en móvil.
- **Agendar manual**: `getInstructoresActivos` filtra a `es_instructor_vuelo=true`.
- **Slots**: nombres cortos **"R.Flores"** (`LEFT(nombre,1)||'.'||split_part(apellido,' ',1)` como
  `*_nombre_corto` en los 3 calendarios; `abbrevNombre` en AdminCalendar).
- **Comentario del alumno**: **obligatorio** al agendar; visible en el **popover del vuelo** (`ss.comentario_alumno` en los 3 calendarios).

### Sistema STAND-BY / lista de espera (mig 019: `slot_standby`)
Varios alumnos piden el mismo horario (día+bloque) → uno asignado, resto **en espera** (no rechazados).
**Turno ordena** la lista (`StandbyModal` desde el popover del calendario; candidatos = quienes pidieron
ese horario). Al aceptarse una cancelación (`resolverSolicitudCancelacion` ACEPTADA) **con margen ≥6h y NO
por cierre de operaciones** (esa ruta no llama al disparador) → **oferta automática secuencial** al #1;
si rechaza o expira (**4h**, job `expirarOfertasVencidas` cada 5 min) → #2. El alumno ve card "Se liberó
un vuelo que pediste" (aceptar crea el vuelo PUBLICADO con `solicitud_vuelo` de respaldo + notifica al
instructor). `standbyController.js`; rutas `/admin/standby*` (Turno) + `/alumno/mis-ofertas` +
`/alumno/standby/:id/aceptar|rechazar`. Constantes `MARGEN_MIN_HORAS=6`, `OFERTA_VENTANA_HORAS=4`.
**Decisiones de Daniel**: automática secuencial · margen 6h · Turno ordena · notificación in-app
(correo/WhatsApp después).

### ⏸️ Instructores que vuelan con instructores (recurrentes/refresh) — NO CONSTRUIDO, definir con la escuela primero

**Qué es:** hay vuelos donde quien RECIBE la instrucción es un instructor (chequeos recurrentes,
refresh, proficiency). **Evidencia real:** en la carga del programa semanal 22-27 jun (sección 16) se
OMITIERON los vuelos de L.Rodas, J.Santillana, J.Burgos, E.Artiga, F.Abarca, J.Hernandez y G.Murillo
justamente por esto — instructores tomando recurrente SIN ficha `alumno` → el sistema no los puede
representar hoy. O sea: pasa todas las semanas y hoy esos vuelos quedan fuera de la plataforma.

**Estado (decisión de Daniel, sesión 2026-07-11):** NO modelarlo todavía. **Primero hay que
informarse bien con la escuela de cómo funciona operativamente**; con esa info se hace el brainstorm
y recién entonces se diseña. No construir nada de esto sin ese paso.

**Preguntas que responder con la escuela antes de diseñar:**
1. ¿Las horas del vuelo van a la bitácora del instructor-practicante? ¿Suman a su experiencia/licencia?
2. ¿Se cobra? ¿A quién y a qué tarifa (o es un beneficio/costo interno de la escuela)?
3. ¿El instructor que INSTRUYE cobra esas horas en nómina como horas de vuelo normales?
4. ¿Cuenta a algún curso/syllabus (recurrente estructurado con unidades) o es vuelo suelto?
5. ¿Cómo se agenda hoy en la práctica? ¿El practicante lo pide como un alumno o lo asigna programación directo?
6. ¿Lleva reporte post-vuelo / checklist / loadsheet igual que un vuelo de alumno?
7. ¿Qué frecuencia/vencimientos hay que rastrear (cada 6/12 meses, proficiency check, médico)?
8. ¿Solo instructores de la casa, o también externos (p.ej. E.Roeder, que tampoco está en el sistema)?

**Opciones de modelado ya esbozadas (elegir DESPUÉS de tener la info):**
- **(A) Vuelo entre instructores:** el `vuelo` lleva un "practicante" que es instructor (sin ficha de
  alumno), marcado tipo RECURRENTE; horas a nombre del practicante. Liviano, pero toca vuelo/reportes/
  conflictos (hoy el practicante ocuparía el campo `id_alumno`, que es FK a `alumno`).
- **(B) Ficha de alumno ligada al usuario instructor:** reusa TODO el flujo existente (solicitud,
  agenda, bitácora, cobro). Más pesado; ojo: `alumno.id_instructor` es NOT NULL y muchos gates asumen
  `rol === 'ALUMNO'` (dual-rol a revisar). Se descartó de una en la carga de junio, pero queda como opción.

### Aeronaves por licencia (`licencia_aeronave`) — corregido, Bimotor pendiente

**Corregido (migraciones `20260711000001`/`002`, ya corridas):** la distribución tenía datos
incorrectos (a un alumno de Instrumentos no le aparecía el YS-270-PE). Distribución real:
Privado → YS-333-PE/YS-334-PE/SIM-1; Instrumentos → + YS-270-PE; Comercial → + YS-127-P (las 5).
**Instructor** (4 alumnos) → las 5 aeronaves (antes tenía 0, confirmado por Daniel: "los instructor
vuelan todos").

**Bimotor (5 alumnos) queda sin ninguna aeronave, A PROPÓSITO — no es un bug.** Daniel: "los bimotor
vuelan unos de otras escuelas" (la flota de CAAA no tiene bimotor) **pero todavía le falta aclarar
cómo se manejará eso en el sistema** (¿aeronave externa registrada igual? ¿se salta el chequeo de
licencia para ellos? ¿otro flujo?). No modelar/tocar Bimotor sin esa aclaración — mismo patrón que
"instructores recurrentes": esperar información antes de diseñar.

> ✅ **RESUELTO el 2026-07-16 — este párrafo quedó obsoleto, no actuar sobre él.** La escuela dio de
> alta el **YS-259-PE (Cessna 310)** y la licencia Bimotor ahora sí tiene aeronave propia (es la única
> que la vuela). Ya no hay que "esperar información": el caso dejó de existir. Ver §22.

### Pendiente / próximo
- ~~**Bimotor**: aclarar cómo manejar alumnos que vuelan en otra escuela~~ → **resuelto** (§22).
- **Informarse con la escuela sobre recurrentes** (ver subsección anterior) → brainstorm → diseño.
- Fusionar rama + `railway up`; pruebas E2E de usuario en prod; sembrar inscripciones demo para el aula.
- Configurar correo (Resend/Brevo) sigue pendiente de sesiones anteriores.

---

## 19. Sesión 2026-07-12/13 — Combobox alumno, aeronaves por licencia, mantenimiento date-aware, cambios en semana en curso, reloj UTC, Web Push

**TODO DESPLEGADO en producción** (rama `claude/focused-lederberg-90ed0b` fusionada FF a `master`
= `origin/master`; backend con `railway up`; migraciones aplicadas en Supabase hasta
`20260713000001`). Commits clave: `8baf227` (combobox) · `50259fc`/`2b05a72` (licencia) ·
`75fdc65`/`8d72cb6` (mantenimiento) · `5a2a6ac` (cambios semana en curso) · `54b2f9c` (reloj UTC + web push).

### A. Combobox de búsqueda de alumno al agendar
- `AgendarVueloModal.jsx`: se reemplazó el input-filtro + `<select>` nativo por un **combobox de búsqueda
  activa** (aparecen opciones mientras se escribe, con navegación por teclado ↑/↓/Enter/Escape y
  click-fuera-cierra). Estado `alumnoAbierto/alumnoHighlight/alumnoBoxRef`; lista filtrada `.slice(0,50)`.

### B. Aeronaves por licencia (`licencia_aeronave`) — corregido; Bimotor pendiente
- Migraciones `20260711000001` (distribución) y `20260711000002` (instructor). Distribución real:
  Privado → YS-333-PE/YS-334-PE/SIM-1; Instrumentos → +YS-270-PE; Comercial → +YS-127-P (las 5);
  **Instructor → las 5** ("los instructor vuelan todos"). **Bimotor queda sin aeronave A PROPÓSITO**
  (vuelan en otra escuela; falta que Daniel aclare cómo manejarlo — ver §18).
- ⚠️ **Desactualizado**: el 2026-07-16 entraron 2 aviones nuevos y **Bimotor ya tiene el YS-259-PE**.
  La distribución vigente está en la tabla de la **§7** (esa es la que hay que mirar).
- ⚠️ `20260711000002` hace `INSERT ... SELECT 6, id_aeronave FROM aeronave` (Instructor → **todas**).
  **No re-ejecutarlo**: hoy le daría el bimotor a Instructor por error. Es un script de una sola vez.

### C. Mantenimiento **date-aware** (un mant. futuro ya NO bloquea todas las fechas)
- **Bug raíz:** `iniciarMantenimiento` ponía `aeronave.activa=false` incondicional → un mantenimiento
  agendado para el lunes bloqueaba agendar vuelos de CUALQUIER fecha (p.ej. el sábado siguiente).
- **Fix (nuevo `utils/mantenimientoUtils.js`):** `sincronizarEstadoFlota(conn, idAeronave?)` deriva
  `aeronave.activa/estado` según si hay mantenimiento **cubriendo CURRENT_DATE**;
  `mantenimientoCubreFechaSQL(fechaParam)` = condición reutilizable (no completado, no CANCELADO,
  `fecha_inicio<=FECHA` y (`fecha_fin IS NULL` o `fecha_fin>=FECHA`)). **Job diario + al arrancar**
  en `server.js`. La disponibilidad al agendar excluye aeronaves con mantenimiento **de esa fecha**.
- **Extras** (`adminMantenimientoController.js`): `cancelarMantenimiento` (DELETE, para los metidos por
  error) y `agregarBloquesMantenimiento` (el "Guardar cambios" del modal Gestionar daba **404**;
  inserta bloques + extiende `fecha_fin` con LEAST/GREATEST + re-sync). Migración `20260712000001`
  amplió el CHECK de `tipo` para incluir **25HR** (antes fallaba el guardado).

### D. Cambios de vuelo durante la semana EN CURSO (publicada) — 5 huecos cerrados
1. **Reserva de aeronave (uso especial sin alumno)** — migración `20260712000002`: tabla
   `reserva_aeronave` (fecha, id_bloque, id_bloque_fin, motivo TRASLADO/PRUEBA/ADMINISTRATIVO/OTRO,
   descripcion). `reservaAeronaveController.js` (listar por semana / crear con checks de conflicto vs
   vuelo y vs reserva / eliminar). En `AgendarVueloModal` modo **"uso especial"** (`permiteReserva`,
   oculta alumno/instructor, muestra motivo). Tarjeta rayada `.reserva-card` en la columna Locales del
   `AdminCalendar` con botón de borrar. La disponibilidad de aeronaves excluye reservas por fecha.
   ⚠️ **Pendiente opcional:** el selector de agenda de la PRÓXIMA semana del alumno aún NO descuenta
   reservas (solo lo hacen el picker de programación y el chequeo de vuelo directo).
2. **Rechazar vuelo publicado lo CANCELA de verdad**: `rechazarSolicitudIndividual` ahora también
   `UPDATE vuelo SET estado='CANCELADO'` (antes solo tocaba la solicitud; el vuelo seguía "vivo").
3. **Stand-by dispara oferta también en cancelación EN BLOQUE**: `cancelarSolicitud` captura
   `RETURNING id_vuelo` y llama `dispararOfertaPorCancelacion` por cada vuelo cancelado.
4. **Panel "Vuelos Cancelados" del dashboard Admin** ya no queda vacío: `getCalendario` devuelve
   array `cancelados` y los dashboards (Admin/Programación/Turno) lo pintan.
5. **Turno puede agregar un vuelo a la semana publicada**: `agendarVueloDirecto` permite TURNO
   (`if (user.rol !== "TURNO" && !(await puedeProgramar(req)))`); botón "Agendar vuelo" en el
   dashboard de Turno abre `AgendarVueloModal` en modo `pickSlot` (elige día+bloque; trae `id_semana`
   de `getCalendarioAdmin('current')`).

### E. Reloj UTC / Zulu en el dashboard de Proyección
- `PaginaProgramacion.jsx`: bajo el reloj grande local se muestra una **línea UTC** (`pp__clock-utc`,
  mono cian) — muy usada en aviación. El tick calcula ambos con `toLocaleTimeString(..., {timeZone:"UTC"})`.

### F. **Web Push** (notificaciones del navegador) a todo el staff — acciones de Turno
- **Qué es:** notificaciones nativas del sistema aunque la pestaña esté cerrada, vía Service Worker +
  Web Push API + VAPID. Funciona en web app (Android Chrome + escritorio directo; **iOS 16.4+ requiere
  "Agregar a inicio" / PWA**).
- **Backend:** `utils/webpush.js` (config VAPID desde env; `notificarStaff(payload,{excluirUid})` envía
  a todos los `usuario` activos con `rol<>'ALUMNO'` y limpia suscripciones muertas 404/410; **todo
  best-effort, envuelto en try/catch — no puede tumbar la acción ni el server**). Tabla
  `push_subscription` (migración `20260713000001`). Rutas `/api/push` (`vapid-public-key` sin auth,
  `subscribe`/`unsubscribe` con authMiddleware). Dep **`web-push`** en package.json.
- **Disparadores** (en `turnoController.js`, todos best-effort con `excluirUid`=actor): abrir/cerrar
  operaciones (`setEstadoOperaciones`), avisos del ticker (`publicarTicker`), salidas/entradas al hangar
  (`avanzarEstadoVuelo`: SALIDA_HANGAR/REGRESO_HANGAR, con lookup de aeronave+alumno).
- **Frontend:** service worker `public/sw.js` (eventos `push` + `notificationclick`); `utils/push.js`
  (registrar SW, pedir permiso, suscribir, POST a `/push/subscribe`); componente `PushToggle` en el
  **Header solo para no-alumnos** (botón campana activar/desactivar **por dispositivo**).
- **Llaves VAPID:** privada SECRETA en Railway env (`VAPID_PRIVATE_KEY`), pública servida por el backend
  (`VAPID_PUBLIC_KEY`), `VAPID_SUBJECT=mailto:danielmancia111203@gmail.com`. **Nunca commitear la
  privada** (vive solo en Railway + `.env` gitignored del worktree). Verificado en prod:
  `/api/push/vapid-public-key` → `habilitado:true`; `/sw.js` servido en Vercel.
- ⚠️ **Falta prueba real de entrega:** requiere un navegador con permiso concedido (el toggle en el
  Header) y que Turno dispare una acción. La cañería (suscribir/guardar/limpiar/best-effort) sí está
  verificada E2E contra Supabase.

### Pendiente / próximo
- **Probar el push de punta a punta** en un navegador real (activar campana con un usuario staff →
  disparar acción de Turno → ver la notificación). En iPhone hay que "Agregar a inicio" primero.
- (Opcional) Descontar **reservas** también en el selector de agenda del alumno para la semana próxima.
- Sigue pendiente de sesiones previas: **Bimotor** e **instructores recurrentes** (esperar info de la
  escuela — §18), correo transaccional (Resend/Brevo), sembrar inscripciones demo del aula, botones de
  export faltantes en Reportes.

---

## 20. Sesión 2026-07-13 (continuación) — PWA instalable, rate-limit, tripulación/almas a bordo, y una tanda grande de bugs reales en producción

**Rama `claude/focused-lederberg-90ed0b` (worktree), commits `460124d..c49f13d`.** TODO fusionado a
`master` y desplegado (Vercel + `railway up`), incluido el commit de hora de salida real — hubo una
caída de conectividad de red al final de la sesión (ver subsección G) que retrasó ese último deploy,
pero la red se recuperó y se completó (`master` en `b97941d`, merge con cambios en paralelo de Samuel
Flores — código de color por aeronave, avisos/estado-operaciones movidos arriba en el dashboard de
Alumno). Nada pendiente de desplegar de esta sesión.

### A. PWA instalable + hardening para más usuarios simultáneos
- **Ícono al agregar a inicio**: antes en iOS solo salía una letra "C" (faltaba `apple-touch-icon`). Se
  generaron íconos propios (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, fondo navy `#1B365D`,
  desde el isotipo fuente 1080×1080 en `Downloads`) + `manifest.json` + meta tags. El service worker
  (`sw.js`, ya existía para push) ahora se registra desde el arranque (`main.jsx`), no solo al activar
  push, para que Android instale en modo standalone real.
- **Rate-limit de login**: 50→200 fallos/IP/15min (la defensa real es el bloqueo por-cuenta a los 5
  fallos; el límite por IP solo frena spraying — con más alumnos entrando a la vez, 50 se agotaba con
  typos normales). Límite global de API 600→1200 req/min/IP. **Login.jsx ya no muestra siempre
  "Credenciales incorrectas"** para cualquier error — ahora distingue 429/403/401/red caída con mensajes
  específicos (antes escondía que era un rate-limit o cuenta bloqueada).

### B. Avisos de Turno visibles en dashboard de Alumno e Instructor
- Nuevo `AvisosTurnoWidget` (reusa `turnoApi.getTicker()`, ya alcanzable con sesión normal — sin cambios
  de backend). Se oculta solo si no hay avisos activos. En Alumno va en el sidebar existente; Instructor
  no tenía sidebar, se agregó una fila compacta bajo el header (`.ins__avisos`).

### C. Turno: editar tripulación de un vuelo + "almas a bordo"
- Para cuando no hay nadie de programación disponible: `PATCH /turno/vuelos/:id/tripulacion` (rol
  TURNO/ADMIN) permite reasignar alumno/instructor/aeronave de un vuelo de la semana publicada, con los
  mismos chequeos de conflicto y licencia que el agendado directo, notifica in-app a los afectados
  (viejos y nuevos) y push best-effort al staff. Nuevo modal `EditarTripulacionModal` (botón lápiz en la
  tarjeta de Turno). Migración `20260713000002`: `vuelo.almas_a_bordo` (0-10) + `vuelo.pasajeros_extra`
  (texto libre) para vuelos demo con gente que no está en el sistema.

### D. Tanda grande de bugs reales (encontrados con logs de Railway, no adivinando)
Patrón repetido varias veces: cuando el estado de vuelo se renombró de `EN_VUELO`→`EN_PROGRESO` (hace
varias sesiones), varios lugares del código **nunca se actualizaron** y seguían esperando el nombre
viejo. Cada vez que apareció, se diagnosticó leyendo `railway logs` (no por inspección de código sola) y
se confirmó contra la BD real con `query.js` antes de arreglar.

1. **`vuelo_estado_tiempo_estado_check` sin `EN_PROGRESO`** (migración `20260713000003`): cada transición
   SALIDA_HANGAR→EN_PROGRESO (botón de Turno/Instructor, y el job de auto-avance en `server.js`) fallaba
   con `violates check constraint` y hacía ROLLBACK de todo — el vuelo nunca avanzaba. Mismo patrón que
   la migración 009 (que arregló `vuelo_estado_check` pero no esta tabla hermana).
2. **TAC/HOBBS sin límite de dígitos** (pedido explícito del usuario): se quitó el tope de 4 dígitos
   (cliente) y 9999.9 (servidor) en `ReporteVueloModal.jsx`/`instructorReporteController.js`.
3. **Loadsheet: correo a casilla incorrecta + botón colgado**: `enviarLoadsheetPDF` usaba
   `MAIL_USERNAME`/`RECIPIENT_EMAIL`/`MAIL_FROM_ADDRESS` — variables que **no existen** en Railway (las
   reales son `MAIL_USER`/`MAIL_FROM`) → `to: undefined`. Además el envío de correo se `await`-eaba antes
   de responder al alumno; con SMTP lento (timeouts reales de 30-60s por IPv6 a Gmail, confirmado en
   logs) el botón "Guardar y enviar" se quedaba cargando todo ese tiempo. Fix: nombres de variable
   correctos + correo en segundo plano (best-effort, no bloquea la respuesta) + fallback a `MAIL_FROM` si
   no hay `RECIPIENT_EMAIL` dedicado. **El instructor NUNCA debe recibir el loadsheet por correo — lo
   revisa en la plataforma ("Ver Loadsheet del alumno", ya funcionaba bien); el correo es solo una
   casilla de recolección aparte.**
4. **`firmarReporteVuelo` seguía fallando tras el fix de TAC/HOBBS** (2 causas distintas, encontradas con
   logs frescos post-deploy):
   - `tipo_vuelo=""` (el instructor podía firmar sin elegir tipo de vuelo) violaba su CHECK — ahora
     validado en cliente y servidor.
   - Campos opcionales en blanco (Hobbs, combustible) se mandaban como `""` directo a columnas
     `NUMERIC` → `invalid input syntax for type numeric`. Fix: helper `blankToNull()`.
5. **Loadsheet: "numeric field overflow"** en `weight_balance.galones_combustible`/`fuel_burn`
   (`NUMERIC(6,2)`, máx 9999.99): el input de "consumo estimado" no tenía `max`. Migración
   `20260713000004` ensancha a `NUMERIC(10,2)` + validación de cordura (máx 500) en servidor y cliente.
6. **"Plan de Vuelo" (alumno) roto de origen, no algo de esta sesión**: el controller leía
   `data.reglas`/`data.hora_salida`, pero el formulario manda `reglas_vuelo`/`hora_vuelo` — nunca
   coincidieron. El `ON CONFLICT` del guardado solo tocaba `actualizado_en` (nunca actualizaba los datos
   reales en un segundo guardado). La tabla tampoco tenía columnas para nombre/licencia/domicilio de los
   2 pilotos, lugar de salida, fecha, colores, despacho, etc. que el formulario sí recolecta — se perdían
   en silencio. Migración `20260713000005` agrega esas columnas + cambia `tiempo_ruta` de `INTERVAL` a
   texto libre (el form lo trata como texto). Se reescribió `alumnoPlanVueloController.js` completo
   (guardar Y leer, mapeo explícito en ambas direcciones).
7. **Aeronave en mantenimiento desaparecía del widget "Estado de la flota" de Proyección** (reportado por
   el usuario tras poner la YS-333-PE en mantenimiento): `getEstadoFlota` filtraba `WHERE a.activa =
   true`, pero una aeronave en mantenimiento hoy tiene `activa=false` (`sincronizarEstadoFlota`) — se
   excluía del todo en vez de mostrarse con la etiqueta roja "Mantenimiento". Se quitó el filtro (la
   query ya calculaba bien `estado_actual`, solo que la fila nunca llegaba). **Ojo**: no tocar el mismo
   filtro en `getMantenimientoResumen` (ahí sí es correcto excluir lo que ya está en mantenimiento de la
   lista de "próximas revisiones") ni en `getAeronavesDisponibles` (agendado — correcto no ofrecer un
   avión en mantenimiento).
8. **Vuelos `EN_PROGRESO` se mostraban "en tierra" en el mismo widget**: el mismo patrón del punto D — la
   detección de "volando" buscaba `estado IN ('EN_VUELO','SALIDA_HANGAR','REGRESO_HANGAR')`, sin
   `EN_PROGRESO`. Agregado.

### E. Migraciones aplicadas esta sesión
Todas corridas en prod, autorizadas explícitamente por el usuario cuando el clasificador de auto-mode
las bloqueó — es la norma para cambios de esquema no 100% aditivos:
`20260713000002_vuelo_almas_a_bordo.sql` · `20260713000003_vuelo_estado_tiempo_en_progreso.sql` ·
`20260713000004_weight_balance_precision.sql` · `20260713000005_plan_vuelo_campos_faltantes.sql`.

### F. Hora de salida REAL en Proyección — DESPLEGADO
El usuario pidió que la columna "SALIDA" de la tabla "Vuelos en Curso" (Proyección) muestre la hora real
en que se tocó el botón "Salida de hangar" (timestamp de `vuelo_estado_tiempo`), no la hora programada
del bloque. `getCalendarioPublico` (`calendarioController.js`) agrega `salida_real` vía el mismo patrón
`LEFT JOIN LATERAL` a `vuelo_estado_tiempo` que ya usa `turnoController.js` para `estado_desde`.
`PaginaProgramacion.jsx` usa `formatHoraReal(v.salida_real)` en vez de `formatHora(v.hora_inicio)`, con
fallback a la hora programada si aún no hay timestamp real; el socket `vuelo_estado_changed` la fija al
instante cuando `estado === "SALIDA_HANGAR"` (sin pisarla en transiciones posteriores del mismo vuelo).
No requirió migración (usa datos que ya existían). Verificado con `query.js` contra la BD real antes de
desplegar (sin vuelos activos en ese momento, pero la consulta corrió sin error) y desplegado en
`master` `b97941d`.

### G. ⚠️ Caída de conectividad a mitad de la sesión (se resolvió sola)
Durante un tramo de la sesión, Railway/GitHub/Vercel quedaron inalcanzables desde la máquina (timeouts
repetidos, DNS resolvía bien, Google sí respondía) — se pausó el deploy del punto F y se usó el tiempo
para actualizar esta documentación. La red se recuperó ~20-30 min después y se completó el deploy
normalmente. Si vuelve a pasar: probar `curl https://github.com` y
`curl https://caaa-backend-production.up.railway.app/api/health` antes de asumir que es un bug de
código — en este caso Google respondía bien mientras GitHub/Railway/Vercel no, así que no era un corte
total de internet sino algo más específico (ruteo/ISP a esos hosts).

### H. PDF de onboarding para alumnos — pausado a medio hacer
Pedido: guía en PDF (cómo abrir la app, instalarla en el teléfono, primer login, recorrido de la
plataforma como alumno) para hacer onboarding. **Enfoque elegido**: generarlo con `pdfkit` (ya es
dependencia del backend, mismo patrón que facturas/recibos/planillas) con ilustraciones vectoriales
propias (teléfono, ícono compartir, menú de puntitos, campana) en vez de screenshots reales — el
`computer{action:"screenshot"}` del navegador de este entorno falló consistentemente (timeout) durante
toda la sesión, no es viable depender de él.

**Estado**: casi terminado, con un bug de paginación real detectado y corregido a medias.
- El script vive en el **scratchpad de la sesión** (no en el repo — se sacó a propósito de un commit
  donde se había colado sin querer): `gen_onboarding_pdf.js` — para retomar, copiarlo a
  `legacy/CAA-backend/_gen_onboarding_pdf.js` (nombre con guion bajo = ignorar en git) y correr
  `node _gen_onboarding_pdf.js` desde ahí (usa `assets/logo-caaa.png`/`logo-caaa-mark.png` del backend +
  `CAA-frontend/public/iso-caaa-white.png` para la portada oscura).
- **Contenido ya redactado y con buen diseño** (portada navy + índice + 8 secciones: abrir la app,
  instalar Android, instalar iOS, primer login, dashboard, agendar vuelos, loadsheet, notificaciones,
  perfil) con iconos vectoriales propios (check/star/warn/info dibujados a mano, sin depender de fuentes
  con glifos Unicode — eso causó un error de "No display font for Symbol" en poppler la primera vez).
- **Bug real encontrado y corregido**: el documento generaba 31 páginas en vez de ~11 porque
  `doc.switchToPage()` combinado con un listener `pageAdded` personalizado interactúa mal con pdfkit
  (termina agregando páginas fantasma con el texto del footer en tamaño de header). Se reescribió para
  dibujar header **y** footer juntos dentro del mismo handler `pageAdded` (sin `switchToPage`, sin
  `bufferPages`), usando un contador de página incremental en vez de numeración post-hoc. **Con este fix
  el documento quedó en 11 páginas, todas revisadas visualmente (convertidas a PNG con `pdftoppm` de
  poppler — instalado vía `scoop install poppler`, el `Read` tool nativo del PDF no detecta el poppler
  recién instalado por un PATH cacheado, hay que renderizar a PNG a mano y leer las imágenes) y se veían
  bien: portada, índice, las 8 secciones, iconos, callouts, todo correcto.**
- **Lo que falta**: la sesión se interrumpió para atender bugs urgentes justo después de confirmar que
  las 11 páginas se veían bien — no llegó a hacer un último `node _gen_onboarding_pdf.js` de confirmación
  final ni a decidir dónde entregar el PDF final (¿commitear a `CAA-frontend/public/` para que se pueda
  descargar desde la app? ¿solo generarlo y dárselo a Daniel directamente?). Retomar corriendo el script
  una vez más para confirmar que sigue en 11 páginas limpias, y preguntarle a Daniel dónde quiere que
  viva el PDF final.

### Pendiente / próximo
- **Terminar el PDF de onboarding** (ver sección H) — confirmar 11 páginas, decidir entrega. Es lo único
  que quedó sin cerrar de esta sesión.
- Sigue pendiente de sesiones previas: **Bimotor** e **instructores recurrentes** (esperar info de la
  escuela — §18), correo transaccional (Resend/Brevo), sembrar inscripciones demo del aula, botones de
  export faltantes en Reportes, rotar `SUPABASE_SERVICE_KEY`.

---

## 21. Sesión 2026-07-15 — Instructor-con-instructor (CHEQUEO/REFRESH), Turno adelanta vuelos, y selector "Tipo de vuelo" (NORMAL/DEMO/CHEQUEO/CHEQUEO_LINEA)

Responde al brainstorm de §18 ("instructores que vuelan con instructores") una vez que Daniel explicó
cómo funciona operativamente. Migraciones `20260713000006` y `20260714000001` aplicadas en Supabase.
Backend desplegado (`railway up`, junto con 2 fixes de Samuel — íconos PWA + zona horaria de
`vuelo_estado_tiempo`, ver más abajo). Frontend pendiente de `git push` (auto-deploy Vercel).

### A. Vuelos instructor-con-instructor: CHEQUEO vs REFRESH (migración 20260713000006)
- **Modelo:** el instructor que RECIBE instrucción (el "practicante") ocupa el slot de estudiante con una
  **ficha espejo** (`alumno.es_practicante=true`, ligada a su MISMO usuario — `alumno` tiene
  `UNIQUE(id_usuario)`, así que hay a lo sumo una por instructor). El PIC (quien instruye) va en
  `vuelo.id_instructor` normal y **siempre cobra la hora en nómina**, sea CHEQUEO o REFRESH.
- **CHEQUEO** = lo paga la escuela: no se debita ningún saldo (ni al practicante ni a nadie), pero SÍ se
  registran TAC/HOBBS, horas de la aeronave y mantenimiento como cualquier vuelo real.
- **REFRESH** = lo paga el practicante: tampoco se auto-debita (una ficha compartida no tiene saldo
  individual con sentido) — el cobro es **manual** desde Administración.
- `utils/practicanteHelper.js`: `asegurarFichaPracticante()` (crea/reutiliza la ficha espejo, licencia
  "Instructor" → las 5 aeronaves), `normalizarTipoInstruccion()`. Validación: el PIC no puede ser el
  mismo practicante. Fichas `es_practicante` se excluyen de los selectores de alumno/roster (Usuarios,
  mis-alumnos) pero SÍ aparecen en Cuentas (se facturan individualmente si es REFRESH).
- Instructor ve sus vuelos de práctica en **"Mis vuelos de práctica"** (dashboard, sección nueva) →
  `GET /instructor/mis-vuelos-practica`; desde ahí abre el loadsheet en modo edición
  (`/instructor/practica/loadsheet/:id_vuelo`, reusa `LoadsheetPage apiBase="alumno"`) y firma el reporte
  post-vuelo como estudiante (`ReporteVueloModal mode="alumno"`, mismos endpoints `/alumno/*` que ya
  admiten por pertenencia).

### B. Turno puede adelantar vuelos (sin candado de hora)
- **Problema:** si un alumno avisa de último minuto que no viene, Turno quería poder adelantar el vuelo
  de otro alumno/instructor sin esperar la hora programada del bloque — la plataforma bloqueaba
  "SALIDA_HANGAR" antes de la hora del bloque.
- **Fix:** se quitó el candado de hora programada; en su lugar, la única restricción real es una
  **guardia de avión ocupado**: no se puede dar "salida a hangar" de un vuelo si esa MISMA aeronave ya
  está en uso (`SALIDA_HANGAR`/`EN_PROGRESO`/`REGRESO_HANGAR`) en otro vuelo — el mensaje de error dice
  con quién está ocupada. Aplicado en `turnoController.avanzarEstadoVuelo` e
  `instructorVueloController.avanzarEstadoVuelo` (mismo criterio en ambos paths). También se quitó el
  candado de hora en `instructorVueloController.registrarInasistencia`: marcar la inasistencia de un
  no-show ANTES de su hora es justo lo que libera el avión para adelantar el vuelo siguiente.
- **Flujo real:** si se va a adelantar el vuelo de otro alumno usando el avión de quien no viene, primero
  hay que marcar la inasistencia del que no viene (libera el avión) y recién ahí dar salida al adelantado.

### C. Selector "Tipo de vuelo" en Programación + columna en Proyección (migración 20260714000001)
Pedido explícito de Daniel: al agendar (además de alumno/instructor/avión) poder elegir el **tipo de
vuelo**, con 4 opciones — y que ese tipo se vea en una columna nueva del dashboard de Proyección.
- **`vuelo.categoria`** (NORMAL/DEMO/CHEQUEO/CHEQUEO_LINEA, default NORMAL) + `solicitud_vuelo.categoria`
  (mismo CHECK). `vuelo.nombre_externo`/`solicitud_vuelo.nombre_externo` (texto libre, para DEMO).
  `alumno.es_externo` marca una **ficha placeholder única y compartida** (`sistema.externo`, sembrada por
  la migración, `activo=false` ⇒ nunca puede loguear) — a diferencia de `es_practicante` (una ficha POR
  instructor, sí facturable), `es_externo` es UNA sola fila reusada por TODOS los vuelos DEMO y **nunca
  se factura contra ella** (comisionaría saldos de personas distintas); se excluye de Usuarios, roster de
  instructor y **también de Cuentas** (no es una cuenta real).
- **NORMAL**: alumno real, precarga su propia licencia (como siempre).
- **DEMO**: pasajero externo no registrado — usa la ficha placeholder, campo opcional "nombre del
  pasajero" solo de referencia, **sin auto-cargo** (se factura manual con esos datos). Como la ficha es
  compartida, se agregó `saltarConflictoAlumno` en `assertSlotLibre`/`conflicto()` para que DOS vuelos
  DEMO simultáneos (aviones distintos) no choquen entre sí por "el alumno ya tiene un vuelo".
- **CHEQUEO**: alumno real, pero se puede elegir una **licencia a chequear** (selector nuevo,
  `GET /admin/licencias` + `GET /admin/licencias/:id/aeronaves`) que filtra las aeronaves disponibles —
  no tiene que ser la licencia propia del alumno. Sin licencia elegida, cae a la licencia propia (mismo
  comportamiento que NORMAL). Se factura y suma horas de licencia **igual que NORMAL**.
- **CHEQUEO_LINEA**: es la categoría del punto A (instructor-con-instructor); el sub-tipo CHEQUEO/REFRESH
  vive en `tipo_instruccion` como antes. Sin auto-cargo, sin horas de licencia.
- **Resolver compartido** (`utils/practicanteHelper.js` → `resolverVueloEspecial()`): centraliza para las
  4 categorías la resolución de `id_alumno` efectivo + si hay que saltar el chequeo de conflicto de
  alumno, usado tanto por `solicitudService.insertarSolicitudVuelo` (semana NO publicada) como por
  `programacionController.agendarVueloDirecto` (semana publicada) — **antes del punto 1 de limitaciones**
  CHEQUEO_LINEA solo funcionaba en semana publicada; ahora funciona en ambos paths por igual.
  `adminVueloController.publicarSemana` (el INSERT...SELECT que copia `solicitud_vuelo`→`vuelo` al
  publicar) ahora también copia `categoria`/`nombre_externo`/`tipo_instruccion` — antes ni siquiera
  copiaba `tipo_instruccion`, así que un CHEQUEO_LINEA armado en la semana no publicada perdía su tipo al
  publicar.
- **Facturación/horas** (`instructorReporteController.firmarReporteVuelo`): el gate de auto-cobro y de
  suma de horas de licencia pasó de mirar `tipo_instruccion` a mirar `categoria`
  (`DEMO`/`CHEQUEO_LINEA` → sin auto-cobro ni horas; `NORMAL`/`CHEQUEO` → igual que siempre).
- **Proyección** (`PaginaProgramacion.jsx`): columna/badge "TIPO" en las tablas "Vuelos en Curso" /
  "Próximo Bloque" y en las tarjetas del Schedule (`categoriaMeta()`, CSS `.pp__tipo-badge`), incluye
  indicador "Ruta" aparte (`tipo_vuelo`, ortogonal a categoría). `getCalendarioPublico` agrega
  `categoria`/`tipo_vuelo`/`tipo_instruccion`/`nombre_externo` al SELECT.
- **Modal de agendar** (`AgendarVueloModal.jsx`): el viejo checkbox "instructor-con-instructor" se
  reemplazó por un `<select>` "Tipo de vuelo" con las 4 opciones, disponible en semana publicada Y no
  publicada (antes CHEQUEO_LINEA solo se ofrecía si `publicada`). Oculto para el instructor (`createFn`,
  su propio calendario de solicitudes) — esas categorías especiales requieren criterio de staff.
- **Verificado E2E** contra Supabase real con una semana "throwaway" muy lejos en el futuro (no
  interfiere con la semana real que usan alumnos/staff): las 4 categorías, el no-choque de dos DEMO
  simultáneos, el override/fallback de licencia en CHEQUEO, el rechazo PIC==practicante, la copia
  correcta en `publicarSemana`, y la tabla de verdad del gating de facturación/horas — 10/10 checks,
  limpieza total al terminar (semana y filas de prueba borradas).

### D. Housekeeping de deploy — merge viejo a medias + 2 commits de Samuel
Al retomar la sesión, el repo principal (`master`, fuera del worktree) tenía un **merge sin terminar**
de una sesión anterior (conflictos ya resueltos, faltaba el `git commit`) — el commit que fusionaba
(`3b350fd`) ya estaba contenido en `origin/master` de todos modos, así que abortarlo no perdió nada.
Mientras tanto Samuel había pusheado 2 commits nuevos a `origin/master`: fix de íconos PWA (canal alfa) y
**fix de zona horaria en `vuelo_estado_tiempo.registrado_en`** (salía con 6h de desfase en la columna
SALIDA de Proyección — `timestamp without time zone` + `SET timezone='America/El_Salvador'` en la
conexión). Se abortó el merge viejo, se hizo fast-forward de `master` a `origin/master`, y se corrió
`railway up` desde ahí — **ya desplegado**.

### Pendiente / próximo
- ~~`git push` del frontend + `railway up` del backend~~ → **ya desplegado** (durante la sesión del
  2026-07-16; ver §22). Todo lo de este §21 está vivo en producción.
- Los pendientes de sesiones previas se consolidaron en **§24 "Pendientes vigentes"** — mirar ahí,
  no esta lista (aquí quedaba desactualizada).

---

## 22. Sesión 2026-07-16 — Vouchera "horas a cobrar", simulador operable, ciclo del día de Turno, módulo Aeronaves, 2 aviones nuevos (Bimotor resuelto)

**✅ TODO DESPLEGADO Y VERIFICADO.** `master` = `origin/master` = **`a60a024`**; `railway up` corrió a las
**14:59**, 8 min DESPUÉS del último commit (14:51) ⇒ el backend tiene todo. Migraciones `20260714000001`,
`20260716000001` (×2), `20260716000002` y `20260716000003` **aplicadas en Supabase** (verificado con
`node query.js` contra la BD real, no asumido). Sesión a 4 manos con **Samuel Flores** en paralelo.

⚠️ **LO ÚNICO SIN COMMITEAR:** `supabase/migrations/20260716000003_tarifa_simulador_unificada.sql` está
**aplicado en prod pero untracked en git** (§22.H). Commitearlo o el repo queda con un hueco en el historial.

### A. Vouchera: "horas a cobrar" que digita el instructor (mig `20260716000002`)
`reporte_vuelo.horas_cobradas NUMERIC(5,2)` **nullable** (aditiva). Antes el cobro salía del tacómetro, pero al
alumno se le cobran estimaciones subjetivas que no coinciden con el TAC. **Decisión de Daniel — quién alimenta qué:**

| Consumidor | Fuente | Por qué |
|---|---|---|
| Horas del **AVIÓN** (`aeronave.horas_acumuladas` → dispara mant. 50/100h) | **TAC** | el motor corrió lo que corrió |
| Horas de **LICENCIA** del alumno (`alumno.horas_acumuladas`) | **`horas_cobradas`** | se le acredita lo que se le cobra |
| **COBRO** al saldo | **`horas_cobradas`** | × `tarifa_hora_usd` |

- `instructorReporteController.firmarReporteVuelo` (~línea 353): `horas_cobradas ?? (tac_llegada − tac_salida)`.
  **Fallback a TAC si viene NULL** ⇒ ningún reporte viejo queda sin cobrar.
- ⚠️ El valor se pasa a `cargarVueloACuentaDentroTx` en un parámetro **todavía llamado `tacometro`** (no se
  renombró): adentro maneja `total`, `movimiento_cuenta.horas_vuelo` y el texto del cargo. **Ya no es el TAC.**
- ⚠️ **Asimetría de validación:** el servidor exige `horas_cobradas` **solo si `SIMULADOR`**; para avión real
  solo valida si viene (`<=0` → 400, `>24` → "¿te faltó el punto decimal?"). El cliente la exige en ambos ⇒ un
  cliente que no sea la UI puede omitirla y caer al TAC en silencio. `es_inasistencia` la fuerza a NULL.

### B. Simulador operable: Iniciar/Finalizar sesión (Samuel `043f2c5`)
Antes CUALQUIER cambio de estado con `aeronave.tipo='SIMULADOR'` se rechazaba (400 "Los simuladores no permiten
cambios de estado"). Ahora hay un **mapa de estados paralelo**: `NEXT_ESTADO_SIM = {PUBLICADO|PROGRAMADO →
EN_PROGRESO, EN_PROGRESO → COMPLETADO}` (`turnoController.js`) y `NEXT_ESTADO_INSTRUCTOR_SIM`
(`instructorVueloController.js`) — **se saltan** SALIDA_HANGAR / REGRESO_HANGAR / FINALIZANDO. La guardia de
"avión ocupado" se amplió al arranque del sim (409 propio). El sim **no lleva** checklist post-vuelo, ni TAC, ni
combustible, ni `tipo_vuelo` (NULL forzado), **ni suma horas de licencia ni de aeronave** — **solo cobra** (por
eso `horas_cobradas` es obligatoria ahí). El PDF titula **"VOUCHERA DE SIMULADOR"** (`reporteVueloPdf.js`).

### C. ⚠️ El merge `a60a024` — Daniel y Samuel construyeron el MISMO campo en paralelo
Caso de estudio del trabajo simultáneo: `adc2549` (Daniel) creó `horas_cobradas NUMERIC(5,2)` para **toda** la
flota; `043f2c5` (Samuel) creó `horas_cobrar NUMERIC(10,2)` **solo simulador**, con su propia migración
`20260716000002_reporte_vuelo_horas_cobrar.sql`. Resolución: base de Samuel + decisiones de Daniel →
**`horas_cobradas`** en los 4 archivos (0 referencias a `horas_cobrar`), **la migración de Samuel se borró** (su
columna nunca llegó a la BD; la de Daniel sí), cobro por `horas_cobradas` para toda la flota con fallback a TAC.
La UI quedó con el campo dentro del render loop de Samuel + TAC como `hint` inline (se descartaron la sección
"Cobro" suelta y el botón "Usar 0.8" de Daniel).

### D. Ciclo del día de TURNO (Samuel, mig `20260716000001_turno_dia.sql` — 3 tablas, aditiva)
El ciclo **normal** del día, distinto de `estado_operaciones` (la suspensión extraordinaria por clima/NOTAM, que
SÍ cancela vuelos). Tablas: **`turno_dia`** (1 fila/fecha, `estado ∈ ABIERTO|EN_PAUSA|CERRADO`), **`turno_evento`**
(bitácora append-only: APERTURA/PAUSA/REANUDACION/CAMBIO_TURNO/CIERRE) y **`turno_asistencia`** (entrada/salida
por instructor, `turno ∈ MANANA|TARDE`, `UNIQUE(fecha,turno,id_instructor)`). "Cambio de turno" **no es un
estado**: es un evento que rota la asistencia MANANA→TARDE.
- `controllers/turnoDiaController.js`; `GET /api/turno/dia` (proyeccionMiddleware) y
  `POST /api/turno/dia/{abrir,pausa,reanudar,cambio,cerrar}` (TURNO/ADMIN). Transaccionales con `FOR UPDATE`,
  409 si la transición no aplica. Fecha server-side (`AT TIME ZONE 'America/El_Salvador'`).
- **Las dos máquinas se cruzan SOLO en presentación**: `turnoController.getEstadoOperaciones` deriva
  `estado_efectivo` = `SUSPENDIDO` (si `estado_general='INACTIVO'`) → `PAUSA_TURNO` → `CERRADO_TURNO` → `ACTIVO`.
- 🚨 **Gotcha de orden de deploy:** la consulta a `turno_dia` va en try/catch; si la tabla no existe,
  `turno_estado=null` ⇒ `estado_efectivo = **CERRADO_TURNO**` (¡el fallback NO es ACTIVO!) y toda la UI dice
  "OPERACIONES CERRADAS". La migración va **antes** del `railway up`. Igual cada mañana: sin fila del día,
  Proyección dice "TURNO NO ABIERTO" hasta que Turno lo abra.
- Front: `components/TurnoDiaWidget/` (dashboard de Turno), franja `pp__turno-strip` en Proyección (solo lectura
  + chips "Cap. {nombre}"), `OperacionesWidget`/`EstadoOperacionesWidget` con 4 estados. `emitirCambio()` emite
  `turno_dia_changed` **y** `estado_operaciones_changed` (payload null ⇒ fuerza re-fetch).

### E. Mantenimiento imprevisto de aeronave desde Turno (Samuel `99f3e9d`)
`controllers/turnoMantenimientoController.js` (TURNO/ADMIN), reusa el modelo del admin (sin tablas nuevas):
`GET /api/turno/mantenimiento/flota`, `POST /api/turno/aeronaves/:id/preview-mantenimiento` (**dry-run**: lista
qué vuelos se cancelarían), `POST .../mantenimiento`, `POST .../completar-mantenimiento`. Iniciar = transacción:
inserta `mantenimiento_aeronave` CORRECTIVO/EN_CURSO + `mantenimiento_bloque` → `sincronizarEstadoFlota()` →
**cancela los vuelos afectados** (hoy por bloques; futuros dentro de `fecha_fin`) → notifica in-app a alumno e
instructor. Best-effort fuera de la tx: correo, ticker ("{codigo} FUERA DE SERVICIO POR MANTENIMIENTO...") y
push. Completar **no re-agenda** los vuelos cancelados.

### F. Módulo **Aeronaves** (CRUD real; antes solo se tocaba por SQL)
- `controllers/admin/adminAeronaveController.js`, rutas bajo **`/admin/aeronaves/registro`** — el sub-prefijo
  `registro` es a propósito: `GET /aeronaves/:id` le robaría la ruta a `/aeronaves/alertas-mantenimiento`.
  Lectura ADMIN+TALLER, escritura **solo ADMIN**.
- **Baja = lógica** (`activa=false, estado='ACTIVO'`), nunca DELETE físico (FKs por todos lados). **409** con
  `vuelos_futuros` si tiene vuelos por venir, salvo `?forzar=true`. Normalizar `estado='ACTIVO'` es obligatorio:
  si quedara en `MANTENIMIENTO`, `sincronizarEstadoFlota` la reactivaría al cerrar ese mantenimiento.
- **No editables a propósito** (cada uno tiene otro dueño): `estado` (derivado), `horas_acumuladas` (cierre de
  vuelo), `horas_*_revision` (Taller), `id_wb_plantilla` (editor de W&B, aún no existe).
- Front: `pages/Admin/Aeronaves.jsx` (`/admin/aeronaves`) + `pages/Admin/AeronaveFicha.jsx`
  (`/admin/aeronaves/:id`), sidebar sección **Taller**. **Página ADMIN-only** (`ProtectedAdmin`) aunque el
  backend deje leer a TALLER. Tabs: **Datos** (+`LicenciasCard`+Foto), **Peso y balance** (solo estado),
  **Documentos** (placeholder), **Loadsheets y vuelos** (lazy).
- **Licencias por avión**: `PUT /admin/aeronaves/registro/:id/licencias` = **reemplazo del set completo**
  (DELETE+INSERT en tx; valida todos los ids ANTES de borrar). Motivo real: como `licencia_aeronave` solo se
  tocaba por SQL, el workaround era **cambiar la licencia del ALUMNO** — que además mueve sus horas y su avance
  de curso (pasó con Roberto Flores, movido a Comercial solo para poder pedir el Arrow).
- ⚠️ `EstadoTag` chequea `MANTENIMIENTO` **antes** que `activa=false`: `activa` = "disponible HOY", no "dada de
  baja"; un avión en taller y uno retirado tienen ambos `activa=false` y se distinguen por `estado`.

### G. 2 aviones nuevos (mig `20260714000001_alta_aeronaves_155_259`) → **Bimotor RESUELTO**
`YS-155-PE` (Cherokee 140, id 6) → Instrumentos/Comercial/Instructor (**no** Privado).
`YS-259-PE` (Cessna 310, id 7) → **solo Bimotor**; a propósito **NO** a Instructor (no todos tienen habilitación
multimotor). **Esto cierra el pendiente "Bimotor sin aeronave" de §18/§19**: la licencia Bimotor ya tiene avión
propio y el caso "vuelan en otra escuela" dejó de existir.
- Ambos con **`id_wb_plantilla NULL`** a propósito (no hay datos de pesada): el avión es agendable/volable/
  reportable ya, el loadsheet avisa que aún no está y se llena a mano. Se activa solo al linkear la plantilla.
- `horas_proxima_revision=50 / '50HR'` **no NULL**: `/mantenimiento` hace `parseFloat(...).toFixed(1)` sin guarda
  y mostraría **NaN**.
- ⚠️ **PENDIENTE REAL: el Cherokee 140 NO tiene tarifa.** Al cerrar un vuelo suyo el cargo automático falla y
  **el error se traga** (`instructorReporteController` ~línea 323): el reporte cierra bien pero **no se debita
  nada**, y cargar la tarifa después **no cobra los vuelos ya cerrados**. Configurar en Contabilidad → Tarifas.
- 🚨 **NO re-ejecutar `20260711000002_licencia_instructor_todas_aeronaves.sql`**: hace
  `INSERT ... SELECT 6, id_aeronave FROM aeronave` ⇒ hoy le daría el **bimotor a Instructor** por error.

### H. Tarifa del simulador unificada (mig `20260716000003`) — **APLICADA, SIN COMMITEAR**
La vouchera de simulador **debitaba $0 en silencio**: había 3 tarifas "sin vincular" heredadas del seed
(`BATD II` $90, `BATD II Bimotor` $105, `Bimotor` $600) que solo matcheaban **por texto de modelo**, y el modelo
del SIM-1 es `SIMULADOR` ⇒ no matcheaba ninguna, y el `catch` del cargo se comía el error. **Decisión de Daniel:
los dos BATD son el mismo simulador ⇒ una sola tarifa de $90** vinculada por `id_aeronave` (la dualidad de
precios estudiante/especial se modela en otra sesión, no con 2 filas sueltas). El SQL decide solo: **retira**
(`vigente_hasta=ayer`) las que ya se usaron en `factura_detalle` y **borra** las que nunca se usaron; deja
intactas las históricas vencidas (el `BATD II` $85 de 2025). Verificado en BD: SIM-1 → `BATD II $90` (fila id 13)
y **cero filas "sin vincular"**.

### I. Agendar: el alumno ve las aeronaves en mantenimiento (`4446cab`) — 2 bugs que se tapaban
| | Antes | Ahora |
|---|---|---|
| `getAeronavesPermitidas` (picker) | `AND a.activa = true` → bloqueaba **de más**: `activa`="disponible HOY", pero el alumno pide para la semana QUE VIENE ⇒ un avión en taller **desaparecía sin explicación** | `AND NOT (a.activa=false AND a.estado='ACTIVO')` → solo excluye los **dados de baja** |
| `guardarSolicitud` | validaba **solo** licencia, **cero** chequeo de mantenimiento; el único freno era que el picker escondiera el avión | valida contra la **fecha pedida** (`mantenimientoCubreFechaSQL`) → **400** nombrando avión, fecha y regreso. **Este es ahora el gate real** |

El picker devuelve `en_mantenimiento`, `mantenimiento_hasta`, `dias_bloqueados[]` (calculado en backend con el
**mismo** criterio y semana que el gate, para que el front no rehaga fechas y derive). Los aviones en
mantenimiento salen **atenuados** con "En mantenimiento hasta el X". Neto: **con** fecha de regreso → se puede
pedir para después; **sin** fecha (`fecha_fin NULL`, caso YS-270-PE) → visible pero no pedible.
⚠️ `mantenimientoCubreFechaSQL` (`utils/mantenimientoUtils.js:61`) **hardcodea el alias `m`** ⇒ la subquery debe
llamarse `m` (por eso el LATERAL vecino se renombró `mact`; costó un `column m.completado does not exist`).

### J. Otros (Samuel salvo indicado)
- **Manual de usuario público** en `/manual` (`pages/Manual/Manual.jsx`, ~600 líneas, **sin login**, 100%
  cliente, 9 páginas por hash: portada, ciclo de vida del vuelo, y 1 por rol) + `/manual/alumno`.
  ⚠️ `/manual/alumno` es **filtro de UX, no de seguridad**: las 9 secciones se renderizan igual en el DOM y solo
  se conmutan por CSS — pero como `/manual` completo ya es público, no oculta nada que no sea accesible.
- **METAR sin fallback a MSLP** (`88f3d69`): si MSSS (Ilopango, la base) fallaba, caía **en silencio** a MSLP
  (¡otro aeropuerto!) y pisaba el cache — se veía el clima de otro aeródromo creyendo que era el propio. Ahora
  solo MSSS; si falla **se conserva el último válido** y el front marca **VENCIDO** (derivado de `fetchedAt`,
  umbral **90 min**; el backend no emite flag). ⚠️ El umbral está **duplicado** en `MetarWidget.jsx` y
  `PaginaProgramacion.jsx`.
- **Proyección**: columna **LLEGADA** (espejo de SALIDA: timestamp real de `REGRESO_HANGAR` vía LEFT JOIN
  LATERAL; **sin fallback**, muestra `—`), columna **ALMAS** (`vuelo.almas_a_bordo`, con **default de
  presentación 2** en el front cuando es NULL — no está en la BD; `pasajeros_extra` de tooltip), siglas de
  licencia en el badge Tipo (mig `20260716000001_licencia_chequeo`: `vuelo.id_licencia_chequeo`), código de color
  por matrícula, sidebar proporcional.
- **Fixes**: checklist post-vuelo **antes** del reporte (Daniel `e3e0780`) y **firmar sin marcar todos** los
  ítems (`de8ec54`); Turno **edita día/bloque** desde "Editar tripulación" (`602721a`); `agendarVueloDirecto`
  tronaba con **ReferenceError `id_licencia_chequeo`** (`21b06dd`); TAC/Hobbs con **2 decimales** conservando el
  **cero inicial**.

### 🧹 Deuda/inconsistencias detectadas (NO arregladas)
- **Docstring desactualizado**: `adminAeronaveController.js:381` dice "El único filtro extra en ambos lados es
  `aeronave.activa = true`" — cierto al escribirlo (13:33), invalidado 13 min después por `4446cab` (13:46) del
  lado del alumno. Sigue siendo cierto del lado staff (`getAeronavesPermitidasAlumno`, `getAeronavesPorLicencia`).
- **Copy desactualizado**: `AeronaveFicha.jsx:306` avisa "este avión no aparece al pedir horas porque hoy está
  fuera de servicio (en mantenimiento / dado de baja)" — la mitad "en mantenimiento" ya **no** es cierta.
- **`estado_desde`** (`turnoController.js`/`instructorVueloController.js`) lee `vuelo_estado_tiempo.registrado_en`
  con el mismo patrón que causó el desfase de 6h y **no** se envolvió en `AT TIME ZONE` (sin bug confirmado; lo
  declaró el propio Samuel en `aeab804`).
- **Licencias 5 (Bimotor) y 6 (Instructor) NO están en los seeds** (`20260527000002_seeds_catalog.sql` solo
  siembra 1/2/3): las creó `seed_alumnos_reales.js` (gitignored, §13). Una BD construida **solo** desde
  migraciones reventaría con FK al insertar `licencia_aeronave` de esas dos. Deriva de esquema conocida (§6).
- Prefijos de migración **duplicados**: dos `20260714000001_*` y dos `20260716000001_*` (nombres distintos, se
  aplican igual, pero entre pares el orden es alfabético — tenerlo presente al crear el siguiente).

---

## 23. Sesión 2026-07-16 (2ª tanda) — Scroll de Proyección, capacidades del instructor al crear, límite de vuelos POR DÍA, fix del botón de solicitudes, y reset de contraseña de alumnos

Pedidos de Daniel al cierre del día + un bug que le bloqueaba las pruebas. **Migración `20260716000004`
aplicada**. **A/B/C/D/E desplegados y verificados en producción** (backend `railway up` + frontend Vercel).

> 🚨 **Vercel dejó de auto-desplegar el 2026-07-16 ~16:19.** Desplegó los commits de Samuel de 16:01/16:11/
> 16:19 y después **nada**, pese a 2 pushes (sin builds fallidos ni encolados: no se dispara ninguno). La
> integración Git existe (el deploy de 16:19 tiene el alias `caaa-app-git-master-caaa.vercel.app`, que Vercel
> solo crea en deploys por Git) ⇒ es la entrega del webhook de su GitHub App, que **no se ve ni se arregla
> desde el CLI**: hay que mirar el dashboard (Settings → Git). **Workaround usado: `vercel --prod --scope caaa`
> manual** para los pushes `4ab562d`(17:00) y el merge con `fc8d0f8`(17:11).
>
> **Se recuperó solo, sin ninguna acción**: el push del merge `ef42a5f` (17:50, trae `95224d4` + el
> `a0c73f2` de Samuel) **nunca se desplegó a mano** — solo se corrió `railway up` para el backend — y aun
> así apareció "Ready" en el dashboard de Vercel poco después, confirmado con el bundle real servido en
> `caaa-app.vercel.app` (`index-DZVX9qH4.js`, contiene `DUENO`/`limite_vuelos_dia`/`salida_anticipada`/
> "Resetear contraseña" — o sea el trabajo de ambos, mío y de Samuel). Probablemente fue un retraso puntual
> de entrega del webhook, no una desconexión real. **Si vuelve a pasar**: mismo diagnóstico (¿tiene el
> alias `-git-`? ¿hay builds en `BUILDING`/`QUEUED`/`ERROR`? ¿cuántos deploys hoy?) antes de asumir que
> hace falta el manual.
>
> ⚠️ **Y el deploy manual falla con `ECONNRESET` si no se acota el upload.** El CLI sube **archivos locales** y
> lee `.vercelignore` (o `.gitignore` si no hay), **pero NO lee `.git/info/exclude`** — que es justo donde está
> excluido `.claude/worktrees/`. Resultado: intenta subir **los 6 worktrees (~31 MB c/u)**. Fix: `.vercelignore`
> temporal excluyendo `.claude legacy supabase design-mockups node_modules dist` (el Root Directory de Vercel es
> `CAA-frontend`, no necesita nada más), desplegar, y **borrarlo** (no commitear).

### A. La columna izquierda de Proyección ahora scrollea
⚠️ **Nombres invertidos vs. el DOM** (importante para no tocar lo que no es): lo que se ve como "los widgets
de la izquierda" es `.pp__main-col` = **columna 1** (Vuelos en Curso + Próximo Bloque + **"vuelos
programados"**). El que YA scrolleaba es `aside.pp__sidebar` = **columna 2, derecha** (METAR/flota).
- **Causa raíz**: `.pp{height:100vh;overflow:hidden}` + las 2 tarjetas de arriba con `flex:0 0 auto;
  max-height:400px` (≈848px **no encogibles**) ⇒ `.pp__schedule-card` era **el único `flex:1`** y absorbía
  TODA la compresión, colapsando a ~0 en pantallas bajas (1366×768). Su scroll interno quedaba inútil (un
  scroller dentro de una caja aplastada) y el resto lo recortaba el `overflow:hidden` del padre.
  El escape `@media(max-width:1200px){.pp{height:auto}}` va por **ancho** y el problema es de **alto** ⇒ no
  cubría el caso.
- **Fix** (solo CSS, sin tocar JSX): `.pp__main-col{overflow-y:auto;padding-right:8px}` + scrollbar espejo del
  sidebar · `.pp__schedule-card{flex:0 0 auto; min-height:420px}` (toma altura natural, deja de colapsar) ·
  `.pp__flights-list{flex:0 0 auto; overflow-y:visible}` (el dueño del scroll pasa a ser la columna; si no,
  quedaban 2 scrollbars anidados).
- **Verificado en navegador** a 1366×768: con 18 vuelos la columna scrollea (`scrollHeight` 1243 vs
  `clientHeight` 628) y **la última fila queda alcanzable** — que era justo lo que no se podía. Sin datos,
  `.pp__schedule-card` se queda en su piso de 418px y no rompe nada.

### B. Capacidades del instructor al CREAR el usuario (antes solo al editar)
**El backend ya estaba listo** — era un gap de frontend: `crearPersonal` ya leía los 3 flags del body, ya
validaba "de vuelo, de teoría o ambos" y ya los aplicaba con COALESCE tras `asegurarInstructorTx`.
- `Usuarios.jsx`: 3 keys nuevas en `EMPTY_PERSONAL` (defaults = los de la BD: **vuelo TRUE**, teoría FALSE,
  programar FALSE ⇒ antes todo instructor nuevo nacía **solo-vuelo**) + bloque "CAPACIDADES DEL INSTRUCTOR" en
  el form de alta, **gateado por `personalForm.rol === "INSTRUCTOR"`** (el modal de edición gatea por
  `editP.id_instructor`, que al crear todavía no existe) + botón deshabilitado si no marcó ninguna.
- ⚠️ `handleCrearPersonal` ahora **solo manda los flags si el rol es INSTRUCTOR**: el guard del backend se
  evalúa **sin mirar el rol**, así que mandarlos apagados para un rol administrativo daba un 400 espurio.

### C. Límite de vuelos POR DÍA configurable por alumno (mig `20260716000004`)
Daniel: *"hay alumnos a los que sí se les permite volar más de una vez por día"*. Antes el tope era **la
constante `1` hardcodeada** en `agendarController.js` y su espejo en `AgendarVuelo.jsx`.
- **`alumno.limite_vuelos_dia integer DEFAULT 1`** (aditiva). **DEFAULT 1 = la conducta actual exacta**: nadie
  cambia de comportamiento al migrar, solo se vuelve configurable lo que era constante.
- Semántica heredada del tope semanal: cuenta **solo aviones** (simuladores exentos) y los
  **extracurriculares están exentos**. Fallback `?? 1` en backend y front.
- **Sin override por semana** (los semanales sí lo tienen vía `habilitarVueloExtra`): Daniel pidió que el
  instructor lo gestione "como los vuelos por semana", o sea el límite **base** del alumno. Agregar
  `solicitud_semana.limite_vuelos_dia` después es trivial con el mismo patrón de precedencia.
- **Rango 1..6** (no 0..6 como los semanales): un tope por día de 0 bloquearía todos los días y se pisaría con
  el semanal — es un footgun, así que se rechaza con 400.
- Lo edita el instructor en **`AlumnoFila`** (`Instructor/Dashboard.jsx`), junto a Avión/Sim.; la píldora
  "N/día" solo se muestra cuando es >1 para no ensuciar la fila del caso normal.
- **Compat**: `limite_vuelos_dia` es **opcional** en `PATCH /instructor/alumnos/:id/limites` — si un cliente
  viejo no lo manda, `COALESCE($3::int, limite_vuelos_dia)` **conserva** el valor en vez de pisarlo.
- ⚠️ **La regla sigue siendo asimétrica, a propósito**: el tope vive **solo** en el flujo del ALUMNO. El path
  de staff/programación (`insertarVueloEnBasket` → `assertSlotLibre`, que es solape de horario y no conteo
  diario) **nunca tuvo tope por día** ⇒ programación ya podía poner 2 vuelos el mismo día, y se dejó así
  (Daniel pidió "que los alumnos **soliciten** más de un vuelo el mismo día"; el staff decide por criterio).
  ❓ Si alguna vez se quiere capar también al staff, hay que agregarlo explícitamente ahí.
- **Verificado E2E** con backend local (PORT=5099) contra Supabase real: sube a 2 (200) · rechaza 0 y 7 (400) ·
  **cliente viejo sin el campo conserva el valor** · `mis-alumnos` expone el campo · el alumno lo ve en
  `GET /agendar/mis-solicitudes?week=next`. Estado del alumno de prueba **restaurado a 1** al terminar.

### D. 🐛 FIX: el botón "Solicitudes de mis alumnos" no hacía NADA (bloqueaba las pruebas)
Reportado por Daniel mientras probaba el flujo *alumno pide horas → instructor las revisa*: el instructor
entra a su panel, toca **"Solicitudes de mis alumnos"** y **no se abría nada**.
- **Causa raíz** (`pages/Instructor/Dashboard.jsx`): el archivo tiene **2 componentes** — `VueloCard`
  (líneas 82-233) e `InstructorDashboard` (367-795). `const navigate = useNavigate()` estaba declarado
  **solo dentro de `VueloCard`** (línea 83), pero el botón vive en `InstructorDashboard` (línea ~588) ⇒ ahí
  `navigate` **no existía** y el onClick tiraba **`Uncaught ReferenceError: navigate is not defined`**. El
  click moría en silencio: nada de navegación, nada visible.
- **Por qué nadie lo vio antes**: un throw dentro de un handler de React va a **`window.onerror`, NO a
  `console.error`** ⇒ el panel de consola del navegador (y `read_console_messages`) **no mostraba nada**.
  Se reprodujo instalando un listener de `error` y disparando el click. La ruta, el `ProtectedInstructor`
  y la página `Solicitudes.jsx` **siempre estuvieron bien** (navegando a `/instructor/solicitudes` a mano
  la página carga perfecto) — el bug era 100% del botón.
- **Fix**: declarar `const navigate = useNavigate()` dentro de `InstructorDashboard`.
- **Verificado en navegador** (u6 → panel → click): navega a `/instructor/solicitudes`, **0 errores**, y la
  página lista las solicitudes reales en BORRADOR de los alumnos.
- **Barrido**: se escaneó todo `CAA-frontend/src` buscando el mismo patrón (un componente que usa
  `navigate()` sin declararlo, con la declaración en otro componente del mismo archivo) ⇒ **no hay más casos**.
- ⚠️ **Lección**: `navigate is not defined` en un `onClick` es **invisible en la consola de React**. Si un
  botón "no hace nada" y la consola está limpia, **no asumas que el handler no se disparó**: escuchá
  `window.onerror` (o envolvé el handler en try/catch) antes de buscar el bug en la ruta o el backend.

### E. Resetear la contraseña de un ALUMNO desde Administración
Antes solo se podía con el **personal** (`POST /administracion/usuarios/personal/:id_usuario/reset-password`);
los alumnos no tenían equivalente. Se agregó el gemelo:
- **`POST /administracion/usuarios/alumnos/:id_alumno/reset-password`** → `usuariosController.resetPasswordAlumno`
  (`WRITE_ROLES` = ADMINISTRACION + ADMIN, el mismo acceso del módulo). Entra por **`id_alumno`** (que es lo
  que maneja la lista de Alumnos) y resuelve el `id_usuario` con una subconsulta, así que es **un solo UPDATE
  sin transacción**. Guarda **bcrypt** y pone `must_change_password = TRUE` ⇒ el alumno **debe cambiarla en su
  próximo ingreso** (mismo comportamiento que el de personal). 400 sin contraseña · 404 si el alumno no existe.
- Front: bloque "Nueva contraseña" + botón en el **modal "Editar cuenta"** de la pestaña Alumnos
  (`Usuarios.jsx`), calcado del de personal. Va **fuera del `<form>`** para que Enter no dispare el submit de
  la cuenta, y el campo se limpia al abrir el modal (que no quede la contraseña tipeada para otro alumno).
  Servicio `resetPasswordAlumno` en `administracionApi.js`.
- **Verificado E2E** contra Supabase real (backend local, 6/6): resetea → el alumno entra con la nueva →
  **`must_change_password=true`** → la vieja da 401 → 404 con alumno inexistente → 400 sin contraseña.
  Alumno de prueba (u5) **restaurado a `demo123`**.
- ⚠️ **Ojo al testear el login**: la respuesta trae `must_complete_profile` **dentro de `user`**, no en la
  raíz (`{ token, user: { ... } }`). Leerlo de la raíz da `undefined` y parece un bug que no existe.

---

## 24. Pendientes vigentes (lista única — actualizar acá, no en las secciones de sesión)

> **Última revisión: 2026-08-22.** Resueltos desde la pasada anterior: ~~el cronómetro del trabajo~~
> (§35.A, era la zona de la sesión) · ~~la dualidad de pantallas del Taller~~ (§36: "Mi taller" es
> ahora la pantalla principal y Trabajos quedó como archivo).
>
> Revisión 2026-08-18: ~~Taller fases 2-3~~ (§31 y §32) ·
> ~~dar de alta a los mecánicos~~ (hecho, ver abajo) ·
> ~~no se podían crear mecánicos desde la app~~ (§33) · ~~tarifa del YS-155~~ ($150, §26.C) ·
> ~~loadsheet del YS-259 y del YS-155~~ (§26.C) · ~~deslogueo aleatorio de u1~~ (§26.B).

### 🔬 Con el mecánico (2026-08-17, §29.F)
- **Cuadre de bodega**: 9 existencias en negativo y 24 diferencias contra el Excel esperando conteo
  físico y su `AJ-001-2026 · Cuadre de migración`. El software no las corrige a propósito.
- **Ingesta de costos** (Taller + Contabilidad): 482 ítems sin costo y 37 entradas sin costear en la
  pestaña "Costos pendientes". Al costear una entrada se genera su egreso en Contabilidad.
- **208 ítems sin ningún movimiento en 2026**: decidir si se depuran del catálogo.

### 📗 Libros del avión (2026-08-22, §37)
- **Dictar del libro** el T.T. del motor y de la hélice del **YS-127-P** y del **YS-270-PE** (en el
  papel venía copiado del de la célula) y las tres partes del **YS-155-PE** y el **YS-259-PE**, que
  no tienen nada cargado. Se carga desde *Trabajos → Libros del avión → Editar ficha y anclaje*.
  Hasta que se haga, esos libros no proponen T.T. — a propósito: el sistema no inventa un número
  que va impreso en un documento legal.
- **El formato del sticker de 25 h** no estaba entre los archivos entregados. El tipo ya existe con
  la plantilla vacía: cuando lo tengan, se escribe desde la app sin desplegar.
- 🔴 **Los bimotores llevan CINCO libros, no tres** (dos motores y dos hélices, cada uno con su
  T.T. y su TSO). El **YS-259-PE** ya está y **compraron un segundo bimotor** el 2026-08-22.
  Ninguno tiene partes cargadas, así que no hay nada mal registrado — pero antes de cargarlos hay
  que ampliar el modelo, y antes de eso **ver un juego de stickers real de un bimotor**. Detalle en
  §37.
- **La tabla grande de conteo de horas y seguimiento de mantenimientos** sigue sin entregarse.
  Cuando llegue se coteja contra los anclajes; no hay que rehacer nada.

### 🔬 Con el Taller (2026-08-18, §34)
- **`YS-270-PE` y `YS-333-PE` están en mantenimiento SIN fecha de finalización.** Aparecen en la cola
  del Taller con "listo estimado: sin fecha" y, sin fecha, quedan bloqueados indefinidamente para
  agendar. Ponerles fecha **cancela los vuelos que caigan adentro**, así que es decisión de Daniel.
  Se arregla desde ***Mi taller* → el avión → "¿Cuándo está listo?"** (la ruta cambió en §36).

### 🔧 Para que el Taller sirva (§32)
- ✅ **Personal del taller cargado** (2026-08-18): `jose.estrada` (jefe, **TMA 090** — confirmado por
  Daniel; lo que se había leído de las fotos como "TMA 692" era mala lectura), `roger.perez` (técnico,
  TMA 915) y `carlos.arevalo` (aprendiz, certificado 5798). Los tres con su **primer ingreso pendiente**:
  la primera vez que entren tienen que fijar contraseña y correo.
- **Manuales del avión** que se adjuntan a cada mantenimiento: Daniel los va a pasar.

### 🎨 Esperando decisión de Daniel
- **Radios suavizados**: se aplicaron **solo al módulo Taller** (§35.C). Extenderlos a Administración
  y Operaciones es cambiar un token, pero toca toda la app.

### 🧾 Higiene inmediata
- **Multa de `javier.espinoza`**: anotada en el Excel de saldos ("multa por aplicar 13/07/26") y **nunca
  aplicada** (§26.F). Se aplica con el botón Multa de su cuenta corriente.
- **Combustible usable del YS-259-PE (310Q)**: la plantilla usa hoy la **capacidad** (102 principal / 41 aux).
  Falta que Daniel confirme el usable — 2 números, no afecta el chequeo de peso/CG (§26.C).
- **Anular desde los listados de Recibos/Facturas** sigue con el modelo viejo (inserta fila ANULACION en el
  ledger), inconsistente con el borrado directo que ahora usa la cuenta corriente (§26.A).
- Untracked viejos en el repo principal (superados por `20260624000004_semana_22jun_completa.sql`, evaluar borrar):
  `seed_semana_22jun2026.js`, `20260624000001/2/3_*.sql`.

### 📋 De sesiones previas (siguen abiertos)
- **Correo transaccional** (Resend/Brevo) — `mailer.js` ya es SMTP genérico, `MAIL_ENABLED=false`. Falta que
  Daniel dé el dominio y dónde administra el DNS (usar **subdominio dedicado** para no arriesgar el DNS de M365).
- **Rotar `SUPABASE_SERVICE_KEY`** (se compartió en chat) → actualizar en Railway y redeployar.
- **Sembrar inscripciones demo del Aula Virtual** (`inscripcion_curso` + `_avance` + `unidad_teorica`): hoy los
  alumnos demo no están inscritos en ningún curso ⇒ el aula se ve vacía.
- **Probar Web Push de punta a punta** en un navegador real (§19.F). En iPhone requiere "Agregar a inicio".
- **3 botones de export** en Administración → Reportes siguen siendo placeholders (Excel Ingresos, Excel Egresos,
  PDF Estado de cuentas).
- **PDF de onboarding** (§20.H): 11 páginas ya revisadas, falta corrida final + decidir dónde entregarlo.
- **Taller — lo que quedó fuera de las 3 fases**: squawks y MEL, libros del avión firmados,
  devolución de sobrantes a bodega, costeo promedio ponderado o FIFO (hoy es **último costo
  conocido**), facturar el trabajo a terceros. La pantalla `/mantenimiento` operativa sigue en
  `/api/admin` ⇒ un TALLER puro no la opera.
- **Factura manual**: decidir si `emitirManual` deja de debitar el saldo (hoy sí, con `CARGO_OTRO`).
- **Instructores externos** (p.ej. E.Roeder) siguen fuera del sistema.
- (Opcional) Descontar **reservas de aeronave** también en el selector de agenda del alumno (§19.D.1).

---

## 25. Sesión 2026-07-17 — Reporte de cierre de Turno separado en dos (sin montos vs. con montos)

Antes había **un solo** reporte de cierre del día ("Vuelos por avión", PDF), accesible por TURNO/ADMIN/
ADMINISTRACION por igual — incluía montos debitados por vuelo. Daniel pidió separarlo: Turno saca uno
**sin montos** (total de operaciones, tripulación, horas completadas por vuelo, dividido por aeronave);
el que tiene montos queda **solo para Administración/Admin**.

- **Dos endpoints, no uno con branching** (`turnoRoutes.js`): así es estructuralmente imposible que un bug
  filtre montos a Turno. `GET /turno/reporte-vuelos-dia` (existente, con montos) → re-gateado a
  **`roleMiddleware(["ADMIN","ADMINISTRACION"])`** (rol puro). `GET /turno/reporte-operaciones-dia`
  (nuevo, sin montos) → `requireCapacidad(["TURNO","ADMIN"], "OPERACIONES")`.
- ⚠️ **El re-gateo tuvo que adaptarse en caliente**: mientras se diseñaba esto, Samuel desplegó
  `instructor.puede_operaciones` (§ commits `59bfaf2`+siguientes) — un instructor con esa capacidad
  actúa como Turno. Como ese endpoint quedó gateado con `requireCapacidad(...)` (no `roleMiddleware`),
  un instructor-con-operaciones también hubiera visto montos si el reporte con montos se hubiera dejado
  con capacidad en vez de rol puro. Decisión: **el reporte con montos es rol puro a propósito** — ni
  Turno ni un instructor-con-operaciones lo ven nunca, sin importar qué capacidad tengan. Hubo que
  **re-importar `roleMiddleware`** en `turnoRoutes.js` (Samuel lo había sacado al migrar todo a
  capacidades).
- **Nuevo controller `getReporteOperacionesDia`**: misma query que el de montos, **sin** el
  `LEFT JOIN LATERAL` a `movimiento_cuenta` (no toca saldos, no hay dato de plata que filtrar), con
  `rv.horas_cobradas` agregado. **PDF nuevo `generarReporteOperacionesDiaPDF`** (`pdfGenerator.js`): 5
  columnas (Fecha/Número/Alumno/Instructor/Horas, sin Tac/Hobbs/Monto), agrupado por aeronave.
- ⚠️ **El simulador no tiene TAC** (`instructorReporteController.js:264-266` fuerza `tacometro_*` a NULL
  para `esSimulador`; sus horas viven en `reporte_vuelo.horas_cobradas`). Un simulador SÍ llega a
  `COMPLETADO` y SÍ entra al reporte, así que sin fallback su fila salía en blanco. `horaFila(v)`:
  TAC si existe, si no `horas_cobradas` — **orden a propósito, inverso al de cobro**
  (`instructorReporteController.js:353-355`, que prioriza `horas_cobradas`): acá el objetivo es "cuánto
  duró", el TAC es más preciso que una estimación de facturación para un avión real. Verificado contra
  vuelos de simulador reales en producción (id 297/328, `horas_cobradas=1.00`) — la fila **no** sale en
  blanco.
- **Frontend**: `turnoApi.abrirReporteOperacionesDia` (nueva, mismo patrón blob que la existente). El
  botón "Reporte del día" del dashboard de Turno pasa a llamarla. `Administracion/Reportes.jsx` **no se
  toca** — Administración conserva el reporte completo con montos, sin cambios.
- Sin migración (no toca esquema).

---

## 26. Sesión 2026-07-22 — Cuenta corriente tipo Excel, precios especiales, pago del Refresh, cuadre de saldos y **loadsheet DB-first**

**TODO DESPLEGADO Y VERIFICADO.** Sesión larga con Samuel trabajando en paralelo (merges limpios).
Migraciones `20260722000001`..`000005` aplicadas en Supabase.

### A. Cuenta corriente se comporta como Excel (commit `52cec70`)
**Problema raíz:** el saldo por fila vivía **congelado** en `movimiento_cuenta.saldo_resultante_usd`
(calculado al crear, asumiendo que el movimiento siempre va al final). Meter un movimiento con fecha
ANTERIOR lo insertaba arriba en el orden pero **no recalculaba** los de abajo → saldos incoherentes.
- **Saldo corrido al LEER**: `cuentaController.getExtracto` usa `SUM(monto_usd) OVER (ORDER BY fecha, id)`
  en un CTE. Campo nuevo `saldo_corrido`; el front usa `saldo_corrido ?? saldo_resultante_usd`.
- **Borrado directo**: `anularMovimiento` pasó de "marcar anulado + fila ANULACION" a **DELETE real**.
  Param `borrar_documento`: si hay recibo/factura ligado, el front **pregunta** si borrar también el
  documento. Botón "Borrar" (papelera) en vez de "Anular". Daniel decidió: **cualquier** movimiento es
  borrable (incluidos los cargos automáticos de vuelo).
- **Fecha al crear** el abono (antes el movimiento caía siempre en `NOW()`).
- Limpieza `supabase/dump/limpiar_anulaciones_cuenta.sql` (ya corrida): borró 10 filas del modelo viejo
  en 3 alumnos; **netea a cero por alumno ⇒ ningún saldo cambió**.
- ⚠️ **Inconsistencia conocida NO tocada:** `recibosController.anular` y `facturasController.anular`
  (anular desde los **listados** de Recibos/Facturas, no desde la cuenta) siguen con el modelo viejo e
  insertan una fila ANULACION en el ledger.
- **Arquitectura del ledger:** `monto_usd` es SIGNADO (+depósito / −cargo); `saldo_actual_usd` = SUM
  (independiente del orden). Solo el saldo POR FILA depende del orden → por eso se calcula al leer.

### B. Precios especiales por avión + fix del deslogueo de u1 (commits `9e78631`, `fbc5b99`, mig `...000001`)
- **Deslogueo aleatorio de u1**: la sesión única (`usuario.current_session_id`) rota el UUID en cada
  **login**; como u1 se usa desde varias máquinas y el TV de proyección, cada login mataba las demás
  sesiones de u1. Fix: `SESION_MULTIPLE = new Set(["u1"])` en `authMiddleware.js` exime **solo a u1**.
  Para eximir otra cuenta: agregar su username al Set. ⚠️ Se exime por **username** — si u1 se renombra,
  el fix deja de aplicar.
- **Precios especiales**: `aeronave_tarifa` += `nombre`, `es_estandar`. El estándar conserva su versionado
  por fecha; los especiales son **montos fijos editables** (decisión de Daniel), sin versionado. Tabla
  `alumno_tarifa_aeronave (id_alumno, id_aeronave, id_tarifa)`, todo ON DELETE CASCADE (borrar el precio
  → cae la asignación → el alumno vuelve al estándar). El cobro busca primero el especial del alumno.
  UI: Tarifas → botón "Precios" por avión; Ficha del alumno → pestaña **"Precios por avión"**.
- ⚠️ **Gotcha de verificación:** el `authMiddleware` de `/administracion` es **a nivel de router** ⇒
  CUALQUIER path bajo `/administracion` da **401 sin token, aunque la ruta no exista**. El truco
  "curl → 404 vs 401" NO sirve ahí.

### C. Dos pendientes viejos resueltos
- **Tarifa del YS-155-PE**: se le puso estándar **$150** (§24 la marcaba como higiene inmediata; sin ella
  los vuelos cerraban **sin cobrar y en silencio**). No salía en la lista porque ésta sale
  `FROM aeronave_tarifa` y el avión no tenía ninguna fila.
- **Loadsheets de los 2 aviones nuevos** (migs `...000002`/`000003`): YS-259-PE (Cessna 310Q, datos del POH
  que mandó Daniel + envolvente que confirmó visualmente) y YS-155-PE (vacío 1275 @ 85.7, máx 2150/1950,
  fuel 50/48; brazos y envolvente **heredados del Cherokee PA-28** por decisión de Daniel).
  ⚠️ El 310 tiene **dos tanques** (principal arm 35 / aux 47): `calcWB` suma todas las estaciones ⇒ el
  despegue sale exacto, pero `computeWbResults` usa `.find(s=>s.is_fuel)` (el primero) para el CG de
  aterrizaje ⇒ asume quema del principal (aproximación aceptable). **Pendiente menor:** confirmar el
  combustible **usable** del 310 (hoy usa capacidad 102/41).

### D. Tres fixes de operación (commit `9568844`)
- **Proyección responsive en celular**: el tablero era 100vh / overflow-hidden / 2 columnas (diseñado para
  TV). Bloque `@media (max-width:768px)`: una columna, scroll natural, METAR crudo oculto, tablas con
  scroll horizontal interno.
- **ADMIN entra al dashboard de Turno** (`ProtectedTurno` + link en AdminSidebar) para publicar avisos.
- **Warnings de saldo bajo al agendar — advertencia, NUNCA bloqueo**: el 403 de saldo del alumno es
  **forzable** (`forzar_saldo` en el body; la respuesta trae `forzable:true`) → el alumno confirma y agenda
  igual (caso "deposito el fin de semana"). Banner en Agendar; badge **$** ámbar en los calendarios del
  staff (`saldo_bajo`/`saldo_alumno`/`tarifa_estimada` por vuelo). `estimarCostoVuelos` pasó a usar la
  tarifa **efectiva** (especial → estándar por id → texto legacy).

### E. Pago del Refresh del instructor (commits `f14328e..649b170`, mig `...000004`)
El instructor que pide un vuelo de práctica sub-tipo **REFRESH** ve su saldo y el costo estimado, y elige
si **debitar de su saldo al completarse** (checkbox, default sí cuando cubre) o pagar al momento. CHEQUEO
nunca cobra. **Nunca se bloquea el pedido; nunca queda saldo negativo por esta vía.**
- `debitar_saldo BOOLEAN` en `solicitud_vuelo` y `vuelo` (NULL = staff/manual). `publicarSemana` la copia.
- `GET /instructor/solicitudes/practica/saldo?id_aeronave=N` → `{saldo, costo_estimado, cubre}`.
  `crearSolicitudPractica` **revalida server-side** (devuelve `debitar_saldo_ajustado` + aviso).
- `cargarVueloACuentaDentroTx` += `modo_refresh` (cobra sin horas de licencia ni curso, nota 'Refresh') y
  `solo_si_saldo_cubre` (el chequeo va **DESPUÉS del FOR UPDATE**, atómico; si el saldo dejó de cubrir,
  `{skipped:true}` y se sincera `vuelo.debitar_saldo=false`).
- UI: Usuarios→Personal columna **Saldo** (gatea por **ficha**, no por rol) + botón "Cuenta corriente";
  badge **R$** en AdminCalendar (azul=debita / ámbar=al momento); vouchera con línea "Pago:" basada en
  **`se_debito`** (el cargo real, no la intención).
- Costo estimado = tarifa efectiva **× 1h** (misma convención que el badge $ del calendario).

### F. Cuadre masivo de saldos al 18-jul + horas iniciales editables
Fuente: `SALDOS AL 21 DE JULIO 2026.xlsx`, hoja **`REPORTE SALDOS ACTIVOS 2026`** (crece a lo ancho: una
tanda de columnas por semana). Leer con openpyxl **`read_only=True`** (sin eso tarda >2 min).
- **Fórmula**: `ajuste inicial = saldo_Excel_18jul − (movimientos con fecha < 2026-07-19)`.
  ⚠️ `movimiento_cuenta.fecha` es **timestamp**: el corte correcto es `fecha < '2026-07-19'` (incluye todo
  el sábado 18). Con `<= '2026-07-18'` se pierden los movimientos de ese día.
- **80 ajustes actualizados + 3 creados**; **20 alumnos** con horas del Excel; total **$310,632.52**.
- **Julio Santillana**: ficha espejo de practicante creada (id_alumno 107) con **$1,293** — revierte la
  decisión de junio de descartar su saldo. **Hector Guevara**: alumno nuevo (`hector.guevara`/`caaa2026`,
  instructor Tejada, id_alumno 108) con **$870**.
- **Feature**: campo **"Horas totales acumuladas"** editable en la ficha del alumno (Perfil), para setear
  el saldo inicial de horas. El front **solo lo manda si cambió** (no pisa horas sumadas por un vuelo
  firmado mientras la ficha estaba abierta).
- ⚠️ **Pendiente**: la multa de `javier.espinoza` está anotada en el Excel ("multa por aplicar 13/07/26")
  y **no se aplicó**.

### G. 🏗️ Loadsheet: modo práctica + editor de W&B — **cambio arquitectónico (DB-first)**
**Antes:** el calculador leía las plantillas de peso&balance de un **archivo estático del frontend**
(`CAA-frontend/src/loadsheet/data/aircraft.js`); `wb_plantilla` existía pero era un **espejo muerto** que
ya había divergido (el 155 tenía 5 estaciones en BD vs 4 en el archivo).
**Ahora:** el calculador lee de `wb_plantilla` **mapeada a la forma AIRCRAFT** (`utils/wbPlantilla.js`),
**keyed por MATRÍCULA real** (`aeronave.codigo`) — esto de paso corrigió el typo histórico del 270
(`aircraft.js` tenía `reg:'YS-270-P'`). **Fallback a `aircraft.js`** si un avión no tiene fila;
**el archivo NO se borró** (queda de fallback/seed). Re-siembra autoritativa con verificación de
paridad 6/6: `supabase/dump/seed_wb_plantilla_desde_aircraft.js`.
- **Modo práctica** `/alumno/loadsheet/practica`, `/instructor/loadsheet/practica` y
  `/admin/loadsheet/practica`: sandbox **efímero** sin vuelo (elige avión libre, precarga el nombre de
  `getSession()`, sin guardar/enviar, imprime/PDF). Link "Practicar loadsheet" en el Header (alumno e
  instructor) y en el sidebar de ADMIN (sección Taller).
- **Editor de W&B** en la pestaña "Peso y balance" de la ficha del avión (**solo ADMIN**): template
  completo (cabecera, aceite, estaciones add/remove, envolvente normal+utility) con **vista previa en vivo
  del envelope** (reusa `EnvelopeCanvas`). `GET/PUT /admin/aeronaves/registro/:id/wb-plantilla`.
- ⚠️ El selector de práctica **incluye aviones en mantenimiento**, solo excluye los dados de baja
  (`NOT (activa=false AND estado='ACTIVO')`): practicar el W&B de un avión en taller es inofensivo.
- ⚠️ `empty_moment` es **solo-lectura/derivado** (weight×arm) — el calculador lo recomputa; el mapper lo
  calcula defensivo para el NOT NULL.

---

## 27. Sesión 2026-07-28 — **Regreso por emergencia** en la vouchera

**DESPLEGADO Y VERIFICADO** (mig `20260728000001`, commits `ca80d28..d759b0c`).
Spec: `docs/superpowers/specs/2026-07-28-regreso-por-emergencia-design.md` · Plan en `docs/superpowers/plans/`.

### El caso
Vuelos que **salen del hangar y no llegan a volar**: se quedan en pista y se regresan por mal clima o una
falla. El avión **sí se movió** (TAC/Hobbs marcaron) ⇒ sus horas deben contar para mantenimiento; pero el
alumno **no voló** ⇒ no se le cobra, y por lo tanto **al instructor tampoco se le paga** esa hora.

### El concepto que ordena todo
- **Horas técnicas del avión** = TAC real → `aeronave.horas_acumuladas`, mantenimiento 50/100h, lecturas
  de los reportes. **Un regreso por emergencia las cuenta normal.**
- **Horas facturables** = plata y progreso (cobro, horas de licencia, avance de curso, pago al instructor).
  **Un regreso por emergencia las pone en cero.**

### Qué quedó
- `reporte_vuelo.regreso_emergencia` + `motivo_emergencia` (CLIMA/FALLA_MECANICA/OTRO, CHECK) +
  `detalle_emergencia`.
- `firmarReporteVuelo`: `actualizarHorasAeronave` **intacto**; el gate de horas de licencia y el bloque
  del cobro ganan `&& !esEmergencia` (el avance de curso vive dentro del cobro ⇒ también se salta);
  `horas_cobradas` forzado a NULL; motivo obligatorio; rechaza emergencia en simulador y **rechaza
  inasistencia+emergencia juntas**.
- **Guard de re-firma (409)** con `pg_advisory_xact_lock(4711, id_vuelo)`.
- **`utils/horasFacturables.js`**: `soloHorasFacturables(alias)` (agregados) y `sinRegresoEmergencia(alias)`
  (desglose de nómina, que hoy SÍ lista inasistencias). Aplicado en los **6 sitios** que suman TAC:
  `nominaController` (:224 la plata, :272 el desglose), `instructorAlumnoController:330`,
  `usuariosController` (:569 agregado, :610 lista), `alumnoCuentaController:124`.
- **PDFs**: reporte del día y operaciones del día imprimen **0 horas** + fila en rojo + leyenda; la
  vouchera lleva sello con motivo; tag en el listado de Voucheras del día.
- **Modal**: botón (oculto en simulador), banner con selector de motivo, badge, oculta "horas a cobrar",
  y manda los 3 campos en los **tres** payloads (borrador, firma y PDF).
- **Extras de la misma tanda**: ADMIN accede a "Practicar loadsheet" (`/admin/loadsheet/practica`); fix
  del desborde horizontal de la tabla "Mis alumnos asignados" en móvil (`min-width:0` en el grid item +
  `overflow-x: clip`, mismo patrón que Proyección).

### ⚠️ Gotchas caros de esta feature (no repetir)
- **`FOR UPDATE` no bloquea filas inexistentes.** El primer guard lockeaba `reporte_vuelo`, pero el
  instructor firma **sin guardar borrador** (son botones distintos) ⇒ la fila no existe y dos requests
  concurrentes pasaban ambas.
- **Lockear `vuelo` invertía el orden de locks** vs `turnoMantenimientoController` (`aeronave → vuelo`)
  ⇒ deadlock 40P01, **justo en el escenario de esta feature** (el avión vuelve por falla y Turno lo manda
  a mantenimiento). Por eso el **advisory lock**, que no entra en el grafo.
- **Poner `horas_cobradas` en NULL NO hace que los PDFs impriman 0**: caen al TAC
  (`horas_cobradas != null ? … : tacH`). Y `0` no sirve: el server rechaza `<= 0`.
- **Objetos literales que hay que actualizar aparte** (3 casi-misses distintos en esta feature):
  `getReporteVueloInstructor`, `alumnoReporteController.getReporteVuelo` (el `{...row}` es solo para
  `vuelo`), `rowToPdfParams` y `buildVoucheraContent` (**parámetros nombrados**, no el objeto crudo).
- **`centro.unshift(...)`, no `else if`**: en el PDF de la vouchera la rama de inasistencia **reemplaza**
  `centro` ⇒ un `else if` habría borrado las tablas de TAC.
- **20 vuelos completados no tienen reporte** ⇒ el helper usa `COALESCE(...) = false`; un `= false` pelado
  los habría borrado de la nómina en silencio.
- El gate de "horas a cobrar" en el cliente eran **3 validaciones**, no una.

### Limitación conocida (aceptada por Daniel)
Si el instructor **firma normal por error**, la corrección **no es automática**: el modal queda en
solo-lectura al firmar y el 409 impide re-firmar. Administración puede borrar el `CARGO_VUELO`, pero las
horas de licencia, el avance de curso y la nómina de ese vuelo quedarían contados. Si el olvido resulta
común, el siguiente paso es el flujo de corrección de Administración.

### Guía operativa para instructores (cómo se usa)
1. **Completar el checklist post-vuelo** (sigue siendo obligatorio — y si volvió por falla, más).
2. Abrir la vouchera y **anotar TAC y Hobbs reales** (aunque la diferencia sea mínima: es lo que mantiene
   al día el mantenimiento del avión).
3. Elegir **tipo de vuelo** (sigue siendo obligatorio).
4. Tocar **"Regreso por emergencia"**, elegir **motivo** (Clima / Falla mecánica / Otro) + detalle.
   El campo "horas a cobrar" desaparece solo.
5. **Firmar y enviar** al alumno.
- Se puede **guardar como borrador** con la marca puesta y sigue ahí al reabrir.
- **NO se usa** si el alumno no llegó (eso es Inasistencia) ni si el vuelo se hizo aunque fuera corto.
- No aplica a simulador (el botón no aparece).

---

## 28. Sesión 2026-07-31 — Rutas con parada (una ruta = N vuelos independientes)

Pedido de Samuel: en las rutas el avión hace escala en otro aeropuerto, y eso son **operaciones
separadas** (dos planes de vuelo, dos voucheras, se marca el aterrizaje en destino y la apertura del
regreso). Dos casos reales que el modelo debía soportar: **cambio de alumno en ruta** (la ida la vuela
uno y el retorno otro; van 3 personas y el instructor es el mismo) y **parada múltiple**
(MSSS→A, A→B, B→MSSS). Spec en `docs/superpowers/specs/2026-07-31-rutas-con-parada-design.md`,
plan en `docs/superpowers/plans/2026-07-31-rutas-con-parada.md`. Migración `20260731000002`.

### A. Modelo — N filas de `vuelo` hermanas (enfoque A del spec)
La **solicitud sigue siendo UNA** (`solicitud_vuelo.con_parada` + `tramos_ruta jsonb` = solo los ICAO
intermedios; MSSS se autocompleta en ambas puntas). Al crear los vuelos se generan **N filas de
`vuelo`**, una por tramo: `grupo_ruta` (= el `id_detalle` de la solicitud), `orden_tramo` 1..N,
`total_tramos`, `icao_origen`, `icao_destino`. Como cada tramo es una fila de `vuelo` normal, **todo lo
que ya operaba por vuelo funciona sin cambios estructurales**: loadsheet, vouchera, cargo a cuenta,
tarjetas de Turno/Dueño, Proyección, reporte del día.
- El rango de bloques se reparte en N partes iguales (`utils/rutaTramos.js` → `construirTramos`), y ese
  horario por tramo es **presentacional**: la reserva real del avión es el rango completo y el gate
  operativo de los tramos 2..N es la acción del instructor, no la hora.
- **Límites del alumno: la ruta cuenta 1** (es un elemento del array `vuelos`), no N.
- **Cobro y horas de licencia: por tramo**, al alumno de ese tramo — sale gratis porque
  `cargarVueloACuentaDentroTx` ya cobra a `vuelo.id_alumno`.

### B. 🚨 `uq_vuelo_detalle` — el bug que casi entierra el diseño
`CREATE UNIQUE INDEX uq_vuelo_detalle ON vuelo(id_detalle)` (init_schema:2766) ⇒ **los N tramos NO
pueden compartir `id_detalle`**, que era justo el supuesto del diseño. Peor: el catch de
`agendarVueloDirecto` mapeaba **cualquier** `23505` a un mensaje **hardcodeado** "Ese bloque y aeronave
ya está ocupado", así que la violación del índice único se disfrazaba de conflicto de horario y costó
~20 min de depuración a ciegas (el síntoma era que LOCAL y RUTA-sin-parada funcionaban y RUTA-con-parada
no, con el MISMO rango de bloques).
- **Fix:** solo el **tramo 1** lleva `id_detalle`; los demás van con **NULL** (Postgres admite varios
  NULL en un índice único). El vínculo entre tramos es **`grupo_ruta`**, que sí conserva el id_detalle.
- **Consecuencia:** `rechazarSolicitudIndividual` y `cancelarSolicitud` (que cancelaban
  `WHERE id_detalle = $1`) ya no alcanzaban a los hermanos ⇒ ahora filtran `(id_detalle = $1 OR
  grupo_ruta = $1)`. El mensaje del 409 dejó de ser hardcodeado.
- ⚠️ **Lección:** un catch que reescribe el mensaje de un código de error de Postgres convierte un bug
  de esquema en un bug fantasma de negocio. Si un 409 "de negocio" aparece donde no tiene sentido,
  sospechá del mapeo del `catch` antes que de los datos.

### C. Estados por tramo — `EN_ESPERA_TRAMO` + mini-form de aterrizaje
Estado nuevo `EN_ESPERA_TRAMO` (ampliado en **las dos** tablas hermanas: `vuelo_estado_check` y
`vuelo_estado_tiempo_estado_check` — la lección de la migración `20260713000003`).
- Tramo 1: `PUBLICADO → SALIDA_HANGAR → EN_PROGRESO → (mini-form) COMPLETADO`
- Intermedios: `EN_ESPERA_TRAMO → EN_PROGRESO → (mini-form) COMPLETADO`
- Tramo final: `EN_ESPERA_TRAMO → EN_PROGRESO → REGRESO_HANGAR → FINALIZANDO → COMPLETADO` (flujo normal)
- **Los tramos no finales se cierran SOLO por el mini-form**, nunca por el botón genérico de avanzar
  (`services/rutaTramoService.js` → `nextEstadoTramo` devuelve `undefined` en ese caso, y el frontend
  oculta el botón). El mini-form pide **TAC y HOBBS de llegada** y los escribe directo en
  `reporte_vuelo`: llegada del tramo N **y** salida del tramo N+1 (nunca pisa una vouchera firmada;
  reabrible mientras el siguiente siga en espera).
- **Checklist post-vuelo solo en el tramo final** (los que cierran fuera de casa no vuelven al hangar).
- Guardas: no se inicia el tramo N si el N-1 no cerró; la guardia de "avión ocupado" ignora a los
  hermanos del mismo `grupo_ruta`.
- Endpoints: `POST /turno/vuelos/:id/aterrizaje-tramo` y `/cancelar-tramos-restantes` (ambos con
  `requireCapacidad(["TURNO","ADMIN"], "OPERACIONES")`), `POST /instructor/vuelos/:id/aterrizaje-tramo`.

### D. Cancelaciones e inasistencia = toda la ruta
Cancelar un tramo cancela el grupo: `resolverSolicitudCancelacion`, mantenimiento imprevisto (que
además ahora incluye `EN_ESPERA_TRAMO` en `WHERE_VUELOS_AFECTADOS`), rechazo y cancelación de solicitud.
**Inasistencia solo aplica al tramo 1** (si el alumno no llega no hay ruta) y cancela el resto.
Para una ruta cortada en la vida real: regreso anticipado en la vouchera del tramo volado + Turno
cancela "los tramos restantes".

### E. Alumno por tramo + tripulación de ruta
`GET /admin/rutas/:id_detalle/tramos` y `PATCH /admin/vuelos/:id/alumno-tramo` (valida licencia con la
regla canónica: salta el chequeo en extracurricular/DEMO/CHEQUEO_LINEA y usa `id_licencia_chequeo` en
CHEQUEO). Modal **"Asignar alumnos por tramo"** en el popover del calendario (solo con `id_vuelo`: los
tramos nacen al publicar). En `editarTripulacion` de Turno, **instructor y aeronave se propagan a toda
la ruta** (con chequeo de conflicto de la aeronave nueva contra los bloques de cada tramo), y **mover de
día una ruta se rechaza con 409** (partiría la ruta en dos fechas y dejaría el retorno sin poder volarse).

### F. Dedupe del calendario
Los tramos comparten `grupo_ruta`, y el calendario hace `LEFT JOIN vuelo v ON v.id_detalle = sv.id_detalle`
⇒ se agregó `AND (v.grupo_ruta IS NULL OR v.orden_tramo = 1)` en `adminVueloController.getCalendario`
**y** en `instructorSolicitudController.getCalendario` (esta segunda es fácil de olvidar: es una copia
literal de la misma query en otro archivo).

### G. UI
Solicitud del alumno (`AgendarVuelo.jsx`) y modal de staff (`AgendarVueloModal.jsx`): checkbox "Con
parada" + cadena `MSSS → [ICAO] → … → MSSS` con "+ Agregar tramo" (máx 4 paradas, ICAO de 4 letras
validado en cliente y servidor). Badges `T2/3 · MGGT→MHTG` en Proyección, tarjeta del Dueño, calendario
y horario del alumno (`tramoBadge`/`estadoVueloMeta` en `utils/vueloVisual.js`); un tramo esperando
muestra **"EN MGGT — ESPERANDO"**. `AterrizajeTramoModal` (2 campos, pensado para el celular) en las
tarjetas de Instructor y Turno. La vouchera muestra "Ruta con parada — Tramo X/Y · origen → destino".

### Fuera de alcance (decidido con Samuel)
Cambio de **instructor** entre tramos (es siempre el mismo), catálogo real de aeropuertos (solo se
valida formato ICAO), loadsheet compartido entre tramos, y reprogramar horas de tramos sueltos.

---

## 29. Sesión 2026-08-17 — Inventario de la bodega OMA (documentos + kardex por ítem)

Réplica del Excel `INVENTARIO OMA CAAA-CONTADOR` en el sistema. Spec:
`docs/superpowers/specs/2026-08-17-inventario-taller-design.md`. Commits `e1ed6b3` (spec) y
`b70f786` (implementación), en la rama `claude/workshop-inventory-system-292b6b`.

> ✅ **DESPLEGADO Y VERIFICADO EN PRODUCCIÓN** (2026-08-17). Migración `20260817000001` aplicada en
> Supabase, Excel cargado, backend en Railway y frontend en Vercel con el código nuevo. Verificado
> contra prod con token real: 642 ítems / $7,791.88 · 243 REQ + 37 FA · kardex del `000039` con 186
> movimientos y saldo −17 que cuadra con el catálogo · la ruta vieja `/taller/repuestos` da 404.
>
> ⚠️ Al verificar, recordar que **`/api/taller` tiene `authMiddleware` a nivel de router**: cualquier
> path bajo ese prefijo da **401 aunque la ruta no exista**, así que el truco "404 vs 401" NO sirve
> ahí (mismo caso que `/administracion`, §26.B). Hay que probar con token.

### A. El defecto que se venía a corregir
La hoja de inventario calculaba el stock con
`SUMIFS(..., ENTRADAS[DESCRIPCION], ..., ENTRADAS[numero de parte], ...)` — o sea **cruzando texto
libre**, no el código. Escribir `100AW` en vez de `100 AW` hacía **desaparecer el movimiento del
stock sin ningún aviso**. Medido: 26 líneas de entrada y 9 de salida invisibles, 22 ítems
descuadrados, 11 claves duplicadas. Ahora la llave es `taller_repuesto.codigo`.

### B. Modelo (migración `20260817000001_inventario_taller.sql`)
`taller_documento_inventario` **nueva** = la cabecera (FA/REQ/AJ, `UNIQUE(tipo,anio,numero)`,
correlativo generado con `pg_advisory_xact_lock` que reinicia cada año) ·
`taller_movimiento_inventario` pasa a ser su renglón (`id_documento` NOT NULL).

- **`cantidad` es SIGNADA** (+entra / −sale / ±ajusta) para que el saldo del kardex sea una **suma
  acumulada calculada AL LEER**, nunca congelada — la lección de la cuenta corriente (§26.A).
- Al renglón se le **quitaron** `tipo`, `fecha`, `id_aeronave`, `id_egreso`, `registrado_por`: ahora
  viven en la cabecera. Dos fuentes de verdad del mismo dato es la deriva que ya mordió varias veces.
- `taller_repuesto` += `codigo` (único parcial), `ultimo_movimiento_en`, `ultima_entrada_en`,
  `es_serializado`; `unidad` pasa a lista cerrada (`UN/QT/GAL/FT/KIT/JGO/LB`).
- `usuario.puede_forzar_inventario` y `aeronave.es_externa`.

### C. Reglas
| | |
|---|---|
| **Entrada** | Proveedor + n° real de factura → **genera el egreso** en Contabilidad. Se **quitó** el egreso que disparaba la SALIDA, que duplicaba el gasto. **Costo opcional**: sin costo no hay egreso y el documento cae en "Costos pendientes". |
| **Salida** | Aeronave obligatoria + opcionalmente colgada de un `taller_cumplimiento` o un `mantenimiento_aeronave` existente. **409 si no alcanza la existencia**, salvo `puede_forzar_inventario` + motivo escrito. Bloquea los ítems `FOR UPDATE` **en orden ascendente de id** (anti-deadlock). |
| **Ajuste** | Se teclea la **existencia contada**; el servidor guarda el delta. Motivo obligatorio. |
| **Anular** | Los documentos **no se editan**. Anular devuelve el stock (recalculado desde cero, no por delta), borra el egreso si lo había, y **el correlativo no se reutiliza**. |

### D. 🚨 `aeronave.es_externa` — la parte de más radio de daño
La OMA le da mantenimiento a aviones que **no son de la escuela** (`YS-361-PE` tiene una inspección
anual completa en el Excel; también `YS-243-P` y `YS-22-C`). Se dieron de alta con `es_externa=true`.
- **Filtradas en 16 consultas** que alimentan selectores de vuelo (agendar del alumno y del staff,
  Programación, Turno, Proyección, Standby, Mantenimiento, Tarifas, Voucheras, Loadsheet).
- **NO filtradas, a propósito**, en `adminAeronaveController.listarAeronaves` (módulo Aeronaves, donde
  se administran) y en `taller/dashboardController` (el Taller sí las ve).
- ⚠️ **No alcanza con darlas de alta como baja lógica** (`activa=false`): `sincronizarEstadoFlota`
  recalcula `activa` según el mantenimiento del día, así que al cerrarles un mantenimiento el job las
  devolvería a los selectores de vuelo. **Por eso es columna propia.** Al agregar una consulta nueva
  que liste aeronaves, acordarse del filtro.

### E. Carga del Excel — `supabase/dump/inventario_oma/` (**YA CORRIDA en prod**)
Dos pasos porque **no hay módulo de Excel para Node** (§16): `extraer_excel.py` (Excel → JSON) y
`cargar.js` (JSON → Supabase, con `--dry-run` y `--limpiar-demo`). Re-ejecutable: lo cargado va
marcado `origen='EXCEL_2026'` y se borra al empezar.

**Cargado: 642 ítems · 280 documentos · 929 renglones, sin perder una sola línea.** Arregla en el
camino: `FA-0000025-2026` y `FA-00025-2026` eran el mismo documento; `FA-00019-2027` tenía el año mal
tecleado (el año sale de la FECHA, no del texto); 6 materiales que se movían sin estar catalogados se
**dan de alta** en vez de descartarse; 4 cantidades tipo `1FT` se interpretan guardando el texto
original en la nota.

⚠️ **Ojo con el conteo de ítems**: la hoja tiene 662 filas con algo, pero **26 son plantilla sin
descripción** (fórmulas evaluando a 0). Los ítems reales son **636**.

### F. 🔬 LO QUE FALTA HACER CON EL MECÁNICO (esto no lo arregla el software)
El stock **no se importó**: sale de sumar los movimientos. El cargador dejó un reporte con:
- **9 existencias en negativo** (`ACEITE 100 AW` −17, `FILTRO DE ACEITE` −7, `BUJIA REM40E` −6, …) —
  son entradas que nunca se digitaron.
- **24 diferencias contra el Excel** (`ARANDELAS` 75→35, `BUJIA` 8→16, `BOLT` 8→0, …) — el Excel
  cruzaba por texto.
- **208 ítems sin ningún movimiento en 2026** — candidatos a depurar.
- **482 ítems sin costo** y **37 entradas sin costear** → pestaña "Costos pendientes".

**Se cierran contando físicamente en bodega y registrando `AJ-001-2026 · Cuadre de migración`.**
El detalle completo de los 73 avisos está en `supabase/dump/inventario_oma/inventario_oma.json`
→ `"problemas"`.

### G. Frontend — `/taller/inventario`
Sub-navegación (patrón de Contabilidad): **Existencias · Documentos · Consumo por aeronave · Costos
pendientes**, más el **kardex** al hacer clic en cualquier ítem (saldo corrido, y **saldo inicial**
cuando se filtra por fechas — sin eso el kardex filtrado arranca en cero y no cuadra).
Componentes en `CAA-frontend/src/pages/Taller/inventario/`. Lectura del módulo también para
`ADMINISTRACION` (la ingesta de costos es trabajo conjunto con Contabilidad).

Dos defectos de UI encontrados **mirando la pantalla**, no el código: "bajo mínimo" marcaba 253 ítems
(todo ítem en cero, porque el mínimo por defecto es 0 → ahora exige `stock_minimo > 0`), y el "valor
del inventario" reproducía el defecto del Excel de meter los negativos dentro del total (ahora suma
solo existencias positivas: **$7,791.88**, e informa aparte los **−$5,479.54** que distorsionan).

### H. Verificación
49/49 E2E contra Supabase real con limpieza total (correlativos, egreso solo en la compra, 409 +
forzado con motivo, ajuste por existencia contada, saldo corrido `10→15→12→−8→12`, **fecha
retroactiva que recalcula todo lo de abajo**, anulación que devuelve stock y saca el documento del
kardex, y que las externas no se cuelan en los selectores de vuelo). Las 4 pantallas revisadas en el
navegador con los datos reales ya cargados.

### Fuera de alcance (decidido con Daniel)
Hojas de trabajo y el formato de materiales **sobrantes** (el gancho ya está: la salida se cuelga del
mantenimiento) · devolución de sobrantes a bodega · costeo promedio ponderado o FIFO (se eligió
**último costo conocido**) · facturar el trabajo a terceros · depurar los 208 ítems sin movimiento.

---

## 30. Sesión 2026-08-17 (2ª tanda) — Papeleo del Taller, Fase 1: requisición → solicitud → retorno

Daniel fotografió **los seis formatos en papel** de la OMA y se reconstruyó el circuito real,
cotejado contra los datos ya cargados. Spec:
`docs/superpowers/specs/2026-08-17-solicitud-almacen-sobrantes-design.md`.

### El circuito (verificado con la inspección de 100 h del YS-127-P, julio 2026)

```
06-jul  REPORTE DE INSPECCIÓN   Operaciones entrega el avión · lo firma un PILOTO · qué inspección toca
07-jul  REQUISICIONES           el técnico anota lo que necesitará                    (interna)
09-jul  SOLICITUD AL ALMACÉN    descarga el inventario · lleva el N° de OT · sobrantes (AAC, CAAA-004-F)
09-jul  ORDEN DE TRABAJO        certifica · Acción Correctiva · Parte Reemplazada      (AAC, CAAA-006-F)
en paralelo:  ENTREGA DE ACEITES POR DÍA  ·  PRÉSTAMO DE PARTES                       (internas)
```

⚠️ **La OT se llena AL FINAL, no al principio** (dato de Daniel). Es el certificado, no el
disparador. Por eso la requisición no puede exigir un N° de OT para existir.

**Cotejos que confirmaron el modelo** (ninguno es suposición): la OT `CAAA/2026-0049` ↔
`REQ-211-2026` y la `CAAA/2026-0042` ↔ `REQ-192-2026` coinciden en avión, tacómetro y trabajo ·
`aeronave.horas_ultima_revision` del YS-127-P **es 8271.00**, el tacómetro de esa OT · en la
requisición la columna rotulada *"Costo Unitario"* **lleva el código de bodega**, no costos (6/6
verificados) · la hoja de aceites y el kardex registran **los mismos eventos** (8 de 10 cruzan).

### Lo entregado (§ desplegado tras el push)

- **Tres tipos de documento** donde había uno: `REQUISICION` (borrador, **no mueve stock**, único
  editable) → `SALIDA` (la solicitud `CAAA-004-F`, descarga) → `RETORNO` (sobrantes, suma con su
  **fecha real**). Migraciones `20260817000002`, `000003`, `000004`.
- **Campos del papel**: `tacometro`, `cliente`, `solicitante`, `entregado_por`, `entregado_a`,
  `observaciones`, `orden_trabajo_no`, `numero_solicitud`.
- **Pestaña "Entrega de aceites"**: el cuaderno del jefe de taller como **reporte del kardex**, sin
  tabla nueva. `000038`/`000039` pasaron de `UN` a `QT`.
- **Reporte de duplicados por n° de parte**: `CH48110-1` existe como `000350` (+10) y `000685` (−7).

### 🚨 Tres trampas que encontró la prueba E2E (no repetir)

1. **La serie `REQ` tenía que continuar desde 245.** Los 243 históricos son tipo `SALIDA` con
   correlativo `REQ-001..244`; una serie nueva desde 1 habría creado dos papeles rotulados igual.
   El generador busca el `MAX` **por prefijo**, no por tipo.
2. **`UNIQUE (tipo, anio, numero)` reventaba con `SOL-001-2026`** (mismo tipo/año/número que el
   histórico `REQ-001-2026`). La unicidad pasó al **correlativo**, que es lo que la gente lee.
3. **`tipo` era `VARCHAR(10)` y `REQUISICION` tiene 11.** Error 22001 al crear la primera.

⚠️ **Y la trampa de diseño:** los renglones de la requisición viven en la MISMA tabla que suma el
kardex. Sin filtrarlos, pedir material movería el stock sin que nadie lo despachara. Va por
`documentoCuentaSQL()` en `utils/inventarioHelpers.js` — **fragmento compartido, no copiado**, la
lección de las horas facturables (§27).

### Los tres PDFs (cerrados en la misma tanda)

`utils/pdfTaller.js`: `generarRequisicionPDF`, `generarSolicitudPDF` (la `CAAA-004-F` con su apartado
de retornos) y `generarEntregaAceitesPDF`. **El código y la revisión del formulario NO van
incrustados**: viven en la tabla `taller_formulario` (migración `20260817000005`, claves
`REQUISICION`/`SOLICITUD`/`ACEITES`) y se editan desde la app ⇒ una Rev.01 de la AAC no obliga a un
deploy.

### El inventario habla el idioma de la bodega, no el del papel (corrección de Daniel)

Primera entrega: los botones se llamaban como el **documento** ("Documentos", "Requisición") y todo
vivía en una sola lista filtrada. Daniel: *"no veo ninguna opción de hacer cargas y descargas
manuales… la sección de documentos no la entiendo del todo"*. Se renombró a la **acción de bodega**
y se partió en pestañas propias: **Existencias · Entradas · Salidas · Aceites · Consumo por avión ·
Costos pendientes**. `Documentos.jsx` quedó reusable (recibe `tipos`/`accion`/`mostrarPendientes`).
**Lección**: nombrar la pantalla como el papel obliga al usuario a saber qué papel corresponde a lo
que quiere hacer — justo lo que el sistema debería resolverle.

---

## 31. Sesión 2026-08-17 (3ª tanda) — Papeleo del Taller, Fase 2: orden de trabajo, reporte de inspección, rol TECNICO e interfaz nueva

Spec: `docs/superpowers/specs/2026-08-17-orden-trabajo-e-interfaz-taller-design.md`.
Migraciones `20260817000005` (formularios) y `20260817000006` (OT). Commits `5992981` (spec),
`4bec5f7` (backend + rol), `a0b3749` ("Mi taller"), `305bf02` (PDFs), `868ec01` (jefe de taller).

### A. La orden de trabajo es el certificado, no el disparador
`orden_trabajo` se abre al recibir el avión — ahí toma su correlativo, con el formato del papel
**`CAAA/2026-0049`** — y se **cierra al firmarla**. De ella cuelgan las requisiciones, solicitudes y
retornos de la fase 1 (`taller_documento_inventario.id_orden_trabajo`). Tablas nuevas:
`reporte_inspeccion` (correlativo `RI-###-2026`, lo firma un **piloto** al entregar el avión),
`orden_trabajo` y `orden_trabajo_parte` (las columnas P/N y S/N **ON/OFF** del papel).

- **Firmar exige licencia TMA** (`usuario.licencia_tma`, columna nueva junto a
  `certificado_aprendiz`): sin ella `POST /taller/ordenes/:id/firmar` devuelve **403** — el número va
  impreso en la orden y es lo que respalda la liberación de la aeronave. Al firmar se **agrega la
  certificación al final de la acción correctiva**, y `ck_ot_cerrada` garantiza a nivel de esquema
  que una OT `CERRADA` tenga mecánico y fecha de firma.
- **Anular** es del jefe de taller y devuelve **409 si la OT tiene documentos de bodega vigentes**:
  primero se anulan los papeles que movieron existencia.
- `sugerenciaInspeccion` propone qué inspección toca cruzando el tacómetro con las tareas
  programadas del Taller; `fichaAeronave` arma el folder del avión.

### B. Rol `TECNICO` (mecánico) — 🚨 el enum de auditoría primero
`VALID_ROLES` + `usuario_rol_check` + `ROLES_PERSONAL`. En rutas: `READ`/`WRITE` =
`["TALLER","TECNICO","ADMIN"]`, `JEFE` = `["TALLER","ADMIN"]` (anular), `READ_INV` suma
`ADMINISTRACION`.

⚠️ **`audit_actor_rol` es un enum de Postgres y hay que ampliarlo ANTES de que el rol exista en
`usuario.rol`.** Si no, cada acción auditada de ese rol hace **rollback silencioso**: la operación
"no falla", simplemente no queda. Al revisarlo apareció que **`DUENO` tampoco estaba** (Samuel lo
agregó a `usuario_rol_check` pero no al enum) — se agregaron los dos en la misma migración.

### C. "Mi taller" — la pantalla del técnico (`/taller/mi-taller`)
Mobile-first, 4 botones grandes en vez de un menú: **Iniciar un mantenimiento · Pedir material ·
Sacar aceite · Firmar mi trabajo**. Arriba, el trabajo en curso como contexto: tocarlo precarga el
avión y la OT en el modal siguiente, así que el técnico nunca teclea un número de orden. Pensada
para gente que usa el teléfono, no el escritorio.

### D. Pantallas del jefe de taller (`/taller/ordenes`)
Pestañas **Órdenes de trabajo · Por avión**: la lista con buscador y filtro de estado, y el **folder
del avión** con su historial. Abrir una orden muestra **todo su papeleo junto** — reporte de
inspección, requisiciones, solicitudes, retornos y partes reemplazadas — que era exactamente lo que
Daniel pidió ("un buscador para ver todos los documentos adjuntos a un mantenimiento").
Componentes en `CAA-frontend/src/pages/Taller/ordenes/`.

### E. PDFs
`generarOrdenTrabajoPDF` y `generarReporteInspeccionPDF`, con su código de formulario leído de
`taller_formulario` (mismo criterio que la fase 1).

### 🚨 Trampas de esta fase (no repetir)
1. **`PATCH /ordenes/:id` tenía un `SET` fijo** ⇒ un body parcial **nulificaba** piloto, acción
   correctiva y los enlaces al mantenimiento. Se descubrió porque el PDF salía con el campo Piloto
   vacío. Ahora el `SET` se arma con las claves realmente presentes en `req.body`.
2. **node-postgres devuelve `DATE` como objeto `Date`** ⇒ el PDF imprimía "Tue Jul 07". Misma trampa
   de §16.A; el formateador usa getters **locales** y tolera ambos tipos.
3. **El footer del PDF creaba una página en blanco** (mismo bug ya documentado de
   `pdfGenerator.drawFooter`): se dibuja en `page.height - 64` con `lineBreak:false`.
4. **`ellipsis` de pdfkit necesita `height`, no solo `width`**: sin eso las celdas largas se
   envolvían y pisaban la fila de abajo.

### Defectos de UI encontrados mirando la pantalla
La unidad del aceite salía `UN` en vez de `QT` · el folder por avión abría en **SIM-1** (un simulador,
que no tiene mantenimiento) → arranca en el primer avión real · "1 renglones".

---

## 32. Sesión 2026-08-17 (4ª tanda) — Papeleo del Taller, Fase 3: préstamo de partes entre talleres

Spec: `docs/superpowers/specs/2026-08-17-prestamo-de-partes-design.md`. Migración
`20260817000007`. Commits `aa6a283` (spec), `126054f` (backend), `5951878` (frontend).

### El caso
Los talleres del aeropuerto se prestan partes entre sí, en **las dos direcciones**, y eso mueve el
inventario **en tiempo real**: dato de Daniel, *"si es entrada, es del tipo que no está ligada a una
factura; igual si es una salida no está ligada a una OT"*. Y *se puede cerrar una OT con un préstamo
activo* ⇒ el estado del préstamo es **independiente** del de la orden de trabajo.

### El modelo
`taller_prestamo` (`direccion ∈ RECIBIDO|ENTREGADO`, `estado ∈ PENDIENTE|DEVUELTO|ANULADO`,
contraparte, solicitante, fechas de entrega y de compromiso) + `taller_prestamo_linea`. El tipo
`PRESTAMO` se sumó al CHECK de `taller_documento_inventario`, con prefijo **`PRE`** en el kardex y
correlativo propio **`PR-###-2026`** para el préstamo.

**Todo el signo del movimiento sale de una sola línea** (`prestamoController.js`):

```js
const signo = (direccion, momento) =>
  (direccion === "RECIBIDO" ? 1 : -1) * (momento === "ENTREGA" ? 1 : -1);
```

Prestar saca del estante; que nos presten, suma; y la devolución invierte cada caso. Solo se mueven
los renglones **con `id_repuesto`**: lo que se escribe a mano (un libro de horas, una llave de
torque) queda registrado pero no toca existencia — y en ese caso el préstamo **no genera documento
de bodega**.

### Reglas
- **409 si no alcanza la existencia** al prestar, con el detalle de qué falta; se puede **forzar con
  motivo escrito** (misma puerta que la salida de la fase 1).
- **Devolución parcial**: se anota lo que volvió y el préstamo sigue abierto por el resto.
  **Cerrar sin devolución física** (`sin_devolucion`) para cuando se pagó o se cruzó en cuenta: no
  mueve existencia. Devolver de más de lo que salió → 400; devolver uno ya cerrado → 409.
- **Vencidos**: pasó la fecha comprometida, o más de un mes afuera sin fecha.
- **Anular** (jefe de taller) anula sus documentos y **recalcula** el stock desde cero.

### Frontend — pestaña "Préstamos" en `/taller/ordenes`
La dirección se elige **primero**, porque decide todo lo demás; en el papel había que deducirla de
quién figuraba como solicitante. Bitácora con filtros, franja roja contando los vencidos, y botón de
devolución por renglón pendiente (cantidades precargadas con lo que falta).

### Verificación
29/29 E2E contra Supabase real con limpieza total (las dos direcciones, parcial, exceso, cierre sin
devolución, 409 + forzado, anulación que devuelve stock). Y la pantalla revisada en el navegador a
**375 px** contra la BD real: alta con existencia insuficiente, alta normal, devolución completa que
cierra el préstamo y mueve el estante en el sentido correcto, y el kardex del ítem mostrando el
`PRE-###-2026` con su saldo corrido. Datos de prueba borrados y existencia restaurada.

### ⏸️ Lo que Daniel debe hacer para que esto sirva
**Dar de alta a los mecánicos como usuarios con su licencia TMA** (`Roger Pérez TMA 915`,
`José Estrada TMA 692`): sin `usuario.licencia_tma` **nadie puede firmar una orden de trabajo** —
es un 403 a propósito. También falta que pase **los manuales del avión** que se adjuntan a cada
mantenimiento.

---

## 33. Sesión 2026-08-18 — Alta de mecánicos con su licencia TMA desde Usuarios

**Desplegado y verificado en producción** (`origin/master` = `e0284c6`). Sin migración: las columnas
ya existían. Cierra el bloqueante que dejó la fase 3 del Taller.

### Eran dos huecos, no uno
1. **El selector de Usuarios no ofrecía los roles del Taller.** `usuariosController.ROLES_PERSONAL` ya
   aceptaba `TALLER` y `TECNICO` desde §31.B, pero el `ROLES_PERSONAL` **del frontend** (otra lista, en
   `pages/Administracion/Usuarios.jsx`) nunca los listó ⇒ no había forma de crear un mecánico sin SQL.
2. **`usuario.licencia_tma` y `certificado_aprendiz` eran columnas muertas.** Existían desde la
   migración `20260817000006` y el gate de firma las leía, pero **ningún camino de la app las escribía**.

### Cómo quedó
Bloque **"Credenciales de aeronavegabilidad"** en el alta y en la edición de personal, gateado por el rol
elegido (`ROLES_TALLER = ["TALLER","TECNICO"]`, mismo patrón que las capacidades del instructor). En la
edición **también se muestra si el usuario ya tiene un número cargado**, para que un cambio de rol no
deje la credencial huérfana e invisible. En la lista: insignia verde con el número, o ámbar
"Sin licencia TMA" si es rol de taller y no la tiene — se ve de un vistazo quién puede firmar.

⚠️ **La licencia NO va con `COALESCE`** como el resto de los campos de `editarPersonal`: una licencia
vencida hay que poder **borrarla**, y COALESCE lee el null como "no la toques". Va con bandera explícita
(`CASE WHEN $8 THEN $9 ELSE licencia_tma END`, con `$8 = licencia_tma !== undefined`): clave ausente en
el body = no se toca · clave vacía = se borra. El helper `credencial()` recorta espacios y deja **NULL**,
no cadena vacía — NULL es lo que mira el gate.

### 🚨 La prueba que estaba mintiendo (la trampa más cara de esta tanda)
La primera versión del E2E daba "OK" en *"sin licencia no puede firmar (403)"*… y ese 403 **no era el de
la licencia**: era el **candado de primer ingreso** (`must_change_password`/`must_set_email`), que todo
usuario recién creado arrastra y que responde con el mismo código. La aserción pasaba sin probar nada.
**Dos reglas que salen de acá:** levantar el candado de primer ingreso antes de medir cualquier otro gate
sobre un usuario nuevo, y **comprobar el mensaje, no solo el código** cuando dos gates comparten status.

### El aprendiz también era una columna muerta
Al cargar Daniel a los tres (jefe, mecánico y aprendiz) salió el gemelo del mismo problema:
`orden_trabajo.id_aprendiz` existía, `firmarOrden` lo aceptaba, el detalle lo mostraba y el PDF lo
imprimía — pero **ninguna pantalla lo mandaba**. Se agregó `GET /taller/personal` (personal del taller
con sus credenciales) y un selector **"Aprendiz que asistió (opcional)"** en `FirmarOrdenModal`, que
ofrece solo a quien tenga `certificado_aprendiz` y no aparece si no hay ninguno.

⚠️ **Patrón a vigilar:** entre la licencia TMA y el aprendiz van **dos columnas muertas seguidas** en el
mismo módulo — el backend y el PDF las consumían, y nadie las escribía. Al agregar una columna que un PDF
imprime, seguirla hasta la pantalla que la llena (misma familia que la trampa de los objetos literales).

### Verificación
19/19 contra Supabase real con backend local y limpieza total (incluida la cadena completa: sin licencia
403 → el admin la carga → firma 200 → la OT queda `CERRADA` con la certificación agregada → edit parcial
no la borra → vaciarla sí). 14/14 contra **producción** con un ciclo real y limpieza. Y la pantalla
revisada en el navegador: alta de un TECNICO con licencia, insignia verde, edición que precarga, borrado
que deja la insignia ámbar.

Lo del aprendiz: 15/15 local y 12/12 en producción, contra el personal real ya cargado (el aprendiz sale
en el selector, el jefe y el mecánico no, el aprendiz no puede firmar, y adjuntado llega al detalle y al
PDF). Las pruebas firman con un **técnico temporal** para no tocarle a los usuarios reales el flag de
primer ingreso — se verifica al final que los tres siguen intactos.

---

## 34. Sesión 2026-08-18 (2ª tanda) — Cola de trabajo, revisión del jefe y estimado de finalización

**Desplegado y verificado en producción** (`origin/master` = `df0479f`). Migración `20260818000001`.
Spec: `docs/superpowers/specs/2026-08-18-cola-de-trabajo-y-revision-del-jefe-design.md`.
Cierra el flujo del Taller de punta a punta.

### El circuito
```
TURNO/ADMIN manda el avión a MANTO          (sin cambios: Operaciones sigue siendo dueño de la flota)
   → COLA DEL TALLER: aviones esperando trabajo
   → el mecánico la toma, o el jefe se la asigna
   → ORDEN DE TRABAJO enlazada al mantenimiento (de ella cuelga el papeleo de bodega)
   → el mecánico firma → FIRMADA (esperando revisión)
   → el jefe aprueba → APROBADA  ·  o la devuelve con nota → vuelve a ABIERTA
   → cuando NO queda orden pendiente: aviso a Operaciones "listo para devolver"
   → TURNO/ADMIN cierra el mantenimiento
```

### Decisiones de Daniel
| | |
|---|---|
| ¿Quién manda a MANTO? | **Operaciones.** El Taller no gana permisos sobre la flota, solo ve la cola. |
| ¿Aprobar devuelve el avión? | **No: avisa** y Operaciones confirma. El Taller certifica, Operaciones dispone. |
| ¿El jefe aprueba lo suyo? | **Sí, pero queda marcado** (`aprobacion_propia`). En un taller chico a veces no hay de otra. |
| ¿Y la duración? | **Manda el Taller.** Su fecha pisa la de Operaciones y los vuelos que queden adentro se cancelan. |

### Modelo
- **La cola NO es tabla nueva**: sale de cruzar `mantenimiento_aeronave` con sus órdenes. Esto por fin
  le da uso a `orden_trabajo.id_mantenimiento` — **la tercera columna muerta del módulo** (§33).
  Se evitó una cuarta entidad: ya hay tres conceptos de "mantenimiento" y sumar otro confunde más de
  lo que ordena. Un avión puede llevar **varias órdenes** y no se libera hasta que todas se aprueben.
- `orden_trabajo` += `id_mecanico_asignado` (**distinto de `id_mecanico`**, que es quien firma al
  terminar), `id_aprobador`, `fecha_aprobacion`, `aprobacion_propia`, `nota_revision`, `devoluciones`.
  Estados: `ABIERTA → FIRMADA → APROBADA` (antes `ABIERTA|CERRADA`). **Asignar no bloquea**: en una
  inspección grande trabajan varios.
- **Estimado**: el Taller escribe directo sobre `mantenimiento_aeronave.fecha_fin` (una sola fuente de
  verdad; todo lo que ya la lee sigue funcionando) y se guarda `fecha_fin_original` + `estimado_por` +
  `motivo_estimado` para explicar después por qué se cancelaron esos vuelos. **La hora sale de los
  bloques**: listo el viernes a las 14:00 ⇒ se cierran los bloques de la mañana y la tarde queda libre.
  Cancelar y restaurar salen **simétricos gratis** de `cancelarVuelosAfectadosPorMantenimiento`, que
  recalcula sobre toda la ventana y devuelve cada vuelo a su estado previo.
- ⚠️ **Dry-run obligatorio antes de confirmar** (`preview-estimado`): mover una fecha puede cancelarle
  el vuelo a diez alumnos. El modal lo muestra mientras se escribe la fecha.

### Pantallas
**Mi taller**: "Aviones esperando trabajo" arriba de los botones; tomar uno abre la orden ya enlazada y
asignada. El botón de firmar dejó de decir "cierra la orden" (mentía) y dice **"Terminé — mandar a
revisión"**. El trabajo en curso avisa si espera al jefe o si se lo devolvieron con la nota.
**Trabajos del taller**: pestaña **"Por revisar"**, ahora la primera — arriba lo que espera su firma,
abajo los aviones del hangar con selector de asignación y el botón de mover la fecha.

### Verificación
35/35 local + 18/18 contra **producción**, con limpieza total y el mantenimiento de prueba en 2027 para
no rozar ningún vuelo real. Circuito completo recorrido en el navegador a 375 px.

### 🚨 Trampas de esta tanda (todas en las PRUEBAS, no en el código)
1. **`String(fecha).slice(0,10)` da `"Wed Mar 10"`** — node-postgres devuelve DATE como objeto `Date`.
   Tercera vez que muerde (§16.A, §31). Usar un formateador con getters locales.
2. **`LIKE` en Postgres distingue mayúsculas** — `'%listo%'` no encuentra `"Listo para devolver"`.
3. **Comparar `creada_en > NOW() - INTERVAL` desde otra conexión da 6 h de diferencia**: es
   `timestamp` sin zona y el backend fija `America/El_Salvador` en la suya, la prueba no. Mismo
   desfase de §21.D. **Comparar por `id`, no por fecha.**
4. Un 403 puede venir de dos gates distintos (§33): comprobar el **mensaje**, no solo el código.

### Defecto encontrado mirando la pantalla
Tras firmar, el avión volvía a ofrecer **"Tomar este avión"** aunque el trabajo seguía siendo del
mecánico esperando al jefe — invitaba a abrir una orden duplicada. Ahora dice "Esperando al jefe".

### Fuera de alcance
Que el Taller mande aviones a MANTO · que aprobar devuelva el avión al servicio solo · reprogramar los
vuelos cancelados (se cancelan, no se mueven).

---

## 35. Sesión 2026-08-19 — Cronómetro del trabajo, firma de entrega de material, y navegación del inventario

**Desplegado y verificado en producción** (`origin/master` = `7ad0eb1`). Migraciones `20260819000001`
y `20260820000001`.
Sesión de pulido sobre el Taller mientras Daniel probaba el circuito en vivo.

### A. El cronómetro arrancaba adelantado (dos intentos: el primero NO alcanzó)
**Primer intento (`aa6c3af`) — incompleto, el bug volvió.** Se movió la resta del navegador a la base
(`segundos_trabajo` en `SELECT_OT`, compartido por lista/detalle/folder). Eso quitó UNA fuente de
desfase, pero la resta seguía siendo `NOW() - creado_en`, o sea **seguía dependiendo de la zona de la
sesión**. Daniel lo volvió a ver: *"cuando abrí un mantenimiento el contador inició desde 5 horas,
pero cuando lo cierro y lo reviso sí me tira el tiempo real"*.

**Esa asimetría es la pista y da el diagnóstico exacto:**

| | por qué |
|---|---|
| Orden **CERRADA** → siempre bien | `firmado_en - creado_en` resta dos columnas de la **misma base**; la zona no la toca |
| Orden **ABIERTA** → mal | mezcla `NOW()` con una columna **sin zona** ⇒ depende de la sesión |

Medido sobre la MISMA fila y la MISMA fórmula: **0.12 h** con la sesión en `America/El_Salvador` y
**6.12 h** con la sesión en UTC. Y la prueba dio **−6 h**, no +6: el signo se invierte según qué zona
estaba activa al **ESCRIBIR** frente a la de **LEER** ⇒ **el desfase no es constante, es no
determinista** (por eso "6 horas" una vez y "5" otra, y por eso parecía arreglado y volvía).

**Por qué la sesión no siempre es la correcta:** `config/db.js` lanza `client.query("SET timezone…")`
en el evento `connect` **sin await**, y el pooler de Supabase puede reiniciar ese estado; además
cualquier script que escriba sin fijarla (migraciones, seeds, `query.js`) guarda en **UTC**.

**Arreglo real (`7ad0eb1`, migración `20260820000001`): fijar la zona en las DOS puntas en vez de
heredarla.** La lectura del reloj y todas las marcas que entran en él (`firmado_en`, `aprobado_en`,
`asignado_en`, `anulado_en`) con `AT TIME ZONE 'America/El_Salvador'`, y el **DEFAULT de `creado_en`**
fijado por migración — en `orden_trabajo` y también en `taller_documento_inventario`, que tenía el
mismo patrón sembrado esperando a la próxima pantalla que calculara duraciones.

**Quinta aparición del mismo desfase** (§21.D, §31, §34, §35). La regla que sale de acá **corrige** la
que había quedado escrita ("restar en SQL"), que era insuficiente:
> Con columnas `timestamp` SIN zona, restar en SQL **no basta**: hay que **fijar la zona
> explícitamente en la expresión y en el DEFAULT**, nunca heredarla de la sesión. Si una duración sale
> bien con el registro cerrado y mal con el registro abierto, es exactamente esto.
- ⚠️ El arreglo venía escrito de antes **y el backend no compilaba**: un comentario con backticks
  dentro del template string cortaba la cadena. Se detectó porque la prueba medía comportamiento
  viejo — había **otro backend escuchando en el 5099** desde antes. Al probar en local, confirmar
  que el server que responde es el que acabás de levantar (`netstat` + leer su log de arranque).

### B. La solicitud CAAA-004-F se firma a mano
`taller_documento_inventario` += `firma_entrega`, `firma_recibe` (mig `20260819000001`).
`firmarSolicitud` las guarda, `FirmarEntregaModal` dibuja los dos `SignaturePad` (el mismo componente
de la vouchera del alumno) y `generarSolicitudPDF` los imprime sobre su línea ⇒ **el papel sale del
sistema ya firmado**. La de quien entrega es obligatoria; la de quien recibe, opcional.
- Verificado 12/12: el trazo queda guardado, el PDF **con** firmas lleva más imágenes que el mismo PDF
  **sin** ellas (comparación con y sin — buscar `/Image` a secas da falso positivo por el logo), la
  descarga respeta la cantidad que bodega ajustó, y el cronómetro arranca en cero.

### C. Navegación del inventario y jerarquía visual
- **Los PRÉSTAMOS se mudaron de "Trabajos del taller" a Inventario**: mueven la existencia igual que
  una entrada o una salida, y un préstamo sigue abierto aunque la orden ya se haya cerrado. El
  mecánico conserva el acceso (`DEL_MECANICO = ["existencias","prestamos"]`) porque ahí deja su firma.
- Las 6 pestañas planas pasan a **3 grupos** — Existencias · Movimientos · Reportes — en pista
  redondeada con la activa levantada (contraste medido **10.84:1** contra la pista). `.inv-tabs`/
  `.inv-tab` **las comparte `OrdenesTrabajo.jsx`**, así que un solo cambio vale para las dos pantallas.
- Los filtros eran **los controles crudos del navegador** (el CSS solo les ponía `min-width`). Una
  regla compartida `.inv-filtros input/select, .inv-campo` con foco visible y lupa embebida, aplicada
  también a los campos sueltos de Aeronavegabilidad y Costos pendientes.
- **Mi taller — un solo botón relleno por pantalla, y es lo que toca hacer**: con trabajo abierto es
  "Terminé"; sin trabajo, "Iniciar un mantenimiento". Antes el relleno era siempre "Iniciar", así que
  el técnico a media faena veía destacado justo lo que NO iba a hacer.

### 🚨 Blanco sobre blanco, tercera vez
`.tec-acciones .tec-btn` (0,2,0) pesa más que `.tec-btn--principal` (0,1,0) ⇒ le pisaba el fondo navy
y dejaba el botón relleno **invisible**. Va corregido con `:not(.tec-btn--principal)` y un comentario
que explica que el `:not()` **no es decorativo**. Las tres veces (§ `--c-primary` inexistente,
`.tec-btn--claro`, y esta) son la misma familia: **estilar contra un fondo supuesto**.
- **Lo que se hace ahora en su lugar**: medir contraste real resolviendo `oklch()` con un canvas y
  caminando hacia arriba hasta el primer ancestro opaco. Barrido sobre las **12 pantallas del módulo:
  cero controles por debajo de 3:1**.

### ⚠️ Medir con el panel del navegador oculto da datos viejos
Pareció haber un bug grave de móvil (el contenido en 107 px, el sidebar sin replegarse). **Era falso:**
con el panel oculto el renderer no rehace el layout al cambiar de tamaño, así que el estilo calculado
del árbol existente queda del tamaño anterior. Se descubrió creando un `div` nuevo con la misma clase:
ese **sí** computaba `translateX(-244px)`. **Para medir responsive hay que RECARGAR al tamaño nuevo**
(`matchMedia` y `clientWidth` ya reportan bien y engañan). Medido en limpio a 375 px: sidebar
replegado, cada grupo en su fila, sin desborde horizontal.

### Pendiente que quedó preguntado
Los radios suavizados se aplicaron **solo al módulo Taller**. Extenderlo a Administración y
Operaciones es cambiar un token, pero toca toda la app — falta que Daniel decida.

---

## 36. Sesión 2026-08-20 — "Mi taller" pasa a ser la pantalla principal (fin de la dualidad)

**Desplegado y verificado en producción** (`origin/master` = `5d691d8`). Sin migración.
Cuatro commits, todos salidos de Daniel probando el circuito en vivo:
`8a3defb` (el jefe veía trabajo ajeno como propio) · `ec20c54` (tacómetro + despacho desde la
tarjeta) · `90fafc0` (los firmados con el reloj detenido) · `5d691d8` (el merge).

### A. 🐛 Al jefe le aparecía el trabajo del mecánico como propio
"Mi taller" pedía `getOrdenes({ abiertas: "true" })`, un filtro que mira el **estado**
(`ABIERTA`/`FIRMADA`) y **no la persona**. Con una sola orden abierta en todo el taller, la
pantalla del jefe se la adjudicaba y anunciaba "estás trabajando en"; y abajo el MISMO avión salía
en la cola con "Tomar este avión", como si nadie lo hubiera empezado. En el perfil de quien inicia
el trabajo se veía bien **solo porque ahí coincidía**.
- **Ya existía el filtro correcto y nadie lo usaba**: `asignadas=true` (`o.id_mecanico_asignado = uid
  OR o.creado_por = uid`). El arreglo es agregarlo. ⚠️ Patrón a vigilar: un filtro de lista que
  distingue por estado no distingue por dueño; si la pantalla dice "lo mío", tiene que pedir lo mío.
- La cola además pasa a decir **quién está adentro** del avión y el botón a **"Abrir otro trabajo"**:
  un avión lleva varias órdenes, pero ofrecer "tomar" uno ya intervenido invita a duplicarlo.

### B. 🚨 La dualidad — dos pantallas para la misma acción se contradicen
Daniel: *"veo que hay una dualidad… lo puedo hacer desde ahí o dando click a la tarjeta… mejor
hacer el merge y centralizarlo en un solo lugar"*. La firma se daba desde "Esperando tu firma"
(pantalla del jefe) **o** desde la tarjeta de "Trabajos en curso"; y la cola de aviones vivía en la
pantalla del técnico mientras los trabajos vivían en la del jefe ⇒ el mismo avión aparecía dos veces
diciendo cosas incompatibles.

**Ahora es UNA sola lista, `El taller ahora`, dentro de "Mi taller", que es la pantalla principal.**
Cada avión trae sus trabajos con quién lo lleva y con quién, el **tacómetro**, el **cronómetro**
(detenido si ya se firmó), el **material pedido** —que se despacha desde la misma tarjeta— y, para
el jefe, el selector para reasignar; debajo, el botón para tomarlo o abrirle otro trabajo.

> **La regla que ordena todo esto: lo que uno puede hacer sale de QUIÉN ES, no de en qué pantalla
> está.** Por eso la pantalla es la misma para el mecánico y para el jefe, y solo cambian los
> controles que ofrece. Tocar un trabajo hace lo que corresponda: el mío me lleva a mi tarjeta, el
> firmado el jefe lo revisa y firma ahí, el resto se mira.

- `/taller/ordenes` queda como **el archivo**: historial de órdenes y folder por avión. Se
  **retiraron** `PorRevisar.jsx` y `TrabajosEnCurso.jsx` (sin uso). Componente nuevo:
  `pages/Taller/ordenes/TallerAhora.jsx`.
- Permisos, verificados con los dos perfiles: el jefe ve "esperando tu firma", el selector de
  asignación y la franja de material; el mecánico ve "tuyo · esperando al jefe" y **nada de eso**
  (su 403 de `getDocumentos` va atrapado ⇒ la franja simplemente no aparece).

### C. El papel se llena solo donde el sistema ya sabe la respuesta
- **Requisición**: `cliente` = `CAAA / OMA` y `solicitante` = quien tiene la sesión abierta, los dos
  precargados y **editables** (a veces el avión es de un tercero). Constante `CLIENTE_PROPIO` y
  helper `yo()` en `DocumentoModal.jsx`.
- **N° de solicitud** derivado de la orden (`CAAA/2026-0001` → `0001`), que es lo que dice el papel;
  solo se rellena si está vacío, para no pisar lo tecleado.
- ⚠️ El **número de orden en la solicitud ya se heredaba** correctamente desde la requisición
  (`heredar()` en el backend, verificado en `SOL-001` de producción) — lo que faltaba era verlo.

### D. Backend: `colaTrabajo` enriquecido
El JSON de cada trabajo suma `tacometro`, `segundos_trabajo`, `documentos`, `aprendiz_nombre` y
`devoluciones`, para que **una sola consulta** alimente toda la pantalla en vez de cruzar dos en el
navegador. El cronómetro va con la **zona FIJADA** (`NOW() AT TIME ZONE 'America/El_Salvador'`),
igual que en `SELECT_OT` — §35.A.

### ⚠️ Trampas de esta tanda
1. **Backticks dentro de un template string, segunda vez en dos días.** Un comentario SQL con
   `` `timestamp` `` corta la cadena y el backend no compila. En los comentarios de esas consultas,
   nada de comillas invertidas.
2. **Finales de línea mixtos en el mismo archivo.** `ordenTrabajoController.js` y `CLAUDE.md` tienen
   CRLF, otros LF; detectar por la primera línea falla. Al parchear por texto, mirar los bytes reales
   (`repr()`) antes de asumir.
3. **Loguearse por script rompe la sesión del navegador** (sesión única rota el UUID): el token que
   estaba probando en la pantalla queda inválido y la app manda a /login. No es un bug.
4. El barrido de contraste encontró **un texto real a 2.57:1** ("Nadie lo tomó todavía", `--c-ink-4`
   sobre la tarjeta) ⇒ corregido a 4.83. El token `--c-ok-500` **no existe**; es `--c-success-500`.

---

## 37. Sesión 2026-08-22 — Stickers de constancia para los libros del avión (célula, motor, hélice)

**Implementado y verificado; ⚠️ PENDIENTE EL PUSH A MASTER** (el clasificador de auto-mode lo
bloqueó, §10). Las **3 migraciones ya están aplicadas en Supabase** y son aditivas, así que el
backend viejo las tolera. Rama `claude/workshop-inventory-system-292b6b`, 5 commits
`ea27f83..c63e0b0`, 5 adelante de `origin/master` y 0 atrás (Samuel no había pusheado nada).
Spec: `docs/superpowers/specs/2026-08-22-stickers-libros-aeronave-design.md`.
Los 11 formatos originales quedaron commiteados en `docs/formatos-aac/stickers/`.

### A. El caso
Cada avión lleva **tres libros físicos** —célula, motor y hélice— exigidos por la certificación de
la AAC, y cada trabajo se acredita pegando en ellos un **sticker** impreso. Se escribían a mano en
Word, en papel adhesivo carta que se recorta.

### B. 🔑 Las dos escalas del TAC (lo que hay que entender antes de tocar nada)

| | |
|---|---|
| **Tacómetro (TAC)** | No mide tiempo: mide RPM acumuladas, calibrado a RPM de crucero. En taxeo corre más lento que el reloj ⇒ siempre marca menos que el tiempo real. Por eso el mantenimiento va por TAC. |
| **Hobbs** | Reloj real, 1:1. Para cobrar. |
| **T.T. (Tiempo Total)** | **No es un instrumento: es un número que vive en el libro.** Y hay uno **por parte**: la célula, el motor y la hélice llevan relojes distintos (el motor se baja, se overhaulea y se vuelve a montar). |

**El T.T. es el TAC más un offset fijo por parte**, y los stickers reales lo prueban: en el
YS-334-PE el motor da **+7,088.42 idéntico en tres stickers de fechas distintas** y la hélice
**−1,846.32** en los tres. Esa es exactamente la fórmula que `taller_componente` traía escrita
desde la migración 011 — **el modelo estaba bien; nadie lo llenó**.

**El tacómetro del YS-334-PE dio la vuelta** entre sep-2025 (sticker: TAC 9,588.18) y feb-2026
(TAC 10,000.03): llegó a 9999.99 y volvió a 0000.03. Los mecánicos le suman 10,000 a mano; **los
instructores digitan la lectura cruda** (127 lecturas en la BD, todas entre 331.07 y 429.10). Los
otros tres aviones no tienen el problema. Ése es el "TAC desfasado" que se recordaba, y es **un
solo avión con un solo offset**.

⚠️ **La regla que sostiene todo el diseño:** `taller_componente.horas_aeronave_instalacion` guarda
el TAC del anclaje en la **escala CRUDA** del sistema. Así `T.T.` y `TSO` son *diferencias* y el
`tac_offset` se cancela solo — solo afecta al campo TAC impreso y a los mini de próxima inspección.
Confundir las dos escalas acá son **10,000 horas en un documento legal**.

### C. Lo que el papel traía mal (y el sistema elimina)
- En el **YS-127-P** y el **YS-270-P** el `T.T.` del motor y de la hélice está **copiado del de la
  célula** — los tres stickers dicen el mismo número.
- La hélice del **YS-127-P** dice `9,893.89` en sep-2025 y `2,846.19` en jul-2026, **con el mismo
  S/N**. El de 2025 es el copiado.
- El offset del YS-334-PE cambió de `+4.07` a `+5.09` entre dos stickers: aritmética a mano.

### D. Modelo (migraciones `20260822000001`, `000002`, `000003`)
- **`taller_componente`** += `marca`, `modelo`, `tipo_certificado` (T.C.), `tso_ancla`, y
  `ancla_actualizado_en/_por` + `ancla_origen` (texto libre). `parte_no`→M/N, `serie_no`→S/N.
- **El anclaje pasa a ser NULLABLE** (mig `000002`): hay partes cuyo T.T. no se puede confiar. Poner
  0 haría que la fórmula devolviera **la lectura cruda como si fuera el tiempo total**. Con NULL la
  fórmula propaga NULL y la pantalla dice "sin anclaje: dictalo del libro".
- **`aeronave.tac_offset`** (YS-334-PE = 10000). **Se aplica SOLO al imprimir documentos del Taller.**
- **`taller_sticker_plantilla`** (avión × parte × tipo): el texto precargado. Es por avión porque el
  manual cambia (761-660 el Tomahawk, D2064-1-13 el 152, 753-586 el Cherokee y el Arrow).
  Placeholders `{orden}` y `{proxima}`.
- **`taller_sticker`**: el sticker emitido, **congelado** (TAC, T.T., TSO, P/N, texto, firmantes).
  Una vez pegado es un registro legal: re-imprimir lee lo guardado, **nunca recalcula**. Se llama así
  y no `orden_trabajo_sticker` porque **puede existir sin orden** (cierre y apertura de libro).
- Fila `STICKER` en `taller_formulario` con `CO-OMA-CAAA-014`.

### E. La red de seguridad: corregir un sticker arregla el futuro
Los tres números salen calculados pero **editables**. Si el mecánico corrige `T.T.` o `TSO`, el
servidor **re-ancla esa parte** — aunque no sea jefe: ese número ya quedó impreso y firmado en un
libro oficial, y seguir calculando desde otro solo garantiza que el próximo sticker salga mal. Queda
el rastro (`ancla_origen`) para que el jefe lo vea; **lo que no puede es quedar en silencio.**

### F. Qué libros toca el trabajo (mig `20260822000004`)
Al **abrir** la orden se declara sobre qué se va a trabajar: `orden_trabajo.toca_celula/_motor/
_helice`, los tres `DEFAULT TRUE`. **Es un default, no un candado** (decisión de Daniel): precarga
las casillas al emitir, pero ahí se puede agregar o quitar un libro — un trabajo descubre trabajo, y
la orden del 333 se abrió por el motor y terminó llevándose la hélice. Con la orden `ABIERTA` se
corrige por `PATCH /taller/ordenes/:id`.

⚠️ **Sin esto el aviso "órdenes firmadas sin sticker" mentía**: listaba todas las órdenes del avión
en los tres libros, así que un cambio de aceite del motor iba a aparecer como "falta pegar" en el
libro de la célula y en el de la hélice **para siempre**. Lo destapó Daniel preguntando por qué el
mantenimiento manual no dejaba elegir la parte.

### G. Pantallas
- **Emisión** desde la orden de trabajo (`EmitirStickersModal`): elegir libros, tipo, números y texto.
  Sale un PDF con los stickers **más el par de mini "próxima inspección"** (TAC + 25 y + 50).
- **Trabajos gana una tercera pestaña, "Libros del avión"** (`Libros.jsx`): tres libros por avión con
  la ficha de la parte, el T.T./TSO de hoy y la lista cronológica. **Los stickers de cierre y apertura
  parten la lista en volúmenes** sin tabla nueva: el evento ya es el borde. Una orden firmada sin
  sticker sale marcada. Al abrir un renglón se reusa entero `OrdenDetalleModal`.
- Plantillas y anclajes: **solo el jefe**. Emitir: mecánico también.

### H. Siembra (`supabase/dump/seed_stickers_libros.js`, ya corrida)
12 partes de los 4 aviones con stickers. Las **cuatro células con confianza**, más motor y hélice del
Tomahawk. El resto queda **sin anclaje a propósito**: el motor del 333 y el del 270 están **fuera del
avión** (reparación mayor y caja rajada), y el T.T. del motor del 127 y de la hélice del 270 viene
copiado en el papel. **YS-155-PE y YS-259-PE no tienen nada.**

### 🚨 Trampas de esta tanda
1. **Un `UPDATE` cuyo `SET` no referencia `$1` y `$2`** (eran solo la llave de búsqueda) da
   **42P18 "could not determine data type of parameter"**. Y con NULL en todos los valores de un
   parámetro hay que **castear** (`$9::numeric`) — la misma trampa de `$4::numeric` de §15.
2. **Había otro backend viejo escuchando en el 5099**: el mío murió con EADDRINUSE y las pruebas
   corrieron **contra el código viejo**, dando un 404 que parecía un bug de rutas. Es la lección de
   §35.A y volvió a morder. **Confirmar en el log que el server que responde es el que levantaste.**
3. **El medidor de contraste daba ratio exactamente 1.00 en todo**: el canvas necesita `width`/
   `height` explícitos para que `getImageData` devuelva lo pintado. Un medidor roto que reporta
   "30 defectos" es peor que no medir. Con el arreglo: **0 bajo umbral, peor caso 4.58:1**.
4. **Heredocs largos rompen la shell** de este entorno (`unexpected EOF`). Para contenido grande:
   escribir a archivo y anexar, o parchear con un script de Python.
5. **`String.replace` con anclas multilínea falla por CRLF**: normalizar el `eol` antes de parchear.
   Y `rfind` de un cierre JSX puede caer en un **sub-componente al final del archivo** — pasó, el
   modal quedó insertado dentro de un helper.

### Defectos que solo se vieron mirando la pantalla
- **"TMA #TMA 001"**: `usuario.licencia_tma` ya se guarda con el prefijo (`"TMA 090"`).
- **"el célula" / "el hélice"**: se renombró para hablar del **libro**, que concuerda con las tres.
- 9 px de desborde horizontal a 375 px: faltaba `flexWrap` en las filas de botones.

### Verificación
**59/59 E2E** en dos suites contra Supabase real con limpieza total (45 de stickers + 14 de la
declaración de partes), incluida la prueba explícita de las dos
escalas (el TAC del libro sale con +10,000 y los tres offsets se reproducen exactos), el re-anclaje,
que el anclaje quede en escala cruda, los 403 del técnico y que una edición parcial de la ficha no
nulifique el resto. PDF revisado renderizado a PNG (1 y 2 páginas, sin partir recuadros). Pantallas
revisadas en el navegador a 1280 y 375 px.

### 🔴 Los bimotores necesitan CINCO libros, no tres
El modelo asume **un motor y una hélice** por avión. Un bimotor lleva dos de cada uno, y cada uno
tiene su libro con su T.T. y su TSO. El **YS-259-PE** ya está en la flota y **la escuela acaba de
comprar un segundo bimotor** (dato de Daniel, 2026-08-22) ⇒ deja de ser hipotético.

Ninguno tiene partes cargadas, así que **no hay nada mal registrado**: es hueco de alcance, no dato
corrupto. Toca `taller_componente.posicion` (ya existe, ahí iría LH/RH), `partesDe()` (se queda con
una fila por tipo), los CHECK de `parte` en `taller_sticker` y `taller_sticker_plantilla`, las tres
banderas `orden_trabajo.toca_*` y las tres pestañas de la vista Libros.
**No modelarlo a ciegas:** primero ver un juego de stickers real de un bimotor — si distinguen los
motores por posición o por serie, y si el libro de la célula cambia en algo.

### Lo que falta
- **El formato de 25 h** no existe entre los archivos entregados: el tipo está creado con la plantilla
  vacía y se escribe desde la app cuando lo tengan.
- **Los dos bimotores** (ver arriba), cuando toque cargarles los libros.
- **Dictar del libro** el T.T. del motor y la hélice del 127 y del 270, y las tres partes del 155 y
  el 259. Es trabajo del mecánico, no del software.
- Cotejar contra la **tabla grande de conteo de horas y seguimiento de mantenimientos** que Daniel
  todavía no entregó. Cuando llegue, se coteja: no se rehace.
