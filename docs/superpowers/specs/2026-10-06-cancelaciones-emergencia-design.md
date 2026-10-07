# Cancelaciones de emergencia: constancia obligatoria y prioridad visible

**Fecha:** 2026-10-06 · **Estado:** diseño acordado con Daniel (constancia
obligatoria en emergencias: decisión suya del 2026-10-06)

## El problema

La condición 2 que el alumno acepta al cancelar dice:

> Las cancelaciones con menos de 24 horas se consideran cancelación de
> emergencia y requieren justificación obligatoria con documento adjunto.

El sistema no hace nada de eso. Medido el 2026-10-06:

1. **La "emergencia" no existe.** `MiHorarioList.jsx` calcula `esEmergencia` y
   no lo usa; quedan de la versión original un botón y un badge en CSS
   (`.mhl__btn--emergency`, `.cv-badge-emergencia`) sin nada que los pinte. El
   backend no distingue. Quien aprueba ve todas las tarjetas iguales, ordenadas
   por fecha de pedido.
2. **La constancia es opcional siempre.** Desde el 2026-09-30 (`c1adfa4`) se
   puede adjuntar, pero en un segundo request y nunca como requisito.
3. **El botón de cancelar desaparece a las 18:00 de la víspera.** El horario del
   alumno no trae `fecha_hora_vuelo`, así que el cliente cae a `fecha_vuelo`
   (un `DATE` que llega como medianoche UTC = 18:00 de El Salvador del día
   anterior). De 26 solicitudes históricas, ninguna se pidió el día del vuelo ni
   después de las 18:00 de la víspera; el margen mínimo es 15.2 h.
4. **Quien aprueba ve las horas 6 h antes.** `fecha_hora_vuelo` y
   `fecha_solicitud` salen como `timestamp` sin zona; el proceso de Railway
   (UTC) los lee como UTC y el navegador les resta 6 h. Reproducido con
   `TZ=UTC` sobre la solicitud 33: vuelo 13:30 → `13:30Z` → se muestra 7:30.
5. **"Mis cancelaciones" del alumno** muestra "Fecha Vuelo: Invalid Date" (el
   endpoint no manda ese campo), no lista las constancias y no deja agregar una
   después. Si la subida falla, no hay forma de reintentar.

## La regla

**Una solicitud es de emergencia cuando se pidió con menos de 24 horas para la
salida programada del vuelo.**

```
salida   = vuelo.fecha_vuelo + bloque_horario.hora_inicio      (hora de El Salvador)
emergencia  ⇔  salida − solicitud_cancelacion.creado_en < 24 h
```

Es un dato **derivado**, no una columna: sale de dos hechos que ya están
guardados. Sin migración (y por lo tanto sin regenerar el esquema `demo`).

Para que la cuenta no dependa de la zona de la sesión —la familia de bugs de
CLAUDE.md §35.A— el `INSERT` escribe `creado_en` explícito con
`NOW() AT TIME ZONE 'America/El_Salvador'`, y antes de que la solicitud exista
la misma cuenta se hace contra ese mismo `NOW()` (que dentro de una transacción
es constante: la validación y la fila guardada no pueden discrepar).

La regla vive en **un solo lugar**, `services/cancelacionService.js`, como
fragmentos SQL que los demás consumen (la lección de `soloHorasFacturables`):

| fragmento | qué devuelve |
|---|---|
| `salidaVueloSQL(v, b)` | la salida programada, `timestamp` sin zona en hora local |
| `AHORA_SV` | "ahora" en hora de El Salvador |
| `esEmergenciaSQL(sc, v, b)` | boolean, para una solicitud que ya existe |
| `seriaEmergenciaSQL(v, b)` | boolean, para un vuelo que todavía no tiene solicitud |
| `comoInstanteSQL(expr)` | `expr AT TIME ZONE 'America/El_Salvador'`: lo que se manda al cliente |

## Alumno: pedir la cancelación

### Cuándo se puede pedir

`GET /alumno/mi-horario` agrega `fecha_hora_vuelo` (la salida, como instante).
El cliente ya la leía (`v.fecha_hora_vuelo || v.fecha_vuelo`): con el campo
presente el botón queda disponible **hasta la hora real de salida**, que es lo
que el código siempre quiso hacer.

El servidor pasa a ser la autoridad. `solicitarCancelacion` rechaza con 400:

- vuelo cuya salida ya pasó;
- vuelo en un estado que no es `PUBLICADO`, `AJUSTADO`, `PROGRAMADO` ni
  `EN_ESPERA_TRAMO` (los mismos en los que la pantalla ofrece el botón);
- motivo vacío (hoy solo lo valida el cliente).

Consecuencia que cambia la operación: un alumno podrá pedir una cancelación el
mismo día del vuelo, incluso minutos antes. Sigue siendo una solicitud que
alguien aprueba o rechaza.

### El formulario

`GET /alumno/condiciones-cancelacion?id_vuelo=` agrega `es_emergencia` y
`horas_para_vuelo`. El modal decide con lo que dice el servidor, no con el reloj
del teléfono.

Si es emergencia:

- badge **Emergencia** en el encabezado (la clase ya existe);
- aviso en rojo: faltan menos de 24 h, es una cancelación de emergencia y
  necesita al menos una constancia;
- el campo pasa de "(opcional)" a obligatorio y **el botón de enviar no se
  habilita sin al menos un archivo**.

En cualquier solicitud, el cliente valida antes de enviar lo mismo que el
servidor: hasta 5 archivos, 8 MB cada uno, JPG/PNG/PDF. Hoy un archivo de 9 MB
recién falla en el servidor, con un mensaje en inglés.

En el horario, el botón de un vuelo a menos de 24 h dice **Cancelación de
emergencia** y usa el estilo rojo que ya existe.

### El envío: una sola petición

`POST /alumno/vuelos/:id_vuelo/solicitar-cancelacion` acepta `multipart/form-data`
(`motivo` + `archivos[]`) además del JSON de hoy.

```
validar acceso, motivo, estado y hora del vuelo
validar tipos de archivo
emergencia y sin archivos        → 400
emergencia y Storage sin config  → 503
BEGIN
  límite de 1 por semana         → 409 (como hoy)
  INSERT solicitud (creado_en explícito)
  por cada archivo: subir a Storage, INSERT adjunto
COMMIT
avisar a quien resuelve (después del COMMIT, best-effort)
```

Qué pasa si una subida falla:

| | emergencia | con margen |
|---|---|---|
| resultado | `ROLLBACK`: **no se crea nada** | la solicitud **se crea igual** |
| archivos ya subidos | se borran de Storage (best-effort) | los que subieron quedan adjuntos |
| respuesta | 502 con mensaje claro | 200 con `aviso_adjuntos` |

Así se conserva la garantía de `c1adfa4` para las cancelaciones con margen
(una falla de Storage nunca las tumba) y se cumple la condición 2 para las de
emergencia. Daniel aceptó el costo: si Storage está caído, una emergencia no se
puede enviar por la app.

Cada subida lleva un tope de 45 s: la transacción queda abierta mientras se
sube, y sin tope un Storage colgado retendría una conexión del pool.

La respuesta agrega `es_emergencia`, `adjuntos` y `aviso_adjuntos`.

**Clientes viejos** (una pestaña abierta antes del deploy): mandan JSON y
después suben aparte. Con margen siguen funcionando. En emergencia reciben el
400, cuyo mensaje dice que recarguen la página.

### Errores de subida legibles

Las rutas que reciben constancias pasan por un envoltorio de `multer` que
convierte sus errores en 400 en español ("pesa más de 8 MB", "máximo 5
archivos", tipo no permitido). Hoy salen como 500.

### Después de enviar

Los endpoints de `c1adfa4` se conservan, con dos cambios:

- `DELETE /alumno/adjuntos-cancelacion/:id`: en una emergencia **no se puede
  borrar la última constancia** (400). Sin esto la regla se salta adjuntando y
  borrando.
- `DELETE /alumno/solicitudes-cancelacion/:id` (retirar la solicitud): además
  de borrar la fila, borra de Storage sus archivos (best-effort, después del
  COMMIT). Hoy quedan huérfanos, y ahora van a ser constancias médicas.

`GET /alumno/mis-solicitudes-cancelacion` pasa de `sc.*` a columnas explícitas
y agrega `fecha_hora_vuelo`, `es_emergencia` y `adjuntos`; `creado_en` sale como
instante.

La pestaña **Mis cancelaciones** se saca de `Dashboard.jsx` a un componente
propio (`components/MisCancelaciones/`) y muestra, por solicitud: fecha del
vuelo (corregida), badge de emergencia, sus constancias (se abren con URL
firmada) y, mientras siga `PENDIENTE`, agregar más o quitar una.

## Quien aprueba: prioridad visible

`GET /admin/solicitudes-cancelacion` agrega `es_emergencia` y
`horas_anticipacion` (horas entre el pedido y la salida), manda
`fecha_hora_vuelo` y `fecha_solicitud` como instantes (arregla las 6 h), y
ordena las pendientes así: **emergencias primero, después la salida más
próxima**. El historial sigue por fecha de pedido, lo más reciente arriba.

En la pantalla de Cancelaciones (`/admin/cancelaciones` y
`/programacion/cancelaciones`, el mismo componente), una emergencia lleva:

- **contorno rojo** en toda la tarjeta (2 px, `--c-danger-500`) — contorno
  completo, no franja lateral (DESIGN.md);
- badge **EMERGENCIA** junto al estado;
- la línea "Pedida 22 h antes del vuelo";
- si no trae ninguna constancia (solicitudes anteriores a este cambio), el aviso
  "Sin constancia".

En el historial la emergencia conserva el badge pero no el contorno: ya no hay
nada que priorizar.

La notificación (in-app y push) a quienes resuelven dice **Cancelación de
EMERGENCIA** cuando aplica.

Al **aceptar**, el vuelo cancelado queda con `tipo_cancelacion = 'EMERGENCIA'` o
`'NORMAL'` (hoy queda `NULL`). El CHECK de la columna ya admite los dos valores,
y el panel "Vuelos cancelados" y el reporte de Turno ya saben mostrarlos.

## Archivos

Backend (`legacy/CAA-backend/`):

| archivo | cambio |
|---|---|
| `services/cancelacionService.js` | los fragmentos SQL de la regla |
| `utils/constancias.js` (nuevo) | límites, validación de archivos y traducción de errores de `multer`: funciones puras |
| `controllers/alumno/alumnoCancelacionController.js` | crear con archivos; validaciones; listado del alumno; limpieza de Storage al retirar |
| `controllers/cancelacionAdjuntoController.js` | no borrar la última constancia de una emergencia; usa `utils/constancias.js` |
| `controllers/alumno/alumnoVueloController.js` | `fecha_hora_vuelo` en el horario; `es_emergencia` en condiciones |
| `controllers/admin/adminCancelacionController.js` | listado (emergencia, orden, instantes); `tipo_cancelacion` al aceptar |
| `routes/alumnoRoutes.js` | `multer` en la ruta de crear; envoltorio de errores |

Frontend (`CAA-frontend/src/`):

| archivo | cambio |
|---|---|
| `utils/constancias.js` (nuevo) | la misma validación de archivos, del lado del cliente |
| `services/alumnoApi.js` | crear con archivos; borrar constancia |
| `components/CancelarVueloModal/` | modo emergencia, validación, un solo envío |
| `components/MiHorarioList/MiHorarioList.jsx` | botón de emergencia |
| `components/MisCancelaciones/` (nuevo) | la pestaña del alumno |
| `pages/Alumno/Dashboard.jsx` | usa el componente nuevo |
| `pages/Admin/Cancelaciones.{jsx,css}` | contorno, badge, anticipación, "sin constancia" |

## Pruebas

- **Unitarias** (`npm test`, sin red): `utils/constancias.js` del backend y del
  frontend — tipos, tamaños, cantidad, mensajes.
- **La regla en SQL**, contra la base pero sin tocar ninguna tabla (filas
  armadas con `VALUES`): 23 h 59 min es emergencia, 24 h no; no cambia con la
  zona de la sesión (`SET timezone` a UTC y a El Salvador dan lo mismo).
- **De punta a punta**, backend local: emergencia sin archivo → 400; con archivo
  → creada con su adjunto; borrar la última → 400; con margen y sin archivo →
  creada; vuelo pasado → 400; el listado de quien aprueba trae la emergencia
  primero y las horas correctas con el proceso en UTC; aceptar deja
  `tipo_cancelacion = 'EMERGENCIA'`.
- **En el navegador**, a 1280 y 375 px: el formulario en modo emergencia y la
  tarjeta con contorno rojo.

Las pruebas de punta a punta van contra el esquema `demo`, no contra los datos
de CAAA: crear una solicitud avisa a los jefes de pilotos reales.

## Fuera de alcance

- Avisar al instructor asignado al vuelo (la condición 4 lo promete y hoy solo
  se avisa a quienes resuelven).
- Comprimir las fotos en el teléfono antes de subirlas.
- Cambiar el límite de 1 cancelación por semana o las multas.
- Un mínimo de anticipación para pedir la cancelación.

## Pendiente que no es de este cambio

El esquema `demo` está dos migraciones atrás: le faltan la tabla
`solicitud_cancelacion_adjunto` y la columna `solicitud_vuelo.creado_en`. Hoy la
pantalla de Cancelaciones de la cuenta de demostraciones falla. Se arregla
regenerando el esquema (`docs/demo/RUNBOOK.md` §3), y hace falta para correr las
pruebas de punta a punta ahí.
