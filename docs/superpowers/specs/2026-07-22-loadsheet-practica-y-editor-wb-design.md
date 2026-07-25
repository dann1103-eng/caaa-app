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

- **Mapeo canónico `wb_plantilla` (fila BD) → forma `AIRCRAFT[key]`** (utilidad backend, ej.
  `utils/wbPlantilla.js` → `filaAObjetoAircraft(fila, aeronave)`): traduce nombres de columna
  (`empty_weight_arm`→`empty_arm`, `max_takeoff_weight`→`max_gross`, `fuel_capacity_gal`→`fuel_cap_gal`,
  `fuel_burn_gal_hr`→`default_flow_gal`, etc.), pasa los jsonb tal cual (`estaciones`→`stations`,
  `limits_normal`, `limits_utility`), y toma `reg`/`model` de la fila `aeronave` (matrícula/modelo).
  El objeto resultante es **idéntico en forma** al que hoy consume el wizard.
- **Columnas faltantes en `wb_plantilla`** (aditivas, para no perder nada de `aircraft.js`):
  `default_power numeric`, `default_flow_gal numeric`, `oil jsonb`, `model varchar`, `sheet varchar`,
  `max_useful_load numeric`. (`fuel_burn_gal_hr` ya existe pero el wizard usa `default_flow_gal`
  como la quema por defecto — se agrega la columna dedicada para no sobrecargar semántica.)
- **`getWBData` (endpoint del vuelo, `alumnoWbController.getWB`)** suma al response un campo
  **`plantilla`** = el objeto mapeado del avión del vuelo (o `null` si el avión no tiene fila).
- **Nuevo endpoint de template por avión (para práctica):**
  `GET /loadsheet/plantilla?matricula=YS-155-PE` (o `?id_aeronave=6`) → `{ plantilla }` mapeado, o
  `{ plantilla: null }`. Accesible a cualquier usuario autenticado (alumno/instructor/staff).
  Devuelve además la lista de aviones con plantilla para poblar el selector de práctica:
  `GET /loadsheet/aeronaves` → `[{ id_aeronave, matricula, modelo, tiene_plantilla }]`.
- **Frontend — el wizard deja de importar `AIRCRAFT` directo y recibe el catálogo por contexto.**
  `LoadSheetProvider` acepta `aircraftCatalog` (mapa `{ key: objeto }`). `LoadsheetPage` arma ese
  mapa a partir de `data.plantilla` (una sola entrada, la del avión del vuelo) y lo mete al contexto.
  Los 9 archivos que hoy hacen `AIRCRAFT[acKey]` pasan a leer del contexto
  (`state.aircraftCatalog[acKey]`). **Fallback:** si `data.plantilla` es null, el catálogo cae al
  `AIRCRAFT` importado (comportamiento actual intacto). `aircraft.js` NO se borra — queda de fallback/seed.

### 2. Modo práctica (alumno + instructor) — sin backend de persistencia

- **Entrada** "Practicar loadsheet" en el header/dashboard de alumno y de instructor.
- **Rutas nuevas:** `/alumno/loadsheet/practica` (ProtectedAlumno) y `/instructor/loadsheet/practica`
  (ProtectedInstructor). Ambas renderizan `LoadsheetPage` en un **modo `practice`** nuevo.
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
- **Carga:** `GET /admin/aeronaves/:id/wb-plantilla` → la fila mapeada (o vacía para crear una nueva
  si el avión no tiene). Lectura ADMIN+TALLER; escritura solo ADMIN.
- **Formulario (estilo `adf-*`):** edita todos los campos:
  - Cabecera: `empty_weight`, `empty_arm`, `empty_moment` (autocalculado = weight×arm, editable),
    `max_gross`, `max_landing`, `max_useful_load?`, `fuel_cap_gal`, `fuel_usable_gal`,
    `default_flow_gal`, `fuel_lb_gal`, `default_power`, `fuel_burn_note`, `moment_div1000` (checkbox),
    `model`, `sheet`.
  - Aceite: toggle "tiene aceite" + `label/arm/weight`.
  - **Estaciones**: tabla editable (agregar/quitar filas): `id, label, arm, max` (o `max_gal` +
    `is_fuel` para tanques). Al menos una `is_fuel`.
  - **Sobre de CG**: dos tablas editables (normal y utility, utility opcional): filas `{w, fwd, aft}`.
- **Vista previa en vivo del envelope:** reusa `EnvelopeCanvas`/`drawEnvelope` para dibujar el sobre
  con los puntos actuales del formulario mientras se edita (clave para el 155/310).
- **Guardar:** `PUT /admin/aeronaves/:id/wb-plantilla` (solo ADMIN) → UPSERT en `wb_plantilla` y
  set `aeronave.id_wb_plantilla`. **Validaciones de cordura** (400 con motivo): `fuel_usable ≤ fuel_cap`,
  `max_landing ≤ max_gross`, cada tabla de límites con `w` estrictamente creciente y `fwd < aft`,
  al menos una estación `is_fuel`, todos los `arm`/`max` numéricos ≥ 0. Toma efecto inmediato (el
  próximo loadsheet lee la fila nueva).

### 4. Modelo de datos + re-siembra

- Migración **aditiva**: `ALTER TABLE wb_plantilla ADD COLUMN IF NOT EXISTS` para
  `default_power`, `default_flow_gal`, `oil` (jsonb), `model`, `sheet`, `max_useful_load`.
- **Re-siembra autoritativa desde `aircraft.js`** (script único, no un endpoint): para los 6 aviones
  reales, UPSERT de `wb_plantilla` con los valores EXACTOS de `AIRCRAFT` (la fuente viva), y set de
  `aeronave.id_wb_plantilla`. Corrige la deriva actual (p.ej. el 155 vuelve a 4 estaciones). Tras
  esto, la DB == comportamiento actual byte a byte.
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
  desde `wb_plantilla` contra `AIRCRAFT[key]` → deben ser iguales (deep-equal) tras la siembra.
- **DB-first en el wizard**: cargar un loadsheet de vuelo real y confirmar que los números salen de
  la DB (editar la fila vía API y ver el cambio reflejado sin tocar `aircraft.js`).
- **Fallback**: con una fila borrada, el wizard usa `aircraft.js` y no se rompe.
- **Editor**: PUT válido cambia el endpoint del template; PUT inválido (usable > cap, etc.) → 400.
- **Práctica**: `/alumno/loadsheet/practica` y `/instructor/loadsheet/practica` montan el wizard,
  el selector lista los aviones con plantilla, no hay botón de guardar/enviar, imprime/PDF funciona.
