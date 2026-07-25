# Loadsheet: modo práctica + editor de peso y balance — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para ejecutar
> tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que alumnos e instructores practiquen loadsheets sin vuelo (efímero) y que el ADMIN edite el
peso & balance de cada avión desde su ficha, con el cambio tomando efecto en vivo en el loadsheet.

**Architecture:** DB-first con fallback. El calculador del loadsheet deja de leer del `aircraft.js`
estático y lee el template de `wb_plantilla` (mapeado a la misma forma, keyed por MATRÍCULA real);
si un avión no tiene fila, cae a `aircraft.js`. Un editor ADMIN escribe `wb_plantilla`. La práctica
reusa el wizard sin `id_vuelo` y sin persistencia.

**Tech Stack:** React 19 + Vite (frontend), Node/Express + `pg` (backend), Supabase Postgres.
Sin framework de tests: la verificación es **scripts node con `assert` que LANZAN** (temp `_verify_*.js`
en `legacy/CAA-backend`, borrados al final, contra Supabase real, con `BEGIN…ROLLBACK` si escriben) +
`npm run build` del frontend + chequeo en el navegador cuando aplica.

**Spec:** `docs/superpowers/specs/2026-07-22-loadsheet-practica-y-editor-wb-design.md`

---

## Reglas permanentes (para TODOS los implementadores)

- **Working dir: `C:\Users\Daniel\Desktop\CAAA modulo op+admin`** (repo principal, branch `master`). NO worktrees.
- Build frontend: `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build` → debe dar `✓ built`.
- Load-check backend: `cd legacy/CAA-backend && node -e "require('./<archivo>'); console.log('load OK')"`.
- Consultar/ejecutar SQL contra Supabase real: `node query.js "SELECT..."` (lectura) y `node run-sql.js <archivo.sql>` (ejecutar) desde `legacy/CAA-backend`.
- ⚠️ **`config/db.js` NO carga dotenv.** Cualquier script node propio que llegue a la DB por `config/db` DEBE empezar con `require("dotenv").config();` y correr con cwd = `legacy/CAA-backend` (para que dotenv encuentre `.env`). `query.js`/`run-sql.js` ya lo hacen; tus `_verify_*.js` y el seed NO lo heredan solos.
- ⚠️ Los controllers van envueltos en `catchAsync` (`(req,res,next)=>fn(...).catch(next)`): para invocarlos desde un script hay que `await` la promesa y pasar un `next` real, o un error de DB se traga en `.catch(undefined)`.
- Commits: `git commit -F <archivo-temp>` (el `-m` multilínea rompe en PowerShell), footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. **NO `git push`** (el push lo hace la sesión principal en la tarea final).
- **NUNCA** stagear untracked ajenos: `seed_semana_22jun2026.js`, `supabase/migrations/20260624000001/2/3_*.sql`, `supabase/dump/fix_id_bloque_fin_corrupto.sql`. Stagear SOLO los archivos de la tarea.
- La forma canónica del objeto template (lo que consume el wizard) está en `CAA-frontend/src/loadsheet/data/aircraft.js` (objeto `AIRCRAFT`). Campos por avión: `reg, model, sheet, empty_weight, empty_arm, empty_moment, max_gross, max_landing, max_useful_load?, fuel_cap_gal, fuel_usable_gal, fuel_lb_gal, fuel_burn_note, default_power, default_flow_gal, moment_div1000, oil{label,arm,weight}|null, stations[{id,label,arm,max|max_gal,is_fuel}], limits_normal[{w,fwd,aft}], limits_utility[]?`.

---

## Task 1: Migración aditiva de columnas en `wb_plantilla`

**Files:**
- Create: `supabase/migrations/20260722000005_wb_plantilla_editor.sql`

- [ ] **Step 1: Escribir la migración** (aditiva, `IF NOT EXISTS`):

```sql
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS default_power    numeric;
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS default_flow_gal numeric;
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS oil              jsonb;
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS model            varchar(120);
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS sheet            varchar(120);
ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS max_useful_load  numeric;
```

- [ ] **Step 2: Aplicar** `node run-sql.js "../../supabase/migrations/20260722000005_wb_plantilla_editor.sql"` desde `legacy/CAA-backend`. Esperado: sin error.
- [ ] **Step 3: Verificar** `node query.js "SELECT column_name FROM information_schema.columns WHERE table_name='wb_plantilla' AND column_name IN ('default_power','default_flow_gal','oil','model','sheet','max_useful_load') ORDER BY column_name"` → 6 filas.
- [ ] **Step 4: Commit** solo `supabase/migrations/20260722000005_wb_plantilla_editor.sql`: `feat(wb): columnas aditivas en wb_plantilla para el editor`.

---

## Task 2: Mapper `wb_plantilla` ⇄ objeto `AIRCRAFT`

**Files:**
- Create: `legacy/CAA-backend/utils/wbPlantilla.js`

Módulo puro (sin DB) con dos funciones: `filaAObjetoAircraft(fila, aeronave)` (fila BD → forma AIRCRAFT)
y `objetoAircraftAFila(obj)` (forma AIRCRAFT → columnas BD, para seed y editor). Reglas:
- `reg` NO viene de columna: `reg = aeronave.codigo` (matrícula real = clave del catálogo).
- `empty_arm`←`empty_weight_arm`, `empty_moment`←`empty_weight_moment`, `max_gross`←`max_takeoff_weight`,
  `max_landing`←`max_landing_weight`, `fuel_cap_gal`←`fuel_capacity_gal`, `default_flow_gal`←`default_flow_gal`
  (columna nueva; NO `fuel_burn_gal_hr`), `oil`←`oil` (jsonb, puede ser null), `stations`←`estaciones`,
  `limits_normal`/`limits_utility` tal cual, `model`/`sheet`/`fuel_lb_gal`/`moment_div1000`/`fuel_burn_note`/
  `default_power`/`max_useful_load`/`fuel_usable_gal` directos. Números: `Number(...)` (pg devuelve strings).
- `objetoAircraftAFila(obj)` produce `{ nombre, empty_weight, empty_weight_arm, empty_weight_moment,
  max_takeoff_weight, max_landing_weight, max_useful_load, fuel_capacity_gal, fuel_usable_gal,
  fuel_burn_gal_hr, fuel_lb_gal, default_power, default_flow_gal, moment_div1000, fuel_burn_note,
  model, sheet, oil, estaciones, limits_normal, limits_utility }`. **`fuel_burn_gal_hr = default_flow_gal`**
  (mantiene el NOT NULL) y **`nombre = obj.nombre || obj.sheet || obj.model`** (NOT NULL).
  ⚠️ **`empty_weight_moment` es NOT NULL** y el editor lo manda vacío (es solo-lectura/derivado en el
  form). Calcularlo defensivo en el mapper: `empty_weight_moment = Number(obj.empty_moment ??
  (Number(obj.empty_weight) * Number(obj.empty_arm)))` — nunca null.

- [ ] **Step 1: Escribir `utils/wbPlantilla.js`** con las dos funciones y `module.exports`.
- [ ] **Step 2: Escribir verificación temporal** `legacy/CAA-backend/_verify_wbmap.js`: importa el mapper, arma una `fila` de ejemplo + `aeronave={codigo:'YS-155-PE'}`, corre `filaAObjetoAircraft`, y `assert` (que LANZA) que `reg==='YS-155-PE'`, `empty_arm===Number`, `stations` es array, `oil` null OK; luego round-trip `objetoAircraftAFila(filaAObjetoAircraft(fila,ae))` y assert que `fuel_burn_gal_hr===default_flow_gal` y `nombre` no vacío.
- [ ] **Step 3: Correr** `node _verify_wbmap.js` → imprime OK sin lanzar. **Borrar** `_verify_wbmap.js`.
- [ ] **Step 4: Load-check** `node -e "require('./utils/wbPlantilla.js'); console.log('load OK')"`.
- [ ] **Step 5: Commit** solo `legacy/CAA-backend/utils/wbPlantilla.js`: `feat(wb): mapper wb_plantilla <-> forma AIRCRAFT`.

---

## Task 3: Re-siembra autoritativa de `wb_plantilla` desde `aircraft.js`

**Files:**
- Create: `supabase/dump/seed_wb_plantilla_desde_aircraft.js` (script node reutilizable, versionado)

El script (CommonJS) empieza con `require("dotenv").config();` y envuelve todo en un **async IIFE**
(necesario para el `await import` y las llamadas a `db`). Importa dinámicamente el ESM del frontend
(única fuente de verdad, sin duplicar datos): `const mod = await import(url.pathToFileURL(path.resolve(
__dirname,'../../CAA-frontend/src/loadsheet/data/aircraft.js')).href); const AIRCRAFT = mod.AIRCRAFT;`
(`aircraft.js` hace `export const AIRCRAFT`; el frontend es `"type":"module"`, el import funciona en
Windows). Mapea clave interna → matrícula real:

```js
const KEY_A_MATRICULA = {
  pa28r180: 'YS-127-P', c310: 'YS-259-PE', pa28_270: 'YS-270-PE',
  pa28_140: 'YS-155-PE', c152: 'YS-333-PE', pa38: 'YS-334-PE',
}; // ⚠️ pa28_270 → YS-270-PE (aircraft.js tiene el reg mal como YS-270-P)
```

Para cada entrada: resuelve `id_aeronave` por `codigo=matricula`; con `objetoAircraftAFila(AIRCRAFT[key])`
hace UPSERT en `wb_plantilla` (por `id_wb_plantilla` de la aeronave si ya tiene, si no INSERT) y setea
`aeronave.id_wb_plantilla`. Todo en una transacción con verificación de paridad ANTES del COMMIT:
para cada avión, `filaAObjetoAircraft(filaRecienEscrita, {codigo:matricula})` deep-equal `AIRCRAFT[key]`
**excepto `reg`** (270) y `empty_moment` (recomputado) → si algo difiere, `throw` → ROLLBACK.

- [ ] **Step 1: Escribir el script** con import dinámico, mapa de matrículas, UPSERT transaccional y la verificación de paridad interna (usa un helper deep-equal simple o `JSON.stringify` de objetos ordenados).
- [ ] **Step 2: Correr** `node ../../supabase/dump/seed_wb_plantilla_desde_aircraft.js` desde `legacy/CAA-backend` (para heredar `.env`/`config/db`). Esperado: "paridad OK 6/6" + "COMMIT".
- [ ] **Step 3: Verificar en BD** `node query.js "SELECT nombre, jsonb_array_length(estaciones) n FROM wb_plantilla WHERE id_wb_plantilla=(SELECT id_wb_plantilla FROM aeronave WHERE codigo='YS-155-PE')"` → el 155 con **4** estaciones (deriva corregida).
- [ ] **Step 4: Commit** solo `supabase/dump/seed_wb_plantilla_desde_aircraft.js`: `feat(wb): re-siembra autoritativa de wb_plantilla desde aircraft.js`.

---

## Task 4: `getWB` mapea `plantilla` (repurpose de la fila cruda)

**Files:**
- Modify: `legacy/CAA-backend/controllers/alumno/alumnoWbController.js:36-41,57-65`

Hoy `getWB` devuelve `plantilla` = la fila CRUDA (líneas 36-41, 60). Cambiarlo a la fila **mapeada**.

- [ ] **Step 1:** importar el mapper arriba: `const { filaAObjetoAircraft } = require("../../utils/wbPlantilla");`.
- [ ] **Step 2:** donde hoy hace `plantilla = pRes.rows[0] || null;`, envolver: `plantilla = pRes.rows[0] ? filaAObjetoAircraft(pRes.rows[0], { codigo: vRes.rows[0].aeronave_codigo }) : null;`.
- [ ] **Step 3: Load-check** `node -e "require('./controllers/alumno/alumnoWbController.js'); console.log('load OK')"`.
- [ ] **Step 4: Commit** solo ese archivo: `feat(wb): getWB devuelve plantilla mapeada a forma AIRCRAFT`.

---

## Task 5: Endpoints de práctica (`/api/loadsheet`)

**Files:**
- Create: `legacy/CAA-backend/controllers/loadsheetController.js`
- Create: `legacy/CAA-backend/routes/loadsheetRoutes.js`
- Modify: `legacy/CAA-backend/server.js` (montar la ruta, junto a las demás `app.use("/api/...")`)

Controller (usa `require("../config/db")`, `catchAsync`, el mapper):
- `getPlantilla(req,res)`: `?id_aeronave=` o `?matricula=`. Resuelve la aeronave, si tiene
  `id_wb_plantilla` devuelve `{ plantilla: filaAObjetoAircraft(fila, aeronave) }`, si no `{ plantilla: null }`.
- `listAeronaves(req,res)`: `SELECT id_aeronave, codigo AS matricula, modelo, (id_wb_plantilla IS NOT NULL) AS tiene_plantilla FROM aeronave WHERE COALESCE(activa,true)=... ` — incluir todas las AVION con plantilla; excluir SIMULADOR. Orden por codigo.

Rutas (`authMiddleware` para cualquier usuario logueado, SIN restricción de rol):
```js
const router = require("express").Router();
const authMiddleware = require("../middlewares/authMiddleware");
const ls = require("../controllers/loadsheetController");
router.get("/plantilla", authMiddleware, ls.getPlantilla);
router.get("/aeronaves", authMiddleware, ls.listAeronaves);
module.exports = router;
```
En `server.js`: `app.use("/api/loadsheet", require("./routes/loadsheetRoutes"));`.

- [ ] **Step 1:** escribir controller + rutas + montaje en server.js.
- [ ] **Step 2: Load-check** `node -e "require('./routes/loadsheetRoutes.js'); require('./controllers/loadsheetController.js'); console.log('load OK')"`.
- [ ] **Step 3:** la verificación funcional de estos endpoints se hace en prod en **Task 13** (login + HTTP). No intentar un `node -e` local: `config/db` no carga dotenv y `getPlantilla` está en `catchAsync` — un mini-script sin `dotenv.config()`+`await`+`next` fallaría silenciosamente. Basta el load-check acá.
- [ ] **Step 4: Commit** los 3 archivos: `feat(loadsheet): endpoints de plantilla y aeronaves para modo práctica`.

---

## Task 6: Endpoints del editor W&B (admin)

**Files:**
- Modify: `legacy/CAA-backend/controllers/admin/adminAeronaveController.js` (agregar `getWbPlantilla`, `guardarWbPlantilla`)
- Modify: `legacy/CAA-backend/routes/adminRoutes.js:65` (agregar 2 rutas bajo `/aeronaves/registro/:id/wb-plantilla`)

- `getWbPlantilla`: por `id` de aeronave, devuelve `{ plantilla: filaAObjetoAircraft(fila, aeronave)|null }`. Reusar `aeronaveLectura`.
- `guardarWbPlantilla`: recibe el objeto forma-AIRCRAFT en el body. **Validaciones (400 con motivo):**
  `nombre` no vacío; `fuel_usable_gal ≤ fuel_cap_gal`; `max_landing ≤ max_gross`; cada `limits_*` con `w`
  estrictamente creciente y `fwd < aft`; ≥1 estación con `is_fuel`; `empty_weight/empty_arm/max_gross`
  numéricos > 0; `arm` de cada estación numérico ≥ 0. ⚠️ **`max`/`max_gal` de estaciones son OPCIONALES**
  (el c310/YS-259-PE tiene estaciones wing_lockers/rear_baggage/baggage SIN `max` ni `max_gal`): validar
  cada uno solo **si viene** (≥0), nunca exigirlos. Luego `objetoAircraftAFila(body)` → UPSERT en
  `wb_plantilla` (si la aeronave ya tiene `id_wb_plantilla`, UPDATE por ese id; si no, INSERT y
  `UPDATE aeronave SET id_wb_plantilla=$new`). Transacción. Reusar `aeronaveEscritura` (solo ADMIN).
  Devuelve `{ ok:true, plantilla: <mapeada de nuevo> }`.

Rutas (después de la línea 65):
```js
router.get("/aeronaves/registro/:id/wb-plantilla", aeronaveLectura, adminAeronave.getWbPlantilla);
router.put("/aeronaves/registro/:id/wb-plantilla", aeronaveEscritura, adminAeronave.guardarWbPlantilla);
```

- [ ] **Step 1:** escribir los 2 handlers (con try/catch — patrón del repo: un async sin catch tumba el server) + las 2 rutas.
- [ ] **Step 2: Load-check** `node -e "require('./controllers/admin/adminAeronaveController.js'); require('./routes/adminRoutes.js'); console.log('load OK')"`.
- [ ] **Step 3: Verificación temporal con ROLLBACK** `_verify_wbput.js` (contra Supabase real, `BEGIN…ROLLBACK`): trae la fila del 155 mapeada, la modifica (p.ej. `empty_weight=1300`), llama `objetoAircraftAFila`+UPDATE dentro de la tx, re-lee mapeada y assert `empty_weight===1300`; luego prueba una validación (`fuel_usable_gal > fuel_cap_gal`) y assert que la función de validación rechaza; ROLLBACK. Borrar el archivo.
- [ ] **Step 4: Commit** los 2 archivos: `feat(wb): editor de peso y balance (GET/PUT admin)`.

---

## Task 7: `LoadSheetContext` — catálogo por contexto (keyed por matrícula)

**Files:**
- Modify: `CAA-frontend/src/loadsheet/context/LoadSheetContext.jsx`

- [ ] **Step 1:** `LoadSheetProvider` ya recibe `initial`. Añadir que `initial.aircraftCatalog` (mapa `{matricula: obj}`) viva en el state. En `initialState`, `currentAC` deja de ser `'pa28r180'` fijo → `''` (se setea al montar via `initial`). Agregar `aircraftCatalog: {}` a `initialState`.
- [ ] **Step 2:** `getDefaultFuelData(acKey, catalog)` y `computeWbResults(acKey, wbInputs, fuelBurn, catalog)` reciben el catálogo (en vez de leer el `AIRCRAFT` importado). Quitar el `import { AIRCRAFT }`. `SET_AIRCRAFT` usa `state.aircraftCatalog`. `buildInitial` usa `initial.aircraftCatalog`.
- [ ] **Step 3: Build** frontend → `✓ built` (aunque otros archivos aún importen AIRCRAFT; este solo debe compilar).
- [ ] **Step 4: Commit** solo ese archivo: `refactor(loadsheet): el contexto recibe el catálogo de aviones (keyed por matrícula)`.

---

## Task 8: Swaps directos `AIRCRAFT[currentAC]` → `state.aircraftCatalog[currentAC]`

**Files:**
- Modify: `CAA-frontend/src/loadsheet/components/steps/Step2WB.jsx`
- Modify: `CAA-frontend/src/loadsheet/components/steps/Step3Nav.jsx`
- Modify: `CAA-frontend/src/loadsheet/components/steps/Step5Summary.jsx`
- Modify: `CAA-frontend/src/loadsheet/components/wb/WBTable.jsx`
- Modify: `CAA-frontend/src/loadsheet/components/wb/ResultCards.jsx`
- Modify: `CAA-frontend/src/loadsheet/components/print/PrintSheet.jsx`

En cada uno: quitar `import { AIRCRAFT }` y reemplazar `AIRCRAFT[state.currentAC]` (o `AIRCRAFT[currentAC]`)
por `state.aircraftCatalog[state.currentAC]`. Si alguno recibe `currentAC` por prop (PrintSheet), pasarle
también el objeto del catálogo o el catálogo. **Leer cada archivo antes** — no asumir la variable; algunos
guardan `const ac = AIRCRAFT[state.currentAC]`.

- [ ] **Step 1:** aplicar los 6 swaps (uno por archivo).
- [ ] **Step 2: Build** → `✓ built`.
- [ ] **Step 3: Commit** los 6 archivos: `refactor(loadsheet): los pasos leen el avión del catálogo del contexto`.

---

## Task 9: `Step1Aircraft` — selector desde el catálogo

**Files:**
- Modify: `CAA-frontend/src/loadsheet/components/steps/Step1Aircraft.jsx`

- [ ] **Step 1:** quitar `import { AIRCRAFT }` y el `const AC_KEYS = Object.keys(AIRCRAFT)...` de nivel de módulo. Dentro del componente: `const catalog = state.aircraftCatalog; const AC_KEYS = Object.keys(catalog); const ac = catalog[state.currentAC];`. El `.map` usa `catalog[key].reg`. Eliminar el filtro `.disabled` (inerte). Consecuencia intencional: en modo vuelo el catálogo tiene 1 entrada → 1 pastilla (correcto).
- [ ] **Step 2:** guard: si `!ac`, no romper (render mínimo/"Cargando…"), porque en práctica el catálogo llega async.
- [ ] **Step 3: Build** → `✓ built`.
- [ ] **Step 4: Commit** solo ese archivo: `refactor(loadsheet): Step1 arma el selector desde el catálogo`.

---

## Task 10: `LoadsheetPage` — arma el catálogo (DB-first + fallback), modo vuelo

**Files:**
- Modify: `CAA-frontend/src/loadsheet/LoadsheetPage.jsx`

- [ ] **Step 1:** en `buildInitial`, en vez de `currentAC: acKey` (clave interna), usar la **matrícula** (`data.aeronave_codigo`) como `currentAC`. Construir `aircraftCatalog`:
  - Si `data.plantilla` (mapeada, de Task 4) no es null → `{ [data.aeronave_codigo]: data.plantilla }`.
  - Si es null (fallback) → buscar `AIRCRAFT` por `reg` (el `findAircraftKey` actual) y envolver:
    `{ [data.aeronave_codigo]: { ...AIRCRAFT[key], reg: data.aeronave_codigo } }`. Si tampoco hay match, mantener el `setError` actual de "sin plantilla".
  - Meter `aircraftCatalog` en el objeto `initial`.
- [ ] **Step 2:** conservar el `import { AIRCRAFT }` (se usa en el fallback). `findAircraftKey` se mantiene solo para el fallback.
- [ ] **Step 3: Build** → `✓ built`.
- [ ] **Step 4: Verificar en navegador** (dev server): abrir un loadsheet de un vuelo real (o Task 13 lo cubre en prod). Confirmar que el wizard renderiza los números del avión. Si no hay forma simple de loguear, dejar la verificación visual para Task 13 y solo exigir build verde acá.
- [ ] **Step 5: Commit** solo ese archivo: `feat(loadsheet): LoadsheetPage arma el catálogo DB-first con fallback`.

---

## Task 11: Modo práctica (rutas + página + wizard sin guardar)

**Files:**
- Modify: `CAA-frontend/src/loadsheet/LoadsheetPage.jsx` (soportar prop `practice`)
- Modify: `CAA-frontend/src/loadsheet/LoadsheetWizard.jsx` (banner práctica; sin botón guardar/enviar)
- Create: `CAA-frontend/src/loadsheet/loadsheetPracticaApi.js` (o reusar `loadsheetApi.js`) para `GET /loadsheet/aeronaves` + `GET /loadsheet/plantilla`
- Modify: `CAA-frontend/src/App.jsx:172,325` (2 rutas nuevas)
- Modify: el header/nav del alumno y del instructor (agregar link "Practicar loadsheet")

- [ ] **Step 1: API** — funciones `getAeronavesPractica()` y `getPlantillaPractica(id_aeronave)` (axios, base = VITE_API_URL, `/loadsheet/...`).
- [ ] **Step 2: `LoadsheetPage practice`** — nueva prop `practice=false`. Cuando `practice`:
  no usa `id_vuelo`; al montar llama `getAeronavesPractica()`, y para cada avión con plantilla trae su template (o lazy al elegir). Arma `aircraftCatalog` con TODOS. `currentAC` = la matrícula del primer avión. Precarga `flightData.student` desde `getSession()` de `utils/auth.js` (`user.nombre`+`user.apellido`); la **licencia NO está en la sesión** → queda en blanco/editable (no bloquea). Setea `initial` con `readOnly:false, practice:true`, sin `idVuelo`.
- [ ] **Step 3: Wizard** — aceptar prop `practice` y meterla en el `initial`/state (ya se hace en Step 2, así llega como `state.practice`). Banner azul "Modo práctica — no se guarda nada" (en vez del amber de readOnly). ⚠️ El wizard renderiza `<CurrentStep />` **sin props** (`LoadsheetWizard.jsx:50`), así que Step5 NO recibe `practice` por prop: el bloque de botones Guardar/Enviar de `Step5Summary` (hoy gated `!state.readOnly`, ~línea 190) pasa a `!state.readOnly && !state.practice`. Vista previa/Imprimir/PDF quedan.
- [ ] **Step 4: Rutas** en `App.jsx`: `/alumno/loadsheet/practica` (ProtectedAlumno → `<LoadsheetPage practice />`) y `/instructor/loadsheet/practica` (ProtectedInstructor → `<LoadsheetPage practice />`). Colocarlas ANTES de las rutas con `:id_vuelo` para que no las capture el dinámico (react-router v7 rankea, pero explícito es más claro).
- [ ] **Step 5: Entradas de menú** — link "Practicar loadsheet" en el header del alumno y del instructor (buscar el componente de header/nav de cada rol y seguir su patrón de links).
- [ ] **Step 6: Build** → `✓ built`.
- [ ] **Step 7: Commit** los archivos tocados: `feat(loadsheet): modo práctica efímero para alumnos e instructores`.

---

## Task 12: Editor de W&B en la ficha del avión (UI)

**Files:**
- Modify: `CAA-frontend/src/pages/Admin/AeronaveFicha.jsx:320-366` (reemplazar `TabWB` placeholder por el editor)
- Modify: `CAA-frontend/src/services/*Api.js` (agregar `getWbPlantilla(id)` y `guardarWbPlantilla(id, obj)` — usar el servicio admin de aeronaves que ya exista; buscar dónde está `getAeronave`/`actualizarAeronave`)
- (Reusar) `CAA-frontend/src/loadsheet/components/wb/EnvelopeCanvas.jsx` + `utils/drawEnvelope.js` para la vista previa

- [ ] **Step 1: API** — `getWbPlantilla(id)` (GET `/admin/aeronaves/registro/:id/wb-plantilla`) y `guardarWbPlantilla(id, obj)` (PUT). Seguir el patrón del servicio que ya llama a `/admin/aeronaves/registro/...`.
- [ ] **Step 2: Estado del editor** — `TabWB` carga la plantilla (o un objeto vacío por defecto si no tiene) en un `useState` con la forma AIRCRAFT. Formulario `adf-*` con: cabecera (nombre*, empty_weight, empty_arm, max_gross, max_landing, max_useful_load, fuel_cap_gal, fuel_usable_gal, default_flow_gal, fuel_lb_gal, default_power, fuel_burn_note, moment_div1000, model, sheet), `empty_moment` de **solo lectura** (derivado `empty_weight*empty_arm`), toggle oil + {label,arm,weight}, tabla editable de estaciones (agregar/quitar; columnas id,label,arm,max/max_gal,is_fuel), y 2 tablas editables de límites (normal + utility) con {w,fwd,aft}.
- [ ] **Step 3: Vista previa del envelope** — renderizar `EnvelopeCanvas` (o llamar `drawEnvelope`) con los `limits_normal` actuales del formulario, para verlo en vivo mientras se editan los puntos. Leer la firma de `EnvelopeCanvas`/`drawEnvelope` antes (qué props/args esperan).
- [ ] **Step 4: Guardar** — botón que llama `guardarWbPlantilla(id, obj)`; toast de éxito/errores (sonner). Mostrar el 400 del backend (motivo de validación) como `toast.error`. Al guardar OK, recargar la ficha (`a.id_wb_plantilla` puede haber cambiado si era null).
- [ ] **Step 5: Build** → `✓ built`.
- [ ] **Step 6: Commit** los archivos tocados: `feat(wb): editor de peso y balance en la ficha del avión (con vista previa del envelope)`.

---

## Task 13: Verificación integral + deploy

**Files:** (solo scripts temporales `_verify_*.js`, borrados al final)

- [ ] **Step 1: Paridad del seed** — re-correr la verificación del script de Task 3 (o un `_verify_paridad.js` que compare cada avión mapeado desde `wb_plantilla` vs `AIRCRAFT[key]`, excepto `reg`/`empty_moment`) → 6/6 OK. Borrar.
- [ ] **Step 2: Merge + push** — `git fetch origin; git merge origin/master` (resolver si Samuel pusheó); `git push origin master` (auto-despliega Vercel + Railway).
- [ ] **Step 3: Esperar backend** — poll `curl -s -o /dev/null -w "%{http_code}" https://caaa-backend-production.up.railway.app/api/loadsheet/aeronaves` hasta **401** (ruta viva; sin token da 401, no 404).
- [ ] **Step 4: E2E prod (solo lectura)** — `_verify_prod.js`: login `u4` (alumno) → `GET /loadsheet/aeronaves` (lista con `tiene_plantilla`), `GET /loadsheet/plantilla?matricula=YS-155-PE` → `{plantilla:{reg:'YS-155-PE', stations:[4], ...}}`; login `u1` → `GET /admin/aeronaves/registro/6/wb-plantilla` → plantilla del 155; `GET /alumno/vuelos/<id>/weight-balance` de un vuelo real → `plantilla` mapeada presente. Borrar el script.
- [ ] **Step 5: Verificación en navegador** — abrir `caaa-app.vercel.app`, login alumno, entrar a "Practicar loadsheet", elegir el 155, completar peso y ver el envelope; login admin, ficha del 155 → pestaña Peso y balance → cambiar un número, guardar, y confirmar en el loadsheet (práctica o vuelo) que el número cambió. Capturas si el navegador lo permite.
- [ ] **Step 6: Actualizar memoria** — archivo `sesion-2026-07-22-loadsheet-practica-editor-wb.md` en el dir de memoria + línea en `MEMORY.md`. Reportar a Daniel.

---

## Dependencias / orden

T1 → T2 → {T3, T4, T5, T6 backend en cualquier orden tras T2} → T7 → T8 → T9 → T10 → T11 → T12 → T13.
Los frontend (T7-T12) son secuenciales porque comparten archivos del wizard. T13 la ejecuta la sesión
principal (merge/push/verificación en prod), NO un subagente.
