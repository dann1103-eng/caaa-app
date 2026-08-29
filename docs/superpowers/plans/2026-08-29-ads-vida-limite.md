# ADs y vida límite — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar los 221 renglones de ADs y vida límite de los cinco aviones en `taller_tarea_programada`, con cálculo de vencimiento, aviso al jefe de taller y export fiel al papel.

**Architecture:** Cuatro columnas aditivas sobre la tabla que ya existe; un helper único que deriva el estado; dos pestañas nuevas en Aeronavegabilidad (que se parte en carpeta); una tarjeta en Mi taller; y un importador re-ejecutable con reporte.

**Tech Stack:** Node/Express + `pg`, React 19 + Vite, PostgreSQL en Supabase. Python + openpyxl solo para leer los Excel (no hay módulo de Excel en Node — CLAUDE.md §16).

**Spec:** `docs/superpowers/specs/2026-08-29-ads-vida-limite-design.md`

---

## Cómo se verifica en este repo

**No hay framework de tests.** La convención establecida (§29–§37 de CLAUDE.md) es un script de Node
que pega contra el backend real o contra Supabase, afirma, y **limpia todo al terminar**. Los scripts
de verificación van en el scratchpad de la sesión, **no se commitean**.

Backend local contra Supabase real:

```bash
cd legacy/CAA-backend && PORT=5099 node server.js
```

⚠️ **Confirmar en el log que el server que responde es el que acabás de levantar.** Ya pasó dos veces
que había otro backend viejo escuchando en el 5099 y las pruebas corrieron contra código viejo,
dando fallos fantasma (§35.A, §37).

---

## Estructura de archivos

**Backend**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260829000001_aeronavegabilidad_ads_vida_limite.sql` | 4 columnas aditivas |
| `legacy/CAA-backend/utils/vencimientos.js` | **crear** — estado, umbrales, y las dos escalas |
| `legacy/CAA-backend/controllers/taller/seguimientoController.js` | **modificar** — campos nuevos, filtro por tipo, resolver conflicto |
| `legacy/CAA-backend/routes/tallerRoutes.js` | **modificar** — 1 ruta nueva |

**Frontend** — `pages/Taller/Aeronavegabilidad.jsx` (34 KB) se parte en `pages/Taller/aeronavegabilidad/`:

| Archivo | Responsabilidad |
|---|---|
| `Aeronavegabilidad.jsx` | selector de avión, franja de atención, pestañas |
| `Componentes.jsx` · `Tareas.jsx` · `Historial.jsx` | lo que hoy existe, movido tal cual |
| `TablaSeguimiento.jsx` | **crear** — la tabla compartida por ADs y vida límite |
| `ListaAD.jsx` · `VidaLimite.jsx` | **crear** — encabezado y filtros de cada pestaña |
| `FranjaAtencion.jsx` | **crear** — las tres bandas |
| `pages/Taller/MiTaller.jsx` | **modificar** — la tarjeta |

**Importador** — `supabase/dump/aeronavegabilidad/`: `extraer.py` (Excel → JSON) y `cargar.js` (JSON → Supabase, con `--dry-run`).

---

## Task 1: Migración y helper de vencimientos

**Files:**
- Create: `supabase/migrations/20260829000001_aeronavegabilidad_ads_vida_limite.sql`
- Create: `legacy/CAA-backend/utils/vencimientos.js`
- Modify: `legacy/CAA-backend/controllers/taller/seguimientoController.js:5-38`

- [ ] **Step 1: Escribir la migración**

```sql
-- ADs, boletines de servicio y vida límite de componentes.
-- Todo aditivo: el backend viejo tolera estas columnas sin cambios.
ALTER TABLE taller_tarea_programada
  ADD COLUMN IF NOT EXISTS aplica                boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS observaciones         text,
  ADD COLUMN IF NOT EXISTS necesita_confirmacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nota_confirmacion     text,
  ADD COLUMN IF NOT EXISTS origen                varchar(20);

COMMENT ON COLUMN taller_tarea_programada.aplica IS
  'false = el renglon no aplica a este avion (N/A por serie, por modelo, no instalado). No alerta, no se borra.';
COMMENT ON COLUMN taller_tarea_programada.necesita_confirmacion IS
  'El papel se contradice consigo mismo; nota_confirmacion trae las dos versiones. El jefe decide.';
COMMENT ON COLUMN taller_tarea_programada.origen IS
  'EXCEL_2026 / OCR_2026 / MANUAL. Lo importado se borra y recarga por este campo.';
```

- [ ] **Step 2: Correr la migración**

```bash
cd legacy/CAA-backend && node run-sql.js "../../supabase/migrations/20260829000001_aeronavegabilidad_ads_vida_limite.sql"
```

Verificar: `node query.js "SELECT aplica, origen FROM taller_tarea_programada LIMIT 1"` devuelve las columnas.

- [ ] **Step 3: Crear `utils/vencimientos.js`**

Mueve `UMBRAL_HORAS`/`UMBRAL_DIAS` y `calcularEstado` fuera del controller, y agrega las dos escalas.
**El cálculo del estado no cambia de escala** — ya estaba bien; lo que se agrega es la conversión de
presentación y los dos estados nuevos.

```js
// Umbrales de aviso. Decisión de Daniel (2026-08-29): 10 horas de vuelo,
// 7 días y 30 días. Los dos primeros ya existían con estos mismos valores.
const UMBRAL_HORAS = 10;
const UMBRAL_DIAS = 30;
const UMBRAL_DIAS_URGENTE = 7;

// ── Las dos escalas del TAC ───────────────────────────────────────────────
// Se GUARDA en escala del sistema (igual que aeronave.horas_acumuladas y que
// taller_componente.horas_aeronave_instalacion). Se MUESTRA en escala de libro.
// El YS-334-PE es el único con offset (su tacómetro dio la vuelta a 9999.99).
// Confundirlas son 10,000 horas en un documento del que depende la
// aeronavegabilidad del avión.
const aLibro = (v, offset) => (v == null ? null : Number(v) + Number(offset || 0));
const aSistema = (v, offset) => (v == null ? null : Number(v) - Number(offset || 0));

function calcularEstado(t) {
  const horasAeronave = parseFloat(t.aeronave_horas) || 0;
  let horas_restantes = null;
  let dias_restantes = null;

  if (t.proxima_horas != null) {
    horas_restantes = Math.round((parseFloat(t.proxima_horas) - horasAeronave) * 100) / 100;
  }
  if (t.proxima_fecha != null) {
    const hoy = new Date();
    const prox = new Date(t.proxima_fecha);
    dias_restantes = Math.round((prox - hoy) / (1000 * 60 * 60 * 24));
  }

  if (t.aplica === false) return { horas_restantes, dias_restantes, estado: "NO_APLICA" };

  const dims = [];
  if (horas_restantes != null) dims.push({ rest: horas_restantes, prox: horas_restantes <= UMBRAL_HORAS });
  if (dias_restantes != null) dims.push({ rest: dias_restantes, prox: dias_restantes <= UMBRAL_DIAS });

  if (!dims.length) {
    // Recurrente sin ninguna base para calcular: el papel no dice cada cuánto.
    // Se distingue de N_A para que la pantalla lo pueda pedir explícitamente.
    const sinIntervalo = t.recurrente && t.intervalo_horas == null && t.intervalo_dias == null;
    return { horas_restantes, dias_restantes, estado: sinIntervalo ? "SIN_INTERVALO" : "N_A" };
  }
  let estado = "VIGENTE";
  if (dims.some((d) => d.rest <= 0)) estado = "VENCIDO";
  else if (dims.some((d) => d.prox)) estado = "PROXIMO";

  const urgente = dias_restantes != null && dias_restantes > 0 && dias_restantes <= UMBRAL_DIAS_URGENTE;
  return { horas_restantes, dias_restantes, estado, urgente };
}

module.exports = { UMBRAL_HORAS, UMBRAL_DIAS, UMBRAL_DIAS_URGENTE, calcularEstado, aLibro, aSistema };
```

- [ ] **Step 4: Reemplazar en el controller**

Borrar de `seguimientoController.js` las constantes y `calcularEstado` (líneas 5-38), y requerir el
helper. ⚠️ `calcularEstado` se usa también más abajo; grepear antes de borrar (lección de §16.D:
al borrar algo, grepear sus usos primero).

- [ ] **Step 5: Verificar la tabla de estados**

Script en el scratchpad que recorre los casos frontera con datos sintéticos:
`aplica=false` → `NO_APLICA` · recurrente sin intervalo → `SIN_INTERVALO` · `restan=0` → `VENCIDO` ·
`restan=10` → `PROXIMO` · `restan=10.01` → `VIGENTE` · `dias=30` → `PROXIMO` · `dias=7` → `urgente` ·
doble base donde horas dice VIGENTE y días dice VENCIDO → `VENCIDO`.

Y las escalas: `aLibro(43.60, 10000) === 10043.60`, `aSistema(10043.60, 10000) === 43.60`,
y con offset 0 la identidad.

- [ ] **Step 6: Confirmar que no rompí las 5 tareas existentes**

```bash
cd legacy/CAA-backend && node query.js "SELECT id_tarea, tipo, proxima_horas FROM taller_tarea_programada WHERE activo = true ORDER BY id_tarea"
```

Y con el backend local arriba, `GET /api/taller/tareas` debe devolver los mismos estados que antes
del cambio para esas 5 filas.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260829000001_*.sql legacy/CAA-backend/utils/vencimientos.js legacy/CAA-backend/controllers/taller/seguimientoController.js
git commit -F <archivo-msg>
```

---

## Task 2: Backend — campos nuevos, filtro por tipo y resolver conflicto

**Files:**
- Modify: `legacy/CAA-backend/controllers/taller/seguimientoController.js`
- Modify: `legacy/CAA-backend/routes/tallerRoutes.js:59-64`

- [ ] **Step 1: `listTareas` acepta `tipo` y devuelve lo nuevo**

Agregar al `SELECT` el `a.tac_offset` (para que el front convierta) y al `WHERE` un filtro
`t.tipo = ANY($n)` cuando venga `?tipo=AD,SB`. Las columnas nuevas ya entran por el `t.*`.

⚠️ **`listTareas` alimenta hoy la pestaña Tareas.** Sin filtro debe seguir devolviendo todo, o esa
pantalla pasaría a mostrar los 221 renglones nuevos. El filtro lo pone el front.

- [ ] **Step 2: `crearTarea` y `editarTarea` aceptan los campos nuevos**

`aplica`, `observaciones`, `necesita_confirmacion`, `nota_confirmacion`.

⚠️ En `editarTarea` el `SET` se arma con las claves **realmente presentes** en `req.body`, nunca fijo:
la lección de §31, donde un `SET` fijo nulificaba piloto y acción correctiva al mandar un body parcial.

- [ ] **Step 3: Endpoint para resolver un conflicto**

`POST /taller/tareas/:id/confirmar` con `roleMiddleware(JEFE)`. Recibe los valores elegidos
(`intervalo_horas`, `intervalo_dias`, `ultima_horas`, `ultima_fecha`, `proxima_horas`), los aplica,
y pone `necesita_confirmacion = false` conservando `nota_confirmacion` como rastro.

- [ ] **Step 4: Verificar E2E**

Contra el backend local: el técnico recibe **403** en `/confirmar` y **200** en
`/tareas/:id/cumplimiento`; el jefe recibe 200 en ambos; un body parcial en `editarTarea` no nulifica
el resto; `?tipo=AD` filtra y sin `tipo` devuelve todo. Limpiar las filas creadas.

⚠️ Un 403 puede venir de **dos gates distintos** — el candado de primer ingreso responde igual que el
de rol (§33). **Comprobar el mensaje, no solo el código.**

- [ ] **Step 5: Commit**

---

## Task 3: El importador

**Files:**
- Create: `supabase/dump/aeronavegabilidad/extraer.py`
- Create: `supabase/dump/aeronavegabilidad/cargar.js`
- Create: `supabase/dump/aeronavegabilidad/README.md`

- [ ] **Step 1: `extraer.py` — los cuatro Excel a JSON**

Lee `docs/formatos-aac/aeronavegabilidad/*/[Aa][Dd]*.xlsx` con openpyxl, detecta la fila de
encabezado y mapea al superset de 9 columnas (cada avión tiene columnas distintas). Suma el JSON del
OCR del 127. Emite `aeronavegabilidad.json` con `{avion, libro, filas[], problemas[]}`.

Interpretación de los valores del papel:
- `OBSERVACIONES` que empieza con `N/A` o dice `NO INSTALADO` ⇒ `aplica = false`.
- `RECURRENTE` ∈ {`SI`, `TAC. 100`, `Cada 100 HRS`, `TAC 5,000.0`, `O/C`} ⇒ `recurrente = true`;
  el intervalo sale del número si lo trae, si no queda **NULL** (son 29 renglones).
- `O/C` (on condition) ⇒ recurrente sin intervalo, y se anota en `observaciones`.
- Fechas que caen en la columna de TAC (el `31/5/1920` del 127) ⇒ TAC nulo + problema anotado.
- Notación `h:mm` (`9,844:42`) ⇒ decimal (`9844.70`), **nunca** leer los minutos como centésimas.

- [ ] **Step 2: `cargar.js` — JSON a Supabase**

Mismo patrón que `supabase/dump/inventario_oma/cargar.js`. Con `--dry-run` no escribe nada.
Borra `WHERE origen IN ('EXCEL_2026','OCR_2026')` y recarga, así se corre las veces que haga falta.

Convierte la escala: **`proxima_horas = papel − aeronave.tac_offset`** y lo mismo con `ultima_horas`.
Crea las filas de `taller_componente` que falten (el 361 no tiene ninguna).

Detecta los conflictos: si un `referencia` aparece en la lista de ADs y en la de vida límite del mismo
avión, deja **una sola fila** precargada con la de ADs, `necesita_confirmacion = true`, y las dos
versiones en `nota_confirmacion`.

Doble base: un ítem con dos renglones (`2,000 Hrs` + `12 Yrs`) entra como **una fila con los dos
intervalos**.

- [ ] **Step 3: Correr en seco y revisar el reporte**

```bash
cd supabase/dump/aeronavegabilidad && python extraer.py && node cargar.js --dry-run
```

Esperado: 221 renglones de AD (32+31+3 del 127, y los conteos por hoja de los otros cuatro),
192 con `aplica=true`, 38 recurrentes, 29 sin intervalo, y los conflictos del 334 detectados.
**Si algún conteo no coincide con el spec, es el importador el que está mal, no el spec.**

- [ ] **Step 4: Cargar de verdad y verificar contra la base**

```bash
node cargar.js
cd ../../../legacy/CAA-backend && node query.js "SELECT a.codigo, t.tipo, count(*) FROM taller_tarea_programada t JOIN aeronave a ON a.id_aeronave=t.id_aeronave WHERE t.origen IS NOT NULL GROUP BY 1,2 ORDER BY 1,2"
```

Y la prueba de escala, que es la que no puede faltar:

```bash
node query.js "SELECT t.referencia, t.proxima_horas AS guardado, t.proxima_horas + a.tac_offset AS en_libro FROM taller_tarea_programada t JOIN aeronave a ON a.id_aeronave=t.id_aeronave WHERE a.codigo='YS-334-PE' AND t.origen IS NOT NULL AND t.proxima_horas IS NOT NULL LIMIT 5"
```

`en_libro` debe reproducir los números del papel (10,043.60, 10,100.03…).

- [ ] **Step 5: Commit** (el JSON generado sí se commitea — es el rastro de qué se cargó)

---

## Task 4: Frontend — partir Aeronavegabilidad (refactor puro)

**Files:**
- Create: `CAA-frontend/src/pages/Taller/aeronavegabilidad/{Aeronavegabilidad,Componentes,Tareas,Historial}.jsx`
- Delete: `CAA-frontend/src/pages/Taller/Aeronavegabilidad.jsx`
- Modify: el import en `CAA-frontend/src/App.jsx` (o donde esté la ruta)

- [ ] **Step 1: Mover sin cambiar comportamiento**

Los tres modales (`ModalComponente`, `ModalTarea`, `ModalCumplir`) van con la sección que los usa.
`Tareas.jsx` filtra a `tipo === "INSPECCION"`.

- [ ] **Step 2: Compilar**

```bash
cd CAA-frontend && npm run build
```

- [ ] **Step 3: Verificar en el navegador que la pantalla quedó igual** (selector, componentes, tareas, cumplir, historial)

- [ ] **Step 4: Commit** — **solo el refactor**, para que cualquier regresión sea bisectable

---

## Task 5: Frontend — pestañas ADs y Vida límite

**Files:**
- Create: `.../aeronavegabilidad/{TablaSeguimiento,ListaAD,VidaLimite,FranjaAtencion}.jsx`
- Modify: `.../aeronavegabilidad/Aeronavegabilidad.jsx`

- [ ] **Step 1: `TablaSeguimiento.jsx`**

Las 9 columnas del papel. Agrupada por libro (`componente_tipo`), grupos colapsables, los que no
tienen recurrentes arrancan cerrados. Filtros `Aplican` (por defecto) · `Recurrentes` · `No aplican` ·
`Todos`. Los `aplica=false` en gris con el motivo. Las horas **se muestran en escala de libro**
(`valor + tac_offset`); la columna *Última* va atenuada.

**Doble base:** una fila con `intervalo_horas` **e** `intervalo_dias` se renderiza como **dos
renglones** consecutivos, uno por base, repitiendo el resto de las columnas. Cumplir cualquiera de los
dos cumple el ítem completo.

Fila con `necesita_confirmacion` → marcada, con las dos versiones y el botón de resolver (solo jefe).

- [ ] **Step 2: `FranjaAtencion.jsx`** — tres bandas que se ocultan si están vacías

- [ ] **Step 3: Enchufar las pestañas** y compilar

- [ ] **Step 4: Revisar en el navegador a 1280 y 375 px** con los datos reales ya cargados

⚠️ Para medir responsive hay que **recargar al tamaño nuevo**: con el panel oculto el layout queda
del tamaño anterior y se ven bugs que no existen (§35).

⚠️ Medir contraste real resolviendo `oklch()` con canvas, no leer el DOM (§35, §36). El canvas
necesita `width`/`height` explícitos o `getImageData` devuelve ratio 1.00 en todo (§37).

- [ ] **Step 5: Commit**

---

## Task 6: Mi taller — la tarjeta

**Files:**
- Modify: `CAA-frontend/src/pages/Taller/MiTaller.jsx`
- Modify: `legacy/CAA-backend/controllers/taller/seguimientoController.js` (o `dashboardController`)

- [ ] **Step 1: Endpoint de resumen** — conteo de `VENCIDO` y `PROXIMO` por avión, en una sola consulta
- [ ] **Step 2: La tarjeta**, arriba, junto a los aviones del hangar, con enlace a la pestaña
- [ ] **Step 3: Verificar con los dos perfiles** — `u_taller` (jefe) y `u_mecanico` (técnico)
- [ ] **Step 4: Commit**

---

## Task 7: Impresión

**Files:**
- Modify: `.../aeronavegabilidad/TablaSeguimiento.jsx`

- [ ] **Step 1: Imprimir la lista** con las 9 columnas, agrupada por libro, en escala de libro,
      y la doble base como dos renglones — fidelidad renglón por renglón con el papel
- [ ] **Step 2: Verificar** que el 334 imprime 33 renglones de vida límite, no 25
- [ ] **Step 3: Commit**

---

## Task 8: Desplegar

- [ ] **Step 1:** `cd CAA-frontend && npm run build` compila
- [ ] **Step 2:** confirmar que la migración ya corrió en producción (Task 1)
- [ ] **Step 3:** `git push origin <rama>` — despliega frontend y backend (CLAUDE.md §3)
- [ ] **Step 4:** verificar contra producción con token real, y limpiar lo que se haya creado
- [ ] **Step 5:** actualizar CLAUDE.md (sección nueva) y `MEMORY.md`

---

## Lo que este plan NO hace

- El formulario **1000 y 1020** — spec aparte.
- **Campana y web push** — la cañería existe; se suman cuando el número lleve un par de semanas verificado.
- **Los dos bimotores** — el modelo de tres libros no les alcanza.
- Cargar el `YS-155-PE` y el `YS-259-PE` — no hay documentación entregada.
