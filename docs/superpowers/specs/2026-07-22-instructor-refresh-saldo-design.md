# Pago de vuelos de práctica del instructor (Refresh): debitar del saldo o pagar al momento

**Fecha:** 2026-07-22 · **Aprobado por:** Daniel (brainstorm en sesión)

## Contexto — qué existe ya (no se rehace nada de esto)

- **Solicitud self-service** (Samuel, commit `3fb2c71`, hoy): en `/instructor/solicitudes` hay una
  tarjeta "Vuelo de práctica (con otro instructor)": el instructor elige día/bloque/aeronave,
  sub-tipo (Chequeo/Refresh) y el PIC. Backend `POST /instructor/solicitudes/practica`
  (`instructorSolicitudController.crearSolicitudPractica`) → `insertarSolicitudVuelo` con
  `categoria='CHEQUEO_LINEA'` y su propio usuario como practicante. Mismo basket semanal y
  mismo envío a Programación que las solicitudes de sus alumnos.
- **Ficha espejo con saldo heredado**: `asegurarFichaPracticante` (utils/practicanteHelper.js)
  **reutiliza cualquier ficha `alumno` existente del mismo usuario**. Para un ex-alumno que
  transicionó a instructor (mismo usuario), su ficha espejo ES su vieja ficha de alumno, con su
  cuenta corriente y saldo intactos. Instructores sin pasado de alumno obtienen ficha nueva
  (cuenta en 0) al primer vuelo de práctica.
- **Hoja de vuelo**: "Mis vuelos de práctica" en el dashboard del instructor (§21) — llena el
  loadsheet y firma el reporte post-vuelo como estudiante. Aplica igual a los autosolicitados
  (mismo mecanismo de ficha espejo).
- **Cobro actual**: `firmarReporteVuelo` NO auto-cobra las categorías `DEMO`/`CHEQUEO_LINEA`
  (§21): el Refresh se cobra manual desde Administración. CHEQUEO lo paga la escuela (nunca se
  cobra al practicante).
- **Tarifa efectiva** (sesión de hoy): `cargarVueloACuentaDentroTx` y `estimarCostoVuelos` ya
  resuelven precio especial del alumno → tarifa estándar por `id_aeronave` → texto legacy. La
  ficha espejo aparece en Cuentas, así que admin puede asignarle precios especiales.

## Decisiones de Daniel (brainstorm)

1. **Alcance**: los vuelos autosolicitados son SIEMPRE con otro instructor (PIC). No hay vuelos
   "solo". La tarjeta de Samuel es el vehículo; solo se le agrega la capa de pago.
2. **Chequeo vs Refresh**: el instructor puede elegir ambos. El control de que un "Chequeo"
   autosolicitado corresponda es HUMANO (Programación lo ve y lo rechaza si no va) — el sistema
   no lo bloquea. La lógica de saldo aplica **solo a Refresh**.
3. **Débito automático**: si eligió "debitar de mi saldo", al firmar el reporte el cobro sale
   solo (como un vuelo de alumno), a la tarifa efectiva de su ficha.
4. **Umbral**: se le ofrece debitar **solo si su saldo cubre el costo estimado**. Con saldo
   insuficiente ve el aviso "se paga al momento del vuelo o coordinalo con Administración" y el
   pedido pasa igual (nunca se bloquea; su cuenta nunca queda negativa por esta vía).
5. **Visibilidad staff** (pedido mid-sesión): columna de saldo de instructores en Usuarios →
   Personal + acceso a su cuenta corriente desde su modal, como con alumnos.

## Diseño

### 1. Flujo al pedir (frontend `Solicitudes.jsx`, tarjeta de práctica)

- Cuando el sub-tipo es **REFRESH**, la tarjeta muestra: `Saldo disponible: $X · este vuelo
  cuesta aprox. $Y` (Y = tarifa efectiva de su ficha para el avión elegido × 1h).
- Saldo cubre (X ≥ Y) → checkbox **"Debitar de mi saldo al completarse el vuelo"**, marcado por
  defecto (puede desmarcarlo para pagar al momento).
- No cubre → aviso ámbar: *"Tu saldo ($X) no cubre este vuelo (~$Y): se paga al momento del
  vuelo o coordinalo con Administración."* — sin checkbox, el pedido se envía igual con
  `debitar_saldo=false`.
- Sub-tipo **CHEQUEO** → nada de esto (paga la escuela).
- Datos de saldo/costo: nuevo `GET /instructor/practica/saldo?id_aeronave=N` → `{ saldo,
  costo_estimado, cubre }` (usa la ficha espejo si existe; sin ficha O ficha sin fila de
  `cuenta_corriente_alumno` → saldo 0, no cubre — COALESCE a 0 en ambos casos).
  Se consulta al cambiar el avión seleccionado.
- El costo estimado es **tarifa × 1h a propósito** (misma convención que el badge de
  saldo-bajo del calendario staff); no se estima por rango de bloques.

### 2. Modelo de datos (migración aditiva)

- `solicitud_vuelo.debitar_saldo BOOLEAN` — elección del practicante. Solo significativa en
  CHEQUEO_LINEA + REFRESH; NULL en el resto.
- `vuelo.debitar_saldo BOOLEAN` — `publicarSemana` la copia al publicar (junto a
  `categoria`/`tipo_instruccion`, mismo INSERT...SELECT). Vuelos creados directo por staff en
  semana publicada quedan NULL (= manual, comportamiento actual).
- `crearSolicitudPractica` acepta `debitar_saldo` en el body; el backend **revalida** el umbral
  (no confía en el cliente): si `debitar_saldo=true` pero el saldo no cubre el costo estimado,
  lo guarda como `false` y devuelve `debitar_saldo_ajustado: true` + mensaje — el frontend lo
  muestra como toast de advertencia para que el instructor sepa que quedó "pago al momento".

### 3. Cobro al cerrar (`instructorReporteController.firmarReporteVuelo`)

El gate actual "categoria IN (DEMO, CHEQUEO_LINEA) → sin auto-cobro" gana una excepción:

| Caso | Al firmar |
|---|---|
| CHEQUEO_LINEA + REFRESH + `vuelo.debitar_saldo=true` + saldo cubre el total | Auto-cobro vía `cargarVueloACuentaDentroTx` (horas cobradas × tarifa efectiva de su ficha), nota "Refresh" |
| Ídem pero el saldo YA NO cubre (gastó entre pedir y volar) | **No debita** — queda como pago al momento (regla: nunca negativo por esta vía) |
| REFRESH sin debitar / CHEQUEO / staff-created (NULL) | Sin auto-cobro (como hoy) |

⚠️ El chequeo "saldo cubre el total" corre **ANTES** de llamar a `cargarVueloACuentaDentroTx`:
esa función debita incondicionalmente (para alumnos normales se permite quedar en negativo).
Acá la regla es la inversa — si no cubre, ni se llama.

Sin cambios: no suma horas de licencia ni avance de curso; el PIC cobra su hora en nómina igual.

### 4. Visibilidad staff

- **Usuarios → Personal**: columna **Saldo** para filas INSTRUCTOR (`LEFT JOIN alumno` del
  usuario → `cuenta_corriente_alumno`; "—" sin ficha). En el modal de edición del instructor,
  botón **"Cuenta corriente"** → `/administracion/cuentas/:id_alumno` (solo si tiene ficha).
- **Calendario staff** (admin + programación): los CHEQUEO_LINEA Refresh exponen
  `debitar_saldo` y el popover/tooltip dice "debita de saldo" o "paga al momento". ⚠️ El badge
  de saldo-bajo actual **NO les aplica hoy**: las 3 queries que calculan `saldo_bajo`
  (`adminVueloController.getCalendario` y las 2 de `programacionController.getCalendario`)
  excluyen `CHEQUEO_LINEA` explícitamente. **Trabajo requerido:** ampliar esa condición para
  que un CHEQUEO_LINEA con `tipo_instruccion='REFRESH'` y `debitar_saldo=true` SÍ evalúe
  saldo-bajo (los demás CHEQUEO_LINEA siguen excluidos — no se cobran).
- **Vouchera / reporte del vuelo**: línea de modo de pago para Refresh ("Se debitó de saldo" /
  "Pago al momento") para que admin sepa si cobra a mano.

## Fuera de alcance

- Vuelos solo (sin PIC) del instructor — no existen.
- Bloquear pedidos por saldo — nunca se bloquea.
- Notificaciones push/correo del cobro — no pedidas.
- Cambiar el flujo de staff al crear CHEQUEO_LINEA (sigue manual/NULL).

## Verificación

- E2E contra Supabase real (transacción con rollback o cuentas demo): pedir Refresh con saldo
  suficiente/insuficiente, revalidación server-side del umbral, copia de `debitar_saldo` al
  publicar, y el cierre: debita cuando corresponde, no debita si el saldo dejó de cubrir, no
  debita CHEQUEO ni staff-created. Usuarios: saldo del instructor visible y link a su cuenta.
