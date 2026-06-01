# CAAA — Sistema de Gestión de Centro de Adiestramiento Aéreo Académico

Contexto del proyecto para continuar en cualquier sesión. **Léelo completo antes de trabajar.**

---

## 1. Qué es

App full-stack para una escuela de aviación (CAAA, Ilopango, El Salvador). Gestiona
alumnos, instructores, programación de vuelos, mantenimiento de aeronaves, módulo de
administración/contabilidad, y un **loadsheet (peso & balance)** integrado.

Roles: `ADMIN`, `PROGRAMACION`, `TURNO`, `ALUMNO`, `INSTRUCTOR`, `ADMINISTRACION`.

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

**Auto-deploy configurado.** Cada `git push origin master`:
- **Vercel** auto-construye el frontend. Funciona porque el **Root Directory** del proyecto en Vercel está puesto en `CAA-frontend` (Settings → Build and Deployment). El `CAA-frontend/vercel.json` tiene el rewrite SPA (`/(.*) → /index.html`).
- **Railway NO auto-despliega desde git.** El backend se despliega manualmente con:
  ```powershell
  cd "C:\Users\Daniel\Desktop\CAAA modulo op+admin\legacy\CAA-backend"
  railway up --detach
  ```
  (Requiere `railway login` previo — credenciales del usuario `danielmancia111203@gmail.com`.)

**Flujo normal para un cambio:**
1. Editar código.
2. `cd CAA-frontend; $env:VITE_API_URL="https://caaa-backend-production.up.railway.app"; npm run build` (verificar que compila).
3. Si tocaste backend: `railway up --detach` desde `legacy/CAA-backend`.
4. `git add ... && git commit -F <archivo-msg> && git push origin master` (frontend se auto-despliega).

### CLI
- Vercel CLI logueado como `danielmancia111203-2224`. Equipo de deploy: `--scope caaa`.
- Railway CLI logueado. Proyecto `caaa-backend` ya linkeado en `legacy/CAA-backend`.

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
Ya corregido: `reporte_vuelo_estado_check` ahora incluye `PENDIENTE_ALUMNO`.

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
| `u9` | TURNO | |
| `u_admin_fin` | ADMINISTRACION | Administración Financiera. Reseteado a `demo123` (flags de bloqueo limpios) vía `supabase/dump/reset_admin_fin.sql`. **Usar para probar administración/contabilidad.** |

- El login acepta password en **texto plano** (`demo123`) y lo convierte a bcrypt al primer login (`authController.js`).
- Los alumnos demo (u4/u5/u7) tienen documentos rellenados (`supabase/dump/backfill_demo_alumnos.sql`) para pasar el bloqueo `must_complete_profile`.
- Aeronaves: id 1 YS-334-PE (PA-38), 2 YS-333-PE (C-152), 3 YS-270-P (PA-28), 4 YS-127-P (PA-28R), 5 SIM-1 (SIMULADOR, sin W&B).

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

**Pendiente / siguiente:**
- **Observaciones del instructor** sobre el loadsheet (el usuario lo quiere: que el instructor escriba comentarios que el alumno luego ve). Aún no implementado.
- Configurar SMTP si se quiere envío de correo real del loadsheet.
- Seguir probando módulos no ejercitados (Aula Virtual, Recibos/Facturas/Egresos manuales, etc.) → esperar más deriva de esquema y arreglar con el proceso de la sección 6.
- `PLAN_IMPLEMENTACION.md` tiene el plan original por fases (Fases 1-2 ya implementadas, 4-5 en curso).
