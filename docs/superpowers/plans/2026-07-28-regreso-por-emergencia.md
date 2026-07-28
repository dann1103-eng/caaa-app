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
- Commits: `git commit -F <archivo-temp>` (el `-m` multilínea rompe en PowerShell), footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. **NO `git push`** (lo hace la sesión principal en la tarea final).
- **NUNCA** stagear untracked ajenos: `legacy/CAA-backend/seed_semana_22jun2026.js`, `supabase/migrations/20260624000001/2/3_*.sql`. Stagear SOLO los archivos de la tarea, y verificar con `git show --stat <SHA>`.
- **Los implementadores corren SECUENCIALES** (comparten el repo; correr dos en paralelo ya barrió un commit en esta sesión).

### Vocabulario del dominio (para no confundir efectos)
- **`es_inasistencia`** = el alumno no llegó. Pone TAC/Hobbs/combustible en NULL ⇒ el avión NO suma horas. **Ya existe, no se toca.**
- **`regreso_emergencia`** (esta feature) = salió del hangar y se regresó. TAC lleno ⇒ **el avión SÍ suma horas**, pero nadie cobra ni cobra.

---

## Task 1: Migración — 3 columnas en `reporte_vuelo`

**Files:**
- Create: `supabase/migrations/20260728000001_reporte_vuelo_regreso_emergencia.sql`

- [ ] **Step 1: Escribir la migración** (aditiva):

```sql
-- Regreso por emergencia: el vuelo salió del hangar y se regresó (clima, falla).
-- El avión SÍ suma sus horas de TAC (mantenimiento), pero no se cobra al alumno
-- ni se le paga la hora al instructor. Distinto de es_inasistencia (el alumno no
-- llegó y el avión nunca se movió).
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS regreso_emergencia BOOLEAN DEFAULT FALSE;
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS motivo_emergencia  VARCHAR(20);
ALTER TABLE reporte_vuelo ADD COLUMN IF NOT EXISTS detalle_emergencia TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reporte_vuelo_motivo_emergencia_check') THEN
    ALTER TABLE reporte_vuelo ADD CONSTRAINT reporte_vuelo_motivo_emergencia_check
      CHECK (motivo_emergencia IS NULL OR motivo_emergencia = ANY (ARRAY['CLIMA','FALLA_MECANICA','OTRO']));
  END IF;
END $$;
```

- [ ] **Step 2: Aplicar** `node run-sql.js "../../supabase/migrations/20260728000001_reporte_vuelo_regreso_emergencia.sql"` desde `legacy/CAA-backend`. Esperado: `✅ SQL ejecutado correctamente.`
- [ ] **Step 3: Verificar** `node query.js "SELECT column_name FROM information_schema.columns WHERE table_name='reporte_vuelo' AND column_name IN ('regreso_emergencia','motivo_emergencia','detalle_emergencia') ORDER BY column_name"` → 3 filas.
- [ ] **Step 4: Commit** solo el .sql: `feat(vouchera): columnas de regreso por emergencia en reporte_vuelo`.

---

## Task 2: Helper `utils/horasFacturables.js`

**Files:**
- Create: `legacy/CAA-backend/utils/horasFacturables.js`

Dos predicados SQL, **parametrizados por alias** (⚠️ `mantenimientoCubreFechaSQL` hardcodeó su alias y costó un `column m.completado does not exist`, §22.I de CLAUDE.md):

```js
// Predicados SQL para separar HORAS TÉCNICAS del avión (TAC → mantenimiento, que
// cuentan SIEMPRE) de las HORAS FACTURABLES (plata y progreso: pago al instructor,
// bitácora del alumno, avance de curso).
//
// Se centralizan acá porque la condición se usa en 6 consultas distintas: copiarla
// seis veces es exactamente cómo el renombre EN_VUELO→EN_PROGRESO dejó lugares sin
// actualizar durante meses.

/**
 * Agregados de horas pagables/facturables: excluye tanto la inasistencia (el
 * alumno no llegó) como el regreso por emergencia (salió y se regresó).
 * @param {string} alias alias de reporte_vuelo en la query (ej. "rv")
 */
function soloHorasFacturables(alias = "rv") {
  return `COALESCE(${alias}.es_inasistencia, false) = false
          AND COALESCE(${alias}.regreso_emergencia, false) = false`;
}

/**
 * Solo excluye el regreso por emergencia. Se usa en el desglose de nómina, que
 * HOY sí inserta las inasistencias (con 0 horas y $0): no cambiamos ese
 * comportamiento de paso.
 */
function sinRegresoEmergencia(alias = "rv") {
  return `COALESCE(${alias}.regreso_emergencia, false) = false`;
}

module.exports = { soloHorasFacturables, sinRegresoEmergencia };
```

- [ ] **Step 1:** escribir el archivo tal cual.
- [ ] **Step 2: Verificación temporal** `_verify_hf.js` (módulo puro, sin DB, sin dotenv): importa ambos, y con `assert` que LANZA (`function assert(c,m){if(!c)throw new Error("FAIL: "+m);console.log("  ✓ "+m)}`) comprobá que (a) el default usa `rv.`, (b) `soloHorasFacturables("x")` contiene `x.es_inasistencia` **y** `x.regreso_emergencia`, (c) `sinRegresoEmergencia("x")` contiene `x.regreso_emergencia` y **NO** contiene `es_inasistencia`. Correr, ver los ✓, **borrar el archivo**.
- [ ] **Step 3: Load-check** `node -e "require('./utils/horasFacturables.js'); console.log('load OK')"`.
- [ ] **Step 4: Commit** solo `legacy/CAA-backend/utils/horasFacturables.js`: `feat(vouchera): helper de horas facturables (excluye inasistencia y emergencia)`.

---

## Task 3: `firmarReporteVuelo` — la marca y sus efectos

**Files:**
- Modify: `legacy/CAA-backend/controllers/instructor/instructorReporteController.js` (`firmarReporteVuelo`, ~líneas 180-455)

**Leer la función completa antes de editar.** Estructura actual: valida → `BEGIN` → snapshot horas → checklist → INSERT/UPSERT del reporte → bloque `if (!esInasistencia && !esSimulador)` (horas de avión + horas de licencia) → `UPDATE vuelo COMPLETADO` → bloque `if (!esInasistencia)` con el cargo → `COMMIT`.

- [ ] **Step 1: Leer el flag y el motivo del body.** Junto a `es_inasistencia`, destructurar `regreso_emergencia, motivo_emergencia, detalle_emergencia` y calcular `const esEmergencia = regreso_emergencia === true || regreso_emergencia === 'true';` (mismo patrón que `esInasistencia`).

- [ ] **Step 2: Validaciones (antes del BEGIN, junto a las que ya existen ~líneas 202-230).**
  - Si `esEmergencia` y `esSimulador` → **400**: `"El regreso por emergencia solo aplica a aeronaves reales, no a simuladores."`
  - Si `esEmergencia` y `!motivo_emergencia` → **400**: `"Elegí el motivo del regreso por emergencia."`
  - Si `esEmergencia` y el motivo no está en `['CLIMA','FALLA_MECANICA','OTRO']` → **400** con mensaje claro.
  - ⚠️ La validación de `horas_cobradas` (`:221-229`, exige > 0 si viene) **se salta si `esEmergencia`** — porque el campo se fuerza a NULL. Envolvé ese `if` con `&& !esEmergencia`.
  - El TAC **sigue validándose igual** (no tocar `:309`/`:317`): alimenta el mantenimiento.

- [ ] **Step 3: Hardening — rechazar la re-firma (antes del BEGIN).** Consultar el estado actual del reporte y si ya está firmado, cortar:

```js
// La UI ya impide re-firmar (ReporteVueloModal deja el modal en solo-lectura al
// pasar a PENDIENTE_ALUMNO), pero el endpoint lo permitía por el ON CONFLICT DO
// UPDATE — y ni el cobro ni actualizarHorasAeronave son idempotentes, así que una
// segunda llamada cobraba dos veces y le sumaba al avión las horas otra vez.
const yaFirmado = await db.query(
  `SELECT estado FROM reporte_vuelo WHERE id_vuelo = $1`, [id]
);
if (["PENDIENTE_ALUMNO", "COMPLETADO"].includes(yaFirmado.rows[0]?.estado)) {
  return res.status(409).json({ message: "Este reporte ya fue firmado y no se puede volver a firmar." });
}
```

- [ ] **Step 4: Persistir las 3 columnas** en el INSERT/UPSERT (~líneas 264-299): agregarlas a la lista de columnas, a los `VALUES` y al `DO UPDATE SET`. Valores: `esEmergencia`, `esEmergencia ? blankToNull(motivo_emergencia) : null`, `esEmergencia ? blankToNull(detalle_emergencia) : null`.
  ⚠️ **`horas_cobradas` se fuerza a NULL cuando `esEmergencia`**: cambiar ese parámetro a `(esInasistencia || esEmergencia) ? null : blankToNull(horas_cobradas)`.

- [ ] **Step 5: Horas del avión SÍ, horas de licencia NO.** En el bloque `if (!esInasistencia && !esSimulador)` (~304-351): **NO** tocar la llamada a `actualizarHorasAeronave` (el avión suma igual). **SÍ** agregar `&& !esEmergencia` al gate de las horas de licencia del alumno (~345):

```js
if (sumaHorasLicencia && !esEmergencia && !vueloRes.rows[0].es_extracurricular && id_alumno) {
```

- [ ] **Step 6: Sin cobro.** El bloque del cargo empieza con `if (!esInasistencia)` (~369) → cambiarlo a `if (!esInasistencia && !esEmergencia)`. Con eso no corre `cargarVueloACuentaDentroTx`, y por lo tanto tampoco el avance de curso (que vive adentro).

- [ ] **Step 7: Load-check** `node -e "require('./controllers/instructor/instructorReporteController.js'); console.log('load OK')"`.

- [ ] **Step 8: Commit** solo ese archivo: `feat(vouchera): regreso por emergencia — el avión suma horas, no se cobra`.

---

## Task 4: Borrador + lecturas (que la marca no se pierda)

**Files:**
- Modify: `legacy/CAA-backend/controllers/instructor/instructorReporteController.js` (`guardarReporteVueloInstructor` :115-175, y el SELECT de `getReporteVueloInstructor` ~:51)
- Modify: `legacy/CAA-backend/controllers/alumno/alumnoReporteController.js` (~:14)

- [ ] **Step 1: Borrador (`guardarReporteVueloInstructor`).** Destructurar `regreso_emergencia, motivo_emergencia, detalle_emergencia` del body; `const esEmergencia = regreso_emergencia === true || regreso_emergencia === 'true';`. Agregar las 3 columnas al INSERT (`:136-141`), al `ON CONFLICT DO UPDATE SET` (`:142-156`) y a los params (`:158-168`), con el mismo patrón que `es_inasistencia`. `horas_cobradas` → `(esInasistencia || esEmergencia) ? null : blankToNull(horas_cobradas)`.
  **Por qué importa:** sin esto, el instructor marca la emergencia → "Guardar borrador" → reabre → **la marca desapareció** y firma una vouchera normal sin darse cuenta.

- [ ] **Step 2: Lectura del instructor.** En el SELECT de `getReporteVueloInstructor` (~:51, donde ya trae `rv.es_inasistencia, rv.motivo_inasistencia`) agregar `rv.regreso_emergencia, rv.motivo_emergencia, rv.detalle_emergencia`. ⚠️ **Verificar si ese endpoint mapea a un objeto literal** (como hace `{ vuelo, reporte }`): si mapea, los 3 campos deben ir TAMBIÉN al literal o no llegan al frontend.

- [ ] **Step 3: Lectura del alumno.** Mismo en `alumnoReporteController.getReporteVuelo` (~:14). Ese hace `SELECT v.*` + un spread `{...row}` — verificar leyendo si con agregar las columnas al SELECT alcanza.

- [ ] **Step 4: Load-check** ambos controllers.
- [ ] **Step 5: Commit** los 2 archivos: `feat(vouchera): la marca de emergencia sobrevive al borrador y vuelve en las lecturas`.

---

## Task 5: Los 6 sitios que suman horas

**Files:**
- Modify: `legacy/CAA-backend/controllers/administracion/nominaController.js` (:219 y :263-266)
- Modify: `legacy/CAA-backend/controllers/instructor/instructorAlumnoController.js` (:324)
- Modify: `legacy/CAA-backend/controllers/administracion/usuariosController.js` (:563 y :609)
- Modify: `legacy/CAA-backend/controllers/alumno/alumnoCuentaController.js` (:121)

Importar el helper en cada archivo: `const { soloHorasFacturables, sinRegresoEmergencia } = require("<ruta>/utils/horasFacturables");` (ojo la profundidad: `../../utils/...` desde `controllers/<sub>/`).

- [ ] **Step 1 — Sitio 1 (LA PLATA), `nominaController.js:218-224`:** agregar al `WHERE` `AND ${soloHorasFacturables("rv")}`. **Leer la query completa antes**: usa alias `rv` para `reporte_vuelo` y `v` para `vuelo`.

- [ ] **Step 2 — Sitio 2, `nominaController.js:262-270`** (el `INSERT INTO nomina_detalle_vuelo ... SELECT`): agregar `AND ${sinRegresoEmergencia("rv")}` al WHERE. ⚠️ **Usar `sinRegresoEmergencia`, NO `soloHorasFacturables`**: hoy este sitio SÍ inserta las inasistencias (con 0 horas y $0) y no queremos cambiar ese comportamiento de rebote.

- [ ] **Step 3 — Sitios 3 y 4 (agregados de historial):** `instructorAlumnoController.js:324` y `usuariosController.js:563` → agregar `AND ${soloHorasFacturables("rv")}` al WHERE (verificar el alias real de cada query leyéndolas).

- [ ] **Step 4 — Sitios 5 y 6 (listas por vuelo, la fila se CONSERVA):** `usuariosController.js:609` y `alumnoCuentaController.js:121`. NO filtrar la fila. Cambiar el cálculo de horas a 0 cuando la marca está puesta, y exponer el flag para que la UI etiquete:

```sql
CASE WHEN COALESCE(rv.regreso_emergencia,false) OR COALESCE(rv.es_inasistencia,false)
     THEN 0 ELSE COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0) END AS horas,
COALESCE(rv.regreso_emergencia,false) AS regreso_emergencia,
```

- [ ] **Step 5: Load-check** los 4 archivos.
- [ ] **Step 6: Verificación temporal con datos reales** `_verify_sitios.js` (con `require("dotenv").config()`, cwd `legacy/CAA-backend`, **solo lectura**): correr las 6 queries modificadas contra Supabase con parámetros reales (cualquier instructor/alumno con vuelos) y comprobar que **no lanzan error de SQL** (el riesgo es un alias mal puesto). No hace falta assert de negocio acá — eso va en Task 9. Borrar el archivo.
- [ ] **Step 7: Commit** los 4 archivos: `feat(vouchera): el regreso por emergencia no suma horas pagables ni facturables`.

---

## Task 6: Reportes del día (PDF de PDFKit) + voucheras de Administración

**Files:**
- Modify: `legacy/CAA-backend/controllers/turnoController.js` (query de `generarReporteVuelosDia` ~919-968, y la de operaciones del día ~1026-1062)
- Modify: `legacy/CAA-backend/utils/pdfGenerator.js` (~:509 y ~:681-682)
- Modify: `legacy/CAA-backend/controllers/administracion/voucherasController.js` (:34-60)

⚠️ **El bug sutil:** poner `horas_cobradas` en NULL **no** hace que impriman 0 — ambos generadores hacen fallback al TAC (`v.horas_cobradas != null ? Number(v.horas_cobradas) : tacH`), así que un regreso por emergencia imprimiría **las horas voladas al lado de $0**. Y `horas_cobradas = 0` no sirve: el servidor rechaza `<= 0`.

- [ ] **Step 1: Queries de turnoController** — agregar `COALESCE(rv.regreso_emergencia,false) AS regreso_emergencia, rv.motivo_emergencia` a **ambos** SELECTs.
- [ ] **Step 2: `pdfGenerator.js` ~:509** (`generarReporteVuelosDiaPDF`): `const horasCob = v.regreso_emergencia ? 0 : (v.horas_cobradas != null ? Number(v.horas_cobradas) : tacH);` — así no suma al subtotal ni al total. El monto ya sale $0 solo (viene de `movimiento_cuenta`).
- [ ] **Step 3: `pdfGenerator.js` ~:681-682** (`horaFila` de `generarReporteOperacionesDiaPDF`): `if (v.regreso_emergencia) return 0;` como primera línea.
- [ ] **Step 4: Etiqueta visible** — en ambos PDFs, marcar la fila (p.ej. sufijo `" (REG. EMERG.)"` en la celda de alumno o de instructor, lo que quepa sin romper el ancho de columna; **leer cómo se dibujan las filas antes de elegir**). Si no cabe limpio, agregar una nota al pie con los `id_vuelo` afectados.
- [ ] **Step 5: `voucherasController.js:47`** — agregar `COALESCE(rv.regreso_emergencia,false) AS regreso_emergencia, rv.motivo_emergencia, rv.detalle_emergencia` al SELECT (junto a `es_inasistencia`).
- [ ] **Step 6: Load-check** los 3 archivos + `node --check utils/pdfGenerator.js`.
- [ ] **Step 7: Commit**: `feat(vouchera): reportes del día muestran 0 horas y etiqueta en regresos por emergencia`.

---

## Task 7: Frontend — el modal de la vouchera

**Files:**
- Modify: `CAA-frontend/src/components/ReporteVueloModal/ReporteVueloModal.jsx`
- Modify: `CAA-frontend/src/components/ReporteVueloModal/ReporteVueloModal.css` (estilos del badge/banner)

**Leer el archivo completo primero.** Espejar TODO el tratamiento de `esInasistencia`: estado (~:95), hidratación (~:129-130), payload de guardar (~:184-186), payload de firmar (~:249-250), badge (~:370-371), botón (~:382-388), banner (~:419-433).

- [ ] **Step 1: Estado.** `const [esEmergencia, setEsEmergencia] = useState(false);` + `motivoEmergencia` (default `""`) + `detalleEmergencia`. Hidratar desde el reporte cargado (`if (r.regreso_emergencia) setEsEmergencia(true)`, etc.).
- [ ] **Step 2: Botón.** Junto al de inasistencia (`mode === "instructor" && !isReadonly`), un botón "Regreso por emergencia" que togglea. **Solo si NO es simulador** — verificar cómo el modal sabe el tipo de aeronave (buscar `SIMULADOR` en el archivo; si no lo sabe, derivarlo de `vueloInfo.aeronave_modelo`/`tipo` que ya recibe). Los dos modos son **mutuamente excluyentes**: marcar uno desmarca el otro.
- [ ] **Step 3: Banner + selector de motivo.** Cuando `esEmergencia`: banner rojo (reusar/copiar las clases del de inasistencia) con un `<select>` de motivo (Clima / Falla mecánica / Otro) y un input de detalle. En modo lectura, mostrar los valores guardados en vez de los inputs (igual que hace el de inasistencia).
- [ ] **Step 4: Badge** "REGRESO POR EMERGENCIA" en el encabezado (junto a donde aparece el de INASISTENCIA).
- [ ] **Step 5: Ocultar "horas a cobrar".** Cuando `esEmergencia`, ese campo se oculta (o se deshabilita y se limpia) — no se cobra nada.
- [ ] **Step 6: ⚠️ Cortocircuitar la validación del cliente.** En `handleFirmar` hay `if (!datos.horas_cobradas) { toast.warning("Ingresá las horas a cobrar…"); return; }` (~:224-228). Debe saltarse cuando `esEmergencia`, igual que ya se salta con `if (esInasistencia)` (~:198).
- [ ] **Step 7: Mandar los 3 campos** en **ambos** payloads (guardar borrador ~:184-186 **y** firmar ~:249-250), explícitos fuera del spread — igual que `es_inasistencia`.
- [ ] **Step 8: Build** → `✓ built`.
- [ ] **Step 9: Commit** los 2 archivos: `feat(vouchera): botón y banner de regreso por emergencia en el modal`.

---

## Task 8: Frontend — PDF de la vouchera + listado de Voucheras

**Files:**
- Modify: `CAA-frontend/src/components/ReporteVueloModal/reporteVueloPdf.js` (sello, cerca del de INASISTENCIA ~:125, y la mini-tabla COBRO ~:142/:153)
- Modify: `CAA-frontend/src/pages/Administracion/Voucheras.jsx` (~:29, el mapeo que alimenta `generarPdfVoucherasDia`)

- [ ] **Step 1: Sello en el PDF.** Donde hoy imprime `"INASISTENCIA / NO-SHOW"` (~:125), agregar el caso `"REGRESO POR EMERGENCIA"` cuando `d.regreso_emergencia`, con una línea debajo: `Motivo: <Clima|Falla mecánica|Otro> — <detalle>`. **Leer el bloque completo para respetar la estructura de pdfmake** (una fila mal armada rompe el PDF entero).
- [ ] **Step 2: La mini-tabla "COBRO"** (~:142 y ~:153, imprime `horas_cobradas`): cuando `regreso_emergencia`, mostrar `0` o `—` y la etiqueta, en vez del valor.
- [ ] **Step 3: `Voucheras.jsx`** — el objeto que se le pasa al generador debe incluir `regreso_emergencia`, `motivo_emergencia`, `detalle_emergencia` (el backend ya los devuelve tras Task 6). **Leer cómo se construye ese objeto** (~:29): si es un spread de la fila, puede que no haga falta cambio; verificar.
- [ ] **Step 4: Build** → `✓ built`.
- [ ] **Step 5: Commit**: `feat(vouchera): sello de regreso por emergencia en el PDF y en las voucheras del día`.

---

## Task 9: Verificación E2E + deploy (la ejecuta la SESIÓN PRINCIPAL, no un subagente)

- [ ] **Step 1: E2E con ROLLBACK contra Supabase real** — `legacy/CAA-backend/_verify_emergencia.js` (con `require("dotenv").config()`, cwd `legacy/CAA-backend`, todo dentro de `BEGIN…ROLLBACK`). Invocar `firmarReporteVuelo` NO es práctico (necesita req/res/HTTP); en su lugar **replicar la secuencia de la transacción** llamando a las mismas funciones (`actualizarHorasAeronave`, y comprobando que `cargarVueloACuentaDentroTx` NO se llama) o —mejor— probar por **HTTP contra un backend local** (`PORT=5099 node server.js` con el `.env` real, patrón ya usado en esta sesión). Asserts (función que LANZA):
  1. `aeronave.horas_acumuladas` **subió** por el TAC + fila en `horas_vuelo_aeronave`.
  2. **Cero** `movimiento_cuenta` para ese vuelo; saldo del alumno **igual**.
  3. `alumno.horas_acumuladas` **intacto**; `inscripcion_curso_avance` **intacto**.
  4. Query de nómina (`nominaController:219`): el **delta** de horas de ese instructor es **0** (no un 0 absoluto — en datos reales tiene otros vuelos del periodo).
  5. Marca puesta sin motivo → **400**.
  6. Re-firmar un reporte ya firmado → **409**.
  7. Borrador con la marca → releer → `regreso_emergencia = true` con su motivo.
  8. **No-regresión:** un vuelo normal cobra, acredita horas y suma a la nómina **exactamente igual que antes**.
  Borrar el script al terminar.
- [ ] **Step 2: Deploy** — `git fetch origin; git merge origin/master` (Samuel pushea en paralelo) → build frontend + load-check backend → `git push origin master` (auto-despliega Vercel + Railway).
- [ ] **Step 3: Esperar backend** — poll hasta que la marca esté viva (p.ej. `curl` a un endpoint que ya devuelva las columnas nuevas, o verificar el bundle de Vercel con el texto "Regreso por emergencia").
- [ ] **Step 4: Verificación en el navegador** — login instructor, abrir una vouchera en BORRADOR, marcar "Regreso por emergencia", elegir motivo, guardar borrador, reabrir y confirmar que la marca sobrevivió. **NO firmar** sobre datos reales de producción.
- [ ] **Step 5: Memoria** — archivo `sesion-2026-07-28-regreso-emergencia.md` en el dir de memoria + línea en `MEMORY.md`. Reportar a Daniel.

---

## Dependencias / orden

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.
T3/T4 tocan el **mismo archivo** (`instructorReporteController.js`) ⇒ estrictamente secuenciales.
T7/T8 tocan el mismo módulo del modal ⇒ también secuenciales.
T9 la ejecuta la sesión principal (merge/push/navegador), NO un subagente.
