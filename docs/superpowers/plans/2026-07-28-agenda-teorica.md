# Agenda de teoría (salones, ciclo de vida, firma de asistencia) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instructores de teoría agendan clases (curso/unidad/fecha/bloque/salón/examen/alumnos),
las inician/cierran en tiempo real, y los alumnos firman su asistencia digitalmente — con un
widget de ocupación de salones reusado en 5 pantallas y push al iniciar. Turno gana paridad
operativa con lo que ya hace con aviones (reservar, agendar a nombre de otro, cancelar, reasignar).

**Architecture:** Se extiende lo que ya existe (`sesion_clase`/`asistencia_alumno`, el módulo
`/administracion/aula/*`) en vez de construir tablas paralelas. Los patrones de conflicto,
reservas de "uso especial", push best-effort y firma digital ya existen para vuelos/voucheras —
se replican exactamente igual para salones/clases.

**Tech Stack:** Node/Express + `pg` (backend), React 19 (frontend), PostgreSQL (Supabase).
Sin framework de testing en el repo — la verificación es `node --check` (sintaxis),
`npm run build` (frontend) y scripts `curl`/`node` contra la base real (mismo patrón usado en
todo el proyecto), con limpieza de datos de prueba al final de cada tarea que cree filas reales.

Spec completo: `docs/superpowers/specs/2026-07-28-agenda-teorica-design.md`.

---

## Mapa de archivos

**Nuevos:**
- `supabase/migrations/20260728000001_agenda_teorica.sql` — migración.
- `legacy/CAA-backend/utils/aulaChoques.js` — helper compartido de validación de choques (salón +
  instructor cruzado vuelo↔teoría).
- `CAA-frontend/src/pages/Instructor/AgendaTeorica.jsx` + `.css` — página del instructor.
- `CAA-frontend/src/components/AgendarClaseModal/AgendarClaseModal.jsx` + `.css` — modal de
  agendar (instructor y Turno).
- `CAA-frontend/src/components/AgendarClaseModal/CerrarClaseModal.jsx` — modal de pasar
  lista + cerrar.
- `CAA-frontend/src/components/FirmarAsistenciaModal/FirmarAsistenciaModal.jsx` + `.css` — el
  alumno firma.
- `CAA-frontend/src/components/SalonesOcupacionWidget/SalonesOcupacionWidget.jsx` — widget
  compartido (5 lugares).
- `CAA-frontend/src/components/MisClasesList/MisClasesList.jsx` + `.css` — tarjetas del alumno.

**Modificados:**
- `legacy/CAA-backend/controllers/administracion/aulaVirtualController.js` — `crearSesion`
  extendido + `editarSesion`/`cancelarSesion`/`iniciarSesion`/`cerrarSesion`/`listSalones`/
  `disponibilidadSalones`/`reasignarSalon`/`rosterCurso` + CRUD `reserva_salon`.
- `legacy/CAA-backend/controllers/alumno/alumnoVueloController.js` (o nuevo
  `alumnoClaseController.js`) — `getMisClases` extendido + `firmarAsistencia`.
- `legacy/CAA-backend/controllers/programacionController.js` — `GET /programacion/salones-ocupacion`.
- `legacy/CAA-backend/routes/administracionRoutes.js` — rutas nuevas de `/aula/*`.
- `legacy/CAA-backend/routes/programacionRoutes.js` — ruta de ocupación.
- `legacy/CAA-backend/routes/alumnoRoutes.js` — ruta de firma.
- `legacy/CAA-backend/utils/webpush.js` — nuevo tipo `CLASE_TEORIA` en `TIPOS_PUSH`.
- `CAA-frontend/src/services/administracionApi.js` — funciones nuevas.
- `CAA-frontend/src/services/alumnoApi.js` — `getMisClases` (ya existe, se reusa tal cual) +
  `firmarAsistenciaClase`.
- `CAA-frontend/src/services/programacionApi.js` — `getSalonesOcupacion`.
- `CAA-frontend/src/pages/Instructor/AulaVirtual.jsx` — se retira el formulario embebido de crear
  sesión (queda solo material/notas/asistencia histórica).
- `CAA-frontend/src/pages/Alumno/Dashboard.jsx` — pestaña "Mis clases".
- `CAA-frontend/src/pages/Proyeccion/PaginaProgramacion.jsx` — monta el widget en el sidebar.
- `CAA-frontend/src/pages/Turno/Dashboard.jsx` — monta el widget + agenda del día + modal.
- `CAA-frontend/src/pages/Programacion/Dashboard.jsx`, `CAA-frontend/src/pages/Admin/Dashboard.jsx`
  — montan el widget.
- `CAA-frontend/src/App.jsx` — ruta `/instructor/agenda-teoria`.

---

## Task 1: Migración de esquema

**Files:**
- Create: `supabase/migrations/20260728000001_agenda_teorica.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- =============================================================================
-- Migración: Agenda de teoría — salones, ciclo de vida de sesion_clase, firma
-- digital de asistencia, y reserva de salón para uso especial.
-- Aditiva: todas las columnas nuevas son nullable o tienen DEFAULT, así que las
-- filas de sesion_clase/asistencia_alumno que ya existen siguen funcionando.
-- =============================================================================

BEGIN;

-- Catálogo de salones (chico, sembrado a mano; agregar uno nuevo es un INSERT).
CREATE TABLE IF NOT EXISTS salon (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL,
  activo  BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO salon (nombre)
  SELECT x FROM (VALUES ('Salón Arrow'), ('Salón Tomahawk'), ('Salón Cap. Tito Gutiérrez')) AS v(x)
  WHERE NOT EXISTS (SELECT 1 FROM salon);

-- sesion_clase: horario en bloques + salón + examen + ciclo de vida real.
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS id_bloque      INTEGER REFERENCES bloque_horario(id_bloque);
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS id_bloque_fin  INTEGER REFERENCES bloque_horario(id_bloque);
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS id_salon       INTEGER REFERENCES salon(id);
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS examen         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS estado         VARCHAR(15) NOT NULL DEFAULT 'PROGRAMADA';
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS iniciada_en    TIMESTAMP;
ALTER TABLE sesion_clase ADD COLUMN IF NOT EXISTS cerrada_en     TIMESTAMP;

DO $$ BEGIN
  ALTER TABLE sesion_clase ADD CONSTRAINT sesion_clase_estado_check
    CHECK (estado IN ('PROGRAMADA','EN_CURSO','CERRADA','CANCELADA'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: toda fila que ya existía (de antes de este módulo, sin id_bloque) ya ocurrió.
UPDATE sesion_clase SET estado = 'CERRADA' WHERE id_bloque IS NULL AND estado = 'PROGRAMADA';

-- asistencia_alumno: firma digital del alumno confirmando que asistió.
ALTER TABLE asistencia_alumno ADD COLUMN IF NOT EXISTS firma_alumno TEXT;
ALTER TABLE asistencia_alumno ADD COLUMN IF NOT EXISTS firmado_en   TIMESTAMP;

-- Reserva de un salón para uso especial (sin clase real) — mismo concepto que reserva_aeronave.
CREATE TABLE IF NOT EXISTS reserva_salon (
  id            SERIAL PRIMARY KEY,
  id_salon      INTEGER NOT NULL REFERENCES salon(id),
  fecha         DATE NOT NULL,
  id_bloque     INTEGER NOT NULL REFERENCES bloque_horario(id_bloque),
  id_bloque_fin INTEGER REFERENCES bloque_horario(id_bloque),
  motivo        VARCHAR(20) NOT NULL DEFAULT 'OTRO'
                  CHECK (motivo IN ('REUNION','EVENTO','ADMINISTRATIVO','OTRO')),
  descripcion   VARCHAR(200),
  creado_por    INTEGER REFERENCES usuario(id_usuario),
  creado_en     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reserva_salon_fecha ON reserva_salon (id_salon, fecha);

COMMIT;

-- Verificación
SELECT id, nombre FROM salon ORDER BY id;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'sesion_clase' AND column_name IN
    ('id_bloque','id_bloque_fin','id_salon','examen','estado','iniciada_en','cerrada_en');
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'asistencia_alumno' AND column_name IN ('firma_alumno','firmado_en');
SELECT COUNT(*) AS legacy_cerradas FROM sesion_clase WHERE id_bloque IS NULL AND estado = 'CERRADA';
```

- [ ] **Step 2: Correrla contra Supabase**

Run: `cd legacy/CAA-backend && node run-sql.js "../../supabase/migrations/20260728000001_agenda_teorica.sql"`
Expected: las 4 consultas de verificación imprimen: 3 filas en `salon`, las 7 columnas nuevas de
`sesion_clase`, las 2 de `asistencia_alumno`, y `legacy_cerradas` ≥ 0 (coincide con el conteo de
sesiones que ya existían antes de esta migración).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260728000001_agenda_teorica.sql
git commit -m "$(cat <<'EOF'
feat(db): agenda de teoría — salones, ciclo de vida de sesion_clase, firma de asistencia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Helper de choques compartido

**Files:**
- Create: `legacy/CAA-backend/utils/aulaChoques.js`

- [ ] **Step 1: Escribir el helper**

Centraliza los 2 chequeos que se repiten en crear/editar/reasignar (salón y — para sesiones,
no para reservas — instructor cruzado vuelo↔teoría). Recibe un `client` de transacción abierta.

```javascript
const db = require("../config/db");

// Choque de salón: mismo salón, misma fecha, rango de bloques que se solapa,
// contra otra sesion_clase no cancelada o contra una reserva_salon.
// `excluirIdSesion` se usa al editar/reasignar, para no chocar contra sí misma.
async function choqueSalon(client, { id_salon, fecha, id_bloque, id_bloque_fin, excluirIdSesion = null }) {
  const fin = id_bloque_fin || id_bloque;

  const sesionOcup = await client.query(
    `SELECT sc.id, c.codigo AS curso_codigo, u_ins.nombre AS instructor_nombre
       FROM sesion_clase sc
       JOIN curso c ON c.id = sc.id_curso
       LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
       LEFT JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario
      WHERE sc.id_salon = $1 AND sc.fecha = $2 AND sc.estado <> 'CANCELADA'
        AND ($5::int IS NULL OR sc.id <> $5)
        AND NOT ($4 < sc.id_bloque OR $3 > COALESCE(sc.id_bloque_fin, sc.id_bloque))
      LIMIT 1`,
    [id_salon, fecha, id_bloque, fin, excluirIdSesion]
  );
  if (sesionOcup.rows.length) {
    const r = sesionOcup.rows[0];
    throw Object.assign(
      new Error(`Ese salón ya tiene una clase de ${r.instructor_nombre || "otro instructor"} (${r.curso_codigo}) en ese horario.`),
      { code: "CHOQUE_SALON" }
    );
  }

  const reservaOcup = await client.query(
    `SELECT id, motivo FROM reserva_salon
      WHERE id_salon = $1 AND fecha = $2
        AND NOT ($4 < id_bloque OR $3 > COALESCE(id_bloque_fin, id_bloque))
      LIMIT 1`,
    [id_salon, fecha, id_bloque, fin]
  );
  if (reservaOcup.rows.length) {
    throw Object.assign(
      new Error(`Ese salón está reservado (${reservaOcup.rows[0].motivo}) en ese horario.`),
      { code: "CHOQUE_SALON" }
    );
  }
}

// Choque cruzado vuelo↔teoría: el mismo instructor no puede tener un vuelo Y
// una clase de teoría al mismo tiempo (ni dos clases de teoría a la vez).
async function choqueInstructor(client, { id_instructor, fecha, id_bloque, id_bloque_fin, excluirIdSesion = null }) {
  if (!id_instructor) return;
  const fin = id_bloque_fin || id_bloque;

  const otraClase = await client.query(
    `SELECT id FROM sesion_clase
      WHERE id_instructor = $1 AND fecha = $2 AND estado <> 'CANCELADA'
        AND ($5::int IS NULL OR id <> $5)
        AND NOT ($4 < id_bloque OR $3 > COALESCE(id_bloque_fin, id_bloque))
      LIMIT 1`,
    [id_instructor, fecha, id_bloque, fin, excluirIdSesion]
  );
  if (otraClase.rows.length) {
    throw Object.assign(new Error("Ese instructor ya tiene otra clase de teoría en ese horario."), { code: "CHOQUE_INSTRUCTOR" });
  }

  const vueloOcup = await client.query(
    `SELECT id_vuelo FROM vuelo
      WHERE id_instructor = $1 AND fecha_vuelo = $2 AND estado <> 'CANCELADO'
        AND NOT ($4 < id_bloque OR $3 > COALESCE(id_bloque_fin, id_bloque))
      LIMIT 1`,
    [id_instructor, fecha, id_bloque, fin]
  );
  if (vueloOcup.rows.length) {
    throw Object.assign(new Error("Ese instructor ya tiene un vuelo agendado en ese horario."), { code: "CHOQUE_INSTRUCTOR" });
  }
}

module.exports = { choqueSalon, choqueInstructor };
```

- [ ] **Step 2: Verificar sintaxis**

Run: `cd legacy/CAA-backend && node --check utils/aulaChoques.js`
Expected: sin salida (sin errores).

- [ ] **Step 3: Commit**

```bash
git add legacy/CAA-backend/utils/aulaChoques.js
git commit -m "$(cat <<'EOF'
feat(aula): helper compartido de choques (salón + instructor cruzado vuelo/teoría)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `crearSesion` extendido (bloque, salón, examen, alumnos elegidos)

**Files:**
- Modify: `legacy/CAA-backend/controllers/administracion/aulaVirtualController.js:152-188`

- [ ] **Step 1: Reemplazar `crearSesion`**

Reemplaza el bloque completo (líneas 152-188 del archivo actual) por esta versión. Cambios: recibe
`id_bloque`/`id_bloque_fin`/`id_salon`/`examen`/`alumnos` (array de `id_alumno`), valida choques, y
precarga `asistencia_alumno` SOLO con los alumnos elegidos (ya no con todo el curso).

```javascript
const { choqueSalon, choqueInstructor } = require("../../utils/aulaChoques");

exports.crearSesion = async (req, res) => {
  const client = await db.connect();
  try {
    const {
      id_curso, id_unidad, fecha, tema, id_bloque, id_bloque_fin, id_salon, examen, alumnos,
    } = req.body;
    let { id_instructor } = req.body;
    if (!id_curso) return res.status(400).json({ ok: false, message: "id_curso requerido" });
    if (!fecha || !id_bloque || !id_salon) {
      return res.status(400).json({ ok: false, message: "fecha, id_bloque y id_salon son requeridos" });
    }
    if (!Array.isArray(alumnos) || alumnos.length === 0) {
      return res.status(400).json({ ok: false, message: "Elegí al menos un alumno para la clase" });
    }

    // Un INSTRUCTOR solo puede crear sesiones a su propio nombre (no spoofear
    // id_instructor por el body). Admin/Administración/Turno sí pueden asignar.
    if (req.user?.rol === "INSTRUCTOR") {
      id_instructor = await resolverIdInstructor(req.user.id_usuario);
      // Debe ser un curso que tiene asignado (mismo criterio que listCursos).
      const asign = await db.query(
        `SELECT 1 FROM instructor_curso WHERE id_instructor = $1 AND id_curso = $2`,
        [id_instructor, id_curso]
      );
      if (asign.rows.length === 0) {
        return res.status(403).json({ ok: false, message: "No tenés asignado ese curso." });
      }
    } else if (!id_instructor) {
      return res.status(400).json({ ok: false, message: "id_instructor requerido" });
    }

    // Los alumnos elegidos deben pertenecer al roster activo del curso.
    const roster = await db.query(
      `SELECT id_alumno FROM inscripcion_curso WHERE id_curso = $1 AND estado = 'ACTIVO' AND id_alumno = ANY($2::int[])`,
      [id_curso, alumnos]
    );
    if (roster.rows.length !== alumnos.length) {
      return res.status(400).json({ ok: false, message: "Uno o más alumnos no están inscritos activos en ese curso." });
    }

    await client.query("BEGIN");
    await choqueSalon(client, { id_salon, fecha, id_bloque, id_bloque_fin });
    await choqueInstructor(client, { id_instructor, fecha, id_bloque, id_bloque_fin });

    const r = await client.query(`
      INSERT INTO sesion_clase (id_curso, id_unidad, fecha, hora_inicio, hora_fin, tema, id_instructor, creado_por,
                                 id_bloque, id_bloque_fin, id_salon, examen, estado)
      VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7, $8, $9, $10, 'PROGRAMADA') RETURNING *
    `, [id_curso, id_unidad || null, fecha, tema || null, id_instructor, req.user?.id_usuario || null,
        id_bloque, id_bloque_fin || null, id_salon, examen === true]);

    await client.query(`
      INSERT INTO asistencia_alumno (id_sesion, id_alumno, estado, registrado_por)
      SELECT $1, x, 'PRESENTE', $2 FROM UNNEST($3::int[]) AS x
    `, [r.rows[0].id, req.user?.id_usuario || null, alumnos]);

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "CHOQUE_SALON" || e.code === "CHOQUE_INSTRUCTOR") {
      return res.status(409).json({ ok: false, message: e.message });
    }
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
```

- [ ] **Step 2: Verificar sintaxis**

Run: `cd legacy/CAA-backend && node --check controllers/administracion/aulaVirtualController.js`
Expected: sin salida.

- [ ] **Step 3: Verificación E2E contra producción**

Login como un instructor de teoría real (o de prueba) y como `u1` (ADMIN). Con el token de u1:

```bash
TOKEN=$(curl -s -X POST https://caaa-backend-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"u1","password":"demo123"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('token',''))")

# 1. Catálogo de salones (aún no existe el endpoint dedicado — usar query.js para el id).
node legacy/CAA-backend/query.js "SELECT id, nombre FROM salon" 2>/dev/null || \
  echo "(usar node run-sql.js/query.js con .env local si hace falta ver los ids)"

# 2. Crear sesión de prueba (ajustar id_curso/id_unidad/id_instructor a valores reales de la BD).
curl -s -X POST https://caaa-backend-production.up.railway.app/api/administracion/aula/sesiones \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id_curso":1,"fecha":"2026-08-15","id_bloque":3,"id_salon":1,"examen":true,"alumnos":[1],"id_instructor":1}'
```

Expected: `{"ok":true,"data":{...,"estado":"PROGRAMADA","examen":true,...}}`. Repetir la misma
llamada exacta una segunda vez → `409` con `"Ese salón ya tiene una clase..."`.

- [ ] **Step 4: Limpieza**

```bash
node legacy/CAA-backend/query.js "DELETE FROM asistencia_alumno WHERE id_sesion IN (SELECT id FROM sesion_clase WHERE fecha = '2026-08-15'); DELETE FROM sesion_clase WHERE fecha = '2026-08-15'"
```

(Si `query.js` es de solo lectura en este entorno, usar `run-sql.js` con un archivo temporal en el
scratchpad para el DELETE, o pedirle a Daniel/Samuel que lo corra desde el editor de Supabase.)

- [ ] **Step 5: Commit**

```bash
git add legacy/CAA-backend/controllers/administracion/aulaVirtualController.js
git commit -m "$(cat <<'EOF'
feat(aula): crearSesion agenda con bloque/salón/examen/alumnos elegidos y valida choques

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Editar y cancelar sesión

**Files:**
- Modify: `legacy/CAA-backend/controllers/administracion/aulaVirtualController.js` (agregar al
  final del archivo, después de `crearSesion`)

- [ ] **Step 1: Agregar `editarSesion` y `cancelarSesion`**

```javascript
// Solo se puede editar/cancelar mientras está PROGRAMADA (antes de iniciar).
// Mismo permiso que crear: instructor dueño + Admin/Administración/Turno.
async function assertPropiaOSStaff(req, sesion) {
  if (req.user?.rol === "INSTRUCTOR") {
    const idIns = await resolverIdInstructor(req.user.id_usuario);
    if (Number(sesion.id_instructor) !== Number(idIns)) {
      const e = new Error("No podés modificar la clase de otro instructor.");
      e.code = "FORBIDDEN";
      throw e;
    }
  }
}

exports.editarSesion = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { id_curso, id_unidad, fecha, tema, id_bloque, id_bloque_fin, id_salon, examen, alumnos } = req.body;

    const cur = await client.query(`SELECT * FROM sesion_clase WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    const sesion = cur.rows[0];
    if (sesion.estado !== "PROGRAMADA") {
      return res.status(400).json({ ok: false, message: "Solo se puede editar una clase que todavía no inició." });
    }
    await assertPropiaOSStaff(req, sesion);

    await client.query("BEGIN");
    await choqueSalon(client, { id_salon, fecha, id_bloque, id_bloque_fin, excluirIdSesion: Number(id) });
    await choqueInstructor(client, { id_instructor: sesion.id_instructor, fecha, id_bloque, id_bloque_fin, excluirIdSesion: Number(id) });

    const r = await client.query(`
      UPDATE sesion_clase SET id_curso=$1, id_unidad=$2, fecha=$3, tema=$4,
             id_bloque=$5, id_bloque_fin=$6, id_salon=$7, examen=$8
       WHERE id = $9 RETURNING *
    `, [id_curso, id_unidad || null, fecha, tema || null, id_bloque, id_bloque_fin || null, id_salon, examen === true, id]);

    if (Array.isArray(alumnos)) {
      await client.query(`DELETE FROM asistencia_alumno WHERE id_sesion = $1`, [id]);
      await client.query(`
        INSERT INTO asistencia_alumno (id_sesion, id_alumno, estado, registrado_por)
        SELECT $1, x, 'PRESENTE', $2 FROM UNNEST($3::int[]) AS x
      `, [id, req.user?.id_usuario || null, alumnos]);
    }

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "FORBIDDEN") return res.status(403).json({ ok: false, message: e.message });
    if (e.code === "CHOQUE_SALON" || e.code === "CHOQUE_INSTRUCTOR") {
      return res.status(409).json({ ok: false, message: e.message });
    }
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.cancelarSesion = async (req, res) => {
  try {
    const { id } = req.params;
    const cur = await db.query(`SELECT * FROM sesion_clase WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    if (cur.rows[0].estado !== "PROGRAMADA") {
      return res.status(400).json({ ok: false, message: "Solo se puede cancelar una clase que todavía no inició." });
    }
    await assertPropiaOSStaff(req, cur.rows[0]);
    await db.query(`UPDATE sesion_clase SET estado = 'CANCELADA' WHERE id = $1`, [id]);
    res.json({ ok: true, message: "Clase cancelada" });
  } catch (e) {
    if (e.code === "FORBIDDEN") return res.status(403).json({ ok: false, message: e.message });
    res.status(500).json({ ok: false, message: e.message });
  }
};
```

- [ ] **Step 2: Verificar sintaxis**

Run: `cd legacy/CAA-backend && node --check controllers/administracion/aulaVirtualController.js`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add legacy/CAA-backend/controllers/administracion/aulaVirtualController.js
git commit -m "$(cat <<'EOF'
feat(aula): editar y cancelar una sesión de teoría (solo mientras está PROGRAMADA)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Ciclo de vida — iniciar / cerrar + push

**Files:**
- Modify: `legacy/CAA-backend/utils/webpush.js:56-63` (agregar tipo a `TIPOS_PUSH`)
- Modify: `legacy/CAA-backend/controllers/administracion/aulaVirtualController.js` (agregar al final)

- [ ] **Step 1: Registrar el tipo de push nuevo**

En `TIPOS_PUSH` (línea ~59 de `utils/webpush.js`), agregar una fila al array existente:

```javascript
const TIPOS_PUSH = [
  { tipo: "CICLO_TURNO",   label: "Ciclo del turno (abrir/pausa/cambio/cierre)" },
  { tipo: "VUELO_ESTADO",  label: "Salida/regreso de hangar, vuelo completado" },
  { tipo: "TICKER",        label: "Aviso publicado en el ticker de Turno" },
  { tipo: "OPERACIONES",   label: "Abrir/cerrar operaciones (suspensión clima/NOTAM)" },
  { tipo: "TRIPULACION",   label: "Turno cambia la tripulación de un vuelo" },
  { tipo: "MANTENIMIENTO", label: "Aeronave entra/sale de mantenimiento imprevisto" },
  { tipo: "CLASE_TEORIA",  label: "Instructor de teoría inicia una clase" },
];
```

- [ ] **Step 2: Agregar `iniciarSesion` y `cerrarSesion`**

```javascript
const { notificarStaff } = require("../../utils/webpush");

exports.iniciarSesion = async (req, res) => {
  try {
    const { id } = req.params;
    const cur = await db.query(`
      SELECT sc.*, c.codigo AS curso_codigo, u.numero AS unidad_numero, u.nombre AS unidad_nombre,
             s.nombre AS salon_nombre, TRIM(ui.nombre || ' ' || COALESCE(ui.apellido,'')) AS instructor_nombre
        FROM sesion_clase sc
        JOIN curso c ON c.id = sc.id_curso
        LEFT JOIN unidad_teorica u ON u.id = sc.id_unidad
        LEFT JOIN salon s ON s.id = sc.id_salon
        LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
        LEFT JOIN usuario ui ON ui.id_usuario = i.id_usuario
       WHERE sc.id = $1
    `, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    const sesion = cur.rows[0];
    if (sesion.estado !== "PROGRAMADA") {
      return res.status(400).json({ ok: false, message: "La clase ya inició, cerró o fue cancelada." });
    }
    await assertPropiaOSStaff(req, sesion);

    await db.query(`UPDATE sesion_clase SET estado = 'EN_CURSO', iniciada_en = NOW() WHERE id = $1`, [id]);

    // Best-effort: nunca puede tumbar la acción si falla.
    notificarStaff({
      title: "Clase de teoría iniciada",
      body: `${sesion.salon_nombre} — ${sesion.instructor_nombre} inició ${sesion.curso_codigo}${sesion.unidad_nombre ? ` · ${sesion.unidad_nombre}` : ""}`,
    }, { excluirUid: req.user?.id_usuario, tipo: "CLASE_TEORIA" }).catch(() => {});

    res.json({ ok: true, message: "Clase iniciada" });
  } catch (e) {
    if (e.code === "FORBIDDEN") return res.status(403).json({ ok: false, message: e.message });
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.cerrarSesion = async (req, res) => {
  try {
    const { id } = req.params;
    const cur = await db.query(`SELECT * FROM sesion_clase WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    if (cur.rows[0].estado !== "EN_CURSO") {
      return res.status(400).json({ ok: false, message: "Solo se puede cerrar una clase que está en curso." });
    }
    await assertPropiaOSStaff(req, cur.rows[0]);
    await db.query(`UPDATE sesion_clase SET estado = 'CERRADA', cerrada_en = NOW() WHERE id = $1`, [id]);
    res.json({ ok: true, message: "Clase cerrada — queda pendiente de firma para los alumnos presentes." });
  } catch (e) {
    if (e.code === "FORBIDDEN") return res.status(403).json({ ok: false, message: e.message });
    res.status(500).json({ ok: false, message: e.message });
  }
};
```

Nota: el instructor ajusta presente/ausente/tarde/justificado ANTES de cerrar usando el endpoint
ya existente `POST /aula/sesiones/:id_sesion/asistencia` (sin cambios) — `cerrarSesion` es
solamente el paso final que confirma y habilita la firma.

- [ ] **Step 3: Verificar sintaxis**

Run: `cd legacy/CAA-backend && node --check utils/webpush.js && node --check controllers/administracion/aulaVirtualController.js`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add legacy/CAA-backend/utils/webpush.js legacy/CAA-backend/controllers/administracion/aulaVirtualController.js
git commit -m "$(cat <<'EOF'
feat(aula): iniciar/cerrar una clase de teoría, con push best-effort al iniciar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Firma de asistencia (alumno) + reasignar salón

**Files:**
- Modify: `legacy/CAA-backend/controllers/alumno/alumnoVueloController.js` (agregar al final)
- Modify: `legacy/CAA-backend/controllers/administracion/aulaVirtualController.js` (agregar al final)

- [ ] **Step 1: `firmarAsistencia` (alumno)**

En `alumnoVueloController.js`, agregar:

```javascript
exports.firmarAsistenciaClase = catchAsync(async (req, res) => {
  const { id_sesion } = req.params;
  const { firma } = req.body;
  if (!firma) return res.status(400).json({ message: "Falta la firma" });

  const alRes = await db.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [req.user.id_usuario]);
  const idAlumno = alRes.rows[0]?.id_alumno;
  if (!idAlumno) return res.status(404).json({ message: "Alumno no encontrado" });

  const fila = await db.query(
    `SELECT a.id, a.estado, sc.estado AS estado_sesion
       FROM asistencia_alumno a
       JOIN sesion_clase sc ON sc.id = a.id_sesion
      WHERE a.id_sesion = $1 AND a.id_alumno = $2`,
    [id_sesion, idAlumno]
  );
  if (fila.rows.length === 0) return res.status(404).json({ message: "Esta clase no te corresponde" });
  const asistencia = fila.rows[0];
  if (asistencia.estado_sesion !== "CERRADA") {
    return res.status(400).json({ message: "La clase todavía no cerró" });
  }
  if (asistencia.estado === "AUSENTE") {
    return res.status(400).json({ message: "No podés firmar una clase donde quedaste marcado ausente" });
  }

  await db.query(
    `UPDATE asistencia_alumno SET firma_alumno = $1, firmado_en = NOW() WHERE id = $2`,
    [firma, asistencia.id]
  );
  res.json({ message: "Asistencia firmada" });
});
```

- [ ] **Step 2: `reasignarSalon` (Admin/Administración/Turno)**

En `aulaVirtualController.js`, agregar:

```javascript
exports.reasignarSalon = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { id_salon } = req.body;
    if (!id_salon) return res.status(400).json({ ok: false, message: "id_salon requerido" });

    const cur = await client.query(`SELECT * FROM sesion_clase WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    const sesion = cur.rows[0];
    if (!["PROGRAMADA", "EN_CURSO"].includes(sesion.estado)) {
      return res.status(400).json({ ok: false, message: "Solo se puede reasignar salón mientras la clase está programada o en curso." });
    }

    await client.query("BEGIN");
    await choqueSalon(client, {
      id_salon, fecha: sesion.fecha, id_bloque: sesion.id_bloque, id_bloque_fin: sesion.id_bloque_fin,
      excluirIdSesion: Number(id),
    });
    const r = await client.query(`UPDATE sesion_clase SET id_salon = $1 WHERE id = $2 RETURNING *`, [id_salon, id]);
    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "CHOQUE_SALON") return res.status(409).json({ ok: false, message: e.message });
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
```

- [ ] **Step 3: Verificar sintaxis**

Run: `cd legacy/CAA-backend && node --check controllers/alumno/alumnoVueloController.js && node --check controllers/administracion/aulaVirtualController.js`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add legacy/CAA-backend/controllers/alumno/alumnoVueloController.js legacy/CAA-backend/controllers/administracion/aulaVirtualController.js
git commit -m "$(cat <<'EOF'
feat(aula): el alumno firma su asistencia; Turno/Admin reasignan el salón de una clase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Salones — catálogo, disponibilidad, roster de curso, y ocupación (widget)

**Files:**
- Modify: `legacy/CAA-backend/controllers/administracion/aulaVirtualController.js` (agregar al final)
- Modify: `legacy/CAA-backend/controllers/programacionController.js` (agregar al final)

- [ ] **Step 1: `listSalones`, `disponibilidadSalones`, `rosterCurso`**

En `aulaVirtualController.js`:

```javascript
exports.listSalones = async (req, res) => {
  try {
    const r = await db.query(`SELECT id, nombre FROM salon WHERE activo = true ORDER BY id`);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Para el picker del formulario de agendar: libre/ocupado (y por quién) en un
// horario dado. Mismo patrón que getAeronavesDisponibles.
exports.disponibilidadSalones = async (req, res) => {
  try {
    const { fecha, id_bloque, id_bloque_fin } = req.query;
    if (!fecha || !id_bloque) return res.status(400).json({ ok: false, message: "fecha e id_bloque son requeridos" });
    const fin = Number(id_bloque_fin || id_bloque);

    const r = await db.query(`
      SELECT s.id, s.nombre,
             sc.id IS NOT NULL AS ocupado_clase, c.codigo AS curso_codigo,
             rs.id IS NOT NULL AS ocupado_reserva, rs.motivo
        FROM salon s
        LEFT JOIN sesion_clase sc ON sc.id_salon = s.id AND sc.fecha = $1 AND sc.estado <> 'CANCELADA'
          AND NOT ($3 < sc.id_bloque OR $2 > COALESCE(sc.id_bloque_fin, sc.id_bloque))
        LEFT JOIN curso c ON c.id = sc.id_curso
        LEFT JOIN reserva_salon rs ON rs.id_salon = s.id AND rs.fecha = $1
          AND NOT ($3 < rs.id_bloque OR $2 > COALESCE(rs.id_bloque_fin, rs.id_bloque))
       WHERE s.activo = true
       ORDER BY s.id
    `, [fecha, id_bloque, fin]);

    res.json({
      ok: true,
      data: r.rows.map((row) => ({
        id: row.id, nombre: row.nombre,
        libre: !row.ocupado_clase && !row.ocupado_reserva,
        motivo: row.ocupado_clase ? `Clase de ${row.curso_codigo}` : row.ocupado_reserva ? `Reservado (${row.motivo})` : null,
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Roster de alumnos activos de un curso, para el multi-select del formulario de agendar.
exports.rosterCurso = async (req, res) => {
  try {
    const { id_curso } = req.params;
    const r = await db.query(`
      SELECT ic.id_alumno, TRIM(u.nombre || ' ' || COALESCE(u.apellido, '')) AS nombre
        FROM inscripcion_curso ic
        JOIN alumno a ON a.id_alumno = ic.id_alumno
        JOIN usuario u ON u.id_usuario = a.id_usuario
       WHERE ic.id_curso = $1 AND ic.estado = 'ACTIVO'
       ORDER BY u.nombre
    `, [id_curso]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Para el selector de Turno al agendar una clase "a nombre de": instructores de
// TEORÍA activos. OJO: `adminVueloController.getInstructoresActivos` (ya usado
// para vuelos) filtra `es_instructor_vuelo=true` — un instructor solo-teoría
// nunca aparecería ahí, por eso este es un endpoint nuevo y separado.
exports.listInstructoresTeoria = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT i.id_instructor, TRIM(u.nombre || ' ' || COALESCE(u.apellido, '')) AS nombre
        FROM instructor i
        JOIN usuario u ON u.id_usuario = i.id_usuario
       WHERE i.activo = true AND i.es_instructor_teoria = true
       ORDER BY u.nombre
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
```

- [ ] **Step 2: `getSalonesOcupacion`**

En `programacionController.js`, agregar al final:

```javascript
// Widget de ocupación de salones — "ahora mismo", reusado en Proyección,
// Turno, Programación, Admin y la Agenda del instructor. El estado se deriva
// de sesion_clase.estado (EN_CURSO manda, no el bloque programado), no de la
// hora del reloj.
exports.getSalonesOcupacion = async (req, res) => {
  try {
    const hoy = await db.query(`SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::date AS d`);
    const fecha = hoy.rows[0].d;

    const r = await db.query(`
      SELECT s.id, s.nombre,
             en_curso.curso_codigo AS ec_curso, en_curso.unidad_nombre AS ec_unidad, en_curso.instructor_nombre AS ec_instructor,
             reserva.motivo AS rs_motivo, reserva.descripcion AS rs_descripcion,
             proxima.hora_inicio AS px_hora, proxima.curso_codigo AS px_curso, proxima.unidad_nombre AS px_unidad, proxima.instructor_nombre AS px_instructor
        FROM salon s
        LEFT JOIN LATERAL (
          SELECT c.codigo AS curso_codigo, u.nombre AS unidad_nombre,
                 TRIM(ui.nombre || ' ' || COALESCE(ui.apellido,'')) AS instructor_nombre
            FROM sesion_clase sc
            JOIN curso c ON c.id = sc.id_curso
            LEFT JOIN unidad_teorica u ON u.id = sc.id_unidad
            LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
            LEFT JOIN usuario ui ON ui.id_usuario = i.id_usuario
           WHERE sc.id_salon = s.id AND sc.fecha = $1 AND sc.estado = 'EN_CURSO'
           LIMIT 1
        ) en_curso ON true
        LEFT JOIN LATERAL (
          SELECT motivo, descripcion FROM reserva_salon rs2
            JOIN bloque_horario bh ON bh.id_bloque = rs2.id_bloque
           WHERE rs2.id_salon = s.id AND rs2.fecha = $1
             AND bh.hora_inicio <= (NOW() AT TIME ZONE 'America/El_Salvador')::time
             AND COALESCE((SELECT hora_fin FROM bloque_horario WHERE id_bloque = rs2.id_bloque_fin), bh.hora_fin)
                 >= (NOW() AT TIME ZONE 'America/El_Salvador')::time
           LIMIT 1
        ) reserva ON true
        LEFT JOIN LATERAL (
          SELECT bh.hora_inicio, c.codigo AS curso_codigo, u.nombre AS unidad_nombre,
                 TRIM(ui.nombre || ' ' || COALESCE(ui.apellido,'')) AS instructor_nombre
            FROM sesion_clase sc
            JOIN bloque_horario bh ON bh.id_bloque = sc.id_bloque
            JOIN curso c ON c.id = sc.id_curso
            LEFT JOIN unidad_teorica u ON u.id = sc.id_unidad
            LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
            LEFT JOIN usuario ui ON ui.id_usuario = i.id_usuario
           WHERE sc.id_salon = s.id AND sc.fecha = $1 AND sc.estado = 'PROGRAMADA'
             AND bh.hora_inicio > (NOW() AT TIME ZONE 'America/El_Salvador')::time
           ORDER BY bh.hora_inicio LIMIT 1
        ) proxima ON true
       WHERE s.activo = true
       ORDER BY s.id
    `, [fecha]);

    const data = r.rows.map((row) => {
      if (row.ec_curso) {
        return { id: row.id, nombre: row.nombre, estado: "EN_SESION", instructor: row.ec_instructor, curso: row.ec_curso, unidad: row.ec_unidad };
      }
      if (row.rs_motivo) {
        return { id: row.id, nombre: row.nombre, estado: "RESERVADO", motivo: row.rs_motivo, descripcion: row.rs_descripcion };
      }
      if (row.px_curso) {
        return { id: row.id, nombre: row.nombre, estado: "PROXIMA", hora: row.px_hora, instructor: row.px_instructor, curso: row.px_curso, unidad: row.px_unidad };
      }
      return { id: row.id, nombre: row.nombre, estado: "LIBRE" };
    });

    res.json(data);
  } catch (e) {
    console.error("getSalonesOcupacion:", e);
    res.status(500).json({ message: "Error al obtener ocupación de salones" });
  }
};
```

- [ ] **Step 3: Verificar sintaxis**

Run: `cd legacy/CAA-backend && node --check controllers/administracion/aulaVirtualController.js && node --check controllers/programacionController.js`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add legacy/CAA-backend/controllers/administracion/aulaVirtualController.js legacy/CAA-backend/controllers/programacionController.js
git commit -m "$(cat <<'EOF'
feat(aula): catálogo/disponibilidad de salones, roster de curso, y endpoint de ocupación en vivo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `reserva_salon` (CRUD, uso especial)

**Files:**
- Modify: `legacy/CAA-backend/controllers/administracion/aulaVirtualController.js` (agregar al final)

- [ ] **Step 1: CRUD completo**

```javascript
const MOTIVOS_SALON = ["REUNION", "EVENTO", "ADMINISTRATIVO", "OTRO"];

exports.listReservasSalon = async (req, res) => {
  try {
    const { fecha } = req.query;
    const params = [];
    let where = "";
    if (fecha) { params.push(fecha); where = "WHERE rs.fecha = $1"; }
    const r = await db.query(`
      SELECT rs.id, rs.id_salon, s.nombre AS salon_nombre, rs.fecha, rs.id_bloque, rs.id_bloque_fin,
             rs.motivo, rs.descripcion
        FROM reserva_salon rs
        JOIN salon s ON s.id = rs.id_salon
        ${where}
       ORDER BY rs.fecha, rs.id_bloque
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.crearReservaSalon = async (req, res) => {
  try {
    const { id_salon, fecha, id_bloque, id_bloque_fin, motivo, descripcion } = req.body;
    if (!id_salon || !fecha || !id_bloque) {
      return res.status(400).json({ ok: false, message: "id_salon, fecha e id_bloque son requeridos" });
    }
    const motivoFinal = MOTIVOS_SALON.includes(motivo) ? motivo : "OTRO";
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await choqueSalon(client, { id_salon, fecha, id_bloque, id_bloque_fin });
      const ins = await client.query(`
        INSERT INTO reserva_salon (id_salon, fecha, id_bloque, id_bloque_fin, motivo, descripcion, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
      `, [id_salon, fecha, id_bloque, id_bloque_fin || null, motivoFinal, descripcion || null, req.user?.id_usuario || null]);
      await client.query("COMMIT");
      res.json({ ok: true, id: ins.rows[0].id });
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code === "CHOQUE_SALON") return res.status(409).json({ ok: false, message: e.message });
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.eliminarReservaSalon = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query(`DELETE FROM reserva_salon WHERE id = $1 RETURNING id`, [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, message: "Reserva no encontrada" });
    res.json({ ok: true, message: "Reserva eliminada" });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
```

- [ ] **Step 2: Verificar sintaxis**

Run: `cd legacy/CAA-backend && node --check controllers/administracion/aulaVirtualController.js`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add legacy/CAA-backend/controllers/administracion/aulaVirtualController.js
git commit -m "$(cat <<'EOF'
feat(aula): reserva de salón para uso especial (CRUD), igual que reserva de aeronave

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Rutas (roles, incluido TURNO)

**Files:**
- Modify: `legacy/CAA-backend/routes/administracionRoutes.js`
- Modify: `legacy/CAA-backend/routes/programacionRoutes.js`
- Modify: `legacy/CAA-backend/routes/alumnoRoutes.js`

- [ ] **Step 1: Agregar las rutas de `/aula/*` en `administracionRoutes.js`**

Justo después de la línea `router.post("/aula/sesiones/:id_sesion/asistencia", ...)` (línea ~196),
agregar (nota el array `AULA_TURNO` nuevo, separado de `AULA_WRITE`, para no darle a Turno acceso
a unidades/evaluaciones/material que no le corresponden):

```javascript
const AULA_TURNO = ["ADMINISTRACION", "ADMIN", "INSTRUCTOR", "TURNO"];

router.patch("/aula/sesiones/:id",              roleMiddleware(AULA_TURNO), aula.editarSesion);
router.post("/aula/sesiones/:id/cancelar",      roleMiddleware(AULA_TURNO), aula.cancelarSesion);
router.post("/aula/sesiones/:id/iniciar",       roleMiddleware(AULA_TURNO), aula.iniciarSesion);
router.post("/aula/sesiones/:id/cerrar",        roleMiddleware(AULA_TURNO), aula.cerrarSesion);
router.patch("/aula/sesiones/:id/salon",        roleMiddleware(["ADMINISTRACION","ADMIN","TURNO"]), aula.reasignarSalon);
router.get("/aula/salones",                     roleMiddleware(AULA_TURNO), aula.listSalones);
router.get("/aula/salones/disponibilidad",      roleMiddleware(AULA_TURNO), aula.disponibilidadSalones);
router.get("/aula/cursos/:id_curso/roster",     roleMiddleware(AULA_TURNO), aula.rosterCurso);
router.get("/aula/instructores",                roleMiddleware(["ADMINISTRACION","ADMIN","TURNO"]), aula.listInstructoresTeoria);
router.get("/aula/reservas-salon",              roleMiddleware(["ADMINISTRACION","ADMIN","TURNO"]), aula.listReservasSalon);
router.post("/aula/reservas-salon",             roleMiddleware(["ADMINISTRACION","ADMIN","TURNO"]), aula.crearReservaSalon);
router.delete("/aula/reservas-salon/:id",       roleMiddleware(["ADMINISTRACION","ADMIN","TURNO"]), aula.eliminarReservaSalon);
```

También cambiar la línea existente `router.post("/aula/sesiones", roleMiddleware(AULA_WRITE), aula.crearSesion);`
por `router.post("/aula/sesiones", roleMiddleware(AULA_TURNO), aula.crearSesion);` (Turno también
crea clases a nombre de un instructor).

- [ ] **Step 2: Ruta de ocupación en `programacionRoutes.js`**

Agregar junto a las demás rutas gated por `proyeccionMiddleware` (`estado-flota`,
`mantenimiento-resumen`):

```javascript
const { getSalonesOcupacion } = require("../controllers/programacionController");
// (agregar getSalonesOcupacion a la destructuración del require existente arriba)

router.get("/salones-ocupacion", proyeccionMiddleware, getSalonesOcupacion);
```

- [ ] **Step 3: Ruta de firma en `alumnoRoutes.js`**

Buscar el bloque de rutas de vuelo del alumno y agregar:

```javascript
router.post("/mis-clases/:id_sesion/firmar", alumnoAccess, alumnoVuelo.firmarAsistenciaClase);
```

(usar el mismo middleware `alumnoAccess` que ya protege `/mi-horario`).

- [ ] **Step 4: Verificar sintaxis**

Run:
```bash
cd legacy/CAA-backend
node --check routes/administracionRoutes.js
node --check routes/programacionRoutes.js
node --check routes/alumnoRoutes.js
```
Expected: sin salida en las 3.

- [ ] **Step 5: Commit**

```bash
git add legacy/CAA-backend/routes/administracionRoutes.js legacy/CAA-backend/routes/programacionRoutes.js legacy/CAA-backend/routes/alumnoRoutes.js
git commit -m "$(cat <<'EOF'
feat(aula): wiring de rutas — Turno gana paridad con lo que ya hace con aviones

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Extender `GET /alumno/mis-clases`

**Files:**
- Modify: `legacy/CAA-backend/controllers/alumno/alumnoVueloController.js` (buscar `getMisClases` —
  o el nombre real de la función detrás de `/alumno/mis-clases`; si vive en otro controller,
  aplicar el mismo cambio ahí)

- [ ] **Step 1: Confirmado — la función vive en `alumnoVueloController.js`**

`legacy/CAA-backend/routes/alumnoRoutes.js:62` registra
`router.get("/mis-clases", alumnoAccess, alumnoVuelo.getMisClases);` — `alumnoVuelo` es el require
de `alumnoVueloController.js`, mismo archivo que ya se tocó en los Tasks 6 y 9.

- [ ] **Step 2: Reescribir la query para incluir salón, examen, hora del bloque y estado de firma**

```javascript
exports.getMisClases = catchAsync(async (req, res) => {
  const alRes = await db.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [req.user.id_usuario]);
  const idAlumno = alRes.rows[0]?.id_alumno;
  if (!idAlumno) return res.json([]);

  const r = await db.query(`
    SELECT sc.id, sc.fecha, sc.tema, sc.examen, sc.estado AS estado_sesion,
           bh.hora_inicio, COALESCE(bh2.hora_fin, bh.hora_fin) AS hora_fin,
           c.codigo AS curso_codigo, u.nombre AS unidad_nombre,
           s.nombre AS salon_nombre,
           TRIM(ui.nombre || ' ' || COALESCE(ui.apellido,'')) AS instructor_nombre,
           aa.estado AS mi_asistencia, aa.firma_alumno IS NOT NULL AS ya_firme
      FROM asistencia_alumno aa
      JOIN sesion_clase sc ON sc.id = aa.id_sesion
      LEFT JOIN bloque_horario bh  ON bh.id_bloque = sc.id_bloque
      LEFT JOIN bloque_horario bh2 ON bh2.id_bloque = sc.id_bloque_fin
      JOIN curso c ON c.id = sc.id_curso
      LEFT JOIN unidad_teorica u ON u.id = sc.id_unidad
      LEFT JOIN salon s ON s.id = sc.id_salon
      LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
      LEFT JOIN usuario ui ON ui.id_usuario = i.id_usuario
     WHERE aa.id_alumno = $1 AND sc.estado <> 'CANCELADA'
     ORDER BY sc.fecha DESC, bh.hora_inicio DESC NULLS LAST
  `, [idAlumno]);

  res.json(r.rows);
});
```

- [ ] **Step 3: Verificar sintaxis**

Run: `cd legacy/CAA-backend && node --check controllers/alumno/alumnoVueloController.js`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add legacy/CAA-backend/controllers/alumno/alumnoVueloController.js
git commit -m "$(cat <<'EOF'
feat(alumno): mis-clases incluye salón, examen, hora real y estado de firma

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Servicios frontend (API)

**Files:**
- Modify: `CAA-frontend/src/services/administracionApi.js`
- Modify: `CAA-frontend/src/services/alumnoApi.js`
- Modify: `CAA-frontend/src/services/programacionApi.js`

- [ ] **Step 1: `administracionApi.js`**

Agregar al final del archivo:

```javascript
// ── Agenda de teoría (salones, ciclo de vida, reservas) ─────────────────────
export const getSalones = async () => (await axios.get(`${BASE}/aula/salones`)).data;

export const getDisponibilidadSalones = async (fecha, id_bloque, id_bloque_fin) =>
  (await axios.get(`${BASE}/aula/salones/disponibilidad`, { params: { fecha, id_bloque, id_bloque_fin } })).data;

export const getRosterCurso = async (id_curso) =>
  (await axios.get(`${BASE}/aula/cursos/${id_curso}/roster`)).data;

export const getInstructoresTeoria = async () => (await axios.get(`${BASE}/aula/instructores`)).data;

export const editarSesionClase = async (id, payload) =>
  (await axios.patch(`${BASE}/aula/sesiones/${id}`, payload)).data;

export const cancelarSesionClase = async (id) =>
  (await axios.post(`${BASE}/aula/sesiones/${id}/cancelar`)).data;

export const iniciarSesionClase = async (id) =>
  (await axios.post(`${BASE}/aula/sesiones/${id}/iniciar`)).data;

export const cerrarSesionClase = async (id) =>
  (await axios.post(`${BASE}/aula/sesiones/${id}/cerrar`)).data;

export const reasignarSalonSesion = async (id, id_salon) =>
  (await axios.patch(`${BASE}/aula/sesiones/${id}/salon`, { id_salon })).data;

export const getReservasSalon = async (fecha) =>
  (await axios.get(`${BASE}/aula/reservas-salon`, { params: { fecha } })).data;

export const crearReservaSalon = async (payload) =>
  (await axios.post(`${BASE}/aula/reservas-salon`, payload)).data;

export const eliminarReservaSalon = async (id) =>
  (await axios.delete(`${BASE}/aula/reservas-salon/${id}`)).data;
```

- [ ] **Step 2: `alumnoApi.js`**

Agregar al final:

```javascript
export const firmarAsistenciaClase = async (id_sesion, firma) => {
  const res = await axios.post(`${API_URL}/alumno/mis-clases/${id_sesion}/firmar`, { firma });
  return res.data;
};
```

- [ ] **Step 3: `programacionApi.js`**

Agregar al final:

```javascript
export const getSalonesOcupacion = async () =>
  (await axios.get(`${API_URL}/programacion/salones-ocupacion`)).data;
```

- [ ] **Step 4: Verificar que compila**

Run: `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build 2>&1 | tail -10`
Expected: `✓ built in ...` sin errores (los exports nuevos no tienen todavía consumidores, así que
no cambia el bundle de forma visible, pero confirma que no hay errores de sintaxis).

- [ ] **Step 5: Commit**

```bash
git add CAA-frontend/src/services/administracionApi.js CAA-frontend/src/services/alumnoApi.js CAA-frontend/src/services/programacionApi.js
git commit -m "$(cat <<'EOF'
feat(front): servicios de API para la agenda de teoría

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Agenda del instructor — página + modal de agendar

**Files:**
- Create: `CAA-frontend/src/components/AgendarClaseModal/AgendarClaseModal.jsx`
- Create: `CAA-frontend/src/components/AgendarClaseModal/AgendarClaseModal.css`
- Create: `CAA-frontend/src/pages/Instructor/AgendaTeorica.jsx`
- Create: `CAA-frontend/src/pages/Instructor/AgendaTeorica.css`
- Modify: `CAA-frontend/src/App.jsx` (nueva ruta)

- [ ] **Step 1: `AgendarClaseModal.jsx`**

Modal simple (curso → unidad → fecha → bloque(s) → salón con disponibilidad → examen → alumnos
con checkboxes → tema). `instructoresPicker=true` habilita el selector de instructor (lo usa
Turno); si es `false`/omitido, se agenda a nombre del usuario logueado.

```javascript
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getDisponibilidadSalones, getRosterCurso, editarSesionClase, getAulaUnidades,
} from "../../services/administracionApi";
import "./AgendarClaseModal.css";

export default function AgendarClaseModal({
  cursos = [], bloques = [], instructores = [], instructoresPicker = false,
  crearFn, sesion = null, // si viene `sesion`, es edición (usa editarSesionClase)
  onClose, onSaved,
}) {
  const [idCurso, setIdCurso] = useState(sesion?.id_curso ? String(sesion.id_curso) : "");
  const [unidades, setUnidades] = useState([]);
  const [idUnidad, setIdUnidad] = useState(sesion?.id_unidad ? String(sesion.id_unidad) : "");
  const [fecha, setFecha] = useState(sesion?.fecha?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [idBloque, setIdBloque] = useState(sesion?.id_bloque ? String(sesion.id_bloque) : String(bloques[0]?.id_bloque || ""));
  const [idBloqueFin, setIdBloqueFin] = useState(sesion?.id_bloque_fin ? String(sesion.id_bloque_fin) : "");
  const [idSalon, setIdSalon] = useState(sesion?.id_salon ? String(sesion.id_salon) : "");
  const [salones, setSalones] = useState([]);
  const [examen, setExamen] = useState(!!sesion?.examen);
  const [tema, setTema] = useState(sesion?.tema || "");
  const [idInstructor, setIdInstructor] = useState(sesion?.id_instructor ? String(sesion.id_instructor) : "");
  const [roster, setRoster] = useState([]);
  const [alumnosSel, setAlumnosSel] = useState([]);
  const [filtroAlumno, setFiltroAlumno] = useState("");
  const [saving, setSaving] = useState(false);

  // Unidades del curso elegido — reusa el endpoint ya existente de Aula Virtual
  // (GET /administracion/aula/unidades?id_curso=), no hace falta uno nuevo.
  useEffect(() => {
    if (!idCurso) { setUnidades([]); return; }
    getAulaUnidades({ id_curso: idCurso })
      .then((r) => setUnidades(r?.data || []))
      .catch(() => setUnidades([]));
  }, [idCurso]);

  useEffect(() => {
    if (!idCurso) { setRoster([]); return; }
    getRosterCurso(idCurso).then((r) => setRoster(r?.data || [])).catch(() => setRoster([]));
  }, [idCurso]);

  useEffect(() => {
    if (!fecha || !idBloque) { setSalones([]); return; }
    getDisponibilidadSalones(fecha, idBloque, idBloqueFin || idBloque)
      .then((r) => setSalones(r?.data || []))
      .catch(() => setSalones([]));
  }, [fecha, idBloque, idBloqueFin]);

  const rosterFiltrado = useMemo(
    () => roster.filter((a) => a.nombre.toLowerCase().includes(filtroAlumno.toLowerCase())),
    [roster, filtroAlumno]
  );

  const toggleAlumno = (id_alumno) => {
    setAlumnosSel((prev) =>
      prev.includes(id_alumno) ? prev.filter((x) => x !== id_alumno) : [...prev, id_alumno]
    );
  };

  const puedeGuardar = idCurso && fecha && idBloque && idSalon && alumnosSel.length > 0 &&
    (instructoresPicker ? idInstructor : true);

  const handleGuardar = async () => {
    setSaving(true);
    const payload = {
      id_curso: Number(idCurso), id_unidad: idUnidad ? Number(idUnidad) : null,
      fecha, id_bloque: Number(idBloque), id_bloque_fin: idBloqueFin ? Number(idBloqueFin) : null,
      id_salon: Number(idSalon), examen, tema: tema || null,
      alumnos: alumnosSel,
      ...(instructoresPicker ? { id_instructor: Number(idInstructor) } : {}),
    };
    try {
      if (sesion) await editarSesionClase(sesion.id, payload);
      else await crearFn(payload);
      toast.success(sesion ? "Clase actualizada" : "Clase agendada");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar la clase");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="acm-overlay" onClick={onClose}>
      <div className="acm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="acm-header">
          <h3>{sesion ? "Editar clase" : "Agendar clase"}</h3>
          <button className="acm-close" onClick={onClose}>×</button>
        </div>

        {instructoresPicker && (
          <label className="acm-field">
            <span>Instructor</span>
            <select value={idInstructor} onChange={(e) => setIdInstructor(e.target.value)}>
              <option value="">Elegir…</option>
              {instructores.map((i) => (
                <option key={i.id_instructor} value={i.id_instructor}>{i.nombre}</option>
              ))}
            </select>
          </label>
        )}

        <label className="acm-field">
          <span>Curso</span>
          <select value={idCurso} onChange={(e) => { setIdCurso(e.target.value); setIdUnidad(""); setAlumnosSel([]); }}>
            <option value="">Elegir…</option>
            {cursos.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
        </label>

        <label className="acm-field">
          <span>Unidad (opcional)</span>
          <select value={idUnidad} onChange={(e) => setIdUnidad(e.target.value)} disabled={!idCurso}>
            <option value="">Sin unidad específica</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>U{u.numero} — {u.nombre}</option>)}
          </select>
        </label>

        <div className="acm-row">
          <label className="acm-field">
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="acm-field">
            <span>Bloque inicio</span>
            <select value={idBloque} onChange={(e) => setIdBloque(e.target.value)}>
              {bloques.map((b) => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_inicio?.slice(0,5)}</option>)}
            </select>
          </label>
          <label className="acm-field">
            <span>Bloque fin (si dura más de uno)</span>
            <select value={idBloqueFin} onChange={(e) => setIdBloqueFin(e.target.value)}>
              <option value="">Igual al inicio</option>
              {bloques.filter((b) => Number(b.id_bloque) >= Number(idBloque)).map((b) => (
                <option key={b.id_bloque} value={b.id_bloque}>{b.hora_fin?.slice(0,5)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="acm-field">
          <span>Salón</span>
          <select value={idSalon} onChange={(e) => setIdSalon(e.target.value)}>
            <option value="">Elegir…</option>
            {salones.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.libre}>
                {s.nombre}{!s.libre ? ` — ocupado (${s.motivo})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="acm-checkbox">
          <input type="checkbox" checked={examen} onChange={(e) => setExamen(e.target.checked)} />
          <span>Habrá examen en esta clase</span>
        </label>

        <label className="acm-field">
          <span>Tema (opcional)</span>
          <input type="text" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ej. Meteorología — capítulo 4" />
        </label>

        <div className="acm-field">
          <span>Alumnos ({alumnosSel.length} elegidos)</span>
          <input
            type="text" placeholder="Buscar alumno…" value={filtroAlumno}
            onChange={(e) => setFiltroAlumno(e.target.value)} className="acm-buscador"
          />
          <div className="acm-roster">
            {rosterFiltrado.length === 0 && <p className="acm-empty">Sin alumnos inscritos en este curso.</p>}
            {rosterFiltrado.map((a) => (
              <label key={a.id_alumno} className="acm-checkbox">
                <input
                  type="checkbox" checked={alumnosSel.includes(a.id_alumno)}
                  onChange={() => toggleAlumno(a.id_alumno)}
                />
                <span>{a.nombre}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="acm-footer">
          <button className="acm-btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="acm-btn-primario" onClick={handleGuardar} disabled={!puedeGuardar || saving}>
            {saving ? "Guardando…" : sesion ? "Guardar cambios" : "Agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `AgendarClaseModal.css`**

```css
.acm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.acm-modal { background: var(--c-surface-1); border-radius: var(--radius-md); padding: 20px; width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.acm-header { display: flex; justify-content: space-between; align-items: center; }
.acm-close { background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--c-ink-3); }
.acm-field { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-sm); color: var(--c-ink-2); }
.acm-field select, .acm-field input[type="text"], .acm-field input[type="date"] { padding: 8px; border: 1px solid var(--c-line-2); border-radius: var(--radius-sm); }
.acm-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.acm-checkbox { display: flex; align-items: center; gap: 8px; font-size: var(--text-sm); }
.acm-buscador { padding: 6px 8px; border: 1px solid var(--c-line-2); border-radius: var(--radius-sm); margin-bottom: 6px; }
.acm-roster { max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--c-line-1); border-radius: var(--radius-sm); padding: 8px; }
.acm-empty { color: var(--c-ink-4); font-size: var(--text-sm); margin: 0; }
.acm-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.acm-btn-primario { background: var(--c-brand-700); color: #fff; border: none; padding: 10px 16px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600; }
.acm-btn-secundario { background: none; border: 1px solid var(--c-line-2); padding: 10px 16px; border-radius: var(--radius-sm); cursor: pointer; }
```

- [ ] **Step 3: `AgendaTeorica.jsx`**

```javascript
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import AgendarClaseModal from "../../components/AgendarClaseModal/AgendarClaseModal";
import SalonesOcupacionWidget from "../../components/SalonesOcupacionWidget/SalonesOcupacionWidget";
import {
  getSesiones, crearSesion, cancelarSesionClase, iniciarSesionClase, cerrarSesionClase,
} from "../../services/administracionApi";
import { getBloquesHorario } from "../../services/programacionApi";
import { getAulaCursos } from "../../services/administracionApi";
import "./AgendaTeorica.css";

const hoySV = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

export default function AgendaTeorica() {
  const [fecha, setFecha] = useState(hoySV());
  const [sesiones, setSesiones] = useState([]);
  const [bloques, setBloques] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [sesionEditar, setSesionEditar] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [ses, blq, cur] = await Promise.all([
        getSesiones({ mias: 1 }),
        getBloquesHorario(),
        getAulaCursos(),
      ]);
      setSesiones((ses?.data || []).filter((s) => s.fecha?.slice(0, 10) === fecha));
      setBloques(Array.isArray(blq) ? blq : []);
      setCursos(cur?.data || []);
    } catch {
      toast.error("Error al cargar la agenda");
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (fn, id, mensajeOk) => {
    try {
      await fn(id);
      toast.success(mensajeOk);
      cargar();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error");
    }
  };

  return (
    <>
      <Header />
      <div className="agt__container">
        <div className="agt__header">
          <h2>Agenda de teoría</h2>
          <div className="agt__actions">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <button className="agt__btn-primario" onClick={() => { setSesionEditar(null); setModalAbierto(true); }}>
              + Agendar clase
            </button>
          </div>
        </div>

        <SalonesOcupacionWidget />

        <div className="agt__lista">
          {loading ? <p>Cargando…</p> : sesiones.length === 0 ? (
            <p className="agt__vacio">Sin clases agendadas ese día.</p>
          ) : sesiones.map((s) => (
            <div key={s.id} className="agt__card">
              <div className="agt__card-info">
                <strong>{s.curso_codigo}{s.unidad_numero ? ` · U${s.unidad_numero}` : ""}</strong>
                <span className="agt__card-estado">{s.estado}</span>
              </div>
              <div className="agt__card-acciones">
                {s.estado === "PROGRAMADA" && (
                  <>
                    <button onClick={() => accion(cancelarSesionClase, s.id, "Clase cancelada")}>Cancelar</button>
                    <button onClick={() => accion(iniciarSesionClase, s.id, "Clase iniciada")}>Iniciar clase</button>
                  </>
                )}
                {s.estado === "EN_CURSO" && (
                  <button onClick={() => accion(cerrarSesionClase, s.id, "Clase cerrada")}>Cerrar clase</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modalAbierto && (
        <AgendarClaseModal
          cursos={cursos} bloques={bloques}
          crearFn={crearSesion}
          sesion={sesionEditar}
          onClose={() => setModalAbierto(false)}
          onSaved={cargar}
        />
      )}
    </>
  );
}
```


- [ ] **Step 4: `AgendaTeorica.css`**

```css
.agt__container { max-width: 900px; margin: 0 auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 16px; }
.agt__header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.agt__actions { display: flex; gap: 10px; align-items: center; }
.agt__btn-primario { background: var(--c-brand-700); color: #fff; border: none; padding: 10px 16px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600; }
.agt__lista { display: flex; flex-direction: column; gap: 10px; }
.agt__vacio { color: var(--c-ink-4); }
.agt__card { display: flex; justify-content: space-between; align-items: center; background: var(--c-surface-1); border: 1px solid var(--c-line-1); border-radius: var(--radius-md); padding: 14px 16px; }
.agt__card-info { display: flex; flex-direction: column; gap: 4px; }
.agt__card-estado { font-size: var(--text-xs); color: var(--c-ink-3); text-transform: uppercase; }
.agt__card-acciones { display: flex; gap: 8px; }
.agt__card-acciones button { padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--c-line-2); background: var(--c-surface-2); cursor: pointer; font-size: var(--text-sm); }
```

- [ ] **Step 5: Ruta en `App.jsx`**

Junto a la ruta existente `/instructor/aula-virtual`, agregar:

```jsx
<Route
  path="/instructor/agenda-teoria"
  element={
    <ProtectedInstructor>
      <AgendaTeorica />
    </ProtectedInstructor>
  }
/>
```

Y el import correspondiente arriba: `import AgendaTeorica from "./pages/Instructor/AgendaTeorica";`.

- [ ] **Step 6: Verificar que compila**

Run: `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build 2>&1 | tail -10`
Expected: `✓ built in ...` sin errores. (`SalonesOcupacionWidget` todavía no existe — este build
fallará hasta completar el Task 15; si se ejecuta este task de forma aislada, comentar
temporalmente esa línea de import/uso y descomentarla al llegar al Task 15.)

- [ ] **Step 7: Commit**

```bash
git add CAA-frontend/src/components/AgendarClaseModal CAA-frontend/src/pages/Instructor/AgendaTeorica.jsx CAA-frontend/src/pages/Instructor/AgendaTeorica.css CAA-frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(instructor): página Agenda de teoría + modal de agendar clase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Retirar el formulario embebido de `AulaVirtual.jsx`

**Files:**
- Modify: `CAA-frontend/src/pages/Instructor/AulaVirtual.jsx`

- [ ] **Step 1: Leer el archivo completo antes de tocarlo**

Run: `grep -n "sesionForm\|crearSesion\|Mis próximas clases\|Registrar Asistencia" CAA-frontend/src/pages/Instructor/AulaVirtual.jsx`

Ubicar exactamente: el `useState(sesionForm...)`, el `handleCrearSesion`/función que llama a
`crearSesion`, el bloque JSX del formulario embebido (inputs de fecha/hora/tema + botón "Crear
sesión"), y el panel "Mis próximas clases". Retirar SOLO esas piezas — el resto de Aula Virtual
(material, notas, pasar lista de una sesión ya creada) se mantiene intacto.

- [ ] **Step 2: Quitar el estado y la función de creación**

Eliminar la línea `const [sesionForm, setSesionForm] = useState({...})` y la función que hace
`await crearSesion({...})` (ya reemplazada por la Agenda de teoría del Task 12).

- [ ] **Step 3: Quitar el JSX del formulario y el panel "Mis próximas clases"**

Reemplazar ese bloque por un aviso corto que dirija a la nueva página:

```jsx
<div className="aula__aviso-agenda">
  <i className="bi bi-calendar-event"></i>
  <span>Para agendar, iniciar y cerrar tus clases, ahora usá{" "}
    <a href="/instructor/agenda-teoria">Agenda de teoría</a>.</span>
</div>
```

- [ ] **Step 4: Verificar que compila**

Run: `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build 2>&1 | tail -10`
Expected: `✓ built in ...` sin errores ni referencias colgantes a `sesionForm`/`crearSesion`.

- [ ] **Step 5: Commit**

```bash
git add CAA-frontend/src/pages/Instructor/AulaVirtual.jsx
git commit -m "$(cat <<'EOF'
refactor(instructor): retirar el formulario de crear sesión de Aula Virtual (vive en Agenda de teoría)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Pestaña "Mis clases" del alumno + firma

**Files:**
- Create: `CAA-frontend/src/components/MisClasesList/MisClasesList.jsx`
- Create: `CAA-frontend/src/components/MisClasesList/MisClasesList.css`
- Create: `CAA-frontend/src/components/FirmarAsistenciaModal/FirmarAsistenciaModal.jsx`
- Create: `CAA-frontend/src/components/FirmarAsistenciaModal/FirmarAsistenciaModal.css`
- Modify: `CAA-frontend/src/pages/Alumno/Dashboard.jsx`

- [ ] **Step 1: `FirmarAsistenciaModal.jsx`** (reusa el `SignaturePad` ya existente)

```javascript
import { useRef, useState } from "react";
import { toast } from "sonner";
import SignaturePad from "../SignaturePad/SignaturePad";
import { firmarAsistenciaClase } from "../../services/alumnoApi";
import "./FirmarAsistenciaModal.css";

export default function FirmarAsistenciaModal({ clase, onClose, onFirmado }) {
  const firmaRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const handleFirmar = async () => {
    if (firmaRef.current?.isEmpty()) {
      toast.warning("Dibujá tu firma antes de confirmar.");
      return;
    }
    setSaving(true);
    try {
      await firmarAsistenciaClase(clase.id, firmaRef.current.toDataURL());
      toast.success("Asistencia firmada");
      onFirmado?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al firmar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fam-overlay" onClick={onClose}>
      <div className="fam-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Firmar asistencia</h3>
        <p className="fam-detalle">
          {clase.curso_codigo}{clase.unidad_nombre ? ` · ${clase.unidad_nombre}` : ""} —{" "}
          {new Date(clase.fecha).toLocaleDateString("es-SV", { timeZone: "UTC" })}
          {clase.salon_nombre ? ` · ${clase.salon_nombre}` : ""}
        </p>
        <SignaturePad ref={firmaRef} width={360} height={140} />
        <div className="fam-footer">
          <button className="fam-btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="fam-btn-primario" onClick={handleFirmar} disabled={saving}>
            {saving ? "Guardando…" : "Firmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `FirmarAsistenciaModal.css`**

```css
.fam-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.fam-modal { background: var(--c-surface-1); border-radius: var(--radius-md); padding: 20px; width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.fam-detalle { font-size: var(--text-sm); color: var(--c-ink-2); text-align: center; margin: 0; }
.fam-footer { display: flex; justify-content: flex-end; gap: 8px; width: 100%; }
.fam-btn-primario { background: var(--c-brand-700); color: #fff; border: none; padding: 10px 16px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600; }
.fam-btn-secundario { background: none; border: 1px solid var(--c-line-2); padding: 10px 16px; border-radius: var(--radius-sm); cursor: pointer; }
```

- [ ] **Step 3: `MisClasesList.jsx`**

```javascript
import { useState } from "react";
import FirmarAsistenciaModal from "../FirmarAsistenciaModal/FirmarAsistenciaModal";
import "./MisClasesList.css";

function formatHora12(hora24) {
  const hhmm = (hora24 || "").slice(0, 5);
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function MisClasesList({ clases = [], loading, onRefresh }) {
  const [firmar, setFirmar] = useState(null);

  if (loading) return <div className="mcl__state">Cargando clases…</div>;
  if (clases.length === 0) return <div className="mcl__state mcl__state--empty">Sin clases agendadas.</div>;

  return (
    <div className="mcl">
      {firmar && (
        <FirmarAsistenciaModal clase={firmar} onClose={() => setFirmar(null)} onFirmado={onRefresh} />
      )}
      {clases.map((c) => (
        <div key={c.id} className="mcl__clase">
          <div className="mcl__row">
            <span className="mcl__hora">{formatHora12(c.hora_inicio)}</span>
            <span className="mcl__curso">{c.curso_codigo}{c.unidad_nombre ? ` · ${c.unidad_nombre}` : ""}</span>
            {c.examen && <span className="mcl__badge mcl__badge--examen">Examen</span>}
          </div>
          <div className="mcl__sub">
            {c.salon_nombre || "Sin salón"} · {c.instructor_nombre || "—"} ·{" "}
            {new Date(c.fecha).toLocaleDateString("es-SV", { day: "2-digit", month: "short", timeZone: "UTC" })}
          </div>
          {c.estado_sesion === "CERRADA" && c.mi_asistencia !== "AUSENTE" && (
            c.ya_firme ? (
              <span className="mcl__badge mcl__badge--firmada">Firmada</span>
            ) : (
              <button className="mcl__btn-firmar" onClick={() => setFirmar(c)}>Firma pendiente</button>
            )
          )}
          {c.estado_sesion === "EN_CURSO" && <span className="mcl__badge mcl__badge--curso">En curso</span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `MisClasesList.css`**

```css
.mcl { display: flex; flex-direction: column; gap: 10px; }
.mcl__state { padding: 24px 0; text-align: center; color: var(--c-ink-4); }
.mcl__clase { background: var(--c-surface-1); border: 1px solid var(--c-line-1); border-radius: var(--radius-md); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.mcl__row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mcl__hora { font-family: var(--font-mono); font-weight: 700; }
.mcl__curso { font-weight: 600; }
.mcl__sub { font-size: var(--text-sm); color: var(--c-ink-3); }
.mcl__badge { font-size: var(--text-xs); font-weight: 700; padding: 3px 9px; border-radius: var(--radius-pill); width: fit-content; }
.mcl__badge--examen { background: var(--c-warn-50); color: var(--c-warn-700); }
.mcl__badge--firmada { background: var(--c-success-50); color: var(--c-success-700); }
.mcl__badge--curso { background: var(--c-info-50); color: var(--c-info-700); }
.mcl__btn-firmar { align-self: flex-start; background: var(--c-brand-700); color: #fff; border: none; padding: 6px 14px; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--text-sm); font-weight: 600; }
```

- [ ] **Step 5: Agregar la pestaña en `Alumno/Dashboard.jsx`**

Buscar el bloque de tabs (`weekMode === "cancelaciones"`, alrededor de la línea 280 vista en el
código actual) y agregar un 4º modo `"clases"`:

```jsx
<button
  className={`dash__tab${weekMode === "clases" ? " dash__tab--active" : ""}`}
  onClick={() => setWeekMode("clases")}
>
  Mis clases
</button>
```

Y en el bloque condicional de contenido, agregar la rama nueva (junto a `weekMode !== "cancelaciones"`):

```jsx
{weekMode === "clases" ? (
  <MisClasesList clases={misClases} loading={loadingClases} onRefresh={fetchClases} />
) : weekMode !== "cancelaciones" ? (
  <MiHorarioList vuelos={vuelos} weekMode={weekMode} loading={loadingVuelos} onRefresh={fetchVuelos} />
) : ( /* ... contenido de cancelaciones existente ... */ )}
```

Agregar el import `import MisClasesList from "../../components/MisClasesList/MisClasesList";` y
reusar el `misClases`/`fetchClases` ya existentes (el `useState(misClases)` y el `useEffect` que
llama a `getMisClases` ya están en el archivo — si `fetchClases`/`loadingClases` no existen
todavía como nombres separados, extraer la carga actual de `misClases` a una función nombrada
`fetchClases` con su propio `loadingClases`, igual al patrón de `fetchVuelos`/`loadingVuelos`).

- [ ] **Step 6: Retirar el widget chico del sidebar**

Eliminar el bloque JSX de `{misClases.length > 0 && (...)}` en el `<aside className="dash__sidebar">`
(el que hoy pinta "Próximas clases" en una cajita) — queda reemplazado por la pestaña nueva.

- [ ] **Step 7: Verificar que compila**

Run: `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build 2>&1 | tail -10`
Expected: `✓ built in ...` sin errores.

- [ ] **Step 8: Commit**

```bash
git add CAA-frontend/src/components/MisClasesList CAA-frontend/src/components/FirmarAsistenciaModal CAA-frontend/src/pages/Alumno/Dashboard.jsx
git commit -m "$(cat <<'EOF'
feat(alumno): pestaña "Mis clases" con tarjetas y firma digital de asistencia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Widget de ocupación de salones (componente + 5 montajes)

**Files:**
- Create: `CAA-frontend/src/components/SalonesOcupacionWidget/SalonesOcupacionWidget.jsx`
- Modify: `CAA-frontend/src/pages/Proyeccion/PaginaProgramacion.jsx`
- Modify: `CAA-frontend/src/pages/Turno/Dashboard.jsx`
- Modify: `CAA-frontend/src/pages/Programacion/Dashboard.jsx`
- Modify: `CAA-frontend/src/pages/Admin/Dashboard.jsx`

- [ ] **Step 1: El componente**

Reusa `ProgWidgets.css` (clases `pw__*`) tal cual — esas clases ya usan variables de diseño
(`--c-surface-1`, `--c-ink-*`, etc.) en vez de colores fijos, así que se ve correcto tanto en el
tema oscuro de Proyección como en el tema claro de Turno/Programación/Admin sin necesitar una
variante — se confirma esto mismo en el `Step 3` de verificación visual.

```javascript
import { useCallback, useEffect, useState } from "react";
import { getSalonesOcupacion } from "../../services/programacionApi";
import "../ProgWidgets/ProgWidgets.css";

export default function SalonesOcupacionWidget() {
  const [salones, setSalones] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const data = await getSalonesOcupacion();
      setSalones(Array.isArray(data) ? data : []);
    } catch {
      /* silencioso, igual que los demás widgets de Proyección */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <div className="pw__widget">
      <div className="pw__widget-header">
        <span className="pw__widget-title">Salones de teoría</span>
        <span className="pw__widget-badge pw__widget-badge--gris">{salones.length}</span>
      </div>

      {loading ? (
        <p className="pw__empty">Cargando…</p>
      ) : (
        <div className="pw__cards">
          {salones.map((s) => (
            <div className="pw__card" key={s.id}>
              <div className="pw__card-row">
                <span className="pw__card-aeronave">{s.nombre}</span>
                {s.estado === "EN_SESION" && <span className="pw__tag pw__tag--rojo">EN SESIÓN</span>}
                {s.estado === "RESERVADO" && <span className="pw__tag pw__tag--naranja">Reservado</span>}
                {s.estado === "PROXIMA" && <span className="pw__tag pw__tag--azul">Próxima</span>}
                {s.estado === "LIBRE" && <span className="pw__tag pw__tag--verde">Libre</span>}
              </div>
              {s.estado === "EN_SESION" && (
                <div className="pw__card-sub">{s.instructor} · {s.curso}{s.unidad ? ` · ${s.unidad}` : ""}</div>
              )}
              {s.estado === "RESERVADO" && (
                <div className="pw__card-sub">{s.motivo}{s.descripcion ? ` — ${s.descripcion}` : ""}</div>
              )}
              {s.estado === "PROXIMA" && (
                <div className="pw__card-sub">{s.hora?.slice(0,5)} · {s.instructor} · {s.curso}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montarlo en Proyección**

En `PaginaProgramacion.jsx`, dentro de `<aside className="pp__sidebar">`, agregar junto a los
demás widgets (después de `<EstadoFlotaWidget />`, por ejemplo):

```jsx
import SalonesOcupacionWidget from "../../components/SalonesOcupacionWidget/SalonesOcupacionWidget";
// ...
<SalonesOcupacionWidget />
```

- [ ] **Step 3: Montarlo en Turno, Programación y Admin**

En cada uno de `Turno/Dashboard.jsx`, `Programacion/Dashboard.jsx`, `Admin/Dashboard.jsx`: agregar
el import y `<SalonesOcupacionWidget />` en un lugar razonable del layout existente de cada
dashboard (p. ej. junto a `<MetarWidget />` en Turno, o como una tarjeta más en la columna
principal de Programación/Admin — el lugar exacto no es crítico, cualquier posición visible sirve).

- [ ] **Step 4: Verificar que compila**

Run: `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build 2>&1 | tail -10`
Expected: `✓ built in ...` sin errores.

- [ ] **Step 5: Verificación visual en el navegador**

Abrir el preview de la app (`preview_start` con la URL de Proyección,
`?modo=proyeccion&key=caaa_proyeccion_secret_2024`), confirmar que "Salones de teoría" aparece en
el sidebar con los 3 salones en estado "Libre" (todavía no hay datos reales), y tomar una captura.

- [ ] **Step 6: Commit**

```bash
git add CAA-frontend/src/components/SalonesOcupacionWidget CAA-frontend/src/pages/Proyeccion/PaginaProgramacion.jsx CAA-frontend/src/pages/Turno/Dashboard.jsx CAA-frontend/src/pages/Programacion/Dashboard.jsx CAA-frontend/src/pages/Admin/Dashboard.jsx
git commit -m "$(cat <<'EOF'
feat(widget): ocupación de salones — reusado en Proyección/Turno/Programación/Admin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Turno — agendar/reservar salón, cancelar, reasignar

**Files:**
- Create: `CAA-frontend/src/components/ReservarSalonModal/ReservarSalonModal.jsx`
- Modify: `CAA-frontend/src/pages/Turno/Dashboard.jsx`

- [ ] **Step 1: Agregar estado + carga de agenda del día completa**

En `Turno/Dashboard.jsx`, agregar junto a los demás `useState`:

```javascript
const [sesionesTeoria, setSesionesTeoria] = useState([]);
const [modalClaseAbierto, setModalClaseAbierto] = useState(false);
const [instructoresTeoria, setInstructoresTeoria] = useState([]);
const [cursosTeoria, setCursosTeoria] = useState([]);
const [salonesCatalogo, setSalonesCatalogo] = useState([]);
const [modalReservaAbierto, setModalReservaAbierto] = useState(false);
const [reasignando, setReasignando] = useState(null); // id_sesion en edición de salón
```

Y una función de carga (agregar al `useEffect` de carga inicial existente, o uno nuevo):

```javascript
import {
  getSesiones, getAulaCursos, crearSesion, cancelarSesionClase, reasignarSalonSesion,
  getSalones, getInstructoresTeoria,
} from "../../services/administracionApi";
import AgendarClaseModal from "../../components/AgendarClaseModal/AgendarClaseModal";
import ReservarSalonModal from "../../components/ReservarSalonModal/ReservarSalonModal";
import SalonesOcupacionWidget from "../../components/SalonesOcupacionWidget/SalonesOcupacionWidget";

const cargarTeoria = useCallback(async () => {
  try {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
    const [ses, ins, cur, sal] = await Promise.all([
      getSesiones({}), getInstructoresTeoria(), getAulaCursos(), getSalones(),
    ]);
    setSesionesTeoria((ses?.data || []).filter((s) => s.fecha?.slice(0, 10) === hoy));
    setInstructoresTeoria(ins?.data || []);
    setCursosTeoria(cur?.data || []);
    setSalonesCatalogo(sal?.data || []);
  } catch { /* silencioso */ }
}, []);

useEffect(() => { cargarTeoria(); }, [cargarTeoria]);
```

- [ ] **Step 2: `ReservarSalonModal.jsx`** (reserva de uso especial, sin clase real)

```javascript
import { useState } from "react";
import { toast } from "sonner";
import { crearReservaSalon } from "../../services/administracionApi";
import "./ReservarSalonModal.css";

const MOTIVOS = [
  { value: "REUNION", label: "Reunión" },
  { value: "EVENTO", label: "Evento" },
  { value: "ADMINISTRATIVO", label: "Administrativo" },
  { value: "OTRO", label: "Otro" },
];

export default function ReservarSalonModal({ salones = [], bloques = [], onClose, onSaved }) {
  const [idSalon, setIdSalon] = useState(String(salones[0]?.id || ""));
  const [fecha, setFecha] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
  const [idBloque, setIdBloque] = useState(String(bloques[0]?.id_bloque || ""));
  const [idBloqueFin, setIdBloqueFin] = useState("");
  const [motivo, setMotivo] = useState("REUNION");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);

  const handleGuardar = async () => {
    setSaving(true);
    try {
      await crearReservaSalon({
        id_salon: Number(idSalon), fecha, id_bloque: Number(idBloque),
        id_bloque_fin: idBloqueFin ? Number(idBloqueFin) : null,
        motivo, descripcion: descripcion || null,
      });
      toast.success("Salón reservado");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al reservar el salón");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rsm-overlay" onClick={onClose}>
      <div className="rsm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rsm-header">
          <h3>Reservar salón (uso especial)</h3>
          <button className="rsm-close" onClick={onClose}>×</button>
        </div>

        <label className="rsm-field">
          <span>Salón</span>
          <select value={idSalon} onChange={(e) => setIdSalon(e.target.value)}>
            {salones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>

        <div className="rsm-row">
          <label className="rsm-field">
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="rsm-field">
            <span>Bloque inicio</span>
            <select value={idBloque} onChange={(e) => setIdBloque(e.target.value)}>
              {bloques.map((b) => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_inicio?.slice(0,5)}</option>)}
            </select>
          </label>
          <label className="rsm-field">
            <span>Bloque fin</span>
            <select value={idBloqueFin} onChange={(e) => setIdBloqueFin(e.target.value)}>
              <option value="">Igual al inicio</option>
              {bloques.filter((b) => Number(b.id_bloque) >= Number(idBloque)).map((b) => (
                <option key={b.id_bloque} value={b.id_bloque}>{b.hora_fin?.slice(0,5)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="rsm-field">
          <span>Motivo</span>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>

        <label className="rsm-field">
          <span>Descripción (opcional)</span>
          <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>

        <div className="rsm-footer">
          <button className="rsm-btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="rsm-btn-primario" onClick={handleGuardar} disabled={saving}>
            {saving ? "Guardando…" : "Reservar"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `ReservarSalonModal.css`**

```css
.rsm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.rsm-modal { background: var(--c-surface-1); border-radius: var(--radius-md); padding: 20px; width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 12px; }
.rsm-header { display: flex; justify-content: space-between; align-items: center; }
.rsm-close { background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--c-ink-3); }
.rsm-field { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-sm); color: var(--c-ink-2); }
.rsm-field select, .rsm-field input[type="text"], .rsm-field input[type="date"] { padding: 8px; border: 1px solid var(--c-line-2); border-radius: var(--radius-sm); }
.rsm-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.rsm-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.rsm-btn-primario { background: var(--c-brand-700); color: #fff; border: none; padding: 10px 16px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600; }
.rsm-btn-secundario { background: none; border: 1px solid var(--c-line-2); padding: 10px 16px; border-radius: var(--radius-sm); cursor: pointer; }
```

- [ ] **Step 4: Agregar la sección en el JSX del dashboard (agenda + acciones + reserva)**

Junto a la sección de vuelos del día (después de la tabla de "Vuelos de hoy" existente, o en un
lugar visible del layout). Los estados (`modalReservaAbierto`, `reasignando`, `salonesCatalogo`) y
la carga ya quedaron listos en el Step 1.

```jsx
<div className="turno__seccion">
  <div className="turno__seccion-header">
    <h3>Agenda de teoría — hoy</h3>
    <div className="turno__seccion-botones">
      <button className="turno__btn-secundario" onClick={() => setModalReservaAbierto(true)}>
        Reservar salón
      </button>
      <button className="turno__btn-primario" onClick={() => setModalClaseAbierto(true)}>
        Agendar clase
      </button>
    </div>
  </div>

  {sesionesTeoria.length === 0 ? (
    <p className="turno__vacio">Sin clases de teoría agendadas hoy.</p>
  ) : sesionesTeoria.map((s) => (
    <div key={s.id} className="turno__fila-teoria">
      <span>{s.curso_codigo} — {s.instructor_nombre || "Sin instructor"}</span>
      <span className="turno__fila-estado">{s.estado}</span>

      {reasignando === s.id ? (
        <select
          defaultValue=""
          onChange={async (e) => {
            if (!e.target.value) return;
            try {
              await reasignarSalonSesion(s.id, Number(e.target.value));
              toast.success("Salón reasignado");
              setReasignando(null);
              cargarTeoria();
            } catch (err) {
              toast.error(err?.response?.data?.message || "Error al reasignar");
            }
          }}
        >
          <option value="">Elegir salón nuevo…</option>
          {salonesCatalogo.map((sl) => <option key={sl.id} value={sl.id}>{sl.nombre}</option>)}
        </select>
      ) : (
        ["PROGRAMADA", "EN_CURSO"].includes(s.estado) && (
          <button onClick={() => setReasignando(s.id)}>Reasignar salón</button>
        )
      )}

      {s.estado === "PROGRAMADA" && (
        <button onClick={async () => {
          try { await cancelarSesionClase(s.id); toast.success("Clase cancelada"); cargarTeoria(); }
          catch (e) { toast.error(e?.response?.data?.message || "Error"); }
        }}>
          Cancelar
        </button>
      )}
    </div>
  ))}
</div>

{modalClaseAbierto && (
  <AgendarClaseModal
    cursos={cursosTeoria}
    bloques={bloques}
    instructores={instructoresTeoria}
    instructoresPicker
    crearFn={crearSesion}
    onClose={() => setModalClaseAbierto(false)}
    onSaved={cargarTeoria}
  />
)}

{modalReservaAbierto && (
  <ReservarSalonModal
    salones={salonesCatalogo}
    bloques={bloques}
    onClose={() => setModalReservaAbierto(false)}
    onSaved={cargarTeoria}
  />
)}
```

Agregar los imports que faltan: `import ReservarSalonModal from "../../components/ReservarSalonModal/ReservarSalonModal";`
y `reasignarSalonSesion, getSalones` en el import ya existente de `administracionApi.js`. Ampliar
`cargarTeoria` (Step 1) para incluir `getSalones()` en el `Promise.all` y `setSalonesCatalogo(sal?.data || [])`.
Usar el `bloques` que el dashboard de Turno ya carga para su propia agenda de vuelos, si existe en
el archivo — si no, agregar `getBloquesHorario()` al mismo `Promise.all`.

- [ ] **Step 5: Verificar que compila**

Run: `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build 2>&1 | tail -10`
Expected: `✓ built in ...` sin errores.

- [ ] **Step 6: Commit**

```bash
git add CAA-frontend/src/components/ReservarSalonModal CAA-frontend/src/pages/Turno/Dashboard.jsx
git commit -m "$(cat <<'EOF'
feat(turno): agendar clase o reservar salón (uso especial) a nombre de un instructor, cancelar y reasignar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Verificación E2E completa y limpieza

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Ciclo completo con datos reales de prueba**

Usando `u1` (ADMIN) y, si existe, un instructor real con `es_instructor_teoria=true` (o
temporalmente activar el flag en un instructor de prueba vía
`node query.js "UPDATE instructor SET es_instructor_teoria=true WHERE id_instructor=X"` y
revertirlo al final):

```bash
TOKEN=$(curl -s -X POST https://caaa-backend-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"u1","password":"demo123"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('token',''))")

# 1. Agendar
ID=$(curl -s -X POST https://caaa-backend-production.up.railway.app/api/administracion/aula/sesiones \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id_curso":1,"fecha":"2026-08-20","id_bloque":2,"id_salon":1,"examen":true,"alumnos":[1],"id_instructor":1}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])")
echo "id_sesion=$ID"

# 2. Iniciar
curl -s -X POST https://caaa-backend-production.up.railway.app/api/administracion/aula/sesiones/$ID/iniciar \
  -H "Authorization: Bearer $TOKEN"

# 3. Ocupación en vivo debe mostrar EN_SESION para el salón 1 (si "hoy" coincide con la fecha de
#    prueba — para probar esto de verdad, usar la fecha de HOY en el paso 1, no una futura).

# 4. Cerrar
curl -s -X POST https://caaa-backend-production.up.railway.app/api/administracion/aula/sesiones/$ID/cerrar \
  -H "Authorization: Bearer $TOKEN"

# 5. Confirmar que asistencia_alumno quedó con firma pendiente (usar query.js).
```

Expected: cada paso responde `ok:true`. Después de "cerrar", una consulta a `asistencia_alumno`
para ese `id_sesion` muestra `firma_alumno IS NULL` y `estado='PRESENTE'`.

- [ ] **Step 2: Firmar como el alumno de prueba**

```bash
TOKEN_ALUMNO=$(curl -s -X POST https://caaa-backend-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"u4","password":"demo123"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('token',''))")

curl -s "https://caaa-backend-production.up.railway.app/api/alumno/mis-clases" -H "Authorization: Bearer $TOKEN_ALUMNO"
# Confirmar que la clase aparece con estado_sesion=CERRADA, ya_firme=false.

curl -s -X POST https://caaa-backend-production.up.railway.app/api/alumno/mis-clases/$ID/firmar \
  -H "Authorization: Bearer $TOKEN_ALUMNO" -H "Content-Type: application/json" \
  -d '{"firma":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}'
```

Expected: `{"message":"Asistencia firmada"}`. Repetir `GET /alumno/mis-clases` → `ya_firme:true`.

- [ ] **Step 3: Choques**

```bash
# Mismo salón/bloque, otro instructor → 409 de salón.
curl -s -w "\n%{http_code}\n" -X POST https://caaa-backend-production.up.railway.app/api/administracion/aula/sesiones \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id_curso":1,"fecha":"2026-08-20","id_bloque":2,"id_salon":1,"alumnos":[1],"id_instructor":2}'
```

Expected: `409` con mensaje de choque de salón.

- [ ] **Step 4: Choque cruzado vuelo↔teoría**

Crear un vuelo real para el instructor 1 en la misma fecha/bloque (usando
`POST /programacion/vuelos`, patrón ya usado en sesiones previas), luego intentar agendar una
clase para ESE instructor en el mismo bloque en OTRO salón → debe dar `409` de choque de
instructor. Cancelar el vuelo de prueba al terminar.

- [ ] **Step 5: Reserva de salón bloquea agendar clase ahí**

```bash
curl -s -X POST https://caaa-backend-production.up.railway.app/api/administracion/aula/reservas-salon \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id_salon":2,"fecha":"2026-08-20","id_bloque":5,"motivo":"REUNION","descripcion":"Prueba E2E"}'
```

Luego intentar `POST /aula/sesiones` con `id_salon=2` mismo día/bloque → `409`.

- [ ] **Step 6: Widget público (llave, sin JWT)**

```bash
curl -s "https://caaa-backend-production.up.railway.app/api/programacion/salones-ocupacion?key=caaa_proyeccion_secret_2024"
```

Expected: `200` con array de 3 salones (sin necesitar `Authorization`).

- [ ] **Step 7: Limpieza completa**

Borrar TODA la data de prueba creada en este task (sesión de id `$ID` y su asistencia, la reserva
de salón, el vuelo de prueba del choque cruzado, y revertir el flag `es_instructor_teoria` si se
activó temporalmente) — usando `run-sql.js`/`query.js` o pidiéndole a Daniel/Samuel que lo corra
desde el editor de Supabase si el entorno actual no tiene `.env` con credenciales de escritura.

- [ ] **Step 8: Confirmar despliegue**

```bash
git log --oneline -20
git push origin master
```

Esperar el redeploy de Railway/Vercel (poll con `curl` a un endpoint nuevo hasta que devuelva
`401`/`200` en vez de `404`, mismo patrón usado toda la sesión) y repetir el Step 6 contra
producción para confirmar que el despliegue real quedó funcionando.
