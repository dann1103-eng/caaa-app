# Separar el reporte de cierre de Turno: montos solo para administración

**Fecha:** 2026-07-17 · **Estado:** aprobado, pendiente de implementar
**Base:** rama `claude/aircraft-management-loadsheet-401766`. `origin/master` está en `30a68e8`
(el fix de Salida del Hangar + rediseño de /dueno de Samuel, ya mergeado en el repo principal y
desplegado aparte); esta rama diverge de un punto anterior de `master` y no contiene esos 3
commits — no afecta a este spec (archivos distintos), pero el Task 12 del plan de instructores
ya trae el `git fetch/merge` antes de pushear, así que se sincroniza en ese paso.

---

## 1. Problema

Hoy existe **un solo** reporte de cierre del día ("Vuelos por avión", PDF), accesible por `TURNO`, `ADMIN` y `ADMINISTRACION` por igual (`legacy/CAA-backend/routes/turnoRoutes.js:29`). Incluye montos debitados por vuelo — información de cuenta corriente que Turno no debería ver. Daniel pidió separarlo:

- El reporte con montos queda **solo para `ADMINISTRACION` y `ADMIN`**.
- Turno saca un reporte **distinto**, sin montos, con: total de operaciones, tripulación (alumno + instructor) y horas completadas por vuelo, dividido por aeronave.

## 2. Estado actual (verificado línea por línea)

- **Ruta:** `turnoRoutes.js:27-29` — `GET /turno/reporte-vuelos-dia`, `roleMiddleware(["TURNO", "ADMIN", "ADMINISTRACION"])`.
- **Controller:** `turnoController.js:763-814`, `exports.getReporteVuelosDia`. La query (:774-804) trae por vuelo: avión (código/modelo), alumno, instructor, tac inicial/final, hobbs inicial/final, y el monto vía `LEFT JOIN LATERAL` a `movimiento_cuenta` (:791-799, tipo `CARGO_VUELO` no anulado). Filtra `estado='COMPLETADO'` y no-inasistencia.
- **PDF:** `pdfGenerator.js:369-474`, `generarReporteVuelosDiaPDF`. Agrupa por avión (:416-424), 11 columnas (Fecha, Número, Alumno, Tac ini/fin/hora, Hobbs ini/fin/hora, **Monto**, Instructor), subtotal por avión (:452) y gran total (:466). Exportada en `module.exports` (:633).
- **Frontend, dos consumidores del mismo PDF:**
  - `pages/Turno/Dashboard.jsx`: botón "Reporte del día" (:606-614), estado `generandoReporte` (:371), handler `handleReporteDia` (~:400-402) que llama `abrirReporteVuelosDia(reporteFecha)`.
  - `pages/Administracion/Reportes.jsx`: tarjeta "Vuelos por avión (cierre del día)" (:89-113), estado `generandoVuelos`/`vuelosFecha` (:31-32), handler `handleReporteVuelos` (:52-61) llamando a la **misma** `abrirReporteVuelosDia` (:55). Subtítulo ya dice explícitamente "monto debitado" (:97) — coherente con que esta pantalla se queda con el reporte completo.
- **Servicio:** `services/turnoApi.js:63-73`, `abrirReporteVuelosDia(fecha)` — `GET /turno/reporte-vuelos-dia` con `responseType: "blob"`, abre el PDF en pestaña nueva.

## 3. Decisión de arquitectura: dos endpoints, no uno con branching

Evaluadas dos opciones:

- **A. Un endpoint, contenido según rol.** El controller mira `req.user.rol` y arma un PDF u otro por dentro.
- **B. Dos endpoints separados, cada uno con su gate duro** (elegida). El endpoint actual se re-gatea a `["ADMIN", "ADMINISTRACION"]`; uno nuevo, `GET /turno/reporte-operaciones-dia`, gateado a `["TURNO", "ADMIN"]`, con su propia query (que **ni siquiera toca `movimiento_cuenta`**) y su propio generador de PDF.

**B** porque el punto entero de este cambio es que Turno deje de ver montos — un endpoint único con un `if` interno es un lugar donde un bug de lógica filtra montos a Turno por accidente; con dos endpoints y dos queries separadas, esa fuga es estructuralmente imposible, no solo improbable. Coincide además con el patrón ya usado en el resto del código de esta sesión (`accessVuelo`/`accessTeoria` en `instructorRoutes.js`: rutas dedicadas por capacidad, no branching interno).

## 4. Cambios — backend

### 4.1 Re-gatear el endpoint existente (sin tocar su lógica)

`turnoRoutes.js:27-29`:
```js
// Reporte de cierre del día CON MONTOS (vuelos por avión, PDF). Es el insumo
// de Administración para debitar saldos. TURNO tiene su propio reporte sin
// montos: GET /reporte-operaciones-dia.
router.get("/reporte-vuelos-dia", authMiddleware, roleMiddleware(["ADMIN", "ADMINISTRACION"]), turnoController.getReporteVuelosDia);
```
`getReporteVuelosDia` (controller) y `generarReporteVuelosDiaPDF` (PDF) **no se tocan** — mismo query, mismas columnas, mismo PDF de siempre.

### 4.2 Endpoint nuevo — sin montos

`turnoRoutes.js`, junto al anterior:
```js
// Reporte de cierre del día SIN montos (operaciones/tripulación/horas). El que
// usa Turno. No consulta movimiento_cuenta: no hay dato de saldo que filtrar.
router.get("/reporte-operaciones-dia", authMiddleware, roleMiddleware(["TURNO", "ADMIN"]), turnoController.getReporteOperacionesDia);
```

`turnoController.js`, junto a `getReporteVuelosDia` — mismo `WHERE` (fecha, `estado='COMPLETADO'`, no-inasistencia), mismo orden por avión, **sin** el `LEFT JOIN LATERAL` a `movimiento_cuenta`, **pero agregando `rv.horas_cobradas`** (ver la nota del simulador en el punto siguiente):
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

### 4.3 PDF nuevo — `generarReporteOperacionesDiaPDF`

`pdfGenerator.js`, junto a `generarReporteVuelosDiaPDF` (mismo patrón que ya usa `generarPyLPDF` al lado de ella). Reutiliza `headerCompacto`, el patrón de agrupado-por-avión y `horas()` tal cual existen hoy (no reutiliza `lectura()`: las lecturas crudas de TAC no se muestran, ver §5). **5 columnas** (sin Monto, sin Hobbs — ver §5): Fecha, Número, Alumno, Instructor, Horas. Subtotal por avión = **cantidad de operaciones** del avión + suma de horas; gran total = operaciones totales + horas totales.

⚠️ **El simulador no tiene TAC.** `instructorReporteController.js:264-266` fuerza `tacometro_salida`/`tacometro_llegada` a `NULL` para toda sesión de simulador (`esSimulador`); sus horas viven **solo** en `reporte_vuelo.horas_cobradas` (columna construida el 2026-07-16, sesión anterior — CLAUDE.md §22.A). Un simulador SÍ llega a `estado='COMPLETADO'` (`NEXT_ESTADO_SIM` en `turnoController.js`) y **SÍ entra** al `WHERE` de este reporte, así que sin este fallback la fila del simulador (y el subtotal de su grupo "AVIÓN: SIM-1") saldrían con Horas en blanco/cero — el mismo patrón de fallback silencioso que este proyecto ya viene arrastrando (CLAUDE.md, "lecciones transversales"). Por eso el cálculo de horas por fila es:

```js
const horaFila = (v) => {
  if (v.tac_ini != null && v.tac_fin != null) return Number(v.tac_fin) - Number(v.tac_ini);
  if (v.horas_cobradas != null) return Number(v.horas_cobradas);
  return null;
};
```

**TAC primero, `horas_cobradas` como fallback** — orden a propósito, y al revés del que usa `instructorReporteController.js:353-355` para *cobro* (que prioriza `horas_cobradas`, cae a TAC solo en reportes viejos sin el campo). Acá el objetivo es "cuánto duró la operación", y para un avión real el TAC es la lectura física del instrumento; `horas_cobradas` es una estimación de facturación que el instructor digita (puede no coincidir exactamente). El fallback solo debe activarse cuando TAC genuinamente no existe — que hoy es exactamente el caso del simulador (más cualquier reporte viejo/incompleto).

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
  const cols = [
    ["Fecha", 70, "left"], ["Número", 60, "right"], ["Alumno", 220, "left"],
    ["Instructor", 220, "left"], ["Horas", 60, "right"],
  ];
  // drawRow / nuevaPagina: igual patrón que generarReporteVuelosDiaPDF (mismo doc, mismo `cols`,
  // misma paginación en y > 480/500).

  const grupos = [];
  for (const v of vuelos) {
    const g = grupos[grupos.length - 1];
    if (!g || g.codigo !== v.avion_codigo) grupos.push({ codigo: v.avion_codigo, modelo: v.avion_modelo, filas: [v] });
    else g.filas.push(v);
  }

  let gOps = 0, gHoras = 0;
  for (const g of grupos) {
    // ...encabezado "AVIÓN: {codigo} {modelo}" igual que hoy...
    let sHoras = 0;
    for (const v of g.filas) {
      const h = horaFila(v);   // TAC si existe, si no horas_cobradas (simulador) — ver arriba
      if (h != null) sHoras += h;
      drawRow([fmtFecha, v.id_vuelo, v.alumno, v.instructor || "—", horas(h)]);
    }
    drawRow(["", "", `Total ${g.codigo}`, `${g.filas.length} operaciones`, horas(sHoras)], { bold: true, color: CAAA_BLUE });
    gOps += g.filas.length; gHoras += sHoras;
  }

  drawRow(["", "", "GRAN TOTAL", `${gOps} operaciones`, horas(gHoras)], { bold: true, color: CAAA_BLUE });
  // ...pie igual, doc.end(), return doc...
}
```

Agregar a `module.exports` (:633): `generarReporteOperacionesDiaPDF`.

## 5. Formato — decisiones (Daniel las corrige si no)

- **Horas: una sola columna, basada en TAC** (no Hobbs). El reporte actual muestra ambas porque son dos instrumentos que pueden diferir; para un reporte operativo de cierre rápido, una sola lectura (la misma fuente que ya usa el resto del sistema para acumular horas de aeronave) alcanza y es más legible.
- **Tripulación: dos columnas (Alumno / Instructor)**, igual que hoy — más legible en tabla que fusionarlas en un solo texto libre.
- Las lecturas crudas de TAC (inicial/final) **no** se muestran — solo la hora ya calculada. Es un reporte de "qué operó y cuánto duró", no de trazabilidad de instrumento (eso lo sigue teniendo el reporte con montos, para Administración).

## 6. Cambios — frontend

| Archivo | Cambio |
|---|---|
| `services/turnoApi.js` | Nueva función `abrirReporteOperacionesDia(fecha)`, mismo patrón blob que `abrirReporteVuelosDia` (:63-73), pegando a `/turno/reporte-operaciones-dia`. |
| `pages/Turno/Dashboard.jsx` | El botón "Reporte del día" (:606-614) y su handler pasan a llamar `abrirReporteOperacionesDia` en vez de `abrirReporteVuelosDia`. Actualizar el `title` del botón (:610, hoy dice "...con tacómetro, hobbs y monto") para que ya no mencione monto/hobbs. |
| `pages/Administracion/Reportes.jsx` | **No se toca.** Sigue llamando `abrirReporteVuelosDia` (:55) — Administración conserva el reporte completo con montos, sin cambios. |

## 7. No-objetivos

- No se cambia nada del reporte con montos (query, PDF, ni su acceso desde Administración → Reportes).
- No se agregan filtros nuevos (aeronave, instructor) a ninguno de los dos reportes — mismo alcance que hoy (por fecha).
- No se toca `movimiento_cuenta` ni la lógica de débito de saldos.
- El botón de Turno **no** ofrece elegir entre los dos reportes — Turno solo tiene el suyo. Si ADMIN necesita el reporte con montos estando en el dashboard de Turno, lo saca desde Administración → Reportes (donde ya tiene acceso completo).

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Un cliente viejo (caché de navegador) sigue pidiendo `/reporte-vuelos-dia` como Turno | El gate del backend ya lo bloquea (403) aunque el frontend viejo intente — es la defensa real, no la UI |
| Confundir cuál PDF va a cuál botón | Nombres de archivo distintos (`vuelos-por-avion-*.pdf` vs `operaciones-*.pdf`) y títulos de PDF distintos ("VUELOS POR AVIÓN" vs "OPERACIONES DEL DÍA") |

## 9. Verificación

E2E con backend local (`PORT=5099`) contra Supabase real:

1. `GET /turno/reporte-vuelos-dia` como `u9` (TURNO) → **403** (antes 200).
2. `GET /turno/reporte-vuelos-dia` como `u_admin_fin` (ADMINISTRACION) → 200, PDF con columna Monto.
3. `GET /turno/reporte-vuelos-dia` como `u1` (ADMIN) → 200 (sigue funcionando).
4. `GET /turno/reporte-operaciones-dia` como `u9` (TURNO) → 200, PDF **sin** columna Monto, con conteo de operaciones por avión y total general.
5. `GET /turno/reporte-operaciones-dia` como `u_admin_fin` (ADMINISTRACION) → **403** (no lo necesita, tiene el completo).
6. `GET /turno/reporte-operaciones-dia` como `u1` (ADMIN) → 200.
7. **Caso simulador** (el que motiva el fallback de §4.3): confirmar con `node query.js` que exista o sembrar un `reporte_vuelo` de un vuelo `COMPLETADO` en SIM-1 con `tacometro_salida/llegada = NULL` y `horas_cobradas` no nulo (es el estado real que deja `firmarReporteVuelo` para simulador) → correr el reporte del punto 4 esa fecha y confirmar que la fila del simulador **no** sale en blanco/cero, sino con `horas_cobradas`. Restaurar cualquier dato sembrado.
8. Confirmar visualmente (build + navegador) que el botón de Turno abre el PDF nuevo, y que la tarjeta de Administración → Reportes sigue abriendo el de siempre.

`cd CAA-frontend; npm run build` antes de commitear.

## 10. Despliegue

Sin migración (no toca esquema). Orden: `git fetch origin; git merge origin/master; git push origin master` → `railway up --detach` desde `legacy/CAA-backend`.
