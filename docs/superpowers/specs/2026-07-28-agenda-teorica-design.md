# Agenda de clases teóricas (salones, ciclo de vida, firma de asistencia)

**Fecha:** 2026-07-28 · **Aprobado por:** Samuel (brainstorm en sesión)

## Contexto — qué existe ya (no se rehace nada de esto)

- **`sesion_clase`** (mig `20260601000006_fase3_asistencia.sql`, horario agregado en mig 018):
  hoy es una "clase impartida" con `id_curso`, `id_unidad`, `fecha`, `hora_inicio`/`hora_fin`
  (TIME libre), `tema`, `id_instructor`. Se crea desde `aulaVirtualController.crearSesion`
  (`POST /administracion/aula/sesiones`) y **precarga `asistencia_alumno` con TODOS los alumnos
  activos del curso** (`inscripcion_curso.estado='ACTIVO'`), default `PRESENTE`.
- **`asistencia_alumno`**: una fila por alumno por sesión, `estado`
  (PRESENTE/AUSENTE/TARDE/JUSTIFICADO), editable vía `registrarAsistencia`
  (`POST /administracion/aula/sesiones/:id_sesion/asistencia`).
- **UI actual**: dentro de `/instructor/aula-virtual` hay un formulario simple embebido
  (fecha/hora/curso/unidad/tema) + panel "Mis próximas clases". El alumno ve un widget chico
  "Próximas clases" en el sidebar de su dashboard (`misClases`, `GET /alumno/mis-clases`).
- **Gate de acceso**: `router.use("/aula", aulaInstructorGate)` — dejar pasar a todo rol
  no-INSTRUCTOR, y a un INSTRUCTOR solo si `es_instructor_teoria=true`. Las rutas puntuales
  además filtran por `AULA_READ`/`AULA_WRITE = ["ADMINISTRACION","ADMIN","INSTRUCTOR"]` —
  **TURNO no está incluido hoy**, hay que agregarlo a los endpoints nuevos de este módulo.
- **Patrones reutilizados de vuelos** (mismo criterio, sin reinventar):
  - `reserva_aeronave` (mig `20260712000002`) = reserva de "uso especial" de un avión sin
    alumno/vuelo real. Se replica igual para salones (`reserva_salon`).
  - `notificarStaff` (`utils/webpush.js`) = push best-effort al staff, ya usado en acciones de
    Turno (abrir/cerrar operaciones, salida/regreso de hangar). Se reutiliza tal cual.
  - El pad de firma que ya usa `ReporteVueloModal` para `firma_alumno` de la vouchera. Se
    reutiliza el mismo componente para firmar asistencia.
  - `bloque_horario` (los mismos 9 bloques del día que usan los vuelos) — la teoría se agenda
    en estos mismos bloques, sin tabla de horario propia.
  - `proyeccionMiddleware` (llave pública O sesión normal) — mismo esquema de acceso que ya usan
    los widgets de Proyección (`getEstadoFlota`, `getMantenimientoResumen`).

## Decisiones de la sesión (brainstorm)

1. **Se construye sobre lo existente**: `sesion_clase`/`asistencia_alumno` se extienden (no hay
   tabla paralela de "clases"). Se conserva todo el flujo de asistencia/avance de curso ya
   conectado.
2. **Horario en bloques fijos** (iguales a los de vuelo), reserva **directa** a fecha+bloque —
   sin esquema semanal de borrador/publicación como Programación.
3. **Examen = aviso informativo simple** (checkbox al agendar). No crea ni vincula una
   evaluación real del módulo de Exámenes.
4. **Alumnos por sesión = grupo elegido por el instructor** (no automáticamente todo el curso).
   `asistencia_alumno` pasa a precargarse solo con los elegidos.
5. **Ciclo de vida con inicio/cierre real** (como el vuelo, sin candado de hora): el instructor
   marca "Iniciar clase" y "Cerrar clase". Al cerrar, pasa lista (ya existe) y los alumnos
   marcados presente/tarde/justificado quedan con **firma pendiente** — firma digital (mismo pad
   que las voucheras), sin ventana de tiempo (puede quedar pendiente, igual que las voucheras).
6. **Choque cruzado vuelo↔teoría**: un instructor no puede quedar agendado en un vuelo y una
   clase de teoría al mismo tiempo (ni viceversa) — el chequeo de choque de instructor mira
   ambas tablas.
7. **Widget de ocupación de salones**: estado **derivado de `sesion_clase.estado`**, no del
   bloque programado (el cierre real manda). Aparece en Proyección (sidebar derecho), Turno,
   Programación, Admin, y la Agenda del instructor — un solo componente/endpoint reusado en los
   5 lugares.
8. **Notificación push al iniciar** (no al cerrar): mensaje breve con salón, instructor, curso y
   unidad — sin nombres de alumnos.
9. **Turno gana paridad operativa con lo que ya hace con aviones**: puede (a) reservar un salón
   para uso especial sin clase real, (b) agendar una clase real completa a nombre de cualquier
   instructor de teoría, (c) cancelar una clase (libera el salón), (d) reasignar el salón de una
   clase existente.

## Modelo de datos (migración aditiva)

```sql
-- Catálogo de salones (chico, no lleva pantalla de alta/edición en este alcance;
-- agregar un 4º salón es una migración de una línea).
CREATE TABLE salon (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL,
  activo  BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO salon (nombre) VALUES
  ('Salón Arrow'), ('Salón Tomahawk'), ('Salón Cap. Tito Gutiérrez');

-- sesion_clase: horario en bloques + salón + examen + ciclo de vida real.
ALTER TABLE sesion_clase ADD COLUMN id_bloque      INTEGER REFERENCES bloque_horario(id_bloque);
ALTER TABLE sesion_clase ADD COLUMN id_bloque_fin  INTEGER REFERENCES bloque_horario(id_bloque);
ALTER TABLE sesion_clase ADD COLUMN id_salon       INTEGER REFERENCES salon(id);
ALTER TABLE sesion_clase ADD COLUMN examen         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sesion_clase ADD COLUMN estado         VARCHAR(15) NOT NULL DEFAULT 'PROGRAMADA'
  CHECK (estado IN ('PROGRAMADA','EN_CURSO','CERRADA','CANCELADA'));
ALTER TABLE sesion_clase ADD COLUMN iniciada_en    TIMESTAMP;
ALTER TABLE sesion_clase ADD COLUMN cerrada_en     TIMESTAMP;
-- Backfill: toda fila que ya exista (sin id_bloque, de antes de este módulo) ya ocurrió → CERRADA.
UPDATE sesion_clase SET estado = 'CERRADA' WHERE id_bloque IS NULL;

-- asistencia_alumno: firma digital del alumno confirmando que asistió.
ALTER TABLE asistencia_alumno ADD COLUMN firma_alumno TEXT;
ALTER TABLE asistencia_alumno ADD COLUMN firmado_en   TIMESTAMP;

-- Reserva de un salón para uso especial (sin clase real) — mismo concepto que reserva_aeronave.
CREATE TABLE reserva_salon (
  id            SERIAL PRIMARY KEY,
  id_salon      INTEGER NOT NULL REFERENCES salon(id),
  fecha         DATE NOT NULL,
  id_bloque     INTEGER NOT NULL REFERENCES bloque_horario(id_bloque),
  id_bloque_fin INTEGER REFERENCES bloque_horario(id_bloque),
  motivo        VARCHAR(20) NOT NULL CHECK (motivo IN ('REUNION','EVENTO','ADMINISTRATIVO','OTRO')),
  descripcion   VARCHAR(200),
  creado_por    INTEGER,
  creado_en     TIMESTAMP NOT NULL DEFAULT NOW()
);
```

`id_bloque_fin` sigue el mismo patrón que `vuelo`/`reserva_aeronave`: `NULL` = una clase de un
solo bloque; el rango efectivo es `[id_bloque, COALESCE(id_bloque_fin, id_bloque)]`.

## Ciclo de vida de `sesion_clase`

```
PROGRAMADA ──Iniciar clase──▶ EN_CURSO ──Cerrar clase──▶ CERRADA
     │
     └──Cancelar (Turno/Admin/Administración/instructor dueño)──▶ CANCELADA
```

- **Crear** (`PROGRAMADA`): instructor dueño (solo sus cursos asignados en `instructor_curso`) +
  Admin/Administración + **Turno** (a nombre de cualquier instructor de teoría, igual que
  Programación/Turno agendan vuelos a nombre de un instructor).
- **Editar** (curso/unidad/fecha/bloque/salón/alumnos/examen): solo mientras `PROGRAMADA`. Mismo
  permiso que crear.
- **Cancelar**: solo mientras `PROGRAMADA` (antes de iniciar). Instructor dueño + Admin/
  Administración + Turno.
- **Iniciar clase**: solo mientras `PROGRAMADA`, la hace el instructor dueño o Admin/
  Administración. Sin candado de hora (mismo criterio que Turno adelantando vuelos). Dispara el
  push a staff.
- **Cerrar clase**: solo mientras `EN_CURSO`, la hace el instructor dueño o Admin/
  Administración. Reutiliza la UI de pasar lista ya existente (`registrarAsistencia`, default
  presente para todos los elegidos, el instructor ajusta). Al confirmar: `estado='CERRADA'`,
  `cerrada_en=NOW()`; toda fila de `asistencia_alumno` con estado PRESENTE/TARDE/JUSTIFICADO
  queda pendiente de firma (`firma_alumno IS NULL`).
- **Reasignar salón**: acción aparte (no pasa por "editar"), disponible mientras `PROGRAMADA` o
  `EN_CURSO` (permite mover una clase que ya está en curso si el salón queda inutilizable a media
  clase). La hace Admin/Administración/**Turno** — mismo criterio que `reasignarAeronave` para
  vuelos. Vuelve a correr el chequeo de choque de salón contra el nuevo salón.

## Validación de choques (al crear/editar/reasignar)

- **Choque de salón**: mismo `id_salon`, misma `fecha`, rango de bloques que se solapa, contra
  otra `sesion_clase` con `estado <> 'CANCELADA'` **o** contra `reserva_salon` → 409.
- **Choque de instructor** (cruzado vuelo↔teoría): mismo instructor, mismo día, rango de bloques
  que se solapa, contra otra `sesion_clase` con `estado <> 'CANCELADA'` **o** contra `vuelo` con
  `estado <> 'CANCELADO'` (comparando `fecha` de la sesión contra `vuelo.fecha_vuelo`) → 409.
- **Roster de alumnos**: los `id_alumno` elegidos deben pertenecer a `inscripcion_curso` activa
  de ese curso.
- **Reserva de salón** (`reserva_salon`): mismo chequeo de choque de salón que arriba (no aplica
  chequeo de instructor, no lleva instructor).

## Backend

- `aulaVirtualController.crearSesion` se extiende: recibe `id_bloque`, `id_bloque_fin`
  (opcional), `id_salon`, `examen`, `alumnos: number[]` (reemplaza el precargado automático de
  todo el curso). Valida choques (arriba) y pertenencia de curso/alumnos. Si `req.user.rol`
  es INSTRUCTOR, fuerza `id_instructor` del token (igual que hoy); ADMIN/ADMINISTRACION/**TURNO**
  pueden pasar `id_instructor` explícito.
- Nuevas rutas bajo `/administracion/aula/*` (agregar **TURNO** al set de roles permitido, sin
  tocar `AULA_READ`/`AULA_WRITE` que gatean endpoints no relacionados como unidades/evaluaciones):
  - `PATCH /aula/sesiones/:id` — editar (solo si `PROGRAMADA`).
  - `POST /aula/sesiones/:id/cancelar` — cancelar (solo si `PROGRAMADA`).
  - `POST /aula/sesiones/:id/iniciar` — inicia (`PROGRAMADA→EN_CURSO`), dispara `notificarStaff`.
  - `POST /aula/sesiones/:id/cerrar` — cierra (`EN_CURSO→CERRADA`), `cerrada_en=NOW()`. El
    instructor ajusta la asistencia ANTES de cerrar usando el endpoint ya existente
    (`POST /aula/sesiones/:id_sesion/asistencia`, sin cambios); cerrar es el paso final que
    confirma la lista y habilita la firma.
  - `PATCH /aula/sesiones/:id/salon` — reasignar salón (Admin/Administración/Turno).
  - `GET /aula/salones` — catálogo.
  - `GET /aula/salones/disponibilidad?fecha=&id_bloque=&id_bloque_fin=` — libres/ocupados y por
    quién (mismo patrón que `getAeronavesDisponibles`).
  - `GET /aula/reservas-salon?fecha=` / `POST /aula/reservas-salon` / `DELETE
    /aula/reservas-salon/:id` — CRUD de `reserva_salon` (Admin/Administración/Turno).
  - `POST /alumno/mis-clases/:id_sesion/firmar` — endpoint nuevo y separado (rol ALUMNO, no
    reutiliza `registrarAsistencia` porque el actor y el gate de permisos son distintos): el
    propio alumno firma su fila de `asistencia_alumno` (`firma_alumno`, `firmado_en=NOW()`).
    Valida que la fila le pertenezca, que la sesión esté `CERRADA`, y que su `estado` no sea
    `AUSENTE` (los ausentes no firman).
- `GET /alumno/mis-clases` se extiende: salón, examen, hora derivada del bloque, estado de la
  sesión, y si la fila propia de `asistencia_alumno` está pendiente de firma o ya firmada. Ya
  filtra correctamente por pertenencia real (la fila de `asistencia_alumno` es la fuente de
  verdad de "a quién le aplica esta clase").
- `GET /programacion/salones-ocupacion` (nuevo, gated con `proyeccionMiddleware`): por cada
  salón activo, "ahora mismo" —
  - si hay una `sesion_clase.estado='EN_CURSO'` hoy → `{ ocupado: true, tipo: 'CLASE', instructor,
    curso, unidad }` (esto es lo que pinta el flag rojo "EN SESIÓN").
  - si no, pero hay una `reserva_salon` cuyo rango de bloques cubre el bloque actual → `{ ocupado:
    true, tipo: 'RESERVA', motivo, descripcion }`.
  - si no, la próxima `sesion_clase.estado='PROGRAMADA'` de hoy (si hay) → `{ proxima: {...} }`.
  - si nada de lo anterior → `{ libre: true }`.

## Notificación push

Al **iniciar** (no al cerrar): `notificarStaff({ titulo, mensaje }, { excluirUid: actor })`,
mismo mecanismo best-effort ya usado por Turno (nunca tumba la acción si falla). Mensaje: `"{sal
ón} — {instructor} inició {curso_codigo} · {unidad_nombre}"`. Sin nombres de alumnos.

## Frontend

### Instructor de teoría — `/instructor/agenda-teoria` (nueva página, gate `es_instructor_teoria`)

Reemplaza el formulario embebido que hoy vive en Aula Virtual (que queda solo con
material/notas/asistencia histórica). Selector de fecha + lista de sus clases de ese día con
acción según estado:
- `PROGRAMADA` → botones "Editar", "Cancelar", "Iniciar clase".
- `EN_CURSO` → botón "Cerrar clase" (abre el pasar-lista existente).
- `CERRADA` → solo lectura: cuántos alumnos ya firmaron / faltan.

Modal "Agendar clase" (mismo look que `AgendarVueloModal`): curso (de sus cursos asignados) →
unidad → fecha → bloque inicio/fin → salón (con disponibilidad en vivo vía
`GET /aula/salones/disponibilidad`) → checkbox examen → combobox buscable de alumnos (roster
activo del curso, multi-selección) → tema opcional.

Incluye el widget de ocupación de salones (para ver de un vistazo qué salón está libre antes de
agendar).

### Alumno — pestaña "Mis clases" en el dashboard

Nueva pestaña junto a "Semana actual/Semana próxima/Mis cancelaciones". Tarjetas con el mismo
peso visual que `VueloCard`: fecha, hora (del bloque), salón, curso, unidad, badge "Examen" si
aplica, y badge de firma:
- Sesión `PROGRAMADA`/`EN_CURSO` → sin acción de firma todavía.
- Sesión `CERRADA` y la fila propia sin firmar → badge "Firma pendiente" → abre modal con el pad
  de firma (reutiliza el componente de `ReporteVueloModal`) → firma → guarda.
- Ya firmada → badge "Firmada".

Se retira el widget chico del sidebar (`misClases` actual), reemplazado por esta pestaña.

### Turno — paridad con aviones

En el dashboard de Turno: el widget de ocupación de salones, una lista de "Agenda de teoría —
hoy" (todos los salones/instructores, no solo los propios), y un botón "Agendar salón" que abre
un modal con dos modos (mismo patrón dual que `AgendarVueloModal` con `permiteReserva`):
- **Clase real**: mismos campos que el modal del instructor, pero con selector de instructor de
  teoría (a nombre de quién se agenda).
- **Uso especial** (`reserva_salon`): salón, fecha, bloque(s), motivo, descripción — sin curso ni
  alumnos.

Cada fila de la lista tiene acciones de cancelar y reasignar salón (íconos, mismo patrón que las
tarjetas de vuelo de Turno).

### Widget "Ocupación de salones" (componente único, 5 lugares)

Proyección (sidebar derecho), Turno, Programación, Admin, y la Agenda del instructor. Un único
componente (variante de estilo oscuro `.pp__sb-card` para Proyección/Dueño, variante clara
`.adf-card` para Turno/Programación/Admin) consumiendo el mismo
`GET /programacion/salones-ocupacion`. Por cada uno de los 3 salones:
- 🔴 **EN SESIÓN** (rojo) — instructor, curso, unidad.
- Reservado (uso especial) — motivo/descripción, sin flag rojo.
- Próxima — hora, instructor, curso, unidad (si hay algo agendado más tarde hoy).
- Libre.

## Fuera de alcance (a propósito)

- El examen es solo un aviso informativo — no crea ni vincula una evaluación real.
- No hay esquema semanal de borrador/publicación para teoría — todo se agenda directo a una
  fecha.
- No hay pantalla de alta/edición de salones (catálogo sembrado por migración; agregar uno nuevo
  es una migración chica).
- El widget de ocupación siempre muestra "ahora mismo" en los 5 lugares — la navegación a otros
  días para elegir horario libre vive solo en las pantallas de agendar (instructor y Turno).
- No se reconstruye el sistema de asistencia/progreso de curso ya existente — solo se le agrega
  el ciclo iniciar/cerrar/firmar encima.

## Plan de verificación

1. Chequeos de sintaxis (`node --check`) de los controllers tocados/nuevos.
2. `npm run build` del frontend.
3. Migración corrida contra Supabase (`node run-sql.js`), confirmando con `node query.js`: los 3
   salones sembrados, las filas viejas de `sesion_clase` quedaron `CERRADA`.
4. E2E contra producción real (mismo patrón `curl`/scripts usado toda la sesión, con un instructor
   de teoría real o de prueba y Turno/Admin):
   - Agendar una clase (instructor y también como Turno a nombre de otro instructor) → conflicto
     de salón (409) → conflicto cruzado vuelo↔teoría (409) → iniciar → cerrar (pasar lista) →
     firmar como alumno → verificar `GET /alumno/mis-clases` refleja cada estado correctamente.
   - Reservar un salón de uso especial → verificar que bloquea agendar una clase ahí.
   - Cancelar una clase `PROGRAMADA` → verificar que libera el salón para un nuevo choque-check.
   - Reasignar salón de una clase `EN_CURSO` → verificar que el widget de ocupación refleja el
     salón nuevo, no el viejo.
   - `GET /programacion/salones-ocupacion` con la llave pública (sin JWT) → confirma que
     funciona igual que los demás widgets de Proyección.
   - Confirmar que el push de "iniciar" llega (best-effort, no bloquea si falla) sin mencionar
     alumnos.
   - Limpieza total de cualquier dato de prueba creado, igual que en toda la sesión.
