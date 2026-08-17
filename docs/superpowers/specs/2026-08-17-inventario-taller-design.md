# Inventario del Taller (bodega OMA) — diseño

**Fecha:** 2026-08-17 · **Estado:** aprobado por Daniel (diseño conversacional, sesión 2026-08-17)

**Fuente:** `INVENTARIO OMA CAAA-CONTADOR ACTUALIZADO (1).xlsx` (3 hojas: ENTRADAS, SALIDAS,
INVENTARIO PARTES GASTABLES), auditado con openpyxl. Todos los números de este documento salen
de esa auditoría, no de estimaciones.

## Problema

La bodega de la OMA se lleva en Excel. El Excel funciona, pero tiene un defecto estructural que
corrompe el stock en silencio y que no se puede arreglar dentro de Excel.

**El defecto:** las columnas `entradas` y `salidas` de la hoja de inventario no suman por código.
La fórmula real es

```
=IFERROR(SUMIFS(ENTRADAS[CANTIDAD],
                ENTRADAS[DESCRIPCION],     INVENTARIO[[#This Row],[descripcion]],
                ENTRADAS[numero de parte], INVENTARIO[[#This Row],[numero de parte]]), "-")
```

es decir, cruza **texto libre: descripción + número de parte**. Si el mecánico escribe `100AW` en
vez de `100 AW`, o `ORING` en vez de `O-RING`, ese movimiento desaparece del stock sin ningún
aviso. Daño medido:

- **26 líneas de entrada** y **9 de salida** no cruzan con ningún ítem → movimientos invisibles.
- **22 ítems** cambian de stock si se recalcula por código.
- `000039 ACEITE 100 AW`: 173 salidas, dos escritas con PN `Q` y `100AW`. El Excel dice −15; por
  código son −17.
- **11 claves duplicadas** (dos ítems con la misma descripción y sin PN: `CARBURADOR`, `MAGNETO`,
  `TACOMETRO`, …) → el SUMIFS le suma lo mismo a ambos.

**Deuda de datos acumulada:** 500 de 662 ítems sin costo unitario (el importe total del inventario
da $3,880 cuando solo los positivos ya suman $7,161) · 356 sin ubicación · 20 sin código · 1 código
repetido (`000585`) · 29 valores de clasificación para ~15 categorías reales (`FERRETERIA` /
`FERRETERIA `, `INSTRUMENTOS ` / `INSTUMENTOS ` / `INSTRUMENTO`) · la unidad de medida vive solo en
ENTRADAS y con 7 variantes (`UN`,`UN `,`QT`,`QTO`,`QTS`,`PIE`,`FT`) · la "fecha de actualización"
es texto (`'27-5-2026'`, `'  26-5-2026'`) · 64 ítems llevan el S/N dentro de la descripción ·
no existe columna de "último movimiento" (hay un `SIN MOVIMIENTO` tecleado a mano en 196 ítems).

**Lo que ya hay en el sistema:** `taller_repuesto` y `taller_movimiento_inventario` (migración 011)
con pantalla en `/taller/inventario`, pero **prácticamente vacías: 3 repuestos y 2 movimientos de
demo**. Les falta la cabecera de documento (una FA con 20 renglones hoy serían 20 movimientos
sueltos), el correlativo, el saldo corrido, el amarre al mantenimiento, y bloquean el stock
negativo con un 400 seco cuando en la realidad la bodega sí termina en negativo.

## Decisiones tomadas (con Daniel)

1. **Migrar todo el histórico 2026** (39 FA + 243 REQ), cruzando por **código**, no por texto, con
   reporte de diferencias contra el Excel.
2. **Costeo: último costo conocido.** La entrada actualiza `costo_unitario` del ítem; la salida
   guarda ese costo como foto del momento. Sin promedio ponderado ni FIFO.
3. **Salidas amarradas** a aeronave (obligatoria hacia adelante) y opcionalmente a un
   mantenimiento **que ya existe** en el sistema (`taller_cumplimiento` o `mantenimiento_aeronave`),
   con el motivo en texto libre siempre disponible. No se construyen hojas de trabajo todavía.
4. **Stock negativo: bloquear, salvo autorización.** 409 con el detalle de qué falta.
5. **La autorización es una capacidad asignable** (`usuario.puede_forzar_inventario`), estilo
   `puede_programar` / `puede_operaciones` del instructor.
6. **La entrada lleva proveedor + número real de factura y genera el egreso en Contabilidad**
   (categoría `REPUESTOS`). Se **quita** el egreso que hoy se dispara en la salida, que duplicaría
   el gasto. **El costo por renglón es opcional**: sin costo no hay egreso, y el documento queda en
   la cola de "costos pendientes" que trabajan Taller y Contabilidad juntos.
7. **Arquitectura: extender lo existente** (opción A). Se agrega la cabecera de documento y se le
   cuelgan los movimientos actuales. Descartadas: (B) tablas nuevas con nombres de bodega — mismo
   modelo final por el doble de trabajo; (C) sin cabecera, el correlativo como texto repetido en
   cada renglón — `FA-00001` tiene 357 renglones y no habría dónde anular un documento completo.
8. **Los 11 ítems con descripción duplicada son ítems distintos** (dos carburadores físicos
   diferentes) y se migran separados, cada uno con su código.
9. **Las aeronaves de terceros se dan de alta como aeronaves externas** (`aeronave.es_externa`).

## Sección 1 — Modelo de datos

### `taller_repuesto` — catálogo (la hoja *INVENTARIO PARTES GASTABLES*)

Ya existe (`parte_no`, `descripcion`, `categoria`, `ubicacion`, `unidad`, `stock_actual`,
`stock_minimo`, `costo_unitario`, `serie_no`, `activo`). Columnas nuevas:

- `codigo VARCHAR(10) UNIQUE` — el correlativo de 6 dígitos del Excel (`000039`). **Es la llave
  real del ítem**, no la descripción. Lo genera el sistema (MAX+1) al crear un ítem.
- `ultimo_movimiento_en DATE` — fecha del último movimiento, mantenida por el sistema. Reemplaza
  el `SIN MOVIMIENTO` tecleado a mano.
- `ultima_entrada_en DATE` — la *"FECHA DE ACTUALIZACION"* del Excel, ahora fecha real y automática.
- `es_serializado BOOLEAN NOT NULL DEFAULT FALSE` — los 64 rotables con S/N.

`unidad` pasa a lista cerrada con `CHECK`: `UN` · `QT` · `GAL` · `FT` · `KIT` · `JGO` · `LB`.

`stock_actual` se mantiene como **cache** (lo necesita el bloqueo por existencia bajo `FOR UPDATE`).
Es una suma con signo, por lo tanto independiente del orden de inserción: no sufre el problema del
saldo congelado.

### `taller_documento_inventario` — cabecera (**nueva**)

```
id_documento     SERIAL PK
tipo             VARCHAR(10)  CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE'))
anio             INTEGER      NOT NULL
numero           INTEGER      NOT NULL
correlativo      VARCHAR(24)  NOT NULL      -- 'FA-00001-2026' | 'REQ-001-2026' | 'AJ-001-2026'
                              UNIQUE (tipo, anio, numero)
fecha            DATE         NOT NULL DEFAULT CURRENT_DATE
-- ENTRADA
proveedor        VARCHAR(160)
factura_no       VARCHAR(60)
id_egreso        INTEGER REFERENCES egreso(id)
-- SALIDA
id_aeronave      INTEGER REFERENCES aeronave(id_aeronave)
id_cumplimiento  INTEGER REFERENCES taller_cumplimiento(id_cumplimiento)
id_mantenimiento INTEGER REFERENCES mantenimiento_aeronave(id_mantenimiento)
motivo           TEXT
-- siempre
estado           VARCHAR(12) NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','ANULADO'))
anulado_en       TIMESTAMP
anulado_por      INTEGER REFERENCES usuario(id_usuario)
motivo_anulacion TEXT
nota             TEXT
origen           VARCHAR(20)                -- 'EXCEL_2026' en lo migrado, NULL en lo nuevo
registrado_por   INTEGER REFERENCES usuario(id_usuario)
creado_en        TIMESTAMP NOT NULL DEFAULT NOW()
```

`CHECK` adicional: `id_cumplimiento` e `id_mantenimiento` no pueden estar ambos con valor.

El correlativo se genera **dentro de la transacción** con `pg_advisory_xact_lock(hashtext(tipo||anio))`
— el mismo recurso que ya usamos contra la doble firma de vouchera (§27), que además no entra en el
grafo de locks de fila y por lo tanto no puede invertir orden con nada.

### `taller_movimiento_inventario` — renglón

Ya existe. Columnas nuevas: `id_documento INTEGER NOT NULL REFERENCES taller_documento_inventario`,
`forzado BOOLEAN NOT NULL DEFAULT FALSE`, `motivo_forzado TEXT`.

**Cambio de semántica:** `cantidad` pasa a ser **con signo** (+entrada, −salida, ±ajuste). Hoy es
siempre positiva y el `tipo` da el signo, y un `AJUSTE` *fija* el stock a un valor absoluto. Con
signo, el saldo del kardex es una suma acumulada — que es la lección ya pagada en la cuenta
corriente (§26.A: `monto_usd` signado, saldo por fila calculado **al leer**, nunca congelado,
porque un movimiento con fecha anterior descuadra todo lo de abajo). En la pantalla el ajuste se
sigue tecleando como "conté 18" y el sistema guarda el delta.

La columna `tipo` del movimiento se elimina: ahora vive en la cabecera.

### `usuario.puede_forzar_inventario BOOLEAN NOT NULL DEFAULT FALSE`

Capacidad de jefe de taller. Habilita forzar una salida sin existencia y anular documentos.
Se asigna desde Administración → Usuarios → Personal.

### `aeronave.es_externa BOOLEAN NOT NULL DEFAULT FALSE`

Aeronave de tercero a la que la OMA le da mantenimiento. No vuela, no se agenda, no aparece en
Programación ni Proyección; sí recibe requisiciones de material e historial de mantenimiento.

## Sección 2 — Flujos

Todo lo que mueve existencia pasa por un documento. No hay forma de tocar el stock por fuera.

### Entrada `FA-xxxxx-2026`

Cabecera: fecha, proveedor, n° de factura real, nota. Renglones: ítem (buscado por código,
descripción o PN) + cantidad + costo unitario **opcional**. Si el repuesto no existe, se crea desde
el mismo formulario y el sistema le asigna el siguiente código libre.

En una transacción: genera correlativo → inserta cabecera y renglones (cantidad positiva) → por
cada ítem suma stock, actualiza `costo_unitario` **solo si el renglón trae costo**, y sella
`ultima_entrada_en` / `ultimo_movimiento_en` → si el total es mayor que cero, crea **un solo egreso**
`REPUESTOS` con el proveedor, el monto total y concepto `Compra FA-00038-2026 (fact. 12345)`, y lo
enlaza a la cabecera.

### Salida `REQ-xxx-2026`

Cabecera: fecha, **aeronave obligatoria**, motivo, y un selector opcional que ofrece los
mantenimientos de *esa* aeronave (cumplimientos recientes + mantenimientos abiertos). Renglones:
ítem + cantidad, mostrando la existencia disponible.

En una transacción: toma los ítems `FOR UPDATE` **en orden ascendente de `id_repuesto`** (dos
requisiciones simultáneas nunca se traban entre sí — la inversión de orden de locks que ya nos mordió
en el cierre de vuelo, §27) → valida existencia; si algún renglón excede, responde **409** con la
lista de qué falta y por cuánto, y con `forzable: true` si el usuario tiene la capacidad → genera
correlativo, inserta cabecera y renglones (cantidad negativa), descuenta stock → guarda en cada
renglón el `costo_unitario` vigente del ítem como foto del momento.

**No crea egreso.** El gasto ya se contabilizó en la compra. Se elimina el checkbox "Registrar
egreso en Contabilidad" que hoy existe en la salida.

Reintento forzado: el cliente reenvía con `forzar: true` + `motivo_forzado` (obligatorio). Los
renglones afectados quedan con `forzado = true`.

### Ajuste `AJ-xxx-2026`

Cabecera: fecha + **motivo obligatorio**. Renglones: ítem + *existencia contada*; el servidor
calcula el delta contra `stock_actual` y guarda ese delta con su signo. Nunca toca Contabilidad.
Es la herramienta con la que se limpian los negativos que arrastre la migración.

### Anular

Los documentos **no se editan**: se anulan y se rehacen. Anular marca `estado='ANULADO'`, devuelve
el stock de todos sus renglones, saca el documento del kardex y, si era una entrada con egreso,
borra el egreso enlazado (consistente con el borrado directo que ya adoptó la cuenta corriente,
§26.A). El documento sigue visible marcado como anulado y **su correlativo no se reutiliza**.
Pueden anular ADMIN y quien tenga `puede_forzar_inventario`.

### Reglas duras

| Situación | Respuesta |
|---|---|
| Salida sin aeronave | 400 |
| Salida que excede la existencia | **409**, salvo capacidad + `motivo_forzado` |
| Documento sin renglones, o cantidad en cero | 400 |
| Ajuste sin motivo | 400 |
| Fecha retroactiva | **Permitida** |
| Ítem inactivo | No aparece en el buscador de renglones |

## Sección 3 — Kardex y pantallas

### Kardex de un ítem

`GET /taller/inventario/:id/kardex?desde&hasta`. Ficha del ítem arriba; abajo el movimiento con
columnas Fecha · Documento · Detalle · Entrada · Salida · **Saldo** · Costo u. · Valor.

```sql
SUM(m.cantidad) OVER (ORDER BY m.fecha, m.id_mov ROWS UNBOUNDED PRECEDING) AS saldo_corrido
```

filtrando `d.estado = 'VIGENTE'`. Dos detalles que separan un kardex de una lista de movimientos:

- **El saldo se calcula al leer**, nunca se guarda. Si se guardara, un movimiento con fecha anterior
  dejaría mintiendo a todo lo de abajo (§26.A).
- **Con filtro de fechas, la primera fila es un *saldo inicial*** con todo lo anterior al rango.
  Sin eso el kardex filtrado arranca en cero y no cuadra con la existencia.

Los renglones forzados salen marcados con quién autorizó y por qué. Los anulados no aparecen salvo
que se prenda el switch. Se imprime a PDF con `utils/pdfGenerator.js`, el mismo de voucheras.

### Pantallas

1. **Existencias** — la hoja de inventario, con buscador y filtros por clasificación y ubicación,
   más atajos *bajo mínimo* · *en negativo* · *sin movimiento* · *sin costo*. "Sin movimiento" sale
   de `ultimo_movimiento_en`, ya no se teclea.
2. **Documentos** — listado de entradas y salidas con correlativo, fecha, proveedor o aeronave,
   renglones y total; se abre para ver el detalle.
3. **Consumo por aeronave** — cuánto material y cuánto dinero por avión en un período, y abriendo,
   qué consumió cada inspección. Es el pago de haber amarrado la salida al mantenimiento.
4. **Costos pendientes** — ítems y entradas sin costo, editables en línea, para la ingesta conjunta
   de Taller y Contabilidad. Al completar los costos de una entrada, ofrece generar el egreso que
   quedó pendiente.

Estilo *Core Admin* (`adf-*`) dentro del shell del Taller que ya existe.

### Roles

Escritura de documentos: `TALLER` + `ADMIN`. Lectura de reportes y edición de la pantalla 4:
`ADMINISTRACION` (la ingesta de costos es trabajo conjunto). `ADMIN`, todo.

## Sección 4 — Migración del Excel

Script re-ejecutable en una transacción; lo migrado queda marcado `origen='EXCEL_2026'` para poder
borrarlo y recargarlo.

**Paso 0** — borrar los 3 repuestos y 2 movimientos de demo.

**Paso 1 · Catálogo (662 ítems)**

| Dato | Regla |
|---|---|
| código | El del Excel. Los 20 sin código reciben correlativo nuevo desde `000770`. El código repetido `000585` se lo queda la primera fila; la segunda recibe uno nuevo. |
| clasificación | Normalizada de 29 valores a ~15: `FERRETERIA `→`FERRETERIA`, `INSTUMENTOS `/`INSTRUMENTO`→`INSTRUMENTOS`, `ACEITES`→`ACEITE`, `ROTABLE`→`ROTABLES`, `TOOL`→`HERRAMIENTA`; el `000508` que quedó de clasificación se vacía. **El mapeo se aprueba con Daniel antes de correr.** |
| unidad | Inferida de ENTRADAS por código y normalizada (`QTO`/`QTS`→`QT`, `PIE`→`FT`). Sin entradas → `UN`. |
| serie | Los 64 con S/N en la descripción: se extrae a `serie_no` y se marca `es_serializado`. `"VOR S/N 2253"` → descripción `VOR`, serie `2253`. |
| costo | Los 162 que lo tienen. Mediana $5.87; los dos más altos (cowling $966.21, gyro direccional $530) son razonables. El aceite a **$218.71** se marca para revisión. |
| stock | **No se importa.** Sale de sumar los movimientos. |

**Paso 2 · Documentos (280)** — 37 entradas + 243 salidas. Dos correlativos rotos que se fusionan:
`FA-0000025-2026` y `FA-00025-2026` son el mismo documento tecleado de dos formas; `FA-00019-2027`
tiene el año mal escrito (es 2026). Las entradas entran sin proveedor, sin factura y sin costo — el
Excel no los tiene — con el comentario original en la nota; van directo a la cola de la pantalla 4.

Cruzando por código: **481 de 489** líneas de entrada y **433 de 440** de salida resuelven limpio.
Quedan **15 líneas** (13 sin código, 2 con código inexistente); a esas se les intenta el cruce por
descripción y lo que no resuelva va al reporte para carga manual.

La aeronave de cada salida se extrae del comentario (389 de 440 líneas mencionan matrícula).
**Las 51 sin matrícula quedan sin aeronave: la obligatoriedad aplica solo hacia adelante.**

**Paso 3 · Reconciliación — lo que el script NO arregla solo**

- **21 ítems quedan con existencia distinta a la del Excel** (el Excel los calcula por texto). Los
  más gruesos: `ARANDELAS` 75→35, `BUJIA` 8→16, `BOLT` 8→0, `BOMBA FRENO DE MANO` 2→8,
  `SCREW (FERRETERIA DE MAGNETO)` 7→1.
- **6 ítems quedan en negativo**: `ACEITE 100 AW` −17, `FILTRO DE ACEITE` −7, `BUJIA REM40E` −6,
  `FRICCION PARA FRENO` −3, `FILTRO DE AIRE` −1, `MAGNETO MOD-4371` −1.

Ambos grupos salen en un **reporte de diferencias**. El mecánico cuenta físicamente y se cierran con
`AJ-001-2026 · Cuadre de migración`, que deja el rastro de por qué cambió cada uno. Dato adicional:
**215 de los 662 ítems no tuvieron ni un movimiento en 2026** — candidatos a depurar, se reportan,
no se borran.

**Paso 4 · Aeronaves externas** — alta de `YS-361-PE` (16 líneas, incluida una inspección anual
completa) y `YS-243` (5 líneas) con `es_externa = true`.

## Sección 5 — Riesgo principal: `aeronave.es_externa`

Es la decisión con más radio de daño del diseño. Hay **~20 consultas que listan aeronaves** en
Programación, Agendar, Turno, Proyección, Standby, Mantenimiento, Taller, Voucheras, Tarifas y
Loadsheet. Si un avión de tercero se filtra en cualquiera, aparece un YS-361-PE agendable.

A favor: la mayoría ya trae `WHERE NOT (a.activa = false AND a.estado = 'ACTIVO')`, así que agregar
`AND a.es_externa = false` es una línea en cada una; y un avión externo no tiene filas en
`licencia_aeronave`, que es la segunda barrera de los selectores del alumno.

En contra: **no alcanza con darlo de alta como baja lógica** (`activa=false`).
`sincronizarEstadoFlota` recalcula `activa` según el mantenimiento del día; el día que se le cierre
un mantenimiento al avión de un tercero, el job le pone `activa=true` y el avión aparece en los
selectores de vuelo. Por eso tiene que ser columna propia y explícita.

Mitigación: barrido completo de las ~20 consultas + una prueba que afirme que una aeronave externa
no aparece en ningún selector de vuelo.

## Fuera de alcance (a propósito)

- **Hojas de trabajo / órdenes de trabajo** y el formato de materiales sobrantes. El gancho queda
  listo: la salida ya se cuelga del mantenimiento.
- **Devolución de sobrantes a bodega** — mismo paquete que las hojas de trabajo.
- **Costeo promedio ponderado / FIFO** — el modelo no lo impide más adelante.
- **Facturar el trabajo a terceros** — por ahora solo se registra el consumo.
- **Depurar los 215 ítems sin movimiento** — se reportan, no se borran.

## Orden de entrega

1. Migración de esquema + capacidad + `es_externa` y barrido de las ~20 consultas.
2. Backend: documentos, kardex, reglas de bloqueo y forzado.
3. Script de migración del Excel + reporte de diferencias (corre contra Supabase real; los números
   se revisan con Daniel antes de dar la carga por buena).
4. Las cuatro pantallas.
5. Cuadre con el mecánico: conteo físico y `AJ-001-2026`.
