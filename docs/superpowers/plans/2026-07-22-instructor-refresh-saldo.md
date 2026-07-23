# Pago de vuelos de práctica del instructor (Refresh) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capa de pago sobre el vuelo de práctica autosolicitado (commit `3fb2c71` de Samuel): en Refresh el instructor elige debitar de su saldo (si cubre) o pagar al momento; el cierre del vuelo debita solo cuando corresponde; el staff ve saldo del instructor y modo de pago.

**Architecture:** Spec aprobado en `docs/superpowers/specs/2026-07-22-instructor-refresh-saldo-design.md`. Todo se apoya en lo existente: ficha espejo (`asegurarFichaPracticante` reutiliza la ficha del ex-alumno con su saldo), `estimarCostoVuelos`/`getSaldoAlumno` (tarifa efectiva), `cargarVueloACuentaDentroTx` (cobro), `publicarSemana` (copia solicitud→vuelo). Nada de esto se rehace; se agregan 2 columnas, 1 endpoint, 2 params opcionales al helper de cobro, y UI.

**Tech Stack:** Node/Express + pg (backend), React (frontend), Supabase Postgres. **No hay framework de tests** — la convención del repo es verificación E2E con scripts `node` contra la Supabase real dentro de transacciones con ROLLBACK (patrón usado en todas las features de esta sesión). Reemplaza al ciclo TDD unitario en este repo.

**Regla de deploy:** `git push origin master` despliega frontend (Vercel) y backend (Railway) solos. Migraciones SIEMPRE antes del push. Antes de cada push: `git fetch origin; git merge origin/master` (Samuel trabaja en paralelo).

---

### Task 1: Migración `debitar_saldo`

**Files:**
- Create: `supabase/migrations/20260722000004_debitar_saldo_refresh.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Refresh autosolicitado por el instructor (spec 2026-07-22): elección de
-- "debitar de mi saldo" al pedir el vuelo. Solo significativa cuando
-- categoria='CHEQUEO_LINEA' y tipo_instruccion='REFRESH'; NULL en el resto
-- (incluye todo lo creado por staff → comportamiento actual: cobro manual).
-- Aditiva.
ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS debitar_saldo BOOLEAN;
ALTER TABLE vuelo           ADD COLUMN IF NOT EXISTS debitar_saldo BOOLEAN;
```

- [ ] **Step 2: Correr contra prod y verificar**

```bash
cd "C:/Users/Daniel/Desktop/CAAA modulo op+admin/legacy/CAA-backend"
node run-sql.js "../../supabase/migrations/20260722000004_debitar_saldo_refresh.sql"
node query.js "SELECT column_name FROM information_schema.columns WHERE table_name IN ('vuelo','solicitud_vuelo') AND column_name='debitar_saldo'"
```
Esperado: 2 filas.

- [ ] **Step 3: Commit** (`git add` de la migración; mensaje `feat(refresh): columnas debitar_saldo (migración)` + footer Co-Authored-By).

---

### Task 2: Backend — endpoint de saldo del practicante + `crearSolicitudPractica` acepta y revalida `debitar_saldo`

**Files:**
- Modify: `legacy/CAA-backend/controllers/instructor/instructorSolicitudController.js` (función `crearSolicitudPractica`, ~línea 301; agregar `getPracticaSaldo` al final)
- Modify: `legacy/CAA-backend/routes/instructorRoutes.js` (junto a la línea 57 `POST /solicitudes/practica`)

- [ ] **Step 1: Nuevo `getPracticaSaldo`** — agregar al controller (requiere `const { getSaldoAlumno, estimarCostoVuelos } = require("../../utils/saldoHelper");` arriba):

```js
/**
 * GET /instructor/solicitudes/practica/saldo?id_aeronave=N
 * Saldo de MI ficha espejo + costo estimado de 1h en esa aeronave (tarifa
 * efectiva: precio especial de la ficha → estándar). Convención ×1h a
 * propósito (la misma del badge saldo_bajo del calendario staff).
 * Sin ficha, o ficha sin fila de cuenta_corriente_alumno → saldo 0, no cubre.
 */
exports.getPracticaSaldo = async (req, res) => {
  try {
    const idInstructor = await resolverIdInstructor(req.user.id_usuario);
    if (!idInstructor) return res.status(403).json({ message: "No sos instructor" });
    const idAeronave = Number(req.query.id_aeronave);
    if (!idAeronave) return res.status(400).json({ message: "id_aeronave requerido" });

    const ficha = await db.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1 LIMIT 1`, [req.user.id_usuario]);
    const idAlumno = ficha.rows[0]?.id_alumno || null;
    let saldo = 0;
    if (idAlumno) saldo = (await getSaldoAlumno(idAlumno)) ?? 0;
    const costo_estimado = await estimarCostoVuelos(
      [{ id_aeronave: idAeronave }], new Date(), db, idAlumno
    );
    res.json({ saldo, costo_estimado, cubre: saldo >= costo_estimado && costo_estimado > 0 });
  } catch (e) {
    console.error("instructorSolicitud.getPracticaSaldo:", e);
    res.status(500).json({ message: "Error al consultar el saldo" });
  }
};
```

- [ ] **Step 2: `crearSolicitudPractica` acepta `debitar_saldo` con revalidación server-side.**
  Al destructuring del body sumar `debitar_saldo`. Después del `insertarSolicitudVuelo(...)` (que devuelve `out.id_detalle`) y ANTES del COMMIT:

```js
    // debitar_saldo: solo tiene sentido en REFRESH. El servidor REVALIDA el
    // umbral (no confía en el cliente): si pidió debitar pero su saldo no
    // cubre el costo estimado, queda en false ("pago al momento") y se avisa.
    let debitarFinal = null;
    let debitarAjustado = false;
    if (String(tipo_instruccion).toUpperCase() === "REFRESH") {
      debitarFinal = debitar_saldo === true;
      if (debitarFinal) {
        const ficha = await client.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1 LIMIT 1`, [req.user.id_usuario]);
        const idAlumnoFicha = ficha.rows[0]?.id_alumno || null;
        const saldoFicha = idAlumnoFicha ? ((await getSaldoAlumno(idAlumnoFicha, client)) ?? 0) : 0;
        const costoEst = await estimarCostoVuelos([{ id_aeronave: Number(id_aeronave) }], new Date(), client, idAlumnoFicha);
        if (!(saldoFicha >= costoEst && costoEst > 0)) {
          debitarFinal = false;
          debitarAjustado = true;
        }
      }
      await client.query(`UPDATE solicitud_vuelo SET debitar_saldo = $1 WHERE id_detalle = $2`, [debitarFinal, out.id_detalle]);
    }
```

  Y la respuesta final pasa a:

```js
    res.json({
      message: "Vuelo de práctica solicitado",
      ...out,
      debitar_saldo: debitarFinal,
      ...(debitarAjustado ? { debitar_saldo_ajustado: true, aviso: "Tu saldo no cubre el costo estimado: el vuelo quedó como pago al momento (o coordinalo con Administración)." } : {}),
    });
```

- [ ] **Step 3: Ruta** — en `instructorRoutes.js`, junto a la línea 57:

```js
router.get("/solicitudes/practica/saldo",                     accessVuelo, instructorSolicitud.getPracticaSaldo);
```
⚠️ Va ANTES de cualquier ruta `/solicitudes/:param` GET si existiera colisión — acá no la hay (las GET existentes son `/calendario` y `/resumen`), pero verificar orden.

- [ ] **Step 4: Sanity + verificación** — `node -e "require('./controllers/instructor/instructorSolicitudController'); require('./routes/instructorRoutes'); console.log('OK')"` desde `legacy/CAA-backend`. Luego script E2E con rollback (patrón de la sesión): en una transacción, crear solicitud práctica REFRESH con `debitar_saldo=true` para un instructor CON saldo (esperar `debitar_saldo=true` en la fila) y para uno SIN saldo (esperar `false` + ajustado). ROLLBACK al final.

- [ ] **Step 5: Commit.**

---

### Task 3: Backend — `publicarSemana` copia `debitar_saldo`

**Files:**
- Modify: `legacy/CAA-backend/controllers/admin/adminVueloController.js` (INSERT...SELECT de publicar, ~línea 113)

- [ ] **Step 1:** En la lista de columnas del INSERT agregar `debitar_saldo` (después de `id_licencia_chequeo`) y en el SELECT agregar `sv.debitar_saldo` en la misma posición:

```sql
INSERT INTO vuelo (id_detalle, ..., id_licencia_chequeo, debitar_saldo, estado, creado_por, fecha_vuelo)
SELECT sv.id_detalle, ..., sv.id_licencia_chequeo, sv.debitar_saldo, 'PUBLICADO', 'ADMIN', ...
```

- [ ] **Step 2: Commit.**

---

### Task 4: Backend — cobro al cerrar (`cargarVueloACuentaDentroTx` + gate en `firmarReporteVuelo`)

**Files:**
- Modify: `legacy/CAA-backend/controllers/administracion/facturasController.js` (`cargarVueloACuentaDentroTx`, líneas 123-235)
- Modify: `legacy/CAA-backend/controllers/instructor/instructorReporteController.js` (líneas 371-399)

- [ ] **Step 1: Dos params opcionales en `cargarVueloACuentaDentroTx`.** Firma:

```js
exports.cargarVueloACuentaDentroTx = async function cargarVueloACuentaDentroTx(client, {
  id_vuelo, id_alumno, id_aeronave, tacometro, modelo_aeronave, fecha, emitida_por,
  es_extracurricular = false, horas_acumuladas_antes,
  modo_refresh = false, solo_si_saldo_cubre = false
}) {
```

  Tras calcular `total` y hacer el `FOR UPDATE` de la cuenta (línea ~166-170), ANTES del UPDATE de saldo:

```js
  // Refresh "debitar de mi saldo": NUNCA deja la cuenta en negativo. Si entre
  // pedir y volar el saldo dejó de cubrir, NO se debita (queda como pago al
  // momento y admin cobra a mano). El chequeo va acá adentro, con la cuenta
  // lockeada, para ser atómico frente a movimientos concurrentes. Para vuelos
  // de alumno normales NO aplica (ellos sí pueden quedar en negativo).
  if (solo_si_saldo_cubre && Number(cuenta.rows[0].saldo_actual_usd) < total) {
    return { skipped: true, motivo: "saldo_insuficiente", id_alumno, saldo: Number(cuenta.rows[0].saldo_actual_usd), total };
  }
```

  Horas/curso/etiqueta — el Refresh se comporta como extracurricular (cobra, sin horas ni avance) pero con su propia etiqueta. Reemplazar el bloque de `horasTotalesMov`/`notaMov`/`descMov` (líneas ~200-208) por:

```js
  const sinHorasNiCurso = es_extracurricular || modo_refresh;
  const horasTotalesMov = sinHorasNiCurso ? horasBase : horasBase + Number(tacometro);
  const notaMov = modo_refresh ? 'Refresh' : (es_extracurricular ? 'Extracurricular' : null);
  const descMov = modo_refresh
    ? `Vuelo refresh #${id_vuelo} ${modelo_aeronave} ${tacometro}h × $${tarifa}`
    : es_extracurricular
      ? `Vuelo extracurricular #${id_vuelo} ${modelo_aeronave} ${tacometro}h × $${tarifa}`
      : `Vuelo #${id_vuelo} ${modelo_aeronave} ${tacometro}h × $${tarifa}`;
```

  Y el gate del avance de curso (línea ~223) pasa de `if (!es_extracurricular)` a `if (!sinHorasNiCurso)`.

- [ ] **Step 2: Gate en `firmarReporteVuelo`.** En la query `vueloInfo` (línea ~371) sumar `v.tipo_instruccion, v.debitar_saldo` al SELECT. Reemplazar las líneas 384-385 por:

```js
          const categoriaVuelo = vueloInfo.rows[0]?.categoria || "NORMAL";
          const infoV = vueloInfo.rows[0] || {};
          // Excepción nueva (spec 2026-07-22): un CHEQUEO_LINEA sub-tipo REFRESH
          // donde el practicante eligió "debitar de mi saldo" SÍ se auto-cobra
          // (si el saldo aún cubre — cargarVuelo lo revalida con la cuenta
          // lockeada). El resto de CHEQUEO_LINEA + DEMO + PRUEBA siguen sin
          // cobro automático.
          const esRefreshDebitable = categoriaVuelo === "CHEQUEO_LINEA"
            && infoV.tipo_instruccion === "REFRESH"
            && infoV.debitar_saldo === true;
          const sinCobroAutomatico = (categoriaVuelo === "DEMO" || categoriaVuelo === "PRUEBA" || categoriaVuelo === "CHEQUEO_LINEA") && !esRefreshDebitable;
```

  Y en la llamada a `cargarVueloACuentaDentroTx` (líneas ~388-398) sumar los params + manejar el skip:

```js
            cargoAutomatico = await cargarVueloACuentaDentroTx(client, {
              id_vuelo: info.id_vuelo,
              id_alumno: info.id_alumno,
              id_aeronave: info.id_aeronave,
              tacometro: tacDiff,
              modelo_aeronave: info.modelo_aeronave,
              fecha: info.fecha,
              emitida_por: req.user.id_usuario,
              es_extracurricular: info.es_extracurricular,
              horas_acumuladas_antes: horasAcumuladasAntes,
              modo_refresh: esRefreshDebitable,
              solo_si_saldo_cubre: esRefreshDebitable
            });
            if (cargoAutomatico?.skipped) {
              console.log(`[refresh] vuelo ${info.id_vuelo}: saldo dejó de cubrir ($${cargoAutomatico.saldo} < $${cargoAutomatico.total}) — queda como pago al momento`);
              cargoAutomatico = null;
            }
```

  ⚠️ NO tocar `sumaHorasLicencia` (línea 321): CHEQUEO_LINEA ya no suma horas de licencia y debe seguir así.

- [ ] **Step 3: Verificación E2E con rollback** (script desde `legacy/CAA-backend`, patrón de la sesión): en una transacción contra la Supabase real, montar un vuelo CHEQUEO_LINEA REFRESH con `debitar_saldo=true` y ficha con saldo suficiente → llamar `cargarVueloACuentaDentroTx` con los flags → assert: debitó, nota 'Refresh', SIN cambio en `horas_totales` del movimiento (horasBase), sin avance de curso. Repetir con saldo insuficiente → assert `skipped:true` y cuenta intacta. Repetir `modo_refresh=false` (alumno normal) → assert que puede quedar negativo (regla vieja intacta). ROLLBACK.

- [ ] **Step 4: Commit.**

---

### Task 5: Backend — `saldo_bajo` incluye Refresh-debitable + calendarios exponen los campos

**Files:**
- Modify: `legacy/CAA-backend/controllers/admin/adminVueloController.js` (`getCalendario`, condición `saldo_bajo`)
- Modify: `legacy/CAA-backend/controllers/programacionController.js` (`getCalendario`, ambas queries: semana en curso y próxima)

- [ ] **Step 1:** En las 3 queries, la condición actual dentro de `saldo_bajo` es
  `COALESCE(<cat>, 'NORMAL') NOT IN ('DEMO','CHEQUEO_LINEA','PRUEBA')` (admin usa `COALESCE(v.categoria, sv.categoria, 'NORMAL')`; programación current usa `v.categoria`; programación next usa `sv.categoria`). Reemplazarla en cada una por (ajustando alias por query):

```sql
(
  COALESCE(<cat>, 'NORMAL') NOT IN ('DEMO','CHEQUEO_LINEA','PRUEBA')
  OR (
    COALESCE(<cat>, 'NORMAL') = 'CHEQUEO_LINEA'
    AND COALESCE(<tipo_instr>) = 'REFRESH'
    AND COALESCE(<debitar>) = TRUE
  )
)
```
  donde `<tipo_instr>`/`<debitar>` son `COALESCE(v.tipo_instruccion, sv.tipo_instruccion)` y `COALESCE(v.debitar_saldo, sv.debitar_saldo)` en admin; `v.*` en programación-current; `sv.*` en programación-next.

- [ ] **Step 2:** En el SELECT de las 3 queries agregar (con alias correspondientes): `categoria`, `tipo_instruccion`, `debitar_saldo` — para el tooltip del frontend (Task 8). En admin: `COALESCE(v.categoria, sv.categoria) AS categoria, COALESCE(v.tipo_instruccion, sv.tipo_instruccion) AS tipo_instruccion, COALESCE(v.debitar_saldo, sv.debitar_saldo) AS debitar_saldo`.

- [ ] **Step 3:** Sanity de sintaxis + correr la query modificada directo con `node query.js` (semana próxima real) verificando que no truena y que los campos salen. Commit.

---

### Task 6: Frontend — tarjeta de práctica con saldo/checkbox/aviso

**Files:**
- Modify: `CAA-frontend/src/services/instructorApi.js` (junto a `crearSolicitudPracticaInstructor`, línea ~142)
- Modify: `CAA-frontend/src/pages/Instructor/Solicitudes.jsx` (tarjeta de práctica, estados línea ~46, `solicitarPractica` ~83, selector de tipo ~261-270)

- [ ] **Step 1: API** —

```js
export const getPracticaSaldo = async (idAeronave) => {
  const res = await axios.get(`${API_URL}/instructor/solicitudes/practica/saldo`, { params: { id_aeronave: idAeronave } });
  return res.data;
};
```

- [ ] **Step 2: Estado + fetch.** En `Solicitudes.jsx`: al estado `practica` sumar `debitar_saldo: true`; nuevo estado `saldoPractica` (`null` inicial). `useEffect` que al cambiar `practica.id_aeronave` (y si `practica.tipo_instruccion === "REFRESH"`) llama `getPracticaSaldo(practica.id_aeronave)` → `setSaldoPractica`; si no hay aeronave o el tipo es CHEQUEO → `setSaldoPractica(null)`.

- [ ] **Step 3: UI.** Debajo del selector de tipo (línea ~270), solo cuando `tipo_instruccion === "REFRESH"` y hay `saldoPractica`:
  - Si `saldoPractica.cubre`: texto `Saldo: $X · este vuelo cuesta aprox. $Y` + checkbox **"Debitar de mi saldo al completarse el vuelo"** ligado a `practica.debitar_saldo` (default `true`).
  - Si no: aviso ámbar (mismo estilo del banner de saldo del alumno): `Tu saldo ($X) no cubre este vuelo (~$Y): se paga al momento del vuelo o coordinalo con Administración.` — sin checkbox.
  - Actualizar la etiqueta del option REFRESH (línea 267): `Refresh — lo pago yo` (la vieja decía "se me cobra manual", ya no siempre).

- [ ] **Step 4: Envío + toast de ajuste.** En `solicitarPractica`, sumar `debitar_saldo: practica.tipo_instruccion === "REFRESH" ? practica.debitar_saldo === true : undefined` al payload. Tras la respuesta: `if (r?.debitar_saldo_ajustado) toast.warning(r.aviso)` (la API devuelve el body — verificar qué retorna `crearSolicitudPracticaInstructor` y capturarlo).

- [ ] **Step 5: Build** (`npm run build` con VITE_API_URL de prod) + commit.

---

### Task 7: Frontend — Usuarios → Personal: columna Saldo + botón Cuenta corriente

**Files:**
- Modify: `legacy/CAA-backend/controllers/administracion/usuariosController.js` (`listPersonal`, líneas 107-125)
- Modify: `CAA-frontend/src/pages/Administracion/Usuarios.jsx` (tabla Personal + modal de edición del instructor)

- [ ] **Step 1: Backend.** Al SELECT de `listPersonal` sumar:

```sql
             af.id_alumno AS id_alumno_ficha,
             cc.saldo_actual_usd AS saldo_instructor,
```
  y los JOINs (después del LEFT JOIN instructor):

```sql
      LEFT JOIN alumno af ON af.id_usuario = u.id_usuario
      LEFT JOIN cuenta_corriente_alumno cc ON cc.id_alumno = af.id_alumno
```
  (COALESCE no hace falta en SQL: el frontend muestra "—" si `saldo_instructor` es null y no hay ficha.)

- [ ] **Step 2: Frontend.** En la tabla Personal de `Usuarios.jsx`: columna **Saldo** que para filas `rol === 'INSTRUCTOR'` muestra `$X.XX` (con `SaldoBadge` si está importable, o texto mono con color según signo) usando `p.saldo_instructor ?? (p.id_alumno_ficha ? 0 : null)`; `null` → "—". En el modal de edición del instructor (gateado por `editP.id_instructor`), botón **"Cuenta corriente"** visible solo si `editP.id_alumno_ficha`, que navega a `/administracion/cuentas/${editP.id_alumno_ficha}`.

- [ ] **Step 3: Build + commit.**

---

### Task 8: Frontend — modo de pago en calendario staff y en vouchera

**Files:**
- Modify: `CAA-frontend/src/components/AdminCalendar/AdminCalendar.jsx` (los 2 renders de tarjeta: locales ~línea 635 y rutas ~717 — junto al badge `$` de saldo bajo)
- Modify: `legacy/CAA-backend/controllers/instructor/instructorReporteController.js` (`getReporteVueloInstructor` — el SELECT inicial del reporte, ~líneas 40-60)
- Modify: `CAA-frontend/src/components/ReporteVueloModal/reporteVueloPdf.js` (línea de pago)

- [ ] **Step 1: AdminCalendar.** En ambos renders, cuando `item.categoria === 'CHEQUEO_LINEA' && item.tipo_instruccion === 'REFRESH'`, badge chico `R$` con tooltip: `debitar_saldo ? "Refresh — debita del saldo del practicante al completarse" : "Refresh — paga al momento / coordinar con Administración"`. Mismo patrón visual del badge `$` existente (estilos inline, ámbar para "paga al momento", info/azul para "debita").

- [ ] **Step 2: Vouchera.** En el SELECT de `getReporteVueloInstructor` sumar `v.categoria, v.tipo_instruccion, v.debitar_saldo` y `EXISTS(SELECT 1 FROM movimiento_cuenta mc WHERE mc.id_vuelo = v.id_vuelo AND mc.tipo='CARGO_VUELO') AS se_debito`. ⚠️ Ese endpoint NO devuelve filas crudas: mapea a objetos `{ vuelo, reporte }` (líneas ~65-98 del controller) — hay que sumar los 4 campos también al literal del objeto `vuelo`, o no llegan al frontend. En `reporteVueloPdf.js`, para `categoria === 'CHEQUEO_LINEA' && tipo_instruccion === 'REFRESH'` agregar una línea NUEVA en la zona de la tabla de info del vuelo (el PDF hoy no imprime tipo_instruccion/categoria en ningún lado — no hay etiqueta existente a la cual anexar): `Pago: ${se_debito ? 'debitado de saldo' : 'al momento / coordinar con Administración'}`.

- [ ] **Step 3: Build + commit.**

---

### Task 9: Verificación E2E completa + deploy

- [ ] **Step 1: E2E local con rollback contra Supabase real** (un solo script, patrón `_verify_*.js` desde `legacy/CAA-backend`, copiado del scratchpad y borrado al final): cubre los asserts de Tasks 2 y 4 de punta a punta + `publicarSemana`-style copy (INSERT de solicitud con `debitar_saldo=true` → simular el INSERT...SELECT → assert que `vuelo.debitar_saldo` llegó).

- [ ] **Step 2: Deploy.** `git fetch origin; git merge origin/master` (resolver si Samuel pusheó) → `git push origin master` → esperar Railway/Vercel.

- [ ] **Step 3: E2E prod (solo lectura + 0 escrituras persistentes):**
  - Login `u6` (instructor demo) → `GET /instructor/solicitudes/practica/saldo?id_aeronave=2` → 200 con `{saldo, costo_estimado, cubre}` (u6 sin ficha → saldo 0, cubre false).
  - Login `u1` → `GET /admin/calendario?week=next` → items traen `categoria/tipo_instruccion/debitar_saldo`.
  - Verificar en el navegador (viewport normal) que la tarjeta de práctica muestra el aviso de saldo para REFRESH.

- [ ] **Step 4: Actualizar memoria de sesión** (archivo `sesion-2026-07-22-*` en el dir de memoria) con el resultado, y reportar a Daniel.
