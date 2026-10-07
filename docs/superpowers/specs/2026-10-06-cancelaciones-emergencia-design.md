# Cancelaciones de emergencia: constancia obligatoria y prioridad visible

**Fecha:** 2026-10-06 · **Estado:** implementado (constancia obligatoria en
emergencias: decisión de Daniel del 2026-10-06)

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

**En una ruta con parada, la salida es la del tramo 1.** Cada tramo es su propia
fila de `vuelo` con un bloque más tardío, cada uno ofrece su botón de cancelar,
y aceptar la cancelación de cualquiera cancela la ruta entera (CLAUDE.md §28.D).
Medir contra el bloque del tramo pedido dejaría cancelar como "con margen" y sin
constancia una ruta que sale en dos horas, con solo pedirlo sobre el tramo 2.
Las rutas viven en una sola fecha (moverlas de día se rechaza), así que la
salida del tramo 1 es la de la ruta.

Es un dato **derivado**, no una columna: sale de dos hechos que ya están
guardados. Sin migración (y por lo tanto sin regenerar el esquema `demo`).

Consecuencia aceptada de que sea derivado: si Turno le cambia el día o el bloque
a un vuelo que tiene una solicitud pendiente (`editarTripulacion`), la
clasificación de esa solicitud sigue al horario nuevo. Es raro y el resultado es
razonable: la prioridad refleja cuándo sale el vuelo hoy.

Para que la cuenta no dependa de la zona de la sesión —la familia de bugs de
CLAUDE.md §35.A— el `INSERT` escribe `creado_en` explícito con
`NOW() AT TIME ZONE 'America/El_Salvador'`, y antes de que la solicitud exista
la misma cuenta se hace contra ese mismo `NOW()` (que dentro de una transacción
es constante: la validación y la fila guardada no pueden discrepar).

La regla vive en **un solo lugar**, `services/cancelacionService.js`, como
fragmentos SQL que los demás consumen (la lección de `soloHorasFacturables`):

| fragmento | qué devuelve |
|---|---|
| `salidaVueloSQL(v, b)` | la salida programada (la del tramo 1 si es una ruta), `timestamp` sin zona en hora local |
| `AHORA_SV` | "ahora" en hora de El Salvador |
| `esEmergenciaSQL(sc, v, b)` | boolean, para una solicitud que ya existe |
| `seriaEmergenciaSQL(v, b)` | boolean, para un vuelo que todavía no tiene solicitud |
| `comoInstanteSQL(expr)` | `expr AT TIME ZONE 'America/El_Salvador'`: lo que se manda al cliente |

## Alumno: pedir la cancelación

### Cuándo se puede pedir

`GET /alumno/mi-horario` agrega `fecha_hora_vuelo` (la salida, como instante).
El cliente ya la leía (`v.fecha_hora_vuelo || v.fecha_vuelo`): con el campo
presente el botón queda disponible **hasta la hora real de salida**, que es lo
que el código siempre quiso hacer. En un tramo de ruta el campo trae la salida
de la ruta: ese campo solo alimenta el botón de cancelar, y una ruta que ya
salió no se cancela por solicitud (la corta Turno, §28.D).

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
emergencia** y usa el estilo rojo que ya existe. Esa etiqueta sale del reloj del
teléfono y es solo un anticipo: quien decide es el servidor. Si el formulario se
abrió con margen y se envía ya dentro de las 24 h, el servidor contesta 400 con
`codigo: "CONSTANCIA_REQUERIDA"` y el formulario pasa a modo emergencia ahí
mismo, sin perder lo escrito.

### El envío: una sola petición

`POST /alumno/vuelos/:id_vuelo/solicitar-cancelacion` acepta `multipart/form-data`
(`motivo` + `archivos[]`) además del JSON de hoy.

```
validar acceso, motivo y archivos (tipo, tamaño, cantidad)
BEGIN
  candado por alumno (pg_advisory_xact_lock)
  leer el vuelo: estado, ¿ya salió?, ¿es emergencia?      ← mismo NOW() que el INSERT
  estado no cancelable o ya salió     → 400
  emergencia y sin archivos           → 400  CONSTANCIA_REQUERIDA
  emergencia y Storage sin configurar → 503
  límite de 1 por semana              → 409 (como hoy)
  INSERT solicitud (creado_en explícito)
  subir los archivos a Storage (en paralelo), INSERT de cada adjunto
COMMIT
avisar a quien resuelve (después del COMMIT, best-effort)
```

La decisión de emergencia va **dentro** de la transacción: `NOW()` es constante
ahí, así que la validación y el `creado_en` guardado usan el mismo instante. Con
la validación afuera, una solicitud enviada justo al cruzar las 24 h pasaba como
"con margen" y quedaba guardada como emergencia sin constancia.

El candado por alumno serializa dos envíos simultáneos (dos pestañas, doble
toque): hoy los dos pasarían el límite semanal, y la subida de archivos alarga
esa ventana de milisegundos a segundos.

Qué pasa si una subida falla:

| | emergencia, no quedó ninguna | emergencia, quedó al menos una | con margen |
|---|---|---|---|
| resultado | `ROLLBACK`: **no se crea nada** | la solicitud **se crea** | la solicitud **se crea igual** |
| archivos | lo intentado se borra de Storage (best-effort) | los que subieron quedan adjuntos | los que subieron quedan adjuntos |
| respuesta | 502 con mensaje claro | 200 con `aviso_adjuntos` | 200 con `aviso_adjuntos` |

La regla es "al menos una constancia", no "todas las que se eligieron": si de
tres fotos sube una, la emergencia está respaldada y se envía avisando de las
que faltaron (el alumno puede agregarlas después desde "Mis cancelaciones").

Así se conserva la garantía de `c1adfa4` para las cancelaciones con margen
(una falla de Storage nunca las tumba) y se cumple la condición 2 para las de
emergencia. Daniel aceptó el costo: si Storage está caído, una emergencia no se
puede enviar por la app.

Los archivos se suben **en paralelo** y cada subida lleva un tope de 45 s: la
transacción queda abierta mientras se sube, y sin tope un Storage colgado
retendría una conexión del pool. El cliente de Storage no sabe abortar, así que
una subida que pierde contra el tope puede terminar igual más tarde: si llega,
se borra.

Storage se limpia **siempre por la ruta exacta** guardada o intentada, nunca por
carpeta: la cuenta de demostraciones comparte el bucket y sus ids chocan con los
reales. Por lo mismo, las constancias subidas desde `demo` van bajo
`cancelaciones/demo-<id>/`.

La respuesta agrega `es_emergencia`, `adjuntos` y `aviso_adjuntos`.

**Clientes viejos** (una pestaña abierta antes del deploy): mandan JSON y
después suben aparte. Con margen siguen funcionando. En emergencia reciben el
400, cuyo mensaje dice que recarguen la página.

### Errores de subida legibles

Las rutas que reciben constancias pasan por `middlewares/recibirConstancias.js`,
que envuelve a `multer` y convierte sus errores en 400 en español ("pesa más
de 8 MB", "máximo 5 archivos", tipo no permitido). Hoy salen como 500.

El mismo middleware arregla dos cosas que salieron al probarlo con pedidos
reales:

- **Los nombres con tildes se guardaban rotos.** `multer` lee el nombre del
  archivo como latin1 y los navegadores lo mandan en UTF-8: la constancia del
  2026-10-06 quedó como "Constancia mÃ©dica .pdf". Se rehace la lectura.
- **Un archivo de exactamente 8 MB se rechazaba.** `multer` corta cuando el
  archivo llega al límite, no cuando lo pasa; su límite va en 8 MB + 1 para
  que coincida con lo que valida el formulario.

### Después de enviar

Los endpoints de `c1adfa4` se conservan, con dos cambios:

- `DELETE /alumno/adjuntos-cancelacion/:id`: en una emergencia **no se puede
  borrar la última constancia** (400). Sin esto la regla se salta adjuntando y
  borrando. La solicitud se bloquea (`FOR UPDATE`) mientras se cuenta y se
  borra: dos borrados simultáneos sobre una emergencia con dos archivos pasarían
  los dos la cuenta.
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

**El push no salía nunca.** `utils/webpush.js` define `notificarUsuarios` desde
el 2026-07-23 pero no la exportaba: el controller recibía `undefined` y el
`TypeError` se lo comía el `try/catch` del aviso, que es best-effort a
propósito. El aviso de la campana sí llegaba y por eso nadie lo notó. Salió al
correr el controller de punta a punta; se arregla exportándola.

Al **aceptar**, el vuelo cancelado queda con `tipo_cancelacion = 'EMERGENCIA'` o
`'NORMAL'` (hoy queda `NULL`). El CHECK de la columna ya admite los dos valores,
y el panel "Vuelos cancelados" y el reporte de Turno ya saben mostrarlos.

### Una solicitud pendiente cuando el vuelo ya salió

Con solicitudes que pueden llegar minutos antes, esto deja de ser raro. La lista
solo las vence al día siguiente (por fecha), así que durante el día siguen
arriba con el botón Aceptar. Dos cambios:

- El listado agrega `ya_salio`, y la tarjeta lo dice: "La hora de salida ya
  pasó". Sigue pendiente y se puede resolver: aceptar después de la hora es una
  decisión legítima (el alumno avisó y no llegó).
- **Aceptar se rechaza con 409 si el vuelo —o cualquier tramo de su ruta— ya
  está en curso o completado** (`SALIDA_HANGAR`, `EN_VUELO`, `EN_PROGRESO`,
  `REGRESO_HANGAR`, `FINALIZANDO`, `COMPLETADO`). Hoy aceptar pasa a `CANCELADO`
  todo lo que no esté cancelado o completado, o sea que cancelaría un avión en
  vuelo. Rechazar la solicitud sigue permitido siempre.

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
| `middlewares/recibirConstancias.js` (nuevo) | `multer` envuelto: errores como 400 en español, nombres con tildes |
| `routes/alumnoRoutes.js` | el middleware en las dos rutas que reciben archivos |
| `utils/webpush.js` | exporta `notificarUsuarios` |

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

## Lo que encontró la revisión del código

Una revisión independiente del diff, antes de desplegar. Ningún defecto crítico;
tres importantes, corregidos:

1. **Agregar constancias después guardaba las filas en autocommit.** Si la base
   fallaba en la segunda, la primera ya estaba confirmada y la limpieza le
   borraba el archivo: quedaba una constancia que no se podía abrir (y en una
   emergencia el alumno podía entonces quitar la original). Ahora
   `subirAdjuntos` va en dos tiempos: sube **sin** transacción abierta, y
   registra lo subido en una transacción corta que bloquea la solicitud y
   vuelve a validar estado y cantidad. O quedan todas las filas o ninguna.
   En el servicio: `subirConstancias` (solo Storage) + `registrarConstancias`
   (solo base, exige transacción); `guardarConstancias` las encadena para el
   envío, que ya tiene la suya.
2. **El candado por alumno se esperaba.** Quien lo tiene puede estar subiendo
   hasta 45 s con la transacción abierta, y cada envío que se quedaba esperando
   retenía una conexión del pool (10 para toda la app). Ahora es
   `pg_try_advisory_xact_lock`: el segundo envío simultáneo recibe 409 enseguida.
3. **La pantalla nueva contra el backend anterior.** Es lo que pasa si en un
   despliegue Vercel termina antes que Railway, o si el de Railway falla. Ese
   backend no tiene `multer` en la ruta de crear y Express 4 deja `req.body`
   vacío: guardaba la solicitud **sin motivo y sin archivos** y contestaba 200.
   El formulario reconoce al backend nuevo porque contesta `es_emergencia` (o
   `CONSTANCIA_REQUERIDA`); al anterior le habla como antes, en dos pasos.

Y uno menor que se veía: la anticipación se redondeaba, así que una solicitud
pedida 23 h 50 min antes decía "pedida 24 h" al lado del badge. Ahora trunca.

Quedaron sin tocar, anotados: aceptar tiene una ventana de milisegundos entre
comprobar que el vuelo no salió y cancelarlo; `borrarMiAdjunto` espera a Storage
con la conexión tomada; una subida que Storage reportó fallida pero llegó queda
huérfana; un archivo de 0 bytes cumple la regla; y `MiHorarioList` desmonta el
formulario si la lista se recarga con él abierto (ya pasaba).

## Pruebas

- **Unitarias** (`npm test`, sin red). Backend: 95 (60 de antes + 35). Frontend:
  32 (23 de antes + 9). Cubren la validación de archivos de los dos lados, el
  middleware con pedidos HTTP reales, y subir/borrar constancias contra el
  Storage de mentira (`tests/storageFalso.js`, que ganó borrado y fallas de
  una sola vez).
- **La regla en SQL** (`tests/cancelacionEmergenciaSQL.test.js`), contra la
  base y solo leyendo: 23 h 59 min es emergencia, 24 h no; cada caso corre con
  la sesión en UTC y en El Salvador y da lo mismo; en las rutas con parada que
  existen, la salida de cada tramo es la del tramo 1. Sin credenciales de base
  se salta.
- **De punta a punta** (`_e2e_cancelaciones.js`, no se commitea): los
  controllers de verdad contra el esquema real, con la sesión en UTC, dentro de
  UNA transacción que al final se deshace. Reciben un `db` de mentira que les
  entrega esa conexión y traduce sus `BEGIN/COMMIT/ROLLBACK` a `SAVEPOINT`, así
  su lógica transaccional corre entera; los vuelos, la ruta y un bloque horario
  de prueba se crean ahí adentro y nadie más los ve. 63 comprobaciones, y al
  terminar el censo de la base es idéntico al de antes de empezar. Los defectos
  1 y 2 de la revisión se reprodujeron ahí antes de corregirlos (52 de 57).
- **En el navegador.** La pantalla de quien aprueba, contra los datos reales en
  solo lectura y con el backend local en `TZ=UTC`: la solicitud pendiente del
  2026-10-06 sale con contorno rojo, badge, "pedida 23 h antes del vuelo" y el
  vuelo a la 1:30 p. m. Las pantallas del alumno, contra un backend de mentira
  (`_mock_alumno.js`) que usa el middleware real de archivos: modo emergencia,
  validación, acumulación, un solo pedido multipart, el cambio a emergencia por
  el 400, el aviso, y "Mis cancelaciones". A 1280 y a 375 px, sin desborde. El
  mismo servidor de mentira tiene un modo "backend viejo" para el punto 3 de la
  revisión: ahí la pantalla manda la solicitud en JSON y después los archivos.

Lo que NO se probó: el formulario del alumno contra el backend real en el
navegador. No hay un alumno de prueba con un vuelo en las próximas 24 h, crear
uno lo mostraría en la Proyección, y el esquema `demo` está atrasado (abajo).

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
