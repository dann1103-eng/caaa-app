# Loadsheet: modo práctica + editor de peso y balance (admin)

**Fecha:** 2026-07-22 · **Aprobado por:** Daniel (brainstorm en sesión)

## Contexto — qué existe ya

- **Loadsheet integrado** en `CAA-frontend/src/loadsheet/`: wizard de 5 pasos
  (`LoadsheetWizard.jsx`, `LoadSheetContext.jsx`). Rutas actuales: alumno edita
  `/alumno/loadsheet/:id_vuelo`, instructor lee `/instructor/loadsheet/:id_vuelo`,
  practicante edita `/instructor/practica/loadsheet/:id_vuelo`. `LoadsheetPage.jsx`
  recibe `readOnly` y `apiBase`.
- **Los templates de peso & balance viven HOY en un archivo estático del frontend:**
  `CAA-frontend/src/loadsheet/data/aircraft.js` (objeto `AIRCRAFT`, keyed por clave interna,
  con `reg` = matrícula). Lo importan **9 archivos**: `LoadSheetContext.jsx`, `LoadsheetPage.jsx`,
  `Step1Aircraft.jsx`, `Step2WB.jsx`, `Step3Nav.jsx`, `Step5Summary.jsx`, `WBTable.jsx`,
  `ResultCards.jsx`, `PrintSheet.jsx`. **Ésta es la fuente de verdad viva del calculador.**
- **La tabla `wb_plantilla` existe** (columnas: `empty_weight`, `empty_weight_arm`,
  `empty_weight_moment`, `max_takeoff_weight`, `max_landing_weight`, `fuel_capacity_gal`,
  `fuel_usable_gal`, `fuel_burn_gal_hr`, `fuel_lb_gal`, `moment_div1000`, `fuel_burn_note`,
  `unidad_arm`, `nombre`, `estaciones` jsonb, `limits_normal` jsonb, `limits_utility` jsonb) y
  **cada avión la referencia** (`aeronave.id_wb_plantilla`). **PERO el calculador nunca la lee** —
  es un espejo muerto, y **ya divergió**: la fila del 155 (id 6) tiene 5 estaciones cuando
  `aircraft.js` tiene 4. `SIM-1` no tiene plantilla (correcto).
- Forma de `aircraft.js` (por avión): `reg, model, sheet, empty_weight, empty_arm,
  empty_moment, max_gross, max_landing, [max_useful_load], fuel_cap_gal, fuel_usable_gal,
  fuel_lb_gal, fuel_burn_note, default_power, default_flow_gal, moment_div1000, oil{label,arm,weight}|null,
  stations[{id,label,arm,max|max_gal,is_fuel}], limits_normal[{w,fwd,aft}], limits_utility[...]?`.

## Decisiones de Daniel (brainstorm)

1. **Práctica = efímero.** El alumno/instructor practica sin vuelo, ve resultados, imprime/PDF;
   nada se guarda. Cero backend nuevo de persistencia.
2. **Práctica para alumnos E instructores** (ambos ven la entrada).
3. **Editor de W&B = template COMPLETO** (cabecera + estaciones + puntos del sobre de CG + oil + flags).
4. **Arquitectura = DB-first con fallback** (enfoque A): el calculador lee el template desde
   `wb_plantilla`; si un avión no tiene fila, cae a `aircraft.js`. Re-siembra inicial garantiza
   paridad exacta el día 1. El editor escribe en `wb_plantilla`.

## Diseño

### 1. Template como dato — mapeo y backend (DB-first)

- **Convención de clave del catálogo (CRÍTICO): la clave es la MATRÍCULA real del avión**
  (`aeronave.codigo`, p.ej. `"YS-155-PE"`), NO las claves internas de `aircraft.js` (`pa28_140`).
  Tanto en modo vuelo como en práctica, `state.currentAC` = la matrícula. Esto unifica el espacio
  de claves entre DB-first y fallback, y de paso **corrige el typo histórico**: `aircraft.js` tiene
  el 270 como `reg:'YS-270-P'` mientras la matrícula real es `YS-270-PE` — con clave = matrícula real,
  el 270 mapea bien (hoy `findAircraftKey('YS-270-PE')` NO encuentra `pa28_270` porque su `reg` está
  mal). `initialState.currentAC` deja de ser una clave interna fija; se setea al montar.
- **Mapeo canónico `wb_plantilla` (fila BD) → forma `AIRCRAFT[key]`** (utilidad backend, ej.
  `utils/wbPlantilla.js` → `filaAObjetoAircraft(fila, aeronave)`): traduce nombres de columna
  (`empty_weight_arm`→`empty_arm`, `empty_weight_moment`→`empty_moment`, `max_takeoff_weight`→`max_gross`,
  `max_landing_weight`→`max_landing`, `fuel_capacity_gal`→`fuel_cap_gal`, `fuel_burn_gal_hr`→NO se usa
  para la quema, ver abajo), pasa los jsonb tal cual (`estaciones`→`stations`, `limits_normal`,
  `limits_utility`). **`reg`, `model`, `sheet` salen de las columnas de `wb_plantilla`** (sembradas
  desde `aircraft.js`), NO de la fila `aeronave` (cuyo `modelo` guarda códigos como `TOMAHAWK`, no el
  texto legible que imprime el wizard). El objeto resultante es **idéntico en forma** al que hoy
  consume el wizard.
- **Columnas faltantes en `wb_plantilla`** (aditivas, para no perder nada de `aircraft.js`):
  `default_power numeric`, `default_flow_gal numeric`, `oil jsonb`, `model varchar`, `sheet varchar`,
  `max_useful_load numeric`. La quema por defecto del wizard es **`default_flow_gal`** (columna nueva);
  `fuel_burn_gal_hr` (ya existe, NOT NULL) se mantiene sincronizada = `default_flow_gal` al escribir,
  para no romper su constraint (ver §3 y §4).
- **`getWB` (endpoint del vuelo, `alumnoWbController.getWB`) YA devuelve un campo `plantilla`** = la
  fila CRUDA de `wb_plantilla` (hoy sin usar en el frontend, que resuelve por `aeronave_codigo`+
  `findAircraftKey`). **Se REPURPONE**: pasa a devolver la fila **mapeada** con `filaAObjetoAircraft`
  (o `null` si el avión no tiene fila). No se agrega un segundo campo. Verificar que nada dependa de
  la forma cruda (hoy nada la lee).
- **Nuevo endpoint de template por avión (para práctica):**
  `GET /loadsheet/plantilla?matricula=YS-155-PE` (o `?id_aeronave=6`) → `{ plantilla }` mapeado, o
  `{ plantilla: null }`. Accesible a cualquier usuario autenticado (alumno/instructor/staff).
  Y la lista de aviones con plantilla para el selector de práctica:
  `GET /loadsheet/aeronaves` → `[{ id_aeronave, matricula, modelo, tiene_plantilla }]`.
- **Frontend — el catálogo se recibe por contexto (con `aircraft.js` de fallback).**
  `LoadSheetProvider` acepta `aircraftCatalog` (mapa **keyed por matrícula** `{ "YS-155-PE": objeto }`).
  `LoadsheetPage` en modo vuelo arma un mapa de UNA entrada (el avión del vuelo) desde `data.plantilla`;
  en práctica lo arma con todos los aviones con plantilla. Los archivos que hoy hacen `AIRCRAFT[acKey]`
  pasan a leer `state.aircraftCatalog[acKey]`. **El swap NO es uniforme** — ver la sub-sección
  "Refactor de los 9 archivos" abajo. **Fallback:** si `data.plantilla` es null, el catálogo se arma
  envolviendo el `AIRCRAFT[internalKey]` importado en `{ [matrícula]: obj }` (misma convención de clave).
  `aircraft.js` NO se borra — queda de fallback/seed y `LoadsheetPage` conserva su import.

#### Refactor de los 9 archivos (no es un swap mecánico)
- La mayoría (`Step2WB`, `Step3Nav`, `Step5Summary`, `WBTable`, `ResultCards`, `PrintSheet`) sí es el
  swap directo `AIRCRAFT[state.currentAC]` → `state.aircraftCatalog[state.currentAC]`.
- **`Step1Aircraft.jsx`**: hoy tiene `const AC_KEYS = Object.keys(AIRCRAFT)...` a **nivel de módulo**
  e itera TODOS los aviones (una pastilla por avión). Debe moverse DENTRO del componente para leer
  `state.aircraftCatalog`. Consecuencia **intencional**: en modo vuelo el selector muestra 1 sola
  pastilla (el avión del vuelo) en vez de las 6 — no es regresión, es correcto (el avión del vuelo es
  fijo). En práctica muestra todos los aviones con plantilla. El flag `.disabled` (hoy inerte, sin
  fuente en la DB) se elimina.
- **`LoadsheetPage.jsx`**: usa `findAircraftKey` (no `AIRCRAFT[acKey]`) y **conserva** el import de
  `AIRCRAFT` para el fallback. La resolución de la matrícula → objeto cambia (ya no `findAircraftKey`
  en modo DB; en fallback sí).
- **`LoadSheetContext.jsx`**: `getDefaultFuelData(acKey)` (reducer `SET_AIRCRAFT`) y
  `computeWbResults(acKey,…)` (`buildInitial`) son helpers de módulo que leen el `AIRCRAFT` importado.
  Pasan a recibir el **catálogo** desde `state`/`initial` (no un `AIRCRAFT[key]` global). `SET_AIRCRAFT`
  y `buildInitial` deben tener el catálogo a mano.

### 2. Modo práctica (alumno + instructor) — sin backend de persistencia

- **Entrada** "Practicar loadsheet" en el header/dashboard de alumno y de instructor.
- **Rutas nuevas:** `/alumno/loadsheet/practica` (ProtectedAlumno) y `/instructor/loadsheet/practica`
  (ProtectedInstructor). Ambas renderizan `LoadsheetPage` en un **modo `practice`** nuevo. ⚠️ La ruta
  del instructor queda cerca de la existente `/instructor/practica/loadsheet/:id_vuelo` (practicante) —
  son distintas y react-router v7 rankea estático > dinámico, pero nombrarlas parecido confunde: usar
  exactamente `/instructor/loadsheet/practica`.
- **Precarga de nombre/licencia** del usuario logueado en `flightData`: alumno desde
  `GET /alumno/mi-ficha`-equivalente (o el `user` del auth ya disponible en el front), instructor desde
  su ficha. Fuente concreta a resolver en el plan; si no hay endpoint simple, se deja el campo editable
  en blanco (no bloquea la práctica).
- **`LoadsheetPage practice`**: no hay `id_vuelo`. Al montar, pide `GET /loadsheet/aeronaves` +
  carga los templates (todas las plantillas, o lazy al elegir avión). Arma `aircraftCatalog` con
  todos los aviones con plantilla. Precarga nombre/licencia del usuario logueado en `flightData`.
  Inicializa el wizard con `readOnly=false`, `practice=true`, sin `idVuelo`.
- **Diferencias del wizard en `practice`:** Paso 1 permite elegir **cualquier** avión con plantilla
  (selector ya existe); se **oculta** el botón "Guardar y enviar" / "Guardar" (no hay vuelo que
  persistir); se mantienen "Vista previa / Imprimir / Descargar PDF". Banner "Modo práctica — no se
  guarda nada".
- **Aviones sin plantilla** (hoy ninguno) no aparecen en el selector de práctica.

### 3. Editor de W&B (admin) — en la ficha del avión

- **Ubicación:** pestaña **"Peso y balance"** de `pages/Admin/AeronaveFicha.jsx` (hoy muestra solo
  estado). **Solo ADMIN** (la página ya es `ProtectedAdmin`).
- **Endpoints** bajo la convención existente de la ficha (`adminRoutes.js`, sub-prefijo `registro`
  a propósito para que `:id` no se coma `/aeronaves/alertas-mantenimiento`), reusando sus middlewares:
  `GET /admin/aeronaves/registro/:id/wb-plantilla` (`aeronaveLectura` = ADMIN+TALLER) → fila mapeada
  (o `null`/plantilla vacía para crear una nueva); `PUT /admin/aeronaves/registro/:id/wb-plantilla`
  (`aeronaveEscritura` = solo ADMIN).
- **Formulario (estilo `adf-*`):** edita todos los campos:
  - Cabecera: `nombre` (obligatorio — `wb_plantilla.nombre` es NOT NULL; se muestra en el form, default
    sugerido = modelo), `empty_weight`, `empty_arm`, `max_gross`, `max_landing`, `max_useful_load?`,
    `fuel_cap_gal`, `fuel_usable_gal`, `default_flow_gal`, `fuel_lb_gal`, `default_power`,
    `fuel_burn_note`, `moment_div1000` (checkbox), `model`, `sheet`.
  - `empty_moment` **NO se edita**: el calculador lo recomputa (`empty_weight × empty_arm` en
    `wbCalc.calcWB`); se muestra derivado de solo-lectura. (Editarlo no tendría efecto — evitar la
    confusión de un campo fantasma.)
  - Aceite: toggle "tiene aceite" + `label/arm/weight`.
  - **Estaciones**: tabla editable (agregar/quitar filas): `id, label, arm, max` (o `max_gal` +
    `is_fuel` para tanques). Al menos una `is_fuel`.
  - **Sobre de CG**: dos tablas editables (normal y utility, utility opcional): filas `{w, fwd, aft}`.
- **Vista previa en vivo del envelope:** reusa `EnvelopeCanvas`/`drawEnvelope` para dibujar el sobre
  con los puntos actuales del formulario mientras se edita (clave para el 155/310).
- **Guardar:** `PUT` → UPSERT en `wb_plantilla` y set `aeronave.id_wb_plantilla`. Al escribir, el
  backend **rellena las columnas NOT NULL sin campo propio en el form**: `fuel_burn_gal_hr` = el
  `default_flow_gal` enviado (mantiene el constraint y las deja sincronizadas), y `nombre` viene del
  form (obligatorio). **Validaciones de cordura** (400 con motivo): `nombre` no vacío,
  `fuel_usable ≤ fuel_cap`, `max_landing ≤ max_gross`, cada tabla de límites con `w` estrictamente
  creciente y `fwd < aft`, al menos una estación `is_fuel`, todos los `arm`/`max` numéricos ≥ 0. Toma
  efecto inmediato (el próximo loadsheet lee la fila nueva).

### 4. Modelo de datos + re-siembra

- Migración **aditiva**: `ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS` para
  `default_power`, `default_flow_gal`, `oil` (jsonb), `model`, `sheet`, `max_useful_load`.
- **Re-siembra autoritativa desde `aircraft.js`** (script único, no un endpoint): para los 6 aviones
  reales, UPSERT de `wb_plantilla` con los valores EXACTOS de `AIRCRAFT` (la fuente viva) — incluyendo
  `nombre` (= el `sheet`/modelo) y `fuel_burn_gal_hr` = `default_flow_gal` para respetar los NOT NULL —
  y set de `aeronave.id_wb_plantilla`. **El match `aircraft.js` → fila `aeronave`** se hace por la
  clave interna → matrícula real (mapeo explícito en el script, porque el `reg` de `aircraft.js` del
  270 está mal: `YS-270-P` → aeronave `YS-270-PE`). La columna `reg` sembrada usa la **matrícula real**
  (única desviación deliberada de `aircraft.js`, para que el catálogo keyee bien). Corrige además la
  deriva actual (p.ej. el 155 vuelve a 4 estaciones).
- ⚠️ `aircraft.js` tiene una inconsistencia pre-existente (el 155 `limits_normal` llega a `w:2450`
  con `max_gross:2150`). La re-siembra **copia aircraft.js tal cual** (no "arregla" nada) para no
  cambiar comportamiento; Daniel corrige esos números después con el editor si quiere.

## Fuera de alcance

- Persistir prácticas / historial de prácticas (se decidió efímero).
- Versionado / auditoría de cambios del template (un UPSERT pisa el anterior). Se puede agregar después.
- Editar el template desde el módulo Taller (hoy solo ADMIN desde la ficha del avión).
- Borrar `aircraft.js` (queda de fallback/seed).
- Cambiar la lógica de cálculo (`wbCalc.js`, `fuelCalc.js`) — solo cambia de dónde sale el template.

## Verificación

- **Paridad del re-seed**: script que, para cada avión, compara campo a campo el objeto mapeado
  desde `wb_plantilla` contra `AIRCRAFT[key]` → deep-equal tras la siembra, **excepto `reg`** (que
  para el 270 pasa a ser la matrícula real `YS-270-PE`, corrección deliberada) y `empty_moment`
  (recomputado, no comparar). El resto debe ser idéntico.
- **DB-first en el wizard**: cargar un loadsheet de vuelo real y confirmar que los números salen de
  la DB (editar la fila vía API y ver el cambio reflejado sin tocar `aircraft.js`).
- **Fallback**: con una fila borrada, el wizard usa `aircraft.js` y no se rompe.
- **Editor**: PUT válido cambia el endpoint del template; PUT inválido (usable > cap, etc.) → 400.
- **Práctica**: `/alumno/loadsheet/practica` y `/instructor/loadsheet/practica` montan el wizard,
  el selector lista los aviones con plantilla, no hay botón de guardar/enviar, imprime/PDF funciona.
