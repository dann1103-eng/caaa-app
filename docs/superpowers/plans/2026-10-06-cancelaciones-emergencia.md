# Cancelaciones de emergencia — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que una cancelación pedida con menos de 24 h exija una constancia, se vea con prioridad para quien aprueba, y que el alumno pueda pedirla hasta la hora real del vuelo.

**Architecture:** la "emergencia" es un dato derivado (`salida − creado_en < 24 h`) que vive en fragmentos SQL de `services/cancelacionService.js`; nadie más hace esa cuenta. La solicitud y sus constancias entran en un solo `POST` multipart dentro de una transacción: en emergencia, si una subida falla no se crea nada. Sin migración.

**Tech Stack:** Express + `pg` + `multer` (memoria) + Supabase Storage · React 19 + Vite · `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-cancelaciones-emergencia-design.md`

> **Estado (2026-10-06): tareas 1 a 10 completadas y revisadas.** Lo que cambió
> respecto de este plan —el middleware propio, los tres defectos de la revisión
> del código, el push que no salía— está en la spec, que es la que quedó al día.
> De la tarea 11 falta la prueba contra el esquema `demo`: se reemplazó por una
> prueba de punta a punta dentro de una transacción que se deshace
> (`_e2e_cancelaciones.js`), porque `demo` está dos migraciones atrás.

---

## Mapa de archivos

| archivo | responsabilidad |
|---|---|
| `legacy/CAA-backend/services/cancelacionService.js` | la regla (fragmentos SQL) y guardar/borrar constancias en Storage |
| `legacy/CAA-backend/utils/constancias.js` (nuevo) | límites y validación de archivos, mensajes de `multer`: puro |
| `legacy/CAA-backend/routes/alumnoRoutes.js` | `multer` + envoltorio de errores en las dos rutas que reciben archivos |
| `legacy/CAA-backend/controllers/alumno/alumnoCancelacionController.js` | crear, listar lo propio, retirar |
| `legacy/CAA-backend/controllers/cancelacionAdjuntoController.js` | agregar / borrar / abrir constancias |
| `legacy/CAA-backend/controllers/alumno/alumnoVueloController.js` | `fecha_hora_vuelo` en el horario, `es_emergencia` en condiciones |
| `legacy/CAA-backend/controllers/admin/adminCancelacionController.js` | listado de quien aprueba, `tipo_cancelacion` al aceptar |
| `CAA-frontend/src/utils/constancias.js` (nuevo) | la misma validación, del lado del cliente |
| `CAA-frontend/src/services/alumnoApi.js` | crear con archivos, borrar constancia |
| `CAA-frontend/src/components/CancelarVueloModal/` | formulario en modo emergencia |
| `CAA-frontend/src/components/MiHorarioList/MiHorarioList.jsx` | botón de emergencia |
| `CAA-frontend/src/components/MisCancelaciones/` (nuevo) | pestaña del alumno |
| `CAA-frontend/src/pages/Alumno/Dashboard.jsx` | usa el componente nuevo |
| `CAA-frontend/src/pages/Admin/Cancelaciones.{jsx,css}` | contorno rojo, badge, anticipación |

Convenciones del repo que aplican: mensajes al usuario en español con voseo; `catchAsync` en los controllers; commits con `git commit -F <archivo>`; scripts de verificación `_*.js` en `legacy/CAA-backend/` (gitignored).

---

## Ajustes tras la revisión del diseño

El revisor de la spec encontró tres huecos; quedaron resueltos en la spec y se
reparten así entre las tareas:

| ajuste | tarea |
|---|---|
| `salidaVueloSQL` usa la salida del **tramo 1** cuando el vuelo es de una ruta; prueba de solo lectura contra las rutas reales (se salta si no hay) | 1 |
| La decisión de emergencia va **dentro** de la transacción; `pg_advisory_xact_lock(4712, id_alumno)` al empezar; subidas **en paralelo** con tope de 45 s y borrado de la que llegue tarde; prefijo `demo-` en la ruta cuando la petición es de la cuenta demo | 3 |
| El listado agrega `ya_salio`; **aceptar** responde 409 si el vuelo o algún tramo de su ruta está en curso o completado | 6 |
| Un 400 con `codigo: "CONSTANCIA_REQUERIDA"` pasa el formulario abierto a modo emergencia | 8 |
| La tarjeta dice "La hora de salida ya pasó" cuando `ya_salio` | 10 |

---

### Task 1: La regla en SQL

**Files:** Modify `legacy/CAA-backend/services/cancelacionService.js` · Test `legacy/CAA-backend/tests/cancelacionEmergenciaSQL.test.js`

- [ ] **Step 1: test que falla.** Contra la base, sin tocar tablas (filas con `VALUES`); se salta si no hay `DB_HOST`. Casos: 23 h 59 min → emergencia; 24 h exactas → no; 25 h → no; `seriaEmergenciaSQL` con una salida a `ahora + 23 h` y a `ahora + 25 h`; todo repetido con `SET timezone` en `UTC` y en `America/El_Salvador` dando lo mismo; `comoInstanteSQL` de `2026-10-07 13:30` devuelve el instante `19:30Z`.
- [ ] **Step 2:** `node --test tests/cancelacionEmergenciaSQL.test.js` → falla (no existen los exports).
- [ ] **Step 3: implementar.**

```js
const ZONA = "America/El_Salvador";
const HORAS_EMERGENCIA = 24;
const salidaVueloSQL = (v = "v", b = "b") => `(${v}.fecha_vuelo + ${b}.hora_inicio::time)`;
const AHORA_SV = `(NOW() AT TIME ZONE '${ZONA}')`;
const esEmergenciaSQL = (sc = "sc", v = "v", b = "b") =>
  `((${salidaVueloSQL(v, b)} - ${sc}.creado_en) < interval '${HORAS_EMERGENCIA} hours')`;
const seriaEmergenciaSQL = (v = "v", b = "b") =>
  `((${salidaVueloSQL(v, b)} - ${AHORA_SV}) < interval '${HORAS_EMERGENCIA} hours')`;
const comoInstanteSQL = (expr) => `(${expr} AT TIME ZONE '${ZONA}')`;
const horasSQL = (intervalo) => `ROUND((EXTRACT(EPOCH FROM (${intervalo})) / 3600.0)::numeric, 1)::float`;
const adjuntosJSONSQL = (sc = "sc") => /* json_agg de solicitud_cancelacion_adjunto, '[]' si no hay */;
```

- [ ] **Step 4:** el test pasa. **Step 5:** commit.

### Task 2: Validación de constancias (backend, pura)

**Files:** Create `legacy/CAA-backend/utils/constancias.js` · Test `legacy/CAA-backend/tests/constancias.test.js`

- [ ] **Step 1: test que falla.** `problemaDeConstancias(archivos, { yaHay })` devuelve `null` con una lista válida y un mensaje con: más de 5 (contando `yaHay`), tipo no permitido (nombra el archivo), archivo de más de 8 MB. `mensajeDeSubida(err)` traduce `LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, `LIMIT_UNEXPECTED_FILE`, conserva el mensaje del `fileFilter` y da uno genérico para lo demás. `extensionDe("Foto.JPG")` → `.jpg`.
- [ ] **Step 2:** falla. **Step 3:** implementar (`MAX_ARCHIVOS = 5`, `MAX_BYTES = 8 MiB`, `TIPOS_OK`, `EXTENSIONES_OK`). **Step 4:** pasa. **Step 5:** commit.

### Task 3: Crear la solicitud con sus constancias

**Files:** Modify `services/cancelacionService.js`, `routes/alumnoRoutes.js`, `controllers/alumno/alumnoCancelacionController.js`

- [ ] **Step 1:** en el servicio, `guardarConstancia(conn, { id_solicitud, archivo, id_usuario, intentadas })` — arma la ruta `cancelaciones/<id>/<ts>-<rand><ext>`, la anota en `intentadas` **antes** de subir, sube con tope de 45 s e inserta la fila con `conn`; y `borrarDeStorage(rutas)` (best-effort).
- [ ] **Step 2:** en las rutas, `recibirConstancias` = `uploadConstancia.array("archivos", MAX_ARCHIVOS)` envuelto: cualquier error → `400 { message: mensajeDeSubida(err) }`. Se usa en `POST /vuelos/:id_vuelo/solicitar-cancelacion` y en `POST /solicitudes-cancelacion/:id/adjuntos`, siempre **después** de `alumnoAccess`.
- [ ] **Step 3:** `solicitarCancelacion`, en este orden:
  1. `puedeAccederVuelo`; motivo con `trim()` → 400 si vacío; `problemaDeConstancias(req.files)` → 400.
  2. `BEGIN`; una consulta trae alumno + vuelo + `ya_salio` + `es_emergencia` (`seriaEmergenciaSQL`). Sin ficha de alumno → 404.
  3. Estado fuera de `PUBLICADO/AJUSTADO/PROGRAMADO/EN_ESPERA_TRAMO` → 400. `ya_salio` → 400.
  4. Emergencia sin archivos → 400 con `codigo: "CONSTANCIA_REQUERIDA"` (el mensaje dice de recargar la página). Emergencia sin Storage → 503.
  5. Límite semanal (409) y multa: sin cambios.
  6. `INSERT … creado_en = AHORA_SV … RETURNING id`.
  7. Por archivo: `guardarConstancia`. Si falla: emergencia → error marcado `esFallaDeConstancia`; con margen → se corta el bucle y queda `aviso_adjuntos`. Con margen y sin Storage → no se intenta, solo el aviso.
  8. Auditoría, `COMMIT`, y **recién ahí** `intentadas.length = 0` (un error posterior no debe borrar archivos ya confirmados).
  9. Aviso a quien resuelve (best-effort, fuera de la transacción); en emergencia el título es "Cancelación de EMERGENCIA".
  10. `catch`: `ROLLBACK`, `borrarDeStorage(intentadas)`; si `esFallaDeConstancia` → 502 con mensaje; si no, relanzar.
- [ ] **Step 4:** `getMisSolicitudesCancelacion` con columnas explícitas + `fecha_hora_vuelo`, `creado_en` como instantes + `es_emergencia` + `adjuntos`.
- [ ] **Step 5:** `quitarSolicitudCancelacion` junta las rutas antes del `DELETE` y las borra de Storage después del `COMMIT`.
- [ ] **Step 6:** `node -e "require('./routes/alumnoRoutes')"` carga sin error; `npm test` verde. Commit.

### Task 4: Agregar y borrar constancias después

**Files:** Modify `controllers/cancelacionAdjuntoController.js`

- [ ] **Step 1:** `subirAdjuntos` usa `problemaDeConstancias(archivos, { yaHay })` y `guardarConstancia`; si una subida falla, borra lo intentado y responde 502.
- [ ] **Step 2:** `borrarMiAdjunto` en transacción: `SELECT … FOR UPDATE OF s` sobre la solicitud (serializa borrados concurrentes), cuenta las constancias y, si es emergencia y queda una sola → 400.
- [ ] **Step 3:** quitar del archivo las constantes y helpers que pasaron a `utils/constancias.js`. `npm test` verde. Commit.

### Task 5: Horario y condiciones del alumno

**Files:** Modify `controllers/alumno/alumnoVueloController.js`

- [ ] **Step 1:** `getMiHorario` agrega `comoInstanteSQL(salidaVueloSQL())` como `fecha_hora_vuelo`.
- [ ] **Step 2:** `getCondicionesCancelacion`, cuando viene `id_vuelo` y es del alumno, agrega `es_emergencia` y `horas_para_vuelo`. Commit.

### Task 6: Quien aprueba

**Files:** Modify `controllers/admin/adminCancelacionController.js`

- [ ] **Step 1:** el listado agrega `es_emergencia` y `horas_anticipacion`, manda `fecha_hora_vuelo` y `fecha_solicitud` como instantes, y ordena las pendientes por emergencia, salida y pedido; el historial queda por `creado_en DESC`.
- [ ] **Step 2:** al aceptar, una consulta aparte y sin bloqueo calcula la emergencia y el `UPDATE vuelo` escribe `tipo_cancelacion`. (No se suma `vuelo` al `FOR UPDATE` existente: invertiría el orden de bloqueos frente a `turnoMantenimientoController`, CLAUDE.md §27.) Commit.

### Task 7: Validación en el cliente y API

**Files:** Create `CAA-frontend/src/utils/constancias.js`, `…/constancias.test.js` · Modify `CAA-frontend/package.json` (script `test`), `src/services/alumnoApi.js`

- [ ] **Step 1: test que falla** (mismos casos que la Task 2, con objetos `{ name, size, type }`) + `pesoLegible`. **Step 2:** falla. **Step 3:** implementar. **Step 4:** pasa.
- [ ] **Step 5:** `solicitarCancelacion(id_vuelo, motivo, archivos = [])`: JSON si no hay archivos, `FormData` si los hay. `borrarConstanciaCancelacion(id_adjunto)`. Commit.

### Task 8: Formulario y botón del alumno

**Files:** Modify `components/CancelarVueloModal/CancelarVueloModal.{jsx,css}`, `components/MiHorarioList/MiHorarioList.jsx`

- [ ] **Step 1:** el modal toma `es_emergencia` del servidor: badge en el encabezado, aviso rojo, campo obligatorio, `puedeConfirmar` exige un archivo. Los archivos se **acumulan** (elegir otro no reemplaza los anteriores) y cada uno se puede quitar; `problemaDeConstancias` valida antes de aceptarlos.
- [ ] **Step 2:** un solo envío. Si vuelve `aviso_adjuntos`, el modal muestra el aviso y un único botón "Entendido" que refresca la lista (hoy "Volver" cerraba sin refrescar).
- [ ] **Step 3:** en `MiHorarioList`, `esEmergencia` deja de ser letra muerta: el botón dice "Cancelación de emergencia" con `mhl__btn--emergency`. Commit.

### Task 9: "Mis cancelaciones"

**Files:** Create `components/MisCancelaciones/MisCancelaciones.{jsx,css}` · Modify `pages/Alumno/Dashboard.jsx`

- [ ] **Step 1:** mover el bloque de la pestaña a un componente (`solicitudes`, `loading`, `estadoCancel`, `onRefresh`). Por solicitud: fecha del vuelo, badge de estado con color, badge de emergencia, constancias que se abren con URL firmada.
- [ ] **Step 2:** mientras esté `PENDIENTE`: "Agregar constancia" y quitar. En emergencia con una sola, quitar no se ofrece. Commit.

### Task 10: Pantalla de quien aprueba

**Files:** Modify `pages/Admin/Cancelaciones.{jsx,css}`

- [ ] **Step 1:** tarjeta pendiente de emergencia con `adm-cancel__card--emergencia` (borde `--c-danger-500` + `box-shadow` interior de 1 px: 2 px visibles sin mover el contenido), badge, "Pedida X antes del vuelo", "Sin constancia" si no trae ninguna. En el historial, solo el badge. Commit.

### Task 11: Verificación

- [ ] `npm test` en backend y frontend; `npx vite build --outDir <scratchpad>` (sin pisar `public/config.js`).
- [ ] Lectura contra datos reales con `TZ=UTC`: la solicitud 33 sale como emergencia y con el vuelo a las 13:30.
- [ ] De punta a punta contra el esquema `demo` (script `_e2e_cancelaciones.js`): los casos de la spec. Requiere regenerar `demo` (autorización de Daniel).
- [ ] Navegador a 1280 y 375 px: formulario en modo emergencia y tarjeta con contorno; contraste medido.

### Task 12: Documentación

- [ ] CLAUDE.md: sección nueva de la sesión y §24 (demo atrasado; lo que quedó fuera de alcance). Memoria: lo que sea durable.
