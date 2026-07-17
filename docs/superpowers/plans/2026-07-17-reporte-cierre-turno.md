# Reporte de cierre de Turno sin montos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Separar el reporte de cierre del día en dos: el que tiene montos queda solo para Administración/Admin; Turno saca uno nuevo sin montos (operaciones + tripulación + horas, por aeronave).

**Architecture:** Dos endpoints separados con gates duros distintos (no un endpoint con branching interno) — así es estructuralmente imposible que un bug filtre montos a Turno. El endpoint con montos se re-gatea; uno nuevo, sin montos, con su propia query (no toca `movimiento_cuenta`) y su propio PDF. Spec: `docs/superpowers/specs/2026-07-17-reporte-cierre-turno-design.md`.

**Tech Stack:** Node/Express + `pg` + `pdfkit` · React 19 + Vite · PostgreSQL Supabase. **Sin migración** (no toca esquema).

---

## ⚠️ Leé esto antes de la Task 1

**1. No hay suite de tests.** Verificación = backend local (`PORT=5099 node server.js` desde `legacy/CAA-backend`) + scripts `fetch` + `node query.js`. Escenario rojo→verde con `assert()` que LANZA (no `console.assert`, que en Node no falla el script):
```js
function assert(cond, msg) { if (!cond) throw new Error("ASSERTION FAILED: " + msg); }
// ...cuerpo async...
(async () => { /* ... */ })().catch((e) => { console.error(e); process.exit(1); });
```
Scripts al **scratchpad**, NO al repo: `C:\Users\Daniel\AppData\Local\Temp\claude\C--Users-Daniel-Desktop-CAAA-modulo-op-admin--claude-worktrees-infallible-wescoff-b428ee\62eebc6f-73c4-44f2-b49b-bf702ed55f3f\scratchpad\`

**2. Datos de PRODUCCIÓN** (Supabase real, sin staging). Toda fila que toque una prueba se restaura. Usuarios demo (`demo123`): `u9` (TURNO), `u_admin_fin` (ADMINISTRACION), `u1` (ADMIN).

**3. Este worktree** (`reporte-turno-op`, rama `claude/reporte-turno-operaciones`) está en **master** (`3f372ee`) con todo lo de Samuel, incluida su capacidad `puede_operaciones`. `.env` y `node_modules` (junctions) ya están listos.

**4. 🚨 EL SPEC QUEDÓ DESACTUALIZADO EN EL RE-GATEO — el estado real de master es distinto.** El spec §4.1 asumía que el endpoint con montos usaba `roleMiddleware(["TURNO","ADMIN","ADMINISTRACION"])`. **Ya no.** Samuel desplegó su capacidad `puede_operaciones` y **cambió ese gate** (y quitó el import de `roleMiddleware` de `turnoRoutes.js`). Estado real hoy (`turnoRoutes.js:29`):
```js
router.get("/reporte-vuelos-dia", authMiddleware, requireCapacidad(["TURNO", "ADMIN", "ADMINISTRACION"], "OPERACIONES"), turnoController.getReporteVuelosDia);
```
`requireCapacidad(roles, cap)` (`utils/capacidades.js:55`): pasa si el rol está en la lista (bypass), **o** si es un INSTRUCTOR con la capacidad. O sea hoy este endpoint lo pasan TURNO/ADMIN/ADMINISTRACION **y** cualquier instructor con `puede_operaciones`.

**Consecuencia para el diseño** (decidido acá, coherente con la intención de la feature): un instructor con `puede_operaciones` **actúa como Turno**, así que **tampoco debe ver montos**. Por eso:
- **Reporte con montos** → `roleMiddleware(["ADMIN", "ADMINISTRACION"])` — **rol puro**, NO capability. Ni TURNO ni instructor-con-operaciones lo ven. (Hay que **re-importar `roleMiddleware`**, que Samuel sacó.)
- **Reporte de operaciones** (nuevo) → `requireCapacidad(["TURNO", "ADMIN"], "OPERACIONES")` — TURNO, ADMIN, e instructor-con-operaciones. **Idéntico** al gate que Samuel ya puso en `editarTripulacion` (`turnoRoutes.js:24`). ADMINISTRACION NO está → 403 (tiene el completo).

---

## Estructura de archivos

| Archivo | Cambio | Task |
|---|---|---|
| `legacy/CAA-backend/routes/turnoRoutes.js` | Re-importar `roleMiddleware`; re-gatear el de montos; ruta nueva | 1 |
| `legacy/CAA-backend/controllers/turnoController.js` | `getReporteOperacionesDia` nuevo (sin `movimiento_cuenta`) | 1 |
| `legacy/CAA-backend/utils/pdfGenerator.js` | `generarReporteOperacionesDiaPDF` nuevo + export | 1 |
| `CAA-frontend/src/services/turnoApi.js` | `abrirReporteOperacionesDia(fecha)` | 2 |
| `CAA-frontend/src/pages/Turno/Dashboard.jsx` | El botón "Reporte del día" llama al endpoint nuevo | 2 |

**No se toca:** `getReporteVuelosDia` (controller), `generarReporteVuelosDiaPDF` (PDF), ni `Administracion/Reportes.jsx` (Administración conserva el reporte completo con montos, sin cambios).

---

### Task 1: Backend — re-gatear el de montos + endpoint y PDF nuevos sin montos

**Files:**
- Modify: `legacy/CAA-backend/routes/turnoRoutes.js` (import línea ~2-3, ruta línea 29)
- Modify: `legacy/CAA-backend/controllers/turnoController.js` (después de `getReporteVuelosDia`, línea 814)
- Modify: `legacy/CAA-backend/utils/pdfGenerator.js` (después de `generarReporteVuelosDiaPDF`, línea 474; export línea 633)

- [ ] **Step 1: Chequeo E2E (rojo)** — `tr.js` en el scratchpad. Arrancá `PORT=5099 node server.js` aparte.

```js
const API = "http://localhost:5099/api";
const login = async (u, p = "demo123") => {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
  const j = await r.json();
  if (!j.token) throw new Error(`login ${u} falló: ${JSON.stringify(j)}`);
  return j.token;
};
const H = (t) => ({ Authorization: `Bearer ${t}` });
function assert(cond, msg) { if (!cond) throw new Error("ASSERTION FAILED: " + msg); }

(async () => {
  const turno = await login("u9"), admin = await login("u1"), adminFin = await login("u_admin_fin");

  // Montos: TURNO ya NO puede (antes 200 → ahora 403); ADMINISTRACION y ADMIN sí.
  assert((await fetch(`${API}/turno/reporte-vuelos-dia`, { headers: H(turno) })).status === 403, "TURNO todavía ve el reporte con MONTOS");
  assert((await fetch(`${API}/turno/reporte-vuelos-dia`, { headers: H(adminFin) })).status === 200, "ADMINISTRACION perdió el reporte con montos");
  assert((await fetch(`${API}/turno/reporte-vuelos-dia`, { headers: H(admin) })).status === 200, "ADMIN perdió el reporte con montos");

  // Operaciones (nuevo): TURNO y ADMIN sí; ADMINISTRACION no.
  const rOps = await fetch(`${API}/turno/reporte-operaciones-dia`, { headers: H(turno) });
  assert(rOps.status === 200, `TURNO no puede sacar operaciones → ${rOps.status}`);
  assert((rOps.headers.get("content-type") || "").includes("pdf"), "operaciones no devolvió PDF");
  assert((await fetch(`${API}/turno/reporte-operaciones-dia`, { headers: H(admin) })).status === 200, "ADMIN no puede sacar operaciones");
  assert((await fetch(`${API}/turno/reporte-operaciones-dia`, { headers: H(adminFin) })).status === 403, "ADMINISTRACION sí puede operaciones (debería 403, tiene el completo)");

  console.log("OK Task 1 (reporte turno)");
})().catch((e) => { console.error(e); process.exit(1); });
```
Run → FAIL (`TURNO todavía ve el reporte con MONTOS` — hoy da 200; y `/reporte-operaciones-dia` da 404).

- [ ] **Step 2: `turnoRoutes.js` — re-importar roleMiddleware + re-gatear + ruta nueva**

Import (junto a `authMiddleware`, línea ~2):
```js
const roleMiddleware = require("../middlewares/roleMiddleware");
```
Reemplazar la ruta de la línea 29 y agregar la nueva justo debajo:
```js
// Reporte de cierre del día CON MONTOS (vuelos por avión, PDF). Insumo de
// Administración para debitar saldos. Solo ADMIN/ADMINISTRACION por ROL — ni
// TURNO ni un instructor con puede_operaciones (que actúa como Turno) ven montos.
router.get("/reporte-vuelos-dia", authMiddleware, roleMiddleware(["ADMIN", "ADMINISTRACION"]), turnoController.getReporteVuelosDia);

// Reporte de cierre del día SIN montos (operaciones/tripulación/horas). El que
// usa Turno. No consulta movimiento_cuenta: no hay saldo que filtrar. Mismo gate
// de capacidad que las demás funciones de Turno (editarTripulacion arriba).
router.get("/reporte-operaciones-dia", authMiddleware, requireCapacidad(["TURNO", "ADMIN"], "OPERACIONES"), turnoController.getReporteOperacionesDia);
```

- [ ] **Step 3: `turnoController.js` — `getReporteOperacionesDia`**

Después de `getReporteVuelosDia` (cierra en línea 814). Idéntico patrón de fecha; query SIN el `LEFT JOIN LATERAL` a `movimiento_cuenta`, CON `rv.horas_cobradas`:
```js
exports.getReporteOperacionesDia = async (req, res) => {
  try {
    const { generarReporteOperacionesDiaPDF } = require("../utils/pdfGenerator");

    let fecha = String(req.query.fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const hoy = await db.query(`SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::date AS d`);
      fecha = hoy.rows[0].d.toISOString().slice(0, 10);
    }

    const r = await db.query(`
      SELECT v.id_vuelo,
             a.codigo AS avion_codigo, a.modelo AS avion_modelo,
             TRIM(ua.nombre || ' ' || COALESCE(ua.apellido, '')) AS alumno,
             TRIM(ui.nombre || ' ' || COALESCE(ui.apellido, '')) AS instructor,
             rv.tacometro_salida  AS tac_ini,
             rv.tacometro_llegada AS tac_fin,
             rv.horas_cobradas    AS horas_cobradas
      FROM vuelo v
      JOIN aeronave a   ON a.id_aeronave = v.id_aeronave
      JOIN alumno  al   ON al.id_alumno = v.id_alumno
      JOIN usuario ua   ON ua.id_usuario = al.id_usuario
      LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
      LEFT JOIN usuario ui   ON ui.id_usuario = i.id_usuario
      LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      WHERE v.fecha_vuelo = $1::date
        AND v.estado = 'COMPLETADO'
        AND COALESCE(rv.es_inasistencia, false) = false
      ORDER BY a.codigo, rv.tacometro_salida NULLS LAST, v.id_vuelo
    `, [fecha]);

    const doc = generarReporteOperacionesDiaPDF({ fecha, vuelos: r.rows });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="operaciones-${fecha}.pdf"`);
    doc.pipe(res);
  } catch (e) {
    console.error("getReporteOperacionesDia:", e);
    res.status(500).json({ message: "Error al generar el reporte de operaciones" });
  }
};
```

- [ ] **Step 4: `pdfGenerator.js` — `generarReporteOperacionesDiaPDF`**

Después de `generarReporteVuelosDiaPDF` (cierra en línea 474). **Leé esa función entera primero** (líneas 369-474) y espejala: mismo `PDFDocument`/`ancho`/`fmtFecha`/`headerCompacto`/`drawRow`/`nuevaPagina`/agrupado por avión. Quitá columnas de Tac/Hobbs/Monto; dejá **5 columnas** (Fecha, Número, Alumno, Instructor, Horas). `headerCompacto` y `CAAA_BLUE` son module-level (líneas 231, 5) — disponibles. El `money()` NO se usa acá.

⚠️ **Simulador sin TAC** (spec §4.3): `instructorReporteController.js:264-266` fuerza `tacometro_*` a NULL para el simulador; sus horas viven en `reporte_vuelo.horas_cobradas`. Un simulador SÍ entra al `WHERE` (llega a COMPLETADO). Por eso el cálculo de horas por fila es TAC-primero-con-fallback (al revés que el cobro, a propósito: acá querés "cuánto duró", el TAC del avión real es más preciso que la estimación de facturación):
```js
function generarReporteOperacionesDiaPDF({ fecha, vuelos }) {
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40 });
  const ancho = 712;
  const fmtFecha = (() => {
    const [yy, mm, dd] = String(fecha).slice(0, 10).split("-");
    return `${Number(dd)}/${Number(mm)}/${yy}`;
  })();
  let y = headerCompacto(doc, "OPERACIONES DEL DÍA", `Desde ${fmtFecha} hasta ${fmtFecha}`, ancho);

  const horas = (n) => (n == null ? "" : Number(n).toFixed(2));
  // TAC si existe; si no (simulador, o reporte viejo sin TAC) cae a horas_cobradas.
  const horaFila = (v) => {
    if (v.tac_ini != null && v.tac_fin != null) return Number(v.tac_fin) - Number(v.tac_ini);
    if (v.horas_cobradas != null) return Number(v.horas_cobradas);
    return null;
  };
  const cols = [
    ["Fecha", 70, "left"], ["Número", 60, "right"], ["Alumno", 250, "left"],
    ["Instructor", 250, "left"], ["Horas", 72, "right"],
  ];

  const drawRow = (cells, opts = {}) => {
    let x = 40;
    doc.fontSize(opts.head ? 7.5 : 8.5).font(opts.bold || opts.head ? "Helvetica-Bold" : "Helvetica")
       .fillColor(opts.color || (opts.head ? "#666" : "#222"));
    cols.forEach((c, i) => { doc.text(String(cells[i] ?? ""), x + 3, y + 4, { width: c[1] - 6, align: c[2] }); x += c[1]; });
    y += opts.head ? 18 : 16;
  };
  const nuevaPagina = () => {
    doc.addPage({ size: "LETTER", layout: "landscape", margin: 40 });
    y = 50; doc.rect(40, y, ancho, 18).fill("#eef2f7"); drawRow(cols.map((c) => c[0]), { head: true });
  };

  doc.rect(40, y, ancho, 18).fill("#eef2f7");
  drawRow(cols.map((c) => c[0]), { head: true });

  const grupos = [];
  for (const v of vuelos) {
    const g = grupos[grupos.length - 1];
    if (!g || g.codigo !== v.avion_codigo) grupos.push({ codigo: v.avion_codigo, modelo: v.avion_modelo, filas: [v] });
    else g.filas.push(v);
  }

  let gOps = 0, gHoras = 0;
  for (const g of grupos) {
    if (y > 480) nuevaPagina();
    y += 4;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(CAAA_BLUE).text(`AVIÓN:  ${g.codigo}    ${g.modelo || ""}`, 43, y);
    y += 16;
    let sHoras = 0;
    for (const v of g.filas) {
      if (y > 500) nuevaPagina();
      const h = horaFila(v);
      if (h != null) sHoras += h;
      drawRow([fmtFecha, v.id_vuelo, v.alumno, v.instructor || "—", horas(h)]);
      doc.strokeColor("#eceff3").lineWidth(0.5).moveTo(40, y).lineTo(40 + ancho, y).stroke();
    }
    drawRow(["", "", `Total ${g.codigo}`, `${g.filas.length} operaciones`, horas(sHoras)], { bold: true, color: CAAA_BLUE });
    gOps += g.filas.length; gHoras += sHoras;
    y += 2;
  }

  if (!vuelos.length) {
    doc.fontSize(10).fillColor("#999").font("Helvetica").text("No hay vuelos completados en la fecha seleccionada.", 40, y + 10);
    y += 30;
  }

  y += 6;
  doc.strokeColor(CAAA_BLUE).lineWidth(1.2).moveTo(40, y).lineTo(40 + ancho, y).stroke();
  y += 5;
  drawRow(["", "", "GRAN TOTAL", `${gOps} operaciones`, horas(gHoras)], { bold: true, color: CAAA_BLUE });

  doc.fontSize(7.5).fillColor("#999").font("Helvetica")
     .text(`Generado el ${new Date().toLocaleString("es-SV", { timeZone: "America/El_Salvador" })} · Sistema CAAA`, 40, 555);

  doc.end();
  return doc;
}
```
Y en `module.exports` (línea 633) agregar `generarReporteOperacionesDiaPDF`.

- [ ] **Step 5: Verde** — reiniciá el backend local, `node "<scratchpad>/tr.js"` → `OK Task 1 (reporte turno)`, exit 0.

- [ ] **Step 6: Caso simulador (spec §9.7)** — verificar que el simulador no salga con horas en blanco.

Buscá con `node query.js` si hay un vuelo COMPLETADO de SIM (aeronave `tipo='SIMULADOR'`) con `reporte_vuelo` de `tacometro_* = NULL` y `horas_cobradas` no nulo, en alguna fecha. Si existe, corré el endpoint de operaciones esa fecha (guardá el PDF a archivo con `curl` autenticado o inspeccioná las filas que arma la query) y confirmá que la fila del sim trae horas de `horas_cobradas`, no en blanco. Si NO existe uno natural, sembrá temporalmente uno mínimo (un `reporte_vuelo` sobre un vuelo de SIM COMPLETADO existente, o creá el par vuelo+reporte con `tac=NULL, horas_cobradas=1.5`), verificá, y **borralo/restauralo**. Anotá qué sembraste. La aserción concreta: el `horaFila` de esa fila devuelve `1.5` (de `horas_cobradas`), no `null`.

> Si te resulta más simple: verificá el `horaFila` de forma unitaria (require el módulo, llamá la función con `{tac_ini:null, tac_fin:null, horas_cobradas:1.5}` → `1.5`, y con `{tac_ini:10, tac_fin:11.5, horas_cobradas:99}` → `1.5` de TAC, ignorando horas_cobradas). Eso prueba la lógica del fallback sin sembrar datos. Hacé al menos una de las dos.

- [ ] **Step 7: Restaurar** cualquier dato sembrado en el Step 6. Confirmá con `node query.js` que la tabla volvió a su estado.

- [ ] **Step 8: Commit**
```bash
git add legacy/CAA-backend/routes/turnoRoutes.js legacy/CAA-backend/controllers/turnoController.js legacy/CAA-backend/utils/pdfGenerator.js
git commit -m "feat(turno): reporte de operaciones sin montos + montos solo para administración"
```

---

### Task 2: Frontend — servicio + botón de Turno

**Files:**
- Modify: `CAA-frontend/src/services/turnoApi.js` (después de `abrirReporteVuelosDia`, línea 65-73)
- Modify: `CAA-frontend/src/pages/Turno/Dashboard.jsx` (import línea 17, handler línea 399-402, botón línea ~606-614)

- [ ] **Step 1: `turnoApi.js` — `abrirReporteOperacionesDia`**

Leé `abrirReporteVuelosDia` (línea 65-73) y espejala apuntando al endpoint nuevo:
```js
export const abrirReporteOperacionesDia = async (fecha) => {
  // ...idéntico a abrirReporteVuelosDia pero GET /turno/reporte-operaciones-dia...
};
```
(Mismo `responseType: "blob"`, mismo `window.open` en pestaña nueva.)

- [ ] **Step 2: `Turno/Dashboard.jsx` — el botón usa el endpoint nuevo**

- Import (línea 17): agregar `abrirReporteOperacionesDia` (o reemplazar `abrirReporteVuelosDia` si ya no se usa en otro lado del archivo — verificá con grep antes; el dashboard de Turno solo debería usar el nuevo).
- `handleReporteDia` (línea 399-402): cambiar `abrirReporteVuelosDia(reporteFecha)` → `abrirReporteOperacionesDia(reporteFecha)`.
- Botón (línea ~606-614): si el `title` menciona "tacómetro, hobbs y monto", actualizarlo (el reporte de Turno ya no tiene monto ni hobbs; queda operaciones + horas).

- [ ] **Step 3: Build**
```bash
cd CAA-frontend && npm run build
```
Esperado: build limpio.

- [ ] **Step 4: Navegador** — entrar como `u9` (TURNO) al dashboard de Turno, tocar "Reporte del día", confirmar que abre el PDF **OPERACIONES DEL DÍA** (sin columna Monto). (Infra: para que el Browser pane alcance el backend local puede hacer falta agregar entrada a `.claude/launch.json` + `ALLOWED_ORIGINS` con el puerto de Vite — revertir ambos después, no commitear. Alternativa: apuntar el front a producción **después** de que el backend esté desplegado, en la verificación final.)

- [ ] **Step 5: Commit**
```bash
git add CAA-frontend/src/services/turnoApi.js CAA-frontend/src/pages/Turno/Dashboard.jsx
git commit -m "feat(turno): el botón 'Reporte del día' abre el reporte de operaciones sin montos"
```

---

### Task 3: Verificación completa + despliegue

- [ ] **Step 1: Re-correr `tr.js`** de punta a punta (los 6 checks de roles) → verde.
- [ ] **Step 2: Confirmar BD limpia** (nada sembrado quedó): `node query.js` sobre `reporte_vuelo`/`vuelo` si el Step 6 de Task 1 sembró algo.
- [ ] **Step 3: Build final** `cd CAA-frontend && npm run build`.
- [ ] **Step 4: Sincronizar con Samuel** `git fetch origin; git merge origin/master`. Si trae backend, tenerlo en cuenta para el Step 6. **Ojo:** si el merge toca `turnoRoutes.js`/`turnoController.js`/`pdfGenerator.js`, resolvé conservando ambos cambios.
- [ ] **Step 5: Push** `git push origin master` (dispara Vercel).
- [ ] **Step 6: Deploy backend** `cd legacy/CAA-backend && railway up --detach`.
- [ ] **Step 7: Verificar prod:**
  - `curl -s -o /dev/null -w "%{http_code}" https://caaa-backend-production.up.railway.app/api/turno/reporte-operaciones-dia` → **401** (existe, pide auth). **404** = backend atrasado/pisado.
- [ ] **Step 8: Actualizar `CLAUDE.md`** (sección de sesión): el split del reporte, el re-gateo a rol puro por la interacción con `puede_operaciones`, y el fallback de horas para el simulador.
