# Regreso por emergencia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para ejecutar
> tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que una vouchera pueda marcarse como "regreso por emergencia": el avión suma sus horas de TAC
(mantenimiento intacto), pero no se le cobra al alumno, no se le acreditan horas, y no se le paga al instructor.

**Architecture:** Tres columnas aditivas en `reporte_vuelo` + un helper SQL compartido que excluye esos
vuelos de todo agregado de horas facturables/pagables. La separación conceptual: **horas técnicas del
avión** (TAC → mantenimiento, cuentan siempre) vs. **horas facturables** (plata y progreso, en cero).

**Tech Stack:** Node/Express + `pg` (backend), React 19 + Vite (frontend), PDFKit (reportes del día),
pdfmake (vouchera del alumno), Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-07-28-regreso-por-emergencia-design.md` — **leerlo antes de empezar.**

---

## Reglas permanentes (para TODOS los implementadores)

- **Working dir: `C:\Users\Daniel\Desktop\CAAA modulo op+admin`** (repo principal, branch `master`). NO worktrees.
- Build frontend: `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build` → `✓ built`.
- Load-check backend: `cd legacy/CAA-backend && node -e "require('./<archivo>'); console.log('load OK')"`.
- SQL contra Supabase: `node query.js "SELECT..."` (lectura) / `node run-sql.js <archivo.sql>` desde `legacy/CAA-backend`.
- ⚠️ **`config/db.js` NO carga dotenv.** Todo script propio empieza con `require("dotenv").config();` y corre con cwd = `legacy/CAA-backend`.
- Commits: `git commit -F <archivo-temp>`, footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. **NO `git push`**.
- **NUNCA** stagear untracked ajenos (`seed_semana_22jun2026.js`, `20260624000001/2/3_*.sql`). Verificar con `git show --stat <SHA>`.
- **Implementadores SECUENCIALES** (comparten el repo; dos en paralelo ya barrieron un commit en esta sesión).

### Vocabulario del dominio
- **`es_inasistencia`** = el alumno no llegó. Pone TAC/Hobbs en NULL ⇒ el avión NO suma horas, y queda excluida sola de la nómina. **Ya existe, no se toca.**
- **`regreso_emergencia`** (esta feature) = salió del hangar y se regresó. **TAC lleno ⇒ el avión SÍ suma horas**, pero nadie cobra ni cobra. Al tener TAC, **hay que excluirla explícitamente** de todos los agregados.

---

## ✅ Task 1 y Task 2 — YA HECHAS (commit `ca80d28`, no rehacer)

- `supabase/migrations/20260728000001_reporte_vuelo_regreso_emergencia.sql` — **aplicada en Supabase**,
  las 3 columnas (`regreso_emergencia`, `motivo_emergencia`, `detalle_emergencia`) están vivas.
- `legacy/CAA-backend/utils/horasFacturables.js` — exporta `soloHorasFacturables(alias)` y
  `sinRegresoEmergencia(alias)`. Verificado. **T5 lo importa tal cual.**

**Empezar en Task 3.**

---

## Task 3: `firmarReporteVuelo` — la marca y sus efectos

**Files:**
- Modify: `legacy/CAA-backend/controllers/instructor/instructorReporteController.js` (`firmarReporteVuelo`, :177-464)

**Leer la función completa antes de editar.** Flujo: valida → `BEGIN` → snapshot horas → checklist →
INSERT/UPSERT del reporte → `if (!esInasistencia && !esSimulador)` (horas de avión + horas de licencia) →
`UPDATE vuelo COMPLETADO` → `if (!esInasistencia)` con el cargo (:369) → `COMMIT`.

- [ ] **Step 1: Leer el flag del body.** Junto a `es_inasistencia`, destructurar `regreso_emergencia,
  motivo_emergencia, detalle_emergencia` y `const esEmergencia = regreso_emergencia === true || regreso_emergencia === 'true';`

- [ ] **Step 2: Validaciones (antes del BEGIN, junto a las de :202-230).**
  - `esEmergencia && esSimulador` → **400** `"El regreso por emergencia solo aplica a aeronaves reales, no a simuladores."`
  - `esEmergencia && !motivo_emergencia` → **400** `"Elegí el motivo del regreso por emergencia."`
  - `esEmergencia` y motivo fuera de `['CLIMA','FALLA_MECANICA','OTRO']` → **400**.
  - ⚠️ La validación de `horas_cobradas` (**:221-229**) se salta con `esEmergencia` (el campo se fuerza a NULL): envolver ese `if` con `&& !esEmergencia`.
  - El TAC **sigue validándose igual** (:309 y :317, no tocar): alimenta el mantenimiento.

- [ ] **Step 3: Hardening — rechazar la re-firma, DENTRO de la transacción.**
  ⚠️ Va **después del `BEGIN`** y con `FOR UPDATE`: fuera de la transacción, un doble-click manda dos
  requests concurrentes que ambas leen `BORRADOR` y ambas cobran — justo la carrera que se quiere cerrar.

```js
// La UI ya impide re-firmar (el modal queda en solo-lectura al pasar a
// PENDIENTE_ALUMNO), pero el endpoint lo permitía por el ON CONFLICT DO UPDATE —
// y ni el cobro ni actualizarHorasAeronave son idempotentes, así que una segunda
// llamada cobraba dos veces y le sumaba al avión las horas otra vez. El FOR UPDATE
// serializa el doble-click.
const yaFirmado = await client.query(
  `SELECT estado FROM reporte_vuelo WHERE id_vuelo = $1 FOR UPDATE`, [id]
);
if (["PENDIENTE_ALUMNO", "COMPLETADO"].includes(yaFirmado.rows[0]?.estado)) {
  await client.query("ROLLBACK");
  return res.status(409).json({ message: "Este reporte ya fue firmado y no se puede volver a firmar." });
}
```
  **Seguridad verificada:** el único caller es `instructorRoutes.js:41`. La firma del ALUMNO y la del
  practicante van por `alumnoRoutes.js:107` → `firmarReporteVueloAlumno`, otro endpoint. Nada llama a
  éste dos veces de forma legítima.

- [ ] **Step 4: Persistir las 3 columnas** en el INSERT/UPSERT (:264-299): a la lista de columnas, a los
  `VALUES` y al `DO UPDATE SET`. Valores: `esEmergencia`, `esEmergencia ? blankToNull(motivo_emergencia) : null`,
  `esEmergencia ? blankToNull(detalle_emergencia) : null`.
  ⚠️ **`horas_cobradas` a NULL**: cambiar ese parámetro a `(esInasistencia || esEmergencia) ? null : blankToNull(horas_cobradas)`.

- [ ] **Step 5: Horas del avión SÍ, horas de licencia NO.** En `if (!esInasistencia && !esSimulador)` (:304-351):
  **NO** tocar `actualizarHorasAeronave` (el avión suma igual). **SÍ** agregar `&& !esEmergencia` al gate de
  las horas de licencia (:345): `if (sumaHorasLicencia && !esEmergencia && !vueloRes.rows[0].es_extracurricular && id_alumno)`.

- [ ] **Step 6: Sin cobro.** El bloque del cargo (**:369**) `if (!esInasistencia)` → `if (!esInasistencia && !esEmergencia)`.
  Con eso no corre `cargarVueloACuentaDentroTx`, y por lo tanto tampoco el avance de curso (que vive adentro).

- [ ] **Step 7: Load-check** `node -e "require('./controllers/instructor/instructorReporteController.js'); console.log('load OK')"`.
- [ ] **Step 8: Commit** solo ese archivo: `feat(vouchera): regreso por emergencia — el avión suma horas, no se cobra`.

---

## Task 4: Borrador + lecturas (que la marca no se pierda)

**Files:**
- Modify: `legacy/CAA-backend/controllers/instructor/instructorReporteController.js` (`guardarReporteVueloInstructor` :115-175; SELECT de lectura ~:51 y su literal ~:79)
- Modify: `legacy/CAA-backend/controllers/alumno/alumnoReporteController.js` (~:10-20)

- [ ] **Step 1: Borrador (`guardarReporteVueloInstructor`).** Destructurar los 3 campos del body +
  `esEmergencia`. Agregarlos al INSERT (:136-141), al `ON CONFLICT DO UPDATE SET` (:142-156) y a los
  params (:158-168), con el mismo patrón que `es_inasistencia`.
  `horas_cobradas` → `(esInasistencia || esEmergencia) ? null : blankToNull(horas_cobradas)`.
  **Por qué importa:** sin esto, el instructor marca la emergencia → "Guardar borrador" → reabre → **la
  marca desapareció** y firma una vouchera normal sin darse cuenta.

- [ ] **Step 2: Lectura del instructor.** Agregar `rv.regreso_emergencia, rv.motivo_emergencia,
  rv.detalle_emergencia` al SELECT (~:51, donde ya trae `rv.es_inasistencia`) **y al objeto literal de la
  respuesta (~:79)** — ese endpoint NO devuelve la fila cruda, así que sin esto los campos no llegan.
  ✅ Esto arregla gratis el lector de admin: `administracionRoutes.js:146` reusa este mismo controller.

- [ ] **Step 3: Lectura del alumno.** `alumnoReporteController.getReporteVuelo` (~:10-20). Hace
  `SELECT v.*` + spread — **verificar leyendo** si con agregar las columnas al SELECT alcanza.

- [ ] **Step 4: Load-check** ambos controllers.
- [ ] **Step 5: Commit**: `feat(vouchera): la marca de emergencia sobrevive al borrador y vuelve en las lecturas`.

---

## Task 5: Los 6 sitios que suman horas

**Files:**
- Modify: `legacy/CAA-backend/controllers/administracion/nominaController.js` (WHERE de :218-224, y el INSERT...SELECT de :262-270)
- Modify: `legacy/CAA-backend/controllers/instructor/instructorAlumnoController.js` (WHERE en **:328-329**)
- Modify: `legacy/CAA-backend/controllers/administracion/usuariosController.js` (WHERE en **:567-568**, y el SELECT de :609)
- Modify: `legacy/CAA-backend/controllers/alumno/alumnoCuentaController.js` (:121)

Importar en cada archivo: `const { soloHorasFacturables, sinRegresoEmergencia } = require("../../utils/horasFacturables");`
(ojo la profundidad según la carpeta del controller).

⚠️ **Conservar la forma `COALESCE(...) = false`** que usa el helper: varias de estas queries hacen LEFT JOIN
a `reporte_vuelo`, y un `= false` pelado descartaría en silencio los vuelos completados sin reporte.

- [ ] **Step 1 — Sitio 1 (LA PLATA), `nominaController.js:218-224`:** agregar `AND ${soloHorasFacturables("rv")}` al WHERE.
- [ ] **Step 2 — Sitio 2, `nominaController.js:262-270`** (`INSERT INTO nomina_detalle_vuelo ... SELECT`):
  agregar `AND ${sinRegresoEmergencia("rv")}` al WHERE. ⚠️ **`sinRegresoEmergencia`, NO `soloHorasFacturables`**:
  hoy este sitio SÍ inserta las inasistencias (0 horas, $0) y no queremos cambiar eso de rebote.
- [ ] **Step 3 — Sitios 3 y 4 (agregados de historial):** `instructorAlumnoController.js` **:328-329** y
  `usuariosController.js` **:567-568** → `AND ${soloHorasFacturables("rv")}` en el WHERE (verificar el alias real leyendo).
- [ ] **Step 4 — Sitios 5 y 6 (listas por vuelo, la fila se CONSERVA):** `usuariosController.js:609` y
  `alumnoCuentaController.js:121`. NO filtrar la fila; poner las horas en 0 y exponer el flag:

```sql
CASE WHEN COALESCE(rv.regreso_emergencia,false)
     THEN 0 ELSE COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0) END AS horas,
COALESCE(rv.regreso_emergencia,false) AS regreso_emergencia,
```
  (No hace falta contemplar la inasistencia acá: su TAC es NULL, así que el `COALESCE(...,0)` ya da 0.)

- [ ] **Step 5 — Que la UI consuma el flag** (si no, la plomería queda muerta). Dos consumidores:
  - `CAA-frontend/src/pages/Perfil/Perfil.jsx:585` — hoy `{v.inasistencia ? "Inasist." : Number(v.horas).toFixed(1)}`
    → agregar el caso `v.regreso_emergencia ? "Reg. emerg." : …`.
  - `CAA-frontend/src/pages/Administracion/AlumnoFicha.jsx:474` — tiene un `adf-tag` ámbar para inasistencia
    → agregar un tag rojo/ámbar equivalente para el regreso por emergencia.
- [ ] **Step 6: Load-check** los 4 controllers + build del frontend.
- [ ] **Step 7: Verificación temporal (solo lectura)** `_verify_sitios.js` (con `require("dotenv").config()`,
  cwd `legacy/CAA-backend`): correr las 6 queries modificadas con parámetros reales y comprobar que **no
  lanzan error de SQL** (el riesgo es un alias mal puesto). Borrar el archivo.
- [ ] **Step 8: Commit**: `feat(vouchera): el regreso por emergencia no suma horas pagables ni facturables`.

---

## Task 6: Reportes del día (PDFKit) + voucheras de Administración

**Files:**
- Modify: `legacy/CAA-backend/controllers/turnoController.js` (queries :919-968 y :1026-1063)
- Modify: `legacy/CAA-backend/utils/pdfGenerator.js` (:509 y :680-684)
- Modify: `legacy/CAA-backend/controllers/administracion/voucherasController.js` (:47)

⚠️ **El bug sutil:** poner `horas_cobradas` en NULL **no** hace que impriman 0 — ambos generadores hacen
fallback al TAC, así que un regreso por emergencia imprimiría **las horas voladas al lado de $0**.
Y `horas_cobradas = 0` no sirve: el servidor rechaza `<= 0`.

- [ ] **Step 1: Queries de turnoController** — agregar `COALESCE(rv.regreso_emergencia,false) AS regreso_emergencia, rv.motivo_emergencia` a **ambos** SELECTs.
- [ ] **Step 2: `pdfGenerator.js:509`** (`generarReporteVuelosDiaPDF`):
  `const horasCob = v.regreso_emergencia ? 0 : (v.horas_cobradas != null ? Number(v.horas_cobradas) : tacH);`
  Así tampoco suma al subtotal ni al total. El monto ya sale $0 solo (viene de `movimiento_cuenta`).
- [ ] **Step 3: `pdfGenerator.js:680-684`** (`horaFila` de `generarReporteOperacionesDiaPDF`): `if (v.regreso_emergencia) return 0;` como primera línea.
- [ ] **Step 4: Etiqueta visible — NO usar sufijo de texto.** Las columnas son angostas (Alumno 145px,
  Instructor 105px, `cols` en :452-458) y `drawRow` (:465) avanza `y` un fijo de **16**: PDFKit envuelve
  el texto largo y la segunda línea se solapa con la fila siguiente. **Usar el `opts.color` que `drawRow`
  ya acepta** (:463 y :708) para pintar la fila en rojo CAAA, más una leyenda de una línea al pie
  ("Filas en rojo: regreso por emergencia — no facturadas"). Leer `drawRow` antes de tocarlo.
- [ ] **Step 5: `voucherasController.js:47`** — agregar `COALESCE(rv.regreso_emergencia,false) AS regreso_emergencia, rv.motivo_emergencia, rv.detalle_emergencia` junto a `es_inasistencia`.
- [ ] **Step 6: Load-check** los 3 archivos + `node --check utils/pdfGenerator.js`.
- [ ] **Step 7: Commit**: `feat(vouchera): reportes del día marcan y no facturan los regresos por emergencia`.

---

## Task 7: Frontend — el modal de la vouchera

**Files:**
- Modify: `CAA-frontend/src/components/ReporteVueloModal/ReporteVueloModal.jsx`
- Modify: `CAA-frontend/src/components/ReporteVueloModal/ReporteVueloModal.css`

**Leer el archivo completo primero.** Espejar el tratamiento de `esInasistencia`: estado :95, hidratación
:129-130, payload de guardar :184-186, payload de firmar :249-250, **payload de descargar :326-327**,
badge :370-371, botón :382-388, banner :419-433, corto-circuito :198, gate de horas :224-228.

- [ ] **Step 1: Estado.** `esEmergencia` (bool), `motivoEmergencia` (default `""`), `detalleEmergencia`.
  Hidratar desde el reporte cargado (junto a :129-130).
- [ ] **Step 2: Botón.** Junto al de inasistencia (`mode === "instructor" && !isReadonly`), un botón
  "Regreso por emergencia". ✅ **El modal YA sabe si es simulador**: `const isSim = vueloInfo?.aeronave_tipo === "SIMULADOR"` en **:103** — gatear con `!isSim`. Los dos modos son **mutuamente excluyentes**
  (marcar uno desmarca el otro).
- [ ] **Step 3: Banner + motivo.** Cuando `esEmergencia`: banner rojo (copiar las clases del de
  inasistencia) con `<select>` de motivo (Clima / Falla mecánica / Otro) e input de detalle. En modo
  lectura, mostrar los valores guardados en vez de los inputs (igual que el de inasistencia).
- [ ] **Step 4: Badge** "REGRESO POR EMERGENCIA" junto a donde aparece el de INASISTENCIA (:370-371).
- [ ] **Step 5: Ocultar "horas a cobrar"** cuando `esEmergencia` (no se cobra nada).
- [ ] **Step 6: ⚠️ Cortocircuitar la validación del cliente.** `handleFirmar` tiene
  `if (!datos.horas_cobradas) { toast.warning("Ingresá las horas a cobrar…"); return; }` (**:224-228**) —
  debe saltarse cuando `esEmergencia`, igual que ya se salta con `if (esInasistencia)` (:198).
- [ ] **Step 7: Mandar los 3 campos en los TRES payloads**, explícitos fuera del spread (igual que
  `es_inasistencia`): guardar borrador (**:184-186**), firmar (**:249-250**) y **descargar PDF (:326-327)**.
  Sin el tercero, el PDF individual sale como vouchera normal aunque Task 8 esté hecha.
- [ ] **Step 8: Build** → `✓ built`.
- [ ] **Step 9: Commit** los 2 archivos: `feat(vouchera): botón y banner de regreso por emergencia en el modal`.

---

## Task 8: Frontend — PDF de la vouchera + listado de Voucheras

**Files:**
- Modify: `CAA-frontend/src/components/ReporteVueloModal/reporteVueloPdf.js`
- Modify: `CAA-frontend/src/pages/Administracion/Voucheras.jsx` (`rowToPdfParams`, :13-42)

⚠️ **`buildVoucheraContent` recibe PARÁMETROS NOMBRADOS** (:91-98), no el objeto crudo — `d.regreso_emergencia`
**no existiría**. Y `datos` es un objeto whitelisted construido campo por campo en los dos call sites
(`ReporteVueloModal.jsx:55-65` `DATOS_INICIALES`; `Voucheras.jsx:13-42` `rowToPdfParams`).

- [ ] **Step 1: Threading de los parámetros.** Agregar `esEmergencia = false, motivoEmergencia = "",
  detalleEmergencia = ""` al destructuring de `buildVoucheraContent` (:91-98) y pasarlos desde los wrappers
  `generarPdfReporteVuelo` y `generarPdfVoucherasDia`. Sin esto nada de lo demás se dibuja.
- [ ] **Step 2: Sello.** ⚠️ El `"INASISTENCIA / NO-SHOW"` de :125 vive en un `if (esInasistencia)` que
  **reemplaza** `centro` (:119-134). Un `else if (esEmergencia)` **borraría las lecturas de TAC/Hobbs**, que
  acá sí queremos conservar. **Fix: dejar esa cadena intacta** (la emergencia cae en el `else` de aeronave
  real, :147-174) y **anteponer la banda** con `if (esEmergencia) centro.unshift({ ...banda roja... })`,
  incluyendo `Motivo: <Clima|Falla mecánica|Otro> — <detalle>`.
- [ ] **Step 3: Mini-tabla "COBRO" (:153).** Cuando `esEmergencia`, mostrar `0` / `—` + la etiqueta en vez
  del valor. (El :142 es la rama de **simulador** — inalcanzable acá, porque Task 3 rechaza la emergencia
  en simulador. No tocarlo.)
- [ ] **Step 4: `Voucheras.jsx`** — `rowToPdfParams` (:13-42) construye el objeto **campo por campo**, NO es
  un spread: agregar los 3 campos en :39-41.
- [ ] **Step 5: Build** → `✓ built`.
- [ ] **Step 6: Commit**: `feat(vouchera): sello de regreso por emergencia en el PDF y en las voucheras del día`.

---

## Task 9: Verificación E2E + deploy (la ejecuta la SESIÓN PRINCIPAL, no un subagente)

⚠️ **Corrección importante sobre el enfoque:** NO se puede hacer `BEGIN…ROLLBACK` alrededor de un flujo
HTTP (el request corre en la conexión del server, el script no lo puede revertir). Y los asserts 1/2/8
necesitan escrituras reales. **Enfoque: HTTP contra backend local + vuelo desechable + limpieza explícita.**

- [ ] **Step 1: Backend local.** `cd legacy/CAA-backend && PORT=5099 node server.js` (el `.env` y
  `node_modules` están en el repo principal, arranca directo). ⚠️ Al bootear corre
  `asegurarProximaSemanaDisponible()`, `sincronizarEstadoFlota()` y el job `expirarOfertasVencidas`
  contra **producción** — es lo normal de esta app, pero tenerlo presente.
- [ ] **Step 2: Sembrar un vuelo desechable** MUY en el futuro (patrón de §21.C de CLAUDE.md: semana
  throwaway que no interfiere con la operación real), con su alumno/instructor/aeronave reales.
  **Anotar los valores previos** de: `aeronave.horas_acumuladas`, saldo del alumno,
  `alumno.horas_acumuladas`, y el total de horas de nómina de ese instructor en el periodo.
- [ ] **Step 3: Asserts** (función que LANZA, no `console.assert`):
  1. Firmar con la marca → `aeronave.horas_acumuladas` **subió** por el TAC + fila en `horas_vuelo_aeronave`.
  2. **Cero** `movimiento_cuenta` para ese vuelo; saldo del alumno **igual** al anotado.
  3. `alumno.horas_acumuladas` **intacto**; `inscripcion_curso_avance` **intacto**.
  4. Query de nómina (`nominaController:219`): el **delta** de horas de ese instructor es **0**
     (no un 0 absoluto — en datos reales tiene otros vuelos del periodo).
  5. Marca puesta sin motivo → **400**.
  6. Re-firmar el reporte ya firmado → **409**.
  7. Guardar borrador con la marca → releer → `regreso_emergencia = true` con su motivo.
  8. **No-regresión:** un segundo vuelo desechable SIN la marca cobra, acredita horas y suma a la nómina
     **exactamente igual que antes**.
- [ ] **Step 4: LIMPIEZA EXPLÍCITA** (revertir las 4 escrituras del vuelo de prueba y **verificar con
  `query.js`** que todo volvió a los valores anotados en el Step 2): borrar `reporte_vuelo`,
  `horas_vuelo_aeronave` y el `movimiento_cuenta` del vuelo no-regresión, restaurar
  `aeronave.horas_acumuladas`, `alumno.horas_acumuladas` y el saldo, y borrar los vuelos/semana desechables.
  Matar el backend local. Borrar el script.
- [ ] **Step 5: Deploy** — `git fetch origin; git merge origin/master` (Samuel pushea en paralelo) →
  build frontend + load-check backend → `git push origin master` (auto-despliega Vercel + Railway).
- [ ] **Step 6: Esperar el deploy** — poll del bundle de Vercel buscando "Regreso por emergencia", y del
  backend con un endpoint que ya devuelva las columnas nuevas.
- [ ] **Step 7: Verificación en el navegador** — login instructor, abrir una vouchera en BORRADOR, marcar
  la emergencia, elegir motivo, **guardar borrador**, reabrir y confirmar que la marca sobrevivió.
  **NO firmar** sobre datos reales de producción.
- [ ] **Step 8: Memoria** — `sesion-2026-07-28-regreso-emergencia.md` + línea en `MEMORY.md`. Reportar a Daniel.

---

## Dependencias / orden

T3 → T4 → T5 → T6 → T7 → T8 → T9. (T1/T2 ya hechas.)
T3/T4 tocan el **mismo archivo** ⇒ estrictamente secuenciales. T7/T8 tocan el mismo módulo ⇒ también.
T3-T6 son **inertes** hasta que T7 pueda poner la marca (nada las dispara), así que el orden es seguro.
T9 la ejecuta la sesión principal (backend local, merge/push, navegador), NO un subagente.

## Verificado por el revisor — NO "arreglar" esto
- **No** tocar las queries de detección de conflictos (`programacionController.js:836-845`,
  `turnoController.js:1192-1199`): una inasistencia libera el slot, pero un regreso por emergencia
  **sí ocupó** el avión y el horario.
- El lector de admin sale gratis: `administracionRoutes.js:146` reusa `getReporteVueloInstructor`.
- `sinRegresoEmergencia` en el sitio 2 mantiene el desglose de nómina consistente con el total.
