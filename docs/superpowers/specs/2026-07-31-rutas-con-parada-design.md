# Rutas con parada — diseño

**Fecha:** 2026-07-31 · **Estado:** aprobado por Samuel (diseño conversacional, sesión 2026-07-31)

## Problema

Hoy una RUTA es **un solo `vuelo`** que abarca `id_bloque → id_bloque_fin`, con un loadsheet,
una vouchera y una sola pasada por la máquina de estados. Las rutas reales con parada en otro
aeropuerto son operativamente **N vuelos independientes** (ida, tramos intermedios, retorno):
cada uno con su plan de vuelo (loadsheet), su vouchera, su aterrizaje y su apertura, visibles
por separado en Proyección y en las tarjetas de Turno y Dueño. Además existen dos casos reales
poco comunes que el modelo debe soportar:

1. **Cambio de alumno en ruta**: la ida la vuela un alumno y el retorno otro (van 3 personas a
   bordo; el instructor es el mismo en toda la ruta).
2. **Parada múltiple**: MSSS→A, A→B, B→MSSS (N tramos, no solo 2).

## Decisiones tomadas (con el usuario)

- **Agendado**: el alumno elige el rango de bloques total como hoy (reserva el avión completo);
  la división del rango entre tramos es en partes iguales y **solo presentacional**. El gate
  real de cada tramo posterior es la acción del instructor, no la hora.
- **ICAO obligatorio siempre** para cada parada (4 letras, validado).
- **Dos voucheras, dos cargos** (generalizado: una vouchera y un cargo **por tramo**, al alumno
  de ese tramo).
- **Estados ya, voucheras después**: en cada aterrizaje fuera de casa el instructor solo llena
  un **mini-form de TAC y HOBBS de llegada**; las voucheras completas se firman al final del
  día. Los valores del mini-form precargan la llegada de la vouchera del tramo N **y** la
  salida de la vouchera del tramo N+1.
- **Alumno + staff** pueden crear rutas con parada (solicitud del alumno y modal de agendar de
  Programación/Admin/Turno).
- **Límites**: una ruta con parada cuenta **1** para los límites semanal/diario del solicitante.
  Alumnos asignados después por Programación no consumen cupo (consistente con que el staff
  asigna por fuera de los límites).
- **Enfoque de modelado elegido: A** — N filas de `vuelo` hermanas creadas al publicar,
  enlazadas por grupo. Descartados: (B) tabla hija de tramos (obliga a reescribir todos los
  consumidores por-vuelo); (C) crear el retorno al aterrizar (el alumno no podría llenar el
  loadsheet del retorno con anticipación).

## Sección 1 — Modelo de datos

**`solicitud_vuelo`** (la solicitud sigue siendo UNA):

- `con_parada boolean DEFAULT false`
- `tramos_ruta jsonb` — solo los ICAO intermedios, ej. `["MGGT"]` (2 tramos) o
  `["MGGT","MHTG"]` (3 tramos). El origen del primer tramo es siempre MSSS y el destino del
  último es siempre MSSS (autocompletados, no se piden).

**`vuelo`** (cada tramo es una fila):

- `grupo_ruta integer` — compartido por todos los tramos de la misma ruta (se usa el
  `id_detalle` de la solicitud origen; sin secuencia nueva).
- `orden_tramo smallint` — 1..N.
- `total_tramos smallint` — para mostrar "Tramo 2 de 3" sin contar filas.
- `icao_origen varchar(4)` / `icao_destino varchar(4)` — MSSS→MGGT, MGGT→MHTG, MHTG→MSSS.
- `id_alumno` ya existe por fila → el alumno por tramo sale gratis. Al publicar, todos los
  tramos nacen con el alumno solicitante; el modal de Programación hace UPDATE del
  `id_alumno` del tramo reasignado.

**Al publicar la semana**: una solicitud `con_parada` genera N filas de `vuelo` repartiendo el
rango de bloques en N partes iguales. El tramo 1 nace `PUBLICADO`; los tramos 2..N nacen
`EN_ESPERA_TRAMO`.

**Mini-form de aterrizaje**: los TAC/HOBBS registrados al aterrizar se escriben directo en
`reporte_vuelo` (creando el borrador si no existe): `tacometro_llegada`/`hobbs_llegada` del
tramo N y `tacometro_salida`/`hobbs_salida` del tramo N+1. Sin tabla nueva — la vouchera los
encuentra precargados por el flujo normal.

## Sección 2 — Estados y flujo del instructor

Estado nuevo: **`EN_ESPERA_TRAMO`** (requiere ampliar `vuelo_estado_check` y
`vuelo_estado_tiempo_estado_check` — recordar la tabla hermana, lección de la migración
20260713000003).

- **Tramo 1** (sale de casa): `PUBLICADO → SALIDA_HANGAR → EN_PROGRESO → COMPLETADO`.
  Al aterrizar: botón "Aterrizamos en {ICAO}" → mini-form TAC/HOBBS → cierra el tramo.
- **Tramos intermedios**: `EN_ESPERA_TRAMO → EN_PROGRESO` (botón "Iniciar tramo a {ICAO}";
  sin SALIDA_HANGAR, no hay hangar en destino) → mini-form al aterrizar → `COMPLETADO`.
- **Tramo final** (vuelve a casa): `EN_ESPERA_TRAMO → EN_PROGRESO → REGRESO_HANGAR →
  FINALIZANDO → COMPLETADO` — cierre completo de siempre, checklist post-vuelo incluido.
- Los tramos que cierran fuera de casa quedan `COMPLETADO` sin pasar por
  `REGRESO_HANGAR`/`FINALIZANDO`; el checklist post-vuelo se exige solo en el tramo final.

**Guardas**:

- No se puede iniciar el tramo N+1 si el tramo N no está cerrado.
- `EN_ESPERA_TRAMO` no dispara no-show, ni auto-avance, ni push de "salida de hangar".
- La guardia de "avión ocupado" ignora a los hermanos del mismo `grupo_ruta`.

Las voucheras completas de todos los tramos se llenan y firman al final del día como cualquier
vuelo; el mini-form solo deja los TAC/HOBBS de los bordes precargados.

## Sección 3 — UI de solicitud y modal de asignación

- **Solicitud del alumno** (`AgendarVuelo`, modo RUTA): checkbox "Con parada en otro
  aeropuerto" → cadena `MSSS → [____] → MSSS` con input ICAO (4 letras, mayúsculas) y botón
  "+ Agregar tramo" que inserta otra parada. Cada parada se puede quitar. Rango de bloques
  igual que hoy. El resumen muestra el itinerario completo.
- **Staff** (`AgendarVueloModal`): mismo checkbox + cadena al elegir tipo RUTA. Paridad total.
- **Modal "Asignar alumnos por tramo"** (nuevo, popover del calendario de Programación): lista
  de los N tramos (`Tramo 1 · MSSS→MGGT · [combobox alumno]`), precargados con el solicitante.
  Validación: el alumno asignado debe tener licencia para esa aeronave (mismo chequeo del
  agendado, con la excepción staff existente).
- **Dashboard del alumno**: cada alumno ve su(s) tramo(s) como tarjeta normal con insignia
  `RUTA · Tramo 2/3 · MGGT→MHTG` e itinerario completo en el detalle. El botón de loadsheet
  abre solo el loadsheet de su tramo (gratis: el loadsheet ya es por vuelo).

## Sección 4 — Tarjetas, Proyección, Turno y Dueño

Cada tramo es una fila de `vuelo` ⇒ todas las vistas existentes los muestran como operaciones
separadas sin trabajo estructural. Se agrega presentación:

- Insignia de ruta en tarjetas (Turno, Dueño, Proyección, calendarios): `T2/3 · MGGT→MHTG`.
- Botones según estado: "Salida de hangar" (tramo 1), "Aterrizamos en {ICAO}" (mini-form),
  "Iniciar tramo a {ICAO}" (en espera), cierre normal (tramo final).
- Proyección: tramos `EN_ESPERA_TRAMO` con etiqueta "EN {ICAO} — ESPERANDO".
- El reporte del día lista N filas por ruta (ya agrupa por aeronave y suma por fila; cuadra solo).

## Sección 5 — Cancelaciones, ediciones y casos borde

- **Cancelar** opera sobre el `grupo_ruta` completo (solicitud cancelada, rechazo desde
  calendario, mantenimiento/suspensión ⇒ caen todos los tramos no completados). No se cancela
  un tramo suelto del medio. Ruta cortada en la vida real (ej. clima en destino): regreso
  anticipado en la vouchera del tramo volado + Turno cancela "los tramos restantes de aquí en
  adelante" (eso sí se permite).
- **Editar tripulación** (Turno): instructor y aeronave aplican a toda la ruta; alumno es por
  tramo (modal de la sección 3).
- **Inasistencia**: solo aplica al tramo 1 ⇒ inasistencia del tramo 1 + cancelación del resto
  del grupo.
- **Mini-form**: TAC/HOBBS de llegada ≥ salida del tramo; reabrible mientras el tramo
  siguiente no haya iniciado; después se corrige por el flujo de editar vouchera existente.
- **Horas de licencia y cobro**: por tramo, al alumno de cada tramo (cada vouchera suma y
  debita a quien voló ese tramo).

## Fuera de alcance

- Rutas donde cambia el instructor entre tramos (el instructor es siempre el mismo).
- Validación de ICAO contra un catálogo real de aeropuertos (solo formato de 4 letras).
- Loadsheet compartido o combinado entre tramos.
- Reprogramación de horas de tramos individuales después de publicar (los horarios por tramo
  son presentacionales).
