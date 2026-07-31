# Rutas con parada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una ruta con parada genera N vuelos (tramos) independientes — cada uno con su alumno, loadsheet, vouchera, cargo y estados propios — visibles por separado en Proyección, Turno y Dueño, con mini-form de TAC/HOBBS en cada aterrizaje fuera de casa.

**Architecture:** Enfoque A del spec (`docs/superpowers/specs/2026-07-31-rutas-con-parada-design.md`): la solicitud sigue siendo UNA (`solicitud_vuelo.con_parada` + `tramos_ruta` jsonb); al publicar se generan N filas de `vuelo` hermanas (`grupo_ruta` = `id_detalle`, `orden_tramo`, `icao_origen/destino`). Estado nuevo `EN_ESPERA_TRAMO` para tramos 2..N. Todos los consumidores por-vuelo (loadsheet, vouchera, cargos, tarjetas) funcionan sin cambios estructurales.

**Tech Stack:** Node/Express + pg (backend en `legacy/CAA-backend`), React 19 + Vite (frontend en `CAA-frontend`), PostgreSQL en Supabase. **No hay test suite**: la verificación por tarea es chequeo de sintaxis (`node -e "require(...)"`), `npm run build`, y una tarea E2E final contra Supabase real con datos throwaway (patrón establecido del repo).

**Convenciones del repo (obligatorias):**
- Antes de cada commit: `git fetch origin && git log HEAD..origin/master --oneline` (trabajo paralelo de Daniel/Samuel). Stagear SOLO los archivos tocados, nunca `git add -A`.
- Commits con trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, mensaje via `git commit -F <archivo>` si es multilínea.
- **NO pushear hasta la tarea final** (cada push despliega a producción). La migración se corre contra Supabase ANTES del push final (el código nuevo lee las columnas).
- `node run-sql.js` y `node query.js` se corren desde `legacy/CAA-backend/` (leen `.env`; si `.env` no existe en esta máquina, pedir a Samuel correr la migración en Supabase y verificar con el SQL de verificación indicado).

---

### Task 1: Migración de esquema

**Files:**
- Create: `supabase/migrations/20260731000002_rutas_con_parada.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Rutas con parada: una ruta = N vuelos (tramos) independientes.
-- Spec: docs/superpowers/specs/2026-07-31-rutas-con-parada-design.md
-- La solicitud sigue siendo una (con_parada + cadena de ICAOs intermedios);
-- al publicar se generan N filas de vuelo hermanas enlazadas por grupo_ruta.

ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS con_parada boolean NOT NULL DEFAULT false;
ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS tramos_ruta jsonb;

ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS grupo_ruta integer;
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS orden_tramo smallint;
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS total_tramos smallint;
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS icao_origen varchar(4);
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS icao_destino varchar(4);
CREATE INDEX IF NOT EXISTS idx_vuelo_grupo_ruta ON vuelo (grupo_ruta) WHERE grupo_ruta IS NOT NULL;

-- Estado nuevo EN_ESPERA_TRAMO (tramos 2..N esperando en el aeropuerto destino).
-- ⚠️ SIEMPRE las DOS tablas hermanas (lección de la migración 20260713000003:
-- vuelo_estado_tiempo nunca se actualizó con EN_PROGRESO y todo hacía ROLLBACK).
ALTER TABLE vuelo DROP CONSTRAINT IF EXISTS vuelo_estado_check;
ALTER TABLE vuelo ADD CONSTRAINT vuelo_estado_check CHECK (
  (estado)::text = ANY (ARRAY[
    'SOLICITADO','AJUSTADO','PUBLICADO','PROGRAMADO','SALIDA_HANGAR',
    'EN_VUELO','EN_PROGRESO','REGRESO_HANGAR','FINALIZANDO','COMPLETADO',
    'CANCELADO','EN_ESPERA_TRAMO'
  ]::text[])
);

ALTER TABLE vuelo_estado_tiempo DROP CONSTRAINT IF EXISTS vuelo_estado_tiempo_estado_check;
ALTER TABLE vuelo_estado_tiempo ADD CONSTRAINT vuelo_estado_tiempo_estado_check
  CHECK (estado IN ('PROGRAMADO','SALIDA_HANGAR','EN_VUELO','EN_PROGRESO',
                    'REGRESO_HANGAR','COMPLETADO','CANCELADO','FINALIZANDO',
                    'EN_ESPERA_TRAMO'));
```

- [ ] **Step 2: Correr la migración contra Supabase**

Run (desde `legacy/CAA-backend/`): `node run-sql.js "../../supabase/migrations/20260731000002_rutas_con_parada.sql"`
Expected: sin errores. Nota: los DROP+ADD de CHECK no son aditivos puros — mismo patrón ya autorizado (migraciones 009 y 20260713000003). Si el clasificador de auto-mode lo bloquea o no hay `.env` local, pedirle a Samuel que lo corra en el editor SQL de Supabase.

- [ ] **Step 3: Verificar columnas y constraints**

Run: `node query.js "SELECT column_name FROM information_schema.columns WHERE table_name='vuelo' AND column_name IN ('grupo_ruta','orden_tramo','total_tramos','icao_origen','icao_destino')"`
Expected: 5 filas.
Run: `node query.js "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='vuelo_estado_tiempo_estado_check'"`
Expected: contiene `EN_ESPERA_TRAMO`.

- [ ] **Step 4: Commit (solo el archivo de migración)**

```bash
git add supabase/migrations/20260731000002_rutas_con_parada.sql
git commit -m "Migración: rutas con parada (tramos + estado EN_ESPERA_TRAMO)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Helper puro de tramos (backend)

**Files:**
- Create: `legacy/CAA-backend/utils/rutaTramos.js`

- [ ] **Step 1: Crear el helper**

```js
// Helpers puros para rutas con parada (N tramos por ruta). Sin acceso a DB.
// El alumno pide solo los ICAO intermedios; el origen del primer tramo y el
// destino del último son siempre la base (MSSS) y se autocompletan.
const BASE_ICAO = "MSSS";
const MAX_PARADAS = 4;

// ["mggt"," MHTG "] -> ["MGGT","MHTG"]. Lanza Error con .status=400 si algo
// no es un ICAO de 4 letras o si hay demasiadas paradas.
function normalizarParadas(tramos_ruta) {
  if (!Array.isArray(tramos_ruta) || tramos_ruta.length === 0) {
    throw Object.assign(
      new Error("Una ruta con parada necesita al menos un aeropuerto destino (código ICAO)."),
      { status: 400 }
    );
  }
  if (tramos_ruta.length > MAX_PARADAS) {
    throw Object.assign(new Error(`Máximo ${MAX_PARADAS} paradas por ruta.`), { status: 400 });
  }
  return tramos_ruta.map((c) => {
    const icao = String(c || "").trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(icao)) {
      throw Object.assign(
        new Error(`"${c}" no es un código ICAO válido (4 letras, ej. MGGT).`),
        { status: 400 }
      );
    }
    return icao;
  });
}

// Reparte el rango de bloques total en N tramos iguales. El horario por tramo
// es PRESENTACIONAL (la reserva real del avión es el rango completo); el gate
// operativo de los tramos 2..N es la acción del instructor, no la hora.
// paradas ["MGGT"] => [{1: MSSS->MGGT}, {2: MGGT->MSSS}]
function construirTramos({ paradas, id_bloque, id_bloque_fin }) {
  const icaos = [BASE_ICAO, ...paradas, BASE_ICAO];
  const n = icaos.length - 1;
  const b0 = Number(id_bloque);
  const b1 = Number(id_bloque_fin || id_bloque);
  const total = Math.max(1, b1 - b0 + 1);
  const por = Math.max(1, Math.floor(total / n));
  const tramos = [];
  for (let i = 0; i < n; i++) {
    const ini = Math.min(b1, b0 + i * por);
    const fin = i === n - 1 ? b1 : Math.min(b1, ini + por - 1);
    tramos.push({
      orden_tramo: i + 1,
      total_tramos: n,
      icao_origen: icaos[i],
      icao_destino: icaos[i + 1],
      id_bloque: ini,
      id_bloque_fin: fin,
    });
  }
  return tramos;
}

module.exports = { BASE_ICAO, MAX_PARADAS, normalizarParadas, construirTramos };
```

- [ ] **Step 2: Verificar sintaxis y lógica de reparto**

Run (desde `legacy/CAA-backend/`):
```bash
node -e "
const { normalizarParadas, construirTramos } = require('./utils/rutaTramos');
const t2 = construirTramos({ paradas: ['MGGT'], id_bloque: 2, id_bloque_fin: 5 });
console.assert(t2.length === 2 && t2[0].id_bloque === 2 && t2[0].id_bloque_fin === 3 && t2[1].id_bloque === 4 && t2[1].id_bloque_fin === 5, 'split 2 tramos');
const t3 = construirTramos({ paradas: ['MGGT','MHTG'], id_bloque: 1, id_bloque_fin: 3 });
console.assert(t3.length === 3 && t3[2].icao_destino === 'MSSS' && t3[0].icao_origen === 'MSSS', 'cadena ICAO');
const t1b = construirTramos({ paradas: ['MGGT'], id_bloque: 4, id_bloque_fin: 4 });
console.assert(t1b.length === 2 && t1b[1].id_bloque === 4, 'rango de 1 bloque no revienta');
try { normalizarParadas(['XX']); console.assert(false); } catch (e) { console.assert(e.status === 400); }
console.log('OK');
"
```
Expected: `OK` sin asserts fallidos.

- [ ] **Step 3: Commit**

```bash
git add legacy/CAA-backend/utils/rutaTramos.js
git commit -m "Helper rutaTramos: validación ICAO y reparto de bloques por tramo" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Servicio compartido de estados de tramo + aterrizaje (backend)

**Files:**
- Create: `legacy/CAA-backend/services/rutaTramoService.js`

Turno e instructor duplican hoy sus mapas `NEXT_ESTADO`; la lógica de tramos va en UN servicio que ambos controllers consumen (menos superficie de bug para lo nuevo).

- [ ] **Step 1: Crear el servicio**

```js
// Lógica compartida (Turno + Instructor) para vuelos que son tramos de una
// ruta con parada (vuelo.grupo_ruta != null). Máquina de estados por tramo:
//   Tramo 1:            PUBLICADO -> SALIDA_HANGAR -> EN_PROGRESO -> (aterrizaje) COMPLETADO
//   Tramos intermedios: EN_ESPERA_TRAMO -> EN_PROGRESO -> (aterrizaje) COMPLETADO
//   Tramo final:        EN_ESPERA_TRAMO -> EN_PROGRESO -> REGRESO_HANGAR -> FINALIZANDO -> COMPLETADO
// Los tramos NO finales se cierran solo por registrarAterrizajeTramo (mini-form
// TAC/HOBBS), nunca por el botón genérico de avanzar.

function esTramo(vuelo) {
  return vuelo && vuelo.grupo_ruta != null;
}

function esTramoFinal(vuelo) {
  return Number(vuelo.orden_tramo) >= Number(vuelo.total_tramos);
}

// Próximo estado para un tramo vía el botón genérico de avanzar. Devuelve
// undefined cuando la transición no existe (p.ej. EN_PROGRESO de un tramo no
// final: ahí el cierre es el mini-form de aterrizaje).
function nextEstadoTramo(vuelo) {
  const primero = Number(vuelo.orden_tramo) === 1;
  const final = esTramoFinal(vuelo);
  const mapa = {
    ...(primero
      ? { PUBLICADO: "SALIDA_HANGAR", PROGRAMADO: "SALIDA_HANGAR", SALIDA_HANGAR: "EN_PROGRESO" }
      : { EN_ESPERA_TRAMO: "EN_PROGRESO" }),
    ...(final
      ? { EN_PROGRESO: "REGRESO_HANGAR", REGRESO_HANGAR: "FINALIZANDO", FINALIZANDO: "COMPLETADO" }
      : {}),
  };
  return mapa[vuelo.estado];
}

// Guard: no se puede iniciar el tramo N si el N-1 no está COMPLETADO.
async function asegurarTramoAnteriorCerrado(client, vuelo) {
  if (Number(vuelo.orden_tramo) <= 1) return;
  const prev = await client.query(
    `SELECT estado, icao_destino FROM vuelo WHERE grupo_ruta = $1 AND orden_tramo = $2`,
    [vuelo.grupo_ruta, Number(vuelo.orden_tramo) - 1]
  );
  if (!prev.rows.length || prev.rows[0].estado !== "COMPLETADO") {
    throw Object.assign(
      new Error("El tramo anterior de la ruta todavía no está cerrado — registrá primero el aterrizaje."),
      { status: 409 }
    );
  }
}

// Mini-form de aterrizaje en destino: cierra el tramo actual y precarga las
// voucheras adyacentes. Escribe DIRECTO en reporte_vuelo (creando el borrador
// si no existe): llegada del tramo actual y salida del siguiente. Reabrible
// mientras el tramo siguiente siga EN_ESPERA_TRAMO.
// Devuelve { registrado_en, reabierto, id_vuelo_siguiente }.
async function registrarAterrizajeTramo(client, { vuelo, tacometro, hobbs, id_usuario }) {
  const tac = parseFloat(tacometro);
  const hob = parseFloat(hobbs);
  if (isNaN(tac) || tac <= 0 || isNaN(hob) || hob <= 0) {
    throw Object.assign(new Error("Registrá el TAC y el HOBBS de llegada (números mayores a 0)."), { status: 400 });
  }
  if (!esTramo(vuelo) || esTramoFinal(vuelo)) {
    throw Object.assign(
      new Error("Este vuelo no es un tramo intermedio de ruta — el tramo final se cierra con el flujo normal."),
      { status: 400 }
    );
  }

  const sig = await client.query(
    `SELECT id_vuelo, estado FROM vuelo WHERE grupo_ruta = $1 AND orden_tramo = $2`,
    [vuelo.grupo_ruta, Number(vuelo.orden_tramo) + 1]
  );
  const siguiente = sig.rows[0] || null;

  const reabierto = vuelo.estado === "COMPLETADO";
  if (vuelo.estado !== "EN_PROGRESO" && !reabierto) {
    throw Object.assign(new Error("El tramo tiene que estar en progreso para registrar el aterrizaje."), { status: 409 });
  }
  if (reabierto && (!siguiente || siguiente.estado !== "EN_ESPERA_TRAMO")) {
    throw Object.assign(
      new Error("El tramo siguiente ya inició — corregí los valores desde la vouchera."),
      { status: 409 }
    );
  }

  // TAC de llegada >= TAC de salida del propio tramo (si ya está precargado).
  const propio = await client.query(
    `SELECT tacometro_salida, hobbs_salida, estado FROM reporte_vuelo WHERE id_vuelo = $1`,
    [vuelo.id_vuelo]
  );
  const rvPropio = propio.rows[0];
  if (rvPropio && rvPropio.tacometro_salida != null && tac < parseFloat(rvPropio.tacometro_salida)) {
    throw Object.assign(
      new Error(`El TAC de llegada (${tac}) no puede ser menor al de salida del tramo (${rvPropio.tacometro_salida}).`),
      { status: 400 }
    );
  }

  // Llegada del tramo actual (no pisa una vouchera ya firmada).
  await client.query(
    `INSERT INTO reporte_vuelo (id_vuelo, tacometro_llegada, hobbs_llegada, estado)
     VALUES ($1, $2, $3, 'BORRADOR')
     ON CONFLICT (id_vuelo) DO UPDATE SET
       tacometro_llegada = EXCLUDED.tacometro_llegada,
       hobbs_llegada = EXCLUDED.hobbs_llegada,
       actualizado_en = NOW()
     WHERE reporte_vuelo.estado IS NULL OR reporte_vuelo.estado = 'BORRADOR'`,
    [vuelo.id_vuelo, tac, hob]
  );

  // Salida del tramo siguiente.
  if (siguiente) {
    await client.query(
      `INSERT INTO reporte_vuelo (id_vuelo, tacometro_salida, hobbs_salida, estado)
       VALUES ($1, $2, $3, 'BORRADOR')
       ON CONFLICT (id_vuelo) DO UPDATE SET
         tacometro_salida = EXCLUDED.tacometro_salida,
         hobbs_salida = EXCLUDED.hobbs_salida,
         actualizado_en = NOW()
       WHERE reporte_vuelo.estado IS NULL OR reporte_vuelo.estado = 'BORRADOR'`,
      [siguiente.id_vuelo, tac, hob]
    );
  }

  let registrado_en = null;
  if (!reabierto) {
    await client.query(`UPDATE vuelo SET estado = 'COMPLETADO' WHERE id_vuelo = $1`, [vuelo.id_vuelo]);
    const ts = await client.query(
      `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
       VALUES ($1, 'COMPLETADO', $2)
       RETURNING (registrado_en AT TIME ZONE 'America/El_Salvador') AS registrado_en`,
      [vuelo.id_vuelo, id_usuario ?? null]
    );
    registrado_en = ts.rows[0].registrado_en;
  }

  return { registrado_en, reabierto, id_vuelo_siguiente: siguiente ? siguiente.id_vuelo : null };
}

module.exports = { esTramo, esTramoFinal, nextEstadoTramo, asegurarTramoAnteriorCerrado, registrarAterrizajeTramo };
```

- [ ] **Step 2: Verificar sintaxis + tabla de verdad del mapa**

```bash
node -e "
const s = require('./services/rutaTramoService');
const t1 = { grupo_ruta: 9, orden_tramo: 1, total_tramos: 3, estado: 'PUBLICADO' };
console.assert(s.nextEstadoTramo(t1) === 'SALIDA_HANGAR');
console.assert(s.nextEstadoTramo({ ...t1, estado: 'SALIDA_HANGAR' }) === 'EN_PROGRESO');
console.assert(s.nextEstadoTramo({ ...t1, estado: 'EN_PROGRESO' }) === undefined, 'tramo 1 no final cierra por aterrizaje');
const t2 = { grupo_ruta: 9, orden_tramo: 2, total_tramos: 3, estado: 'EN_ESPERA_TRAMO' };
console.assert(s.nextEstadoTramo(t2) === 'EN_PROGRESO');
const t3 = { grupo_ruta: 9, orden_tramo: 3, total_tramos: 3, estado: 'EN_PROGRESO' };
console.assert(s.nextEstadoTramo(t3) === 'REGRESO_HANGAR', 'tramo final flujo completo');
console.log('OK');
"
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add legacy/CAA-backend/services/rutaTramoService.js
git commit -m "Servicio rutaTramoService: máquina de estados por tramo y mini-form de aterrizaje" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Solicitudes con parada — los 3 caminos de escritura a `solicitud_vuelo`

**Files:**
- Modify: `legacy/CAA-backend/controllers/agendarController.js` (~L426-473, `guardarSolicitud`)
- Modify: `legacy/CAA-backend/services/solicitudService.js` (~L245-346, `insertarSolicitudVuelo`)
- Modify: `legacy/CAA-backend/controllers/programacionController.js` (~L835-951, `agendarVueloDirecto` — solo la solicitud de respaldo; los vuelos van en Task 5)

- [ ] **Step 1: `agendarController.guardarSolicitud` — aceptar y validar `con_parada`/`tramos_ruta`**

Al tope del archivo, junto a los otros require:
```js
const { normalizarParadas } = require("../utils/rutaTramos");
```

Dentro del loop de INSERT (hoy L470-473), reemplazar el INSERT de 8 columnas por:
```js
      const conParada = v.tipo_vuelo === "RUTA" && v.con_parada === true;
      const paradas = conParada ? normalizarParadas(v.tramos_ruta) : null;
      await client.query(
        `INSERT INTO solicitud_vuelo (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, es_extracurricular, con_parada, tramos_ruta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id_solicitud, id_semana, v.dia_semana, v.id_bloque, v.id_aeronave, v.tipo_vuelo || 'LOCAL', v.id_bloque_fin || v.id_bloque, v.es_extracurricular === true, conParada, paradas ? JSON.stringify(paradas) : null]
      );
```
El error de `normalizarParadas` trae `.status=400`; en el `catch` del endpoint (hoy L487-500), agregar antes del manejo genérico:
```js
    if (e.status === 400) {
      return res.status(400).json({ message: e.message });
    }
```
Nota: los límites semanal/diario NO cambian — una ruta con parada sigue siendo UN elemento del array `vuelos` y cuenta 1 (decisión del spec).

- [ ] **Step 2: `solicitudService.insertarSolicitudVuelo` — mismos 2 campos**

Agregar al tope: `const { normalizarParadas } = require("../utils/rutaTramos");`

En la firma (L245-251), agregar `con_parada, tramos_ruta,` después de `es_extracurricular,`.

Antes del INSERT final (L334), agregar:
```js
  const conParada = (tipo_vuelo === "RUTA") && con_parada === true;
  const paradasNorm = conParada ? normalizarParadas(tramos_ruta) : null;
```
Y reemplazar el INSERT de 13 columnas por el de 15:
```js
  const ins = await client.query(
    `INSERT INTO solicitud_vuelo
       (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, id_instructor, es_extracurricular, categoria, tipo_instruccion, nombre_externo, id_licencia_chequeo, con_parada, tramos_ruta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id_detalle`,
    [
      id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave,
      tipo_vuelo || "LOCAL", id_bloque_fin || id_bloque,
      id_instructor || null, es_extracurricular === true,
      resuelto.categoria, resuelto.tipo_instruccion || "NORMAL", resuelto.nombre_externo,
      resuelto.id_licencia_chequeo,
      conParada, paradasNorm ? JSON.stringify(paradasNorm) : null,
    ]
  );
```

- [ ] **Step 3: `programacionController.agendarVueloDirecto` — solicitud de respaldo**

En el destructuring del body (L835-840) agregar `con_parada, tramos_ruta,`.

Después de `const fin = Number(id_bloque_fin || id_bloque);` (L862), agregar:
```js
    const { normalizarParadas } = require("../utils/rutaTramos");
    const conParada = (tipo_vuelo === "RUTA") && con_parada === true;
    let paradasRuta = null;
    if (conParada) {
      try { paradasRuta = normalizarParadas(tramos_ruta); }
      catch (e) { return res.status(400).json({ message: e.message }); }
    }
```
En el INSERT de respaldo a `solicitud_vuelo` (L946-951), agregar las 2 columnas (queda de 15, igual que el Step 2):
```js
    const sv = await client.query(
      `INSERT INTO solicitud_vuelo (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, id_instructor, es_extracurricular, tipo_instruccion, categoria, nombre_externo, id_licencia_chequeo, con_parada, tramos_ruta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id_detalle`,
      [id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo || "LOCAL", fin, id_instructor, es_extracurricular === true, tipoInstruccion, categoria, nombreExterno, idLicenciaChequeoEfectiva, conParada, paradasRuta ? JSON.stringify(paradasRuta) : null]
    );
```

- [ ] **Step 4: Verificar sintaxis**

```bash
node -e "require('./controllers/agendarController'); require('./services/solicitudService'); require('./controllers/programacionController'); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add legacy/CAA-backend/controllers/agendarController.js legacy/CAA-backend/services/solicitudService.js legacy/CAA-backend/controllers/programacionController.js
git commit -m "Solicitudes: con_parada + tramos_ruta en los 3 caminos de escritura" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Generar N tramos al crear los vuelos (publicar semana + agendado directo)

**Files:**
- Modify: `legacy/CAA-backend/controllers/admin/adminVueloController.js` (`publicarSemana`, L111-123)
- Modify: `legacy/CAA-backend/controllers/programacionController.js` (`agendarVueloDirecto`, L953-959)

- [ ] **Step 1: `publicarSemana` — excluir con_parada del INSERT...SELECT y loopear los tramos**

Import al tope del archivo:
```js
const { normalizarParadas, construirTramos } = require("../../utils/rutaTramos");
```

En el `INSERT INTO vuelo ... SELECT` existente (L112-123), agregar al final del WHERE:
```sql
        AND COALESCE(sv.con_parada, false) = false
```

Inmediatamente después de ese query, agregar el loop de rutas con parada:
```js
    // Rutas con parada: N filas de vuelo por solicitud (una por tramo),
    // enlazadas por grupo_ruta = id_detalle. Tramo 1 nace PUBLICADO; los
    // demás EN_ESPERA_TRAMO (los abre el instructor desde destino).
    const rutasRes = await client.query(`
      SELECT sv.id_detalle, sv.id_semana, ss.id_alumno,
             COALESCE(sv.id_instructor, al.id_instructor) AS id_instructor,
             sv.id_aeronave, sv.dia_semana, sv.id_bloque, sv.id_bloque_fin,
             COALESCE(sv.es_extracurricular, FALSE) AS es_extracurricular,
             COALESCE(sv.tipo_instruccion, 'NORMAL') AS tipo_instruccion,
             COALESCE(sv.categoria, 'NORMAL') AS categoria,
             sv.nombre_externo, sv.id_licencia_chequeo, sv.debitar_saldo, sv.tramos_ruta,
             sw.fecha_inicio + (sv.dia_semana - 1) AS fecha_vuelo
        FROM solicitud_vuelo sv
        JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
        JOIN alumno al ON al.id_alumno = ss.id_alumno
        JOIN semana_vuelo sw ON sw.id_semana = sv.id_semana
       WHERE sv.id_semana = $1 AND sv.con_parada = true
         AND ss.estado NOT IN ('RECHAZADA','CANCELADA')
         AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')
    `, [id_semana]);

    for (const r of rutasRes.rows) {
      const tramos = construirTramos({
        paradas: normalizarParadas(r.tramos_ruta),
        id_bloque: r.id_bloque,
        id_bloque_fin: r.id_bloque_fin,
      });
      for (const t of tramos) {
        await client.query(`
          INSERT INTO vuelo (id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo, id_bloque_fin, es_extracurricular, tipo_instruccion, categoria, nombre_externo, id_licencia_chequeo, debitar_saldo, estado, creado_por, fecha_vuelo, grupo_ruta, orden_tramo, total_tramos, icao_origen, icao_destino)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'RUTA',$8,$9,$10,$11,$12,$13,$14,$15,'ADMIN',$16,$1,$17,$18,$19,$20)
        `, [
          r.id_detalle, r.id_semana, r.id_alumno, r.id_instructor, r.id_aeronave,
          r.dia_semana, t.id_bloque, t.id_bloque_fin, r.es_extracurricular,
          r.tipo_instruccion, r.categoria, r.nombre_externo, r.id_licencia_chequeo,
          r.debitar_saldo,
          t.orden_tramo === 1 ? "PUBLICADO" : "EN_ESPERA_TRAMO",
          r.fecha_vuelo, t.orden_tramo, t.total_tramos, t.icao_origen, t.icao_destino,
        ]);
      }
    }
```
Notas: `grupo_ruta` reusa `$1` (= `id_detalle`) a propósito. El `DELETE FROM vuelo WHERE id_semana` que ya corre antes hace la republicación idempotente. **Beneficio colateral**: como los N tramos comparten `id_detalle`, `rechazarSolicitudIndividual` (UPDATE por `id_detalle`) y `cancelarSolicitud` (por `id_detalle IN (...)`) ya cancelan la ruta COMPLETA sin tocarlos.

- [ ] **Step 2: `agendarVueloDirecto` — N tramos en semana publicada**

Reemplazar el INSERT único a `vuelo` (L953-959) por:
```js
    const { construirTramos } = require("../utils/rutaTramos");
    let id_vuelo;
    if (conParada) {
      const tramos = construirTramos({ paradas: paradasRuta, id_bloque, id_bloque_fin: fin });
      for (const t of tramos) {
        const vueT = await client.query(
          `INSERT INTO vuelo (id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo, id_bloque_fin, es_extracurricular, tipo_instruccion, categoria, nombre_externo, id_licencia_chequeo, estado, creado_por, fecha_vuelo, grupo_ruta, orden_tramo, total_tramos, icao_origen, icao_destino)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'RUTA',$8,$9,$10,$11,$12,$13,$14,'PROGRAMACION',
                   (SELECT fecha_inicio FROM semana_vuelo WHERE id_semana=$2) + ($6 - 1),
                   $1,$15,$16,$17,$18)
           RETURNING id_vuelo`,
          [id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, t.id_bloque, t.id_bloque_fin, es_extracurricular === true, tipoInstruccion, categoria, nombreExterno, idLicenciaChequeoEfectiva, t.orden_tramo === 1 ? "PUBLICADO" : "EN_ESPERA_TRAMO", t.orden_tramo, t.total_tramos, t.icao_origen, t.icao_destino]
        );
        if (t.orden_tramo === 1) id_vuelo = vueT.rows[0].id_vuelo;
      }
    } else {
      const vue = await client.query(
        `INSERT INTO vuelo (id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo, id_bloque_fin, es_extracurricular, tipo_instruccion, categoria, nombre_externo, id_licencia_chequeo, estado, creado_por, fecha_vuelo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PUBLICADO','PROGRAMACION',
                 (SELECT fecha_inicio FROM semana_vuelo WHERE id_semana=$2) + ($6 - 1))
         RETURNING id_vuelo`,
        [id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo || "LOCAL", fin, es_extracurricular === true, tipoInstruccion, categoria, nombreExterno, idLicenciaChequeoEfectiva]
      );
      id_vuelo = vue.rows[0].id_vuelo;
    }
```
(El resto de la función sigue usando `id_vuelo` — el del tramo 1 — para notificaciones/respuesta.)

- [ ] **Step 3: Verificar sintaxis**

```bash
node -e "require('./controllers/admin/adminVueloController'); require('./controllers/programacionController'); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add legacy/CAA-backend/controllers/admin/adminVueloController.js legacy/CAA-backend/controllers/programacionController.js
git commit -m "Publicación y agendado directo generan N tramos para rutas con parada" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Avance de estados por tramo + endpoint de aterrizaje (Turno e Instructor)

**Files:**
- Modify: `legacy/CAA-backend/controllers/turnoController.js` (`avanzarEstadoVuelo` L104-305; nuevo `registrarAterrizajeTramo`; nuevo `cancelarTramosRestantes`)
- Modify: `legacy/CAA-backend/controllers/instructor/instructorVueloController.js` (`avanzarEstadoVuelo` L178-416; nuevo `registrarAterrizajeTramo`)
- Modify: `legacy/CAA-backend/routes/turnoRoutes.js`
- Modify: `legacy/CAA-backend/routes/instructorRoutes.js`

- [ ] **Step 1: `turnoController.avanzarEstadoVuelo` — cargar datos de tramo y usar el mapa nuevo**

Import al tope:
```js
const { esTramo, nextEstadoTramo, asegurarTramoAnteriorCerrado, registrarAterrizajeTramo: registrarAterrizajeTramoCore } = require("../services/rutaTramoService");
```
En el SELECT ... FOR UPDATE (L114-118), agregar columnas:
```sql
       SELECT v.id_vuelo, v.estado, v.id_aeronave, v.grupo_ruta, v.orden_tramo, v.total_tramos, v.icao_origen, v.icao_destino, rv.es_inasistencia
```
Reemplazar la línea `let nuevoEstado = (esSimulador ? NEXT_ESTADO_SIM : NEXT_ESTADO)[vuelo.estado];` por:
```js
    const vueloEsTramo = esTramo(vuelo);
    let nuevoEstado = vueloEsTramo
      ? nextEstadoTramo(vuelo)
      : (esSimulador ? NEXT_ESTADO_SIM : NEXT_ESTADO)[vuelo.estado];
```
(El 400 existente de "no se puede avanzar" cubre `nuevoEstado === undefined`; mejorar su mensaje para tramos: si `vueloEsTramo && vuelo.estado === "EN_PROGRESO"` responder `400 "Este tramo se cierra registrando el aterrizaje en destino (TAC/HOBBS)."`.)

En `esEventoSalida` (L144), incluir el arranque de tramo:
```js
    const esEventoSalida = nuevoEstado === "SALIDA_HANGAR"
      || (esSimulador && nuevoEstado === "EN_PROGRESO")
      || (vueloEsTramo && vuelo.estado === "EN_ESPERA_TRAMO" && nuevoEstado === "EN_PROGRESO");
```
En la guardia de avión ocupado (query de L147-160), excluir hermanos del mismo grupo (y chequear tramo anterior cerrado). Justo antes del query de ocupación:
```js
      if (vueloEsTramo) {
        await asegurarTramoAnteriorCerrado(client, vuelo);
      }
```
Y en el WHERE del query de ocupación agregar (con el nuevo parámetro `$3`):
```sql
            AND ($3::int IS NULL OR v2.grupo_ruta IS DISTINCT FROM $3::int)
```
pasando `[vuelo.id_aeronave, Number(id_vuelo), vuelo.grupo_ruta ?? null]`.

En el push de hangar (L268+), agregar el caso de inicio de tramo: cuando `vueloEsTramo && nuevoEstado === "EN_PROGRESO" && vuelo.estado_anterior === "EN_ESPERA_TRAMO"` — más simple: capturar antes `const eraEspera = vuelo.estado === "EN_ESPERA_TRAMO";` y después del bloque de push existente agregar:
```js
    if (vueloEsTramo && eraEspera && nuevoEstado === "EN_PROGRESO") {
      (async () => {
        try {
          await notificarStaff({
            title: "🛫 Inició tramo de ruta",
            body: `Vuelo #${id_vuelo} · tramo ${vuelo.orden_tramo}/${vuelo.total_tramos} hacia ${vuelo.icao_destino}`,
            url: "/turno", tag: "hangar",
          }, { excluirUid: user?.id_usuario, tipo: "VUELO_ESTADO" });
        } catch (e) { console.error("push tramo:", e.message); }
      })();
    }
```

- [ ] **Step 2: `turnoController.registrarAterrizajeTramo` (endpoint nuevo)**

Agregar al final del archivo:
```js
// Mini-form de aterrizaje en destino (rutas con parada): cierra el tramo actual
// con TAC/HOBBS de llegada y precarga la salida del tramo siguiente.
exports.registrarAterrizajeTramo = async (req, res) => {
  const { id_vuelo } = req.params;
  const { tacometro, hobbs } = req.body;
  const io = req.app.get("io");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const vRes = await client.query(
      `SELECT id_vuelo, estado, grupo_ruta, orden_tramo, total_tramos, icao_destino
         FROM vuelo WHERE id_vuelo = $1 FOR UPDATE`,
      [Number(id_vuelo)]
    );
    if (vRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Vuelo no encontrado" });
    }
    const out = await registrarAterrizajeTramoCore(client, {
      vuelo: vRes.rows[0], tacometro, hobbs, id_usuario: req.user?.id_usuario,
    });
    await client.query("COMMIT");
    if (io && !out.reabierto) {
      io.emit("vuelo_estado_changed", {
        id_vuelo: Number(id_vuelo), estado: "COMPLETADO", registrado_en: out.registrado_en,
      });
    }
    res.json({ id_vuelo: Number(id_vuelo), ...out });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if (e.status) return res.status(e.status).json({ message: e.message });
    console.error("registrarAterrizajeTramo:", e);
    res.status(500).json({ message: "Error al registrar el aterrizaje" });
  } finally {
    client.release();
  }
};
```

- [ ] **Step 3: `turnoController.cancelarTramosRestantes` (ruta cortada a la mitad)**

```js
// Cancela este tramo y todos los siguientes de la misma ruta (solo los que aún
// no volaron). Para rutas cortadas en la vida real (clima en destino, etc.):
// el tramo que sí voló se cierra con regreso anticipado en su vouchera.
exports.cancelarTramosRestantes = async (req, res) => {
  const { id_vuelo } = req.params;
  const { motivo } = req.body;
  const io = req.app.get("io");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const vRes = await client.query(
      `SELECT grupo_ruta, orden_tramo FROM vuelo WHERE id_vuelo = $1 FOR UPDATE`,
      [Number(id_vuelo)]
    );
    if (!vRes.rows.length || vRes.rows[0].grupo_ruta == null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este vuelo no es un tramo de ruta." });
    }
    const { grupo_ruta, orden_tramo } = vRes.rows[0];
    const cancelados = await client.query(
      `UPDATE vuelo SET estado = 'CANCELADO', fecha_cancelacion = NOW(),
              tipo_cancelacion = 'NORMAL',
              justificacion_cancelacion = $3
        WHERE grupo_ruta = $1 AND orden_tramo >= $2
          AND estado IN ('PUBLICADO','PROGRAMADO','EN_ESPERA_TRAMO')
        RETURNING id_vuelo`,
      [grupo_ruta, orden_tramo, String(motivo || "Tramos restantes de la ruta cancelados por Turno").trim()]
    );
    for (const row of cancelados.rows) {
      await client.query(
        `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por) VALUES ($1, 'CANCELADO', $2)`,
        [row.id_vuelo, req.user?.id_usuario ?? null]
      );
    }
    await client.query("COMMIT");
    if (io) {
      for (const row of cancelados.rows) {
        io.emit("vuelo_estado_changed", { id_vuelo: row.id_vuelo, estado: "CANCELADO" });
      }
    }
    res.json({ cancelados: cancelados.rows.map((r) => r.id_vuelo) });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("cancelarTramosRestantes:", e);
    res.status(500).json({ message: "Error al cancelar los tramos restantes" });
  } finally {
    client.release();
  }
};
```

- [ ] **Step 4: `instructorVueloController.avanzarEstadoVuelo` — espejo del Step 1**

Mismos cambios que el Step 1 (import del servicio; columnas `grupo_ruta, orden_tramo, total_tramos, icao_origen, icao_destino` en su SELECT FOR UPDATE; `nextEstadoTramo`; `esEventoSalida` ampliado; `asegurarTramoAnteriorCerrado`; exclusión de hermanos en la guardia con el parámetro extra; mensaje 400 del cierre por aterrizaje). El gate de pertenencia (L208-211) y el resto quedan igual.

Y agregar `exports.registrarAterrizajeTramo` idéntico al Step 2 pero con el gate de pertenencia después del SELECT:
```js
    if (vRes.rows[0].id_instructor !== req.user.id_instructor) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No estás asignado a este vuelo" });
    }
```
(agregando `v.id_instructor` al SELECT del endpoint).

- [ ] **Step 5: Rutas**

`routes/turnoRoutes.js` — junto a `router.patch("/vuelos/:id_vuelo/estado", ...)` agregar (mismo middleware de capacidad que esa línea):
```js
router.post("/vuelos/:id_vuelo/aterrizaje-tramo", requireCapacidad(["TURNO", "ADMIN"], "OPERACIONES"), turnoController.registrarAterrizajeTramo);
router.post("/vuelos/:id_vuelo/cancelar-tramos-restantes", requireCapacidad(["TURNO", "ADMIN"], "OPERACIONES"), turnoController.cancelarTramosRestantes);
```
(Copiar el middleware EXACTO que use la ruta de estado existente en ese archivo — verificar al editar.)

`routes/instructorRoutes.js` — junto a la ruta de avanzar:
```js
router.post("/vuelos/:id_vuelo/aterrizaje-tramo", instructorAccess, instructorVuelo.registrarAterrizajeTramo);
```
(Mismo patrón de middleware/nombres que las rutas vecinas de ese archivo.)

- [ ] **Step 6: Verificar sintaxis**

```bash
node -e "require('./controllers/turnoController'); require('./controllers/instructor/instructorVueloController'); require('./routes/turnoRoutes'); require('./routes/instructorRoutes'); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add legacy/CAA-backend/controllers/turnoController.js legacy/CAA-backend/controllers/instructor/instructorVueloController.js legacy/CAA-backend/routes/turnoRoutes.js legacy/CAA-backend/routes/instructorRoutes.js
git commit -m "Estados por tramo: avance, aterrizaje en destino y cancelar tramos restantes" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Inasistencia y cancelaciones en grupo

**Files:**
- Modify: `legacy/CAA-backend/controllers/instructor/instructorVueloController.js` (`registrarInasistencia` L418-484)
- Modify: `legacy/CAA-backend/controllers/turnoController.js` (`registrarInasistencia` L390-452)
- Modify: `legacy/CAA-backend/controllers/admin/adminCancelacionController.js` (`resolverSolicitudCancelacion` L64-101)
- Modify: `legacy/CAA-backend/controllers/turnoMantenimientoController.js` (tras el UPDATE de cancelación, L146-154)

- [ ] **Step 1: Inasistencia solo en tramo 1 + cancela los hermanos (ambos controllers)**

En AMBAS versiones de `registrarInasistencia`, al inicio de la transacción (antes del UPDATE a COMPLETADO):
```js
    const tramoRes = await client.query(
      `SELECT grupo_ruta, orden_tramo FROM vuelo WHERE id_vuelo = $1`,
      [id_vuelo]
    );
    const tramo = tramoRes.rows[0];
    if (tramo?.grupo_ruta != null && Number(tramo.orden_tramo) > 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "La inasistencia solo aplica al primer tramo de una ruta." });
    }
```
Y después del INSERT a `vuelo_estado_tiempo` (antes del COMMIT):
```js
    if (tramo?.grupo_ruta != null) {
      const canc = await client.query(
        `UPDATE vuelo SET estado = 'CANCELADO', fecha_cancelacion = NOW(),
                justificacion_cancelacion = 'Inasistencia en el primer tramo de la ruta'
          WHERE grupo_ruta = $1 AND orden_tramo > 1
            AND estado NOT IN ('CANCELADO','COMPLETADO')
          RETURNING id_vuelo`,
        [tramo.grupo_ruta]
      );
      for (const row of canc.rows) {
        await client.query(
          `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por) VALUES ($1, 'CANCELADO', $2)`,
          [row.id_vuelo, user?.id_usuario ?? null]
        );
      }
    }
```

- [ ] **Step 2: `resolverSolicitudCancelacion` — la aceptación cancela la ruta completa**

Reemplazar el UPDATE de vuelo (dentro del `if (decision === 'ACEPTADA')`):
```js
      await client.query(
        `UPDATE vuelo SET estado = 'CANCELADO', fecha_cancelacion = NOW()
          WHERE id_vuelo = $1
             OR grupo_ruta = (SELECT grupo_ruta FROM vuelo WHERE id_vuelo = $1 AND grupo_ruta IS NOT NULL)`,
        [solRes.rows[0].id_vuelo]
      );
```

- [ ] **Step 3: Mantenimiento imprevisto — arrastra a los hermanos en espera**

En `turnoMantenimientoController.js`, después de `const idsCancelados = cancelRes.rows.map(...)` agregar:
```js
    // Rutas con parada: si cayó un tramo, caen también sus hermanos que aún no
    // volaron (el avión no va a estar para completar la ruta).
    if (idsCancelados.length > 0) {
      const hermanos = await client.query(
        `UPDATE vuelo SET estado = 'CANCELADO', fecha_cancelacion = NOW(),
                tipo_cancelacion = 'NORMAL',
                justificacion_cancelacion = $2
          WHERE grupo_ruta IN (SELECT grupo_ruta FROM vuelo WHERE id_vuelo = ANY($1::int[]) AND grupo_ruta IS NOT NULL)
            AND estado IN ('PUBLICADO','PROGRAMADO','EN_ESPERA_TRAMO')
          RETURNING id_vuelo`,
        [idsCancelados, `Mantenimiento imprevisto de ${codigo}: ${String(descripcion).trim()}`]
      );
      for (const row of hermanos.rows) idsCancelados.push(row.id_vuelo);
    }
```
(Las notificaciones por vuelo que ya existen después usan `idsCancelados`/`tripulaciones` — verificar al editar que la query de tripulaciones se alimente de `idsCancelados` ya ampliado; si se arma antes, moverla después de este bloque.)

- [ ] **Step 4: Verificar sintaxis + commit**

```bash
node -e "require('./controllers/turnoController'); require('./controllers/instructor/instructorVueloController'); require('./controllers/admin/adminCancelacionController'); require('./controllers/turnoMantenimientoController'); console.log('OK')"
git add legacy/CAA-backend/controllers/turnoController.js legacy/CAA-backend/controllers/instructor/instructorVueloController.js legacy/CAA-backend/controllers/admin/adminCancelacionController.js legacy/CAA-backend/controllers/turnoMantenimientoController.js
git commit -m "Inasistencia y cancelaciones operan sobre la ruta completa (grupo_ruta)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Asignación de alumnos por tramo (backend) + propagación en editar tripulación

**Files:**
- Modify: `legacy/CAA-backend/controllers/admin/adminVueloController.js` (2 exports nuevos al final)
- Modify: `legacy/CAA-backend/routes/adminRoutes.js`
- Modify: `legacy/CAA-backend/controllers/turnoController.js` (`editarTripulacionVuelo`)

- [ ] **Step 1: Endpoints de tramos**

En `adminVueloController.js`:
```js
// Tramos de una ruta con parada (para el modal "Asignar alumnos por tramo").
exports.getTramosRuta = catchAsync(async (req, res) => {
  const { id_detalle } = req.params;
  const r = await db.query(
    `SELECT v.id_vuelo, v.orden_tramo, v.total_tramos, v.icao_origen, v.icao_destino,
            v.estado, v.id_alumno,
            u.nombre AS alumno_nombre, u.apellido AS alumno_apellido
       FROM vuelo v
       JOIN alumno al ON al.id_alumno = v.id_alumno
       JOIN usuario u ON u.id_usuario = al.id_usuario
      WHERE v.grupo_ruta = $1
      ORDER BY v.orden_tramo`,
    [Number(id_detalle)]
  );
  res.json(r.rows);
});

// Reasignar el alumno de UN tramo (caso: la ida la vuela un alumno y el
// retorno otro; el instructor es el mismo en toda la ruta). Valida licencia
// del alumno nuevo contra la aeronave; sin chequeo de conflicto de horario
// (criterio de staff, mismo trato que el agendado directo de programación).
exports.asignarAlumnoTramo = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  const { id_alumno } = req.body;
  if (!id_alumno) return res.status(400).json({ message: "Falta id_alumno" });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const vRes = await client.query(
      `SELECT id_vuelo, grupo_ruta, estado, id_aeronave FROM vuelo WHERE id_vuelo = $1 FOR UPDATE`,
      [Number(id_vuelo)]
    );
    if (!vRes.rows.length || vRes.rows[0].grupo_ruta == null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este vuelo no es un tramo de ruta." });
    }
    if (!["PUBLICADO", "PROGRAMADO", "EN_ESPERA_TRAMO"].includes(vRes.rows[0].estado)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El tramo ya inició o cerró — no se puede reasignar." });
    }
    const lic = await client.query(
      `SELECT 1 FROM alumno a
         JOIN licencia_aeronave la ON la.id_licencia = a.id_licencia AND la.id_aeronave = $2
        WHERE a.id_alumno = $1`,
      [Number(id_alumno), vRes.rows[0].id_aeronave]
    );
    if (lic.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "La aeronave no está habilitada para la licencia de ese alumno." });
    }
    await client.query(`UPDATE vuelo SET id_alumno = $1 WHERE id_vuelo = $2`, [Number(id_alumno), Number(id_vuelo)]);
    await client.query("COMMIT");
    const io = req.app.get("io");
    if (io) io.emit("vuelo_estado_changed", { id_vuelo: Number(id_vuelo) });
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 2: Rutas en `adminRoutes.js`** (junto a las rutas de solicitudes, mismo `adminAccess`):
```js
router.get("/rutas/:id_detalle/tramos", adminAccess, adminVuelo.getTramosRuta);
router.patch("/vuelos/:id_vuelo/alumno-tramo", adminAccess, adminVuelo.asignarAlumnoTramo);
```

- [ ] **Step 3: `editarTripulacionVuelo` (turno) — instructor/aeronave se propagan a la ruta**

Localizar `editarTripulacionVuelo` en `turnoController.js`. Después de que actualiza el vuelo objetivo, agregar (usando las variables reales de esa función — leerla antes de editar):
```js
    // Rutas con parada: instructor y aeronave son de TODA la ruta (el alumno
    // sí es por tramo y se cambia con el modal de asignación).
    const gRes = await client.query(`SELECT grupo_ruta FROM vuelo WHERE id_vuelo = $1`, [id_vuelo]);
    if (gRes.rows[0]?.grupo_ruta != null) {
      await client.query(
        `UPDATE vuelo SET id_instructor = $1, id_aeronave = $2
          WHERE grupo_ruta = $3 AND id_vuelo <> $4 AND estado NOT IN ('CANCELADO','COMPLETADO')`,
        [nuevoInstructor, nuevaAeronave, gRes.rows[0].grupo_ruta, id_vuelo]
      );
    }
```
(`nuevoInstructor`/`nuevaAeronave` = los valores finales que la función ya aplicó al vuelo objetivo; tomar los nombres reales del código al editar.)

- [ ] **Step 4: Verificar sintaxis + commit**

```bash
node -e "require('./controllers/admin/adminVueloController'); require('./routes/adminRoutes'); require('./controllers/turnoController'); console.log('OK')"
git add legacy/CAA-backend/controllers/admin/adminVueloController.js legacy/CAA-backend/routes/adminRoutes.js legacy/CAA-backend/controllers/turnoController.js
git commit -m "Asignación de alumno por tramo + tripulación de ruta se propaga en grupo" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Queries de lectura + vouchera (checklist gate y columnas de tramo)

**Files:**
- Modify: `legacy/CAA-backend/controllers/turnoController.js` (`getVuelosHoy` L33-102)
- Modify: `legacy/CAA-backend/controllers/calendarioController.js` (`getCalendarioPublico`)
- Modify: `legacy/CAA-backend/controllers/instructor/instructorVueloController.js` (los 2 SELECT de L33 y L99)
- Modify: `legacy/CAA-backend/controllers/admin/adminVueloController.js` (`getCalendario`, JOIN de L50/L276)
- Modify: `legacy/CAA-backend/controllers/instructor/instructorReporteController.js` (`getReporteVueloInstructor` L43-128; `firmarReporteVuelo` gate L421-432)

- [ ] **Step 1: Columnas nuevas en los SELECT explícitos**

Agregar `v.grupo_ruta, v.orden_tramo, v.total_tramos, v.icao_origen, v.icao_destino,` a:
- `turnoController.getVuelosHoy` (después de `v.nombre_externo,`)
- `calendarioController.getCalendarioPublico` (localizar su SELECT principal y agregar las 5 columnas con el alias de tabla que use)
- `instructorVueloController` — los SELECT de `getVuelosHoy` (L33) y `getVuelosSemana` (L99)

(El `getMiHorario` del alumno usa `v.*` — fluye solo, sin cambios.)

- [ ] **Step 2: `getCalendario` — una tarjeta por ruta (no N)**

En `adminVueloController.js`, las DOS ocurrencias de:
```sql
    LEFT JOIN vuelo v ON v.id_detalle = sv.id_detalle AND v.id_semana = sv.id_semana
```
cambian a:
```sql
    LEFT JOIN vuelo v ON v.id_detalle = sv.id_detalle AND v.id_semana = sv.id_semana
      AND (v.grupo_ruta IS NULL OR v.orden_tramo = 1)
```
Y en el SELECT del calendario (L8-10 del extracto), agregar `sv.con_parada, sv.tramos_ruta,` para que el popover sepa que es una ruta con parada.

- [ ] **Step 3: Vouchera — datos de tramo + checklist solo en el tramo final**

`getReporteVueloInstructor` (L43-128): agregar al SELECT `v.grupo_ruta, v.orden_tramo, v.total_tramos, v.icao_origen, v.icao_destino,` (van al objeto `vuelo` de la respuesta — verificar que el mapeo explícito de la función los incluya; si mapea campo por campo, agregarlos).

`firmarReporteVuelo`: localizar el `vueloRes` que ya carga datos del vuelo dentro de la transacción y agregarle `v.grupo_ruta, v.orden_tramo, v.total_tramos`. Luego cambiar el gate del checklist (L421-432):
```js
      // Checklist post-vuelo: solo para aeronave física Y solo en el tramo
      // final de una ruta (los tramos que cierran fuera de casa no regresan
      // al hangar — el avión se revisa cuando vuelve).
      const infoTramo = vueloRes.rows[0];
      const esTramoNoFinal = infoTramo.grupo_ruta != null
        && Number(infoTramo.orden_tramo) < Number(infoTramo.total_tramos);
      if (!esInasistencia && !esSimulador && !esTramoNoFinal) {
        const checklistRes = await client.query(
          'SELECT id_vuelo FROM checklist_postvuelo WHERE id_vuelo = $1',
          [id]
        );
        if (checklistRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: 'Debe completar el checklist post-vuelo primero antes de firmar el reporte' });
        }
      }
```
(⚠️ verificar que `vueloRes` exista ANTES de este punto en el flujo real de la función; si el SELECT del vuelo ocurre después, mover la carga de estas 3 columnas a un query previo al gate.)

- [ ] **Step 4: Verificar sintaxis + commit**

```bash
node -e "require('./controllers/turnoController'); require('./controllers/calendarioController'); require('./controllers/instructor/instructorVueloController'); require('./controllers/admin/adminVueloController'); require('./controllers/instructor/instructorReporteController'); console.log('OK')"
git add legacy/CAA-backend/controllers/turnoController.js legacy/CAA-backend/controllers/calendarioController.js legacy/CAA-backend/controllers/instructor/instructorVueloController.js legacy/CAA-backend/controllers/admin/adminVueloController.js legacy/CAA-backend/controllers/instructor/instructorReporteController.js
git commit -m "Lecturas exponen datos de tramo; checklist solo en tramo final; calendario dedupe" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Frontend — servicios API nuevos

**Files:**
- Modify: `CAA-frontend/src/services/turnoApi.js`
- Modify: `CAA-frontend/src/services/instructorApi.js`
- Modify: `CAA-frontend/src/services/adminApi.js`

- [ ] **Step 1: Agregar funciones (mismo patrón axios de cada archivo)**

`turnoApi.js`:
```js
export const registrarAterrizajeTramo = async (id_vuelo, { tacometro, hobbs }) => {
  const res = await axios.post(`${API_URL}/turno/vuelos/${id_vuelo}/aterrizaje-tramo`, { tacometro, hobbs });
  return res.data;
};

export const cancelarTramosRestantes = async (id_vuelo, motivo) => {
  const res = await axios.post(`${API_URL}/turno/vuelos/${id_vuelo}/cancelar-tramos-restantes`, { motivo });
  return res.data;
};
```

`instructorApi.js`:
```js
export const registrarAterrizajeTramoInstructor = async (id_vuelo, { tacometro, hobbs }) => {
  const res = await axios.post(`${API_URL}/instructor/vuelos/${id_vuelo}/aterrizaje-tramo`, { tacometro, hobbs });
  return res.data;
};
```

`adminApi.js`:
```js
export const getTramosRuta = async (id_detalle) => {
  const res = await axios.get(`${API_URL}/admin/rutas/${id_detalle}/tramos`);
  return res.data;
};

export const asignarAlumnoTramo = async (id_vuelo, id_alumno) => {
  const res = await axios.patch(`${API_URL}/admin/vuelos/${id_vuelo}/alumno-tramo`, { id_alumno });
  return res.data;
};
```

- [ ] **Step 2: Commit**

```bash
git add CAA-frontend/src/services/turnoApi.js CAA-frontend/src/services/instructorApi.js CAA-frontend/src/services/adminApi.js
git commit -m "Servicios API: aterrizaje de tramo, cancelar restantes, asignar alumno por tramo" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Frontend — solicitud del alumno con cadena de tramos

**Files:**
- Modify: `CAA-frontend/src/pages/Alumno/AgendarVuelo.jsx`

- [ ] **Step 1: Estado + UI de paradas**

Junto a los estados de ruta (L205-209):
```jsx
  const [rutaConParada, setRutaConParada] = useState(false);
  const [rutaParadas, setRutaParadas] = useState([""]); // ICAOs intermedios
```
En el render del formulario RUTA (después del select de "Hora de Llegada", ~L554), agregar:
```jsx
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 8 }}>
                <input type="checkbox" checked={rutaConParada} onChange={(e) => setRutaConParada(e.target.checked)} />
                Con parada en otro aeropuerto (genera un vuelo por tramo)
              </label>
              {rutaConParada && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>MSSS</span>
                    {rutaParadas.map((p, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className="bi bi-arrow-right"></i>
                        <input
                          type="text"
                          value={p}
                          maxLength={4}
                          placeholder="ICAO"
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                            setRutaParadas(prev => prev.map((x, j) => (j === i ? val : x)));
                          }}
                          style={{ width: 70, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', padding: '4px 6px' }}
                        />
                        {rutaParadas.length > 1 && (
                          <button type="button" title="Quitar parada"
                            onClick={() => setRutaParadas(prev => prev.filter((_, j) => j !== i))}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-danger-700)' }}>
                            <i className="bi bi-x-circle"></i>
                          </button>
                        )}
                      </span>
                    ))}
                    <i className="bi bi-arrow-right"></i>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>MSSS</span>
                  </div>
                  {rutaParadas.length < 4 && (
                    <button type="button" onClick={() => setRutaParadas(prev => [...prev, ""])}
                      style={{ marginTop: 6, fontSize: 'var(--text-sm)' }} className="btn btn-outline-secondary btn-sm">
                      + Agregar tramo
                    </button>
                  )}
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-ink-3)', margin: '6px 0 0' }}>
                    Cada tramo será un vuelo con su propio loadsheet y vouchera. El primer código es tu primera parada.
                  </p>
                </div>
              )}
```

- [ ] **Step 2: `handleAgregarRuta` — validar y agregar los campos al objeto**

Dentro de `handleAgregarRuta` (L227), después de la validación de bloques agregar:
```jsx
    if (rutaConParada) {
      const limpias = rutaParadas.map(p => p.trim().toUpperCase()).filter(Boolean);
      if (limpias.length === 0 || limpias.some(p => !/^[A-Z]{4}$/.test(p))) {
        toast.warning("Completá el código ICAO de cada parada (4 letras, ej. MGGT)");
        return;
      }
    }
```
Y en el objeto que se agrega a `setSelecciones`:
```jsx
      {
        dia_semana: Number(rutaDia),
        id_bloque: Number(rutaBloqueInicio),
        id_aeronave: Number(rutaAeronave),
        tipo_vuelo: 'RUTA',
        id_bloque_fin: Number(rutaBloqueFin),
        con_parada: rutaConParada,
        tramos_ruta: rutaConParada ? rutaParadas.map(p => p.trim().toUpperCase()).filter(Boolean) : null,
      }
```
Al final del handler, resetear también: `setRutaConParada(false); setRutaParadas([""]);`

En `normalize` (L62), agregar las paradas para que la detección de cambios las vea:
```jsx
    const normalize = (s) => `${s.dia_semana}-${s.id_bloque}-${s.id_aeronave}-${s.tipo_vuelo || 'LOCAL'}-${s.id_bloque_fin || ''}-${s.es_extracurricular ? 'X' : ''}-${(s.tramos_ruta || []).join(',')}`;
```
En la lista de seleccionados (L613-618), mostrar el itinerario:
```jsx
                  const bloqueStr = s.tipo_vuelo === 'RUTA'
                    ? `Salida: Bloque ${s.id_bloque} | Llegada: Bloque ${s.id_bloque_fin}${s.con_parada ? ` | MSSS→${(s.tramos_ruta || []).join('→')}→MSSS` : ''}`
                    : `Bloque: ${s.id_bloque}`;
```

- [ ] **Step 3: Build + commit**

Run: `cd CAA-frontend && npm run build` → Expected: compila sin errores.
```bash
git add CAA-frontend/src/pages/Alumno/AgendarVuelo.jsx
git commit -m "Alumno solicita rutas con parada (cadena de ICAOs con agregar tramo)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Frontend — AgendarVueloModal (staff) con parada

**Files:**
- Modify: `CAA-frontend/src/components/AgendarVueloModal/AgendarVueloModal.jsx`

- [ ] **Step 1: Estado + UI**

Junto a los estados de tipo (L50-51):
```jsx
  const [conParada, setConParada] = useState(false);
  const [paradas, setParadas] = useState([""]);
```
Debajo del bloque `tipoVuelo === "RUTA"` existente (L472-487), dentro del mismo `avm-row` condicionado a RUTA, agregar (misma estructura de la cadena de la Task 11, versión compacta):
```jsx
          {tipoVuelo === "RUTA" && (
            <div className="avm-field" style={{ marginTop: 6 }}>
              <label className="avm-check">
                <input type="checkbox" checked={conParada} onChange={(e) => setConParada(e.target.checked)} />
                Con parada (un vuelo por tramo)
              </label>
              {conParada && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <span style={{ fontWeight: 700 }}>MSSS</span>
                  {paradas.map((p, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      →
                      <input type="text" value={p} maxLength={4} placeholder="ICAO"
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                          setParadas(prev => prev.map((x, j) => (j === i ? val : x)));
                        }}
                        style={{ width: 64, textTransform: 'uppercase' }} />
                      {paradas.length > 1 && (
                        <button type="button" onClick={() => setParadas(prev => prev.filter((_, j) => j !== i))}
                          style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                      )}
                    </span>
                  ))}
                  <span>→ <b>MSSS</b></span>
                  {paradas.length < 4 && (
                    <button type="button" onClick={() => setParadas(prev => [...prev, ""])}>+ tramo</button>
                  )}
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 2: Payload**

En `guardar()` (L185+), antes de armar `payloadBase` agregar validación:
```jsx
    if (tipoVuelo === "RUTA" && conParada) {
      const limpias = paradas.map(p => p.trim().toUpperCase()).filter(Boolean);
      if (limpias.length === 0 || limpias.some(p => !/^[A-Z]{4}$/.test(p))) {
        toast.error("Completá el código ICAO de cada parada (4 letras)");
        setSaving(false);
        return;
      }
    }
```
Y en `payloadBase` agregar:
```jsx
      con_parada: tipoVuelo === "RUTA" && conParada,
      tramos_ruta: (tipoVuelo === "RUTA" && conParada)
        ? paradas.map(p => p.trim().toUpperCase()).filter(Boolean)
        : null,
```

- [ ] **Step 3: Build + commit**

Run: `cd CAA-frontend && npm run build` → Expected: sin errores.
```bash
git add CAA-frontend/src/components/AgendarVueloModal/AgendarVueloModal.jsx
git commit -m "Staff agenda rutas con parada desde el modal del calendario" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Frontend — mini-form de aterrizaje + botones de tramo (Instructor y Turno)

**Files:**
- Create: `CAA-frontend/src/components/AterrizajeTramoModal/AterrizajeTramoModal.jsx`
- Create: `CAA-frontend/src/components/AterrizajeTramoModal/AterrizajeTramoModal.css`
- Modify: `CAA-frontend/src/pages/Instructor/Dashboard.jsx` (`VueloCard` L92-260)
- Modify: `CAA-frontend/src/pages/Turno/Dashboard.jsx` (`VueloCard` L100-249)

- [ ] **Step 1: Componente del mini-form (compartido)**

`AterrizajeTramoModal.jsx`:
```jsx
import { useState } from "react";
import { toast } from "sonner";
import "./AterrizajeTramoModal.css";

// Mini-form del aterrizaje en destino (rutas con parada): 2 campos, pensado
// para llenarse rápido desde el celular. Cierra el tramo actual y deja el
// TAC/HOBBS precargado en las voucheras de los tramos adyacentes.
export default function AterrizajeTramoModal({ vuelo, onSubmit, onClose }) {
  const [tac, setTac] = useState("");
  const [hobbs, setHobbs] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!tac || !hobbs || parseFloat(tac) <= 0 || parseFloat(hobbs) <= 0) {
      toast.warning("Registrá el TAC y el HOBBS de llegada.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ tacometro: tac, hobbs });
      toast.success(`Aterrizaje en ${vuelo.icao_destino} registrado — tramo cerrado.`);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo registrar el aterrizaje.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="atm-overlay" onClick={onClose}>
      <div className="atm-modal" onClick={(e) => e.stopPropagation()}>
        <h3><i className="bi bi-airplane-engines"></i> Aterrizamos en {vuelo.icao_destino}</h3>
        <p className="atm-sub">
          Tramo {vuelo.orden_tramo}/{vuelo.total_tramos} · {vuelo.icao_origen} → {vuelo.icao_destino}.
          Estos valores quedan como llegada de esta vouchera y salida de la siguiente.
        </p>
        <div className="atm-field">
          <label>TAC de llegada</label>
          <input type="number" inputMode="decimal" step="0.01" value={tac}
            onChange={(e) => setTac(e.target.value)} autoFocus />
        </div>
        <div className="atm-field">
          <label>HOBBS de llegada</label>
          <input type="number" inputMode="decimal" step="0.1" value={hobbs}
            onChange={(e) => setHobbs(e.target.value)} />
        </div>
        <div className="atm-actions">
          <button className="atm-btn-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="atm-btn-save" onClick={guardar} disabled={saving}>
            {saving ? "Registrando…" : "Registrar aterrizaje"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

`AterrizajeTramoModal.css`:
```css
.atm-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1200;
}
.atm-modal {
  background: var(--c-surface-0, #fff); border-radius: 12px; padding: 20px;
  width: min(380px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.25);
}
.atm-modal h3 { margin: 0 0 4px; font-size: 1.05rem; display: flex; align-items: center; gap: 8px; }
.atm-sub { font-size: 0.82rem; color: var(--c-ink-3, #64748b); margin: 0 0 14px; }
.atm-field { margin-bottom: 12px; }
.atm-field label { display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c-ink-3, #64748b); margin-bottom: 4px; }
.atm-field input { width: 100%; padding: 10px 12px; border: 1px solid var(--c-line-2, #cbd5e1); border-radius: 8px; font-family: var(--font-mono, monospace); font-size: 1rem; }
.atm-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.atm-btn-cancel { background: none; border: 1px solid var(--c-line-2, #cbd5e1); border-radius: 8px; padding: 8px 14px; cursor: pointer; }
.atm-btn-save { background: var(--c-brand-700, #1b365d); color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
.atm-btn-save:disabled, .atm-btn-cancel:disabled { opacity: 0.6; cursor: default; }
```

- [ ] **Step 2: Instructor `VueloCard` — botones y badge de tramo**

En `pages/Instructor/Dashboard.jsx`:
- Import: `import AterrizajeTramoModal from "../../components/AterrizajeTramoModal/AterrizajeTramoModal";` y `registrarAterrizajeTramoInstructor` desde `../../services/instructorApi`.
- En `ESTADO_TAG` (L29-38) agregar: `EN_ESPERA_TRAMO: "En espera en destino",`.
- En `VueloCard`, agregar estado local `const [aterrizando, setAterrizando] = useState(false);` y derivar:
```jsx
  const esTramo = vuelo.grupo_ruta != null;
  const esTramoNoFinal = esTramo && Number(vuelo.orden_tramo) < Number(vuelo.total_tramos);
```
- Label del botón (L122-123) — reemplazar por:
```jsx
  const btnLabel = isSim
    ? BTN_LABEL_SIM[vuelo.estado]
    : (esTramo
        ? (vuelo.estado === "EN_ESPERA_TRAMO"
            ? `Iniciar tramo a ${vuelo.icao_destino}`
            : (esTramoNoFinal && vuelo.estado === "EN_PROGRESO" ? null : BTN_LABEL[vuelo.estado]))
        : BTN_LABEL[vuelo.estado]);
```
(Cuando `btnLabel` es null no se muestra el botón genérico — en su lugar va el de aterrizaje.)
- Badge en la cabecera de la tarjeta (junto a los tags de estado, L169-176):
```jsx
          {esTramo && (
            <span className="ins__tag" title={`Ruta con parada — tramo ${vuelo.orden_tramo} de ${vuelo.total_tramos}`}>
              RUTA T{vuelo.orden_tramo}/{vuelo.total_tramos} · {vuelo.icao_origen}→{vuelo.icao_destino}
            </span>
          )}
```
- Botón de aterrizaje (dentro del bloque `canOperate && !isCompletado`, junto al botón de avanzar):
```jsx
              {esTramoNoFinal && vuelo.estado === "EN_PROGRESO" && (
                <button className="ins__btn-avanzar" onClick={() => setAterrizando(true)}>
                  Aterrizamos en {vuelo.icao_destino}
                </button>
              )}
```
- Y al final del JSX de la tarjeta:
```jsx
      {aterrizando && (
        <AterrizajeTramoModal
          vuelo={vuelo}
          onClose={() => setAterrizando(false)}
          onSubmit={(datos) => registrarAterrizajeTramoInstructor(vuelo.id_vuelo, datos).then(onRefresh)}
        />
      )}
```
(`onRefresh` = el callback de recarga que `VueloCard` ya recibe — verificar el nombre real de la prop al editar; si no existe, usar el patrón de recarga del padre.)

- [ ] **Step 3: Turno `VueloCard` — espejo**

En `pages/Turno/Dashboard.jsx`:
- Imports: `AterrizajeTramoModal` + `registrarAterrizajeTramo, cancelarTramosRestantes` de `../../services/turnoApi`.
- `ESTADO_LABEL` (L40-48): agregar `EN_ESPERA_TRAMO: "En espera en destino",`.
- `ESTADOS_AVANZABLES` (L51): agregar `"EN_ESPERA_TRAMO"` al Set.
- `NEXT_LABEL` (L53-60): agregar `EN_ESPERA_TRAMO: "→ Iniciar tramo",`.
- En `VueloCard`, derivar `esTramo`/`esTramoNoFinal` igual que en el instructor, y:
  - Cuando `esTramoNoFinal && vuelo.estado === "EN_PROGRESO"`: en vez del botón genérico de avanzar, botón "Aterrizamos en {icao_destino}" que abre `AterrizajeTramoModal` con `onSubmit={(d) => registrarAterrizajeTramo(vuelo.id_vuelo, d).then(onRefresh)}`.
  - Badge `RUTA T{orden}/{total} · {origen}→{destino}` junto a los tags existentes (L177-192).
  - Para tramos con estado `EN_ESPERA_TRAMO`, botón secundario "Cancelar tramos restantes" con `window.confirm` que llama `cancelarTramosRestantes(vuelo.id_vuelo)` y `onRefresh`.

- [ ] **Step 4: Build + commit**

Run: `cd CAA-frontend && npm run build` → Expected: sin errores.
```bash
git add CAA-frontend/src/components/AterrizajeTramoModal/ CAA-frontend/src/pages/Instructor/Dashboard.jsx CAA-frontend/src/pages/Turno/Dashboard.jsx
git commit -m "Mini-form de aterrizaje + botones de tramo en tarjetas de Instructor y Turno" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Frontend — badges y estados en el resto de vistas

**Files:**
- Modify: `CAA-frontend/src/utils/vueloVisual.js`
- Modify: `CAA-frontend/src/components/VuelosEnCursoTable/VuelosEnCursoTable.jsx`
- Modify: `CAA-frontend/src/components/VueloResumenCard/VueloResumenCard.jsx`
- Modify: `CAA-frontend/src/components/MiHorarioList/MiHorarioList.jsx`
- Modify: `CAA-frontend/src/pages/Proyeccion/PaginaProgramacion.jsx`
- Modify: `CAA-frontend/src/components/AdminCalendar/AdminCalendar.jsx`

- [ ] **Step 1: `vueloVisual.js` — helpers de tramo**

Agregar a `ESTADO_VUELO_META` (L21-29):
```js
  EN_ESPERA_TRAMO: { label: "EN ESPERA",       cls: "pp__tbl-badge--programado" },
```
Y dos helpers nuevos al final (exportados):
```js
// Badge "T2/3 · MGGT→MHTG" para tramos de ruta con parada; null si no aplica.
export function tramoBadge(v) {
  if (v?.grupo_ruta == null) return null;
  return `T${v.orden_tramo}/${v.total_tramos} · ${v.icao_origen}→${v.icao_destino}`;
}

// Etiqueta de estado con contexto de tramo: un tramo esperando en destino
// muestra "EN MGGT — ESPERANDO" en vez del genérico.
export function estadoVueloMeta(v) {
  const base = ESTADO_VUELO_META[v?.estado] || { label: v?.estado, cls: "pp__tbl-badge--envuelo" };
  if (v?.estado === "EN_ESPERA_TRAMO" && v?.icao_origen) {
    return { ...base, label: `EN ${v.icao_origen} — ESPERANDO` };
  }
  return base;
}
```

- [ ] **Step 2: `VuelosEnCursoTable` y `VueloResumenCard`**

En ambos, importar `tramoBadge, estadoVueloMeta` desde `../../utils/vueloVisual` y:
- Reemplazar `const badge = ESTADO_VUELO_META[v.estado] || ...` por `const badge = estadoVueloMeta(v);` (mismo cambio con `vuelo` en la card del dueño).
- Junto al badge "Ruta" existente de `VuelosEnCursoTable` (L43), cambiarlo por:
```jsx
                    {v.tipo_vuelo === "RUTA" && (
                      <span className="pp__tipo-badge pp__tipo--ruta">{tramoBadge(v) || "Ruta"}</span>
                    )}
```
- En `VueloResumenCard` (que hoy no muestra Ruta), agregar junto a los badges tipo/estado (L32-35):
```jsx
        {tramoBadge(vuelo) && <span className="pp__tipo-badge pp__tipo--ruta">{tramoBadge(vuelo)}</span>}
```

- [ ] **Step 3: `MiHorarioList` (alumno)**

En `ESTADO_CFG` (L29-44) agregar:
```jsx
  EN_ESPERA_TRAMO: { label: "En espera en destino", cls: "mhl__badge--publicado" },
```
En la meta de la tarjeta (L56-72), después del span de aeronave:
```jsx
          {v.grupo_ruta != null && (
            <span className="mhl__vuelo-sim" title="Tramo de ruta con parada">
              T{v.orden_tramo}/{v.total_tramos} {v.icao_origen}→{v.icao_destino}
            </span>
          )}
```
Y en la condición del botón de loadsheet (L74), agregar `|| v.estado === "EN_ESPERA_TRAMO"` para que el alumno del tramo 2..N pueda llenar su plan de vuelo con anticipación:
```jsx
      {(v.estado === "PUBLICADO" || v.estado === "AJUSTADO" || v.estado === "PROGRAMADO" || v.estado === "EN_ESPERA_TRAMO") && (
```

- [ ] **Step 4: Proyección — tramos en espera visibles hoy**

En `PaginaProgramacion.jsx`, el filtro de "Vuelos en Curso" (L172-190): agregar al array `ESTADOS_VUELO_ACTIVO` (L39) el valor `"EN_ESPERA_TRAMO"`:
```jsx
const ESTADOS_VUELO_ACTIVO = ["SALIDA_HANGAR", "EN_VUELO", "EN_PROGRESO", "REGRESO_HANGAR", "FINALIZANDO", "EN_ESPERA_TRAMO"];
```
(Con eso el tramo esperando en destino aparece en la tabla con el badge "EN {ICAO} — ESPERANDO" del Step 1-2.)

- [ ] **Step 5: `AdminCalendar` — badge de itinerario + botón del modal de asignación**

- En la tarjeta de RUTA (L846, donde está el badge "Ruta"), mostrar el itinerario cuando hay parada:
```jsx
                          <span style={{fontSize:'0.65rem', padding:'2px 4px', background:'rgba(0,0,0,0.05)', color:'var(--neutral-dark)', borderRadius:'4px', marginRight:'4px', display:'inline-block'}}>
                            {item.con_parada ? `Ruta · MSSS→${(Array.isArray(item.tramos_ruta) ? item.tramos_ruta : []).join('→')}→MSSS` : 'Ruta'}
                          </span>
```
- En `PopoverContent`, para items con `item.con_parada && week === "current"` (semana publicada), agregar botón "Asignar alumnos por tramo" que abre el modal nuevo (Step 6). Pasar el handler por prop nueva `onAsignarTramos` desde el componente principal, siguiendo el patrón exacto de `onGestionarEspera` (L1184-1198): el botón llama `onAsignarTramos(activePopover.item.id_detalle)`.
- En los dashboards que montan el calendario con acciones de staff (`pages/Admin/Dashboard.jsx` y `pages/Programacion/Dashboard.jsx`), pasar `onAsignarTramos={(id_detalle) => setTramosRuta(id_detalle)}` con su estado + render del modal (Step 6), siguiendo el patrón de `StandbyModal`.

- [ ] **Step 6: Modal `AsignarTramosModal`**

Create: `CAA-frontend/src/components/AsignarTramosModal/AsignarTramosModal.jsx` (reusa el CSS del mini-form: `import "../AterrizajeTramoModal/AterrizajeTramoModal.css";`):
```jsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getTramosRuta, asignarAlumnoTramo, getAlumnosListAdmin } from "../../services/adminApi";
import "../AterrizajeTramoModal/AterrizajeTramoModal.css";

// Asignar un alumno distinto a cada tramo de una ruta con parada (caso: la ida
// la vuela un alumno y el retorno otro; el instructor es el mismo).
export default function AsignarTramosModal({ id_detalle, onClose, onSaved }) {
  const [tramos, setTramos] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [saving, setSaving] = useState(null); // id_vuelo en guardado

  useEffect(() => {
    getTramosRuta(id_detalle).then(setTramos).catch(() => toast.error("No se pudieron cargar los tramos."));
    getAlumnosListAdmin().then((r) => setAlumnos(r || [])).catch(() => {});
  }, [id_detalle]);

  const cambiar = async (t, id_alumno) => {
    setSaving(t.id_vuelo);
    try {
      await asignarAlumnoTramo(t.id_vuelo, Number(id_alumno));
      const data = await getTramosRuta(id_detalle);
      setTramos(data);
      toast.success(`Tramo ${t.orden_tramo} reasignado.`);
      if (onSaved) onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo reasignar el tramo.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="atm-overlay" onClick={onClose}>
      <div className="atm-modal" onClick={(e) => e.stopPropagation()}>
        <h3><i className="bi bi-people"></i> Asignar alumnos por tramo</h3>
        <p className="atm-sub">Cada tramo cobra y acredita horas al alumno asignado. Solo se pueden reasignar tramos que aún no volaron.</p>
        {tramos.map((t) => {
          const editable = ["PUBLICADO", "PROGRAMADO", "EN_ESPERA_TRAMO"].includes(t.estado);
          return (
            <div key={t.id_vuelo} className="atm-field">
              <label>Tramo {t.orden_tramo}/{t.total_tramos} · {t.icao_origen}→{t.icao_destino} · {t.estado}</label>
              <select
                value={t.id_alumno}
                disabled={!editable || saving === t.id_vuelo}
                onChange={(e) => cambiar(t, e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--c-line-2, #cbd5e1)" }}
              >
                {alumnos.map((a) => (
                  <option key={a.id_alumno} value={a.id_alumno}>{a.nombre} {a.apellido}</option>
                ))}
              </select>
            </div>
          );
        })}
        <div className="atm-actions">
          <button className="atm-btn-save" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
```
(⚠️ verificar al editar el shape real de `getAlumnosListAdmin` — campos `id_alumno`/`nombre`/`apellido` — y ajustar si difiere.)

- [ ] **Step 7: Build + commit**

Run: `cd CAA-frontend && npm run build` → Expected: sin errores.
```bash
git add CAA-frontend/src/utils/vueloVisual.js CAA-frontend/src/components/VuelosEnCursoTable/VuelosEnCursoTable.jsx CAA-frontend/src/components/VueloResumenCard/VueloResumenCard.jsx CAA-frontend/src/components/MiHorarioList/MiHorarioList.jsx CAA-frontend/src/pages/Proyeccion/PaginaProgramacion.jsx CAA-frontend/src/components/AdminCalendar/AdminCalendar.jsx CAA-frontend/src/components/AsignarTramosModal/ CAA-frontend/src/pages/Admin/Dashboard.jsx CAA-frontend/src/pages/Programacion/Dashboard.jsx
git commit -m "Badges de tramo en todas las vistas + modal de asignación de alumnos" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Vouchera — línea de contexto de tramo en el modal

**Files:**
- Modify: `CAA-frontend/src/components/ReporteVueloModal/ReporteVueloModal.jsx`

- [ ] **Step 1: Mostrar el contexto del tramo**

En la cabecera del modal (donde muestra aeronave/alumno/fecha), agregar cuando `data?.vuelo?.grupo_ruta != null`:
```jsx
          {data?.vuelo?.grupo_ruta != null && (
            <div className="rv-tramo-info" style={{ fontSize: '0.8rem', color: 'var(--c-ink-3)', fontFamily: 'var(--font-mono)' }}>
              Ruta con parada — Tramo {data.vuelo.orden_tramo}/{data.vuelo.total_tramos} · {data.vuelo.icao_origen} → {data.vuelo.icao_destino}
            </div>
          )}
```
(Localizar el nombre real de la variable de datos del vuelo en el componente — puede ser `vueloInfo` en vez de `data.vuelo`; seguir el patrón del archivo. Los TAC/HOBBS precargados por el mini-form aparecen solos: el modal ya hidrata desde `reporte`.)

- [ ] **Step 2: Build + commit**

Run: `cd CAA-frontend && npm run build` → Expected: sin errores.
```bash
git add CAA-frontend/src/components/ReporteVueloModal/ReporteVueloModal.jsx
git commit -m "Vouchera muestra el contexto del tramo de ruta" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: Verificación E2E contra Supabase (datos throwaway) + limpieza

**Files:**
- Create: `/private/tmp/claude-501/.../scratchpad/e2e_rutas_parada.mjs` (script en el scratchpad de la sesión, NO en el repo)

Patrón establecido: semana throwaway con `fecha_inicio` muy lejos en el futuro (no interfiere con la operación real), API de producción o backend local `PORT=5099` contra Supabase, y limpieza total al final.

- [ ] **Step 1: Sembrar la semana throwaway**

Via `node run-sql.js` o el editor de Supabase:
```sql
INSERT INTO semana_vuelo (fecha_inicio, fecha_fin, publicada)
VALUES ('2027-06-07', '2027-06-12', false) RETURNING id_semana;
```
Anotar el `id_semana` devuelto.

- [ ] **Step 2: Script E2E — flujo completo**

El script (login `u1`, fetch a la API) debe verificar, en orden:
1. **Solicitud con parada** (`POST /programacion/solicitudes` con `id_semana` throwaway... — ese endpoint exige semana NO publicada, correcto): payload RUTA `con_parada: true, tramos_ruta: ["MGGT","MHTG"]`, bloque 1→3. Expected: 200/201.
2. ICAO inválido (`tramos_ruta: ["XX"]`) → Expected: 400 con mensaje de ICAO.
3. **Publicar** (`POST /admin/publicar-semana` con el `id_semana`). Expected: OK.
4. `node query.js`: la solicitud generó **3 filas** de vuelo con `grupo_ruta = id_detalle`, `orden_tramo` 1..3, cadena `MSSS→MGGT→MHTG→MSSS`, tramo 1 `PUBLICADO`, tramos 2-3 `EN_ESPERA_TRAMO`.
5. **Estados**: avanzar tramo 1 (Turno API): PUBLICADO→SALIDA_HANGAR→EN_PROGRESO. Intentar avanzar de nuevo → Expected: 400 "se cierra registrando el aterrizaje". Intentar iniciar tramo 2 → Expected: 409 "tramo anterior no cerrado".
6. **Aterrizaje** tramo 1 (`POST /turno/vuelos/:id/aterrizaje-tramo` `{tacometro: 1500.5, hobbs: 2000.1}`): Expected: 200; tramo 1 `COMPLETADO`; `reporte_vuelo` del tramo 1 tiene `tacometro_llegada=1500.5` y el del tramo 2 tiene `tacometro_salida=1500.5`.
7. **Iniciar tramo 2** → EN_PROGRESO OK. Aterrizar tramo 2 con TAC menor a 1500.5 → Expected: 400. Con 1501 → OK.
8. **Tramo final** (3): iniciar → EN_PROGRESO → REGRESO_HANGAR → FINALIZANDO → COMPLETADO por el flujo normal.
9. **Asignar alumno por tramo**: sobre una SEGUNDA solicitud con parada (repetir pasos 1+3 en otro día de la semana), `PATCH /admin/vuelos/:id/alumno-tramo` con el alumno 2 en el tramo 2 → Expected: 200 y `query.js` muestra `id_alumno` distinto por tramo. Con un alumno sin licencia para esa aeronave → Expected: 400.
10. **Cancelación en grupo**: `PATCH /admin/solicitudes/:id_detalle/rechazar` de la segunda ruta → Expected: TODOS sus tramos quedan `CANCELADO` (comparten `id_detalle`).
11. **Inasistencia**: tercera ruta mínima (1 parada), marcar inasistencia del tramo 1 → tramo 1 COMPLETADO+es_inasistencia, tramo 2 CANCELADO. Intentar inasistencia sobre un tramo 2 de otra ruta → Expected: 400.

- [ ] **Step 3: Limpieza total**

```sql
DELETE FROM vuelo_estado_tiempo WHERE id_vuelo IN (SELECT id_vuelo FROM vuelo WHERE id_semana = <ID>);
DELETE FROM reporte_vuelo WHERE id_vuelo IN (SELECT id_vuelo FROM vuelo WHERE id_semana = <ID>);
DELETE FROM vuelo WHERE id_semana = <ID>;
DELETE FROM solicitud_vuelo WHERE id_semana = <ID>;
DELETE FROM solicitud_semana WHERE id_semana = <ID>;
DELETE FROM semana_vuelo WHERE id_semana = <ID>;
```
Verificar con `node query.js "SELECT COUNT(*) FROM vuelo WHERE id_semana = <ID>"` → 0.

⚠️ Si el E2E corre contra la API de **producción**, el backend desplegado aún no tiene el código nuevo — correr el backend **local** (`PORT=5099 node server.js` desde `legacy/CAA-backend`, que usa el `.env` → Supabase real) y apuntar el script a `http://localhost:5099`, patrón ya usado en sesiones previas. Si no hay `.env` local, posponer el E2E hasta después del deploy (Task 17) y correrlo contra producción con la misma limpieza.

- [ ] **Step 4: Reportar resultados** — cada check con su resultado real (no asumir).

---

### Task 17: Deploy y verificación en producción

- [ ] **Step 1: Confirmar que la migración ya corrió** (Task 1 — si quedó pendiente, correrla AHORA, antes del push: el backend nuevo inserta `EN_ESPERA_TRAMO` y lee las columnas).

- [ ] **Step 2: Build final + sincronizar + push**

```bash
cd CAA-frontend && npm run build
cd .. && git fetch origin && git log HEAD..origin/master --oneline
git push origin master
```
(Si hay commits de otros en `origin/master`: `git merge origin/master`, resolver, re-build, y recién entonces push.)

- [ ] **Step 3: Verificar el deploy**

- Backend: `curl -s -o /dev/null -w "%{http_code}" https://caaa-backend-production.up.railway.app/api/turno/vuelos/1/aterrizaje-tramo -X POST` → Expected: **401** (ruta existe y pide auth; 404 = el deploy no corrió).
- Frontend: abrir `https://caaa-app.vercel.app` y confirmar en Agendar (alumno de prueba `u4`) que el modo Ruta muestra el checkbox "Con parada".
- Si el E2E de la Task 16 quedó pospuesto, correrlo ahora contra producción (con limpieza).

- [ ] **Step 4: Actualizar CLAUDE.md** — agregar una sección breve de sesión describiendo la función (modelo `grupo_ruta`, estado `EN_ESPERA_TRAMO`, endpoints nuevos, decisiones del spec) siguiendo el formato de las secciones existentes, y commitear+pushear junto con lo anterior o en un commit propio.

---

## Self-review del plan (hecho al escribirlo)

- **Cobertura del spec**: modelo de datos (T1, T4, T5) · estados y flujo instructor (T3, T6) · mini-form (T3, T6, T13) · UI solicitud alumno+staff (T11, T12) · modal asignación (T8, T14) · dashboards/tarjetas/Proyección (T13, T14) · vouchera/checklist/cargo por tramo (T9, T15 — el cargo por tramo sale gratis: `cargarVueloACuentaDentroTx` cobra a `vuelo.id_alumno`) · cancelaciones/inasistencia (T7) · límites cuenta-1 (sin cambio, documentado en T4) · fuera de alcance respetado (sin catálogo ICAO, sin cambio de instructor por tramo).
- **Riesgos señalados en línea**: orden migración→deploy; dedupe de `getCalendario`; `vueloRes` en el gate de checklist; nombres de props/variables a verificar al editar (marcados con ⚠️).
- **Decisión consciente**: los tramos comparten `id_detalle` ⇒ rechazo/cancelación por solicitud ya son grupales sin código extra (verificado contra el código real de `rechazarSolicitudIndividual` y `cancelarSolicitud`).
