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
| `u_taller` | TALLER | Taller Prueba (mecánico, id_usuario 111). Seed `supabase/dump/seed_usuario_taller.sql`. **Usar para probar el módulo Taller** (sección 15). |

- El login acepta password en **texto plano** (`demo123`) y lo convierte a bcrypt al primer login (`authController.js`).
- **⚠️ Robapantallas de primer login (desde sesión 2026-06-12, ver sección 15):** alumnos e instructores con `usuario.datos_confirmados = false` ven un modal bloqueante al entrar. Todas las cuentas demo de alumno/instructor (u4–u8 y los 104 reales) están **sin confirmar**, así que verás el modal. Para saltarlo en pruebas: `node query.js "UPDATE usuario SET datos_confirmados=true WHERE username='uX'"`. El viejo gate de documentos de vuelo del alumno se retiró del bloqueo (ahora es recordatorio en /perfil).
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
