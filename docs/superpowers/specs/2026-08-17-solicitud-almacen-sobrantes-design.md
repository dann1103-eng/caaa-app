# Solicitud al almacén, sobrantes y entrega de aceites — diseño (Fase 1)

**Fecha:** 2026-08-17 · **Estado:** aprobado por Daniel (diseño conversacional, sesión 2026-08-17)

**Contexto:** primera de tres fases del papeleo del Taller. Continúa
`2026-08-17-inventario-taller-design.md`, que dejó la bodega funcionando con documentos y kardex.

**Fuente:** seis formatos en papel fotografiados por Daniel, cotejados uno por uno contra los
datos ya cargados en producción. Todos los números de este documento salen de ese cotejo.

## El circuito real del taller

Reconstruido de los formatos y verificado con un trabajo real de punta a punta — la inspección de
100 horas del YS-127-P, julio 2026:

```
06-jul  REPORTE DE INSPECCIÓN   Operaciones entrega el avión · lo firma un piloto · qué inspección toca
07-jul  REQUISICIONES           el técnico anota lo que va a necesitar                    (interna)
09-jul  SOLICITUD AL ALMACÉN    descarga el inventario · lleva el N° de OT · sobrantes    (AAC, CAAA-004-F)
09-jul  ORDEN DE TRABAJO        certifica el trabajo · Acción Correctiva · Parte Reemplazada (AAC, CAAA-006-F)

en paralelo:  ENTREGA DE ACEITES POR DÍA  ·  PRÉSTAMO DE PARTES                          (internas)
```

Verificación del cotejo (ninguno de estos datos es una suposición):

- La OT `CAAA/2026-0049` y la `REQ-211-2026` ya cargada coinciden en avión, tacómetro (8271.00) y
  trabajo. La OT `CAAA/2026-0042` coincide con la `REQ-192-2026`.
- `aeronave.horas_ultima_revision` del YS-127-P es exactamente **8271.00**, el tacómetro de esa OT.
- En la requisición, la columna rotulada *"Costo Unitario"* **no lleva costos: lleva el código de
  bodega**, escrito sin los ceros de adelante. Los 6 renglones verificados: `0299`→`000299`,
  `0092`→`000092`, `0685`→`000685`, `0039`→`000039`, `0378`→`000378`, `0312`→`000312`.
- La hoja de entrega de aceites y el kardex registran **los mismos eventos**, no consumo adicional:
  8 de 10 renglones de julio cruzan uno a uno con su `REQ-###-2026`.

## Esta fase resuelve

1. **Los sobrantes nunca llegaron a la bodega.** Las 440 líneas de salida del Excel son todas
   positivas: el apartado *PARTES PARA RETORNAR AL ALMACÉN* del `CAAA-004-F` no se registraba en
   ningún lado. Si un trabajo pidió 8 cuartos de aceite y devolvió 2, se descontaron 8.
2. **El aceite se lleva en dos cuadernos.** El jefe de taller mantiene su propio saldo corrido
   diario (26 → 10 entre el 21 y el 31 de julio) mientras la bodega dice −17 para el mismo ítem.
3. **El tacómetro se escribe a mano en tres formatos distintos**, con tres oportunidades de que no
   coincidan.
4. **El sistema no sabe a quién se le entregó el material** — dato que piden los tres formatos.

## Decisiones tomadas (con Daniel)

1. **Requisición y solicitud son dos documentos encadenados.** La requisición es el borrador
   interno del técnico y **no mueve stock**; la solicitud es la que descarga el inventario.
2. **El retorno de sobrantes es un documento propio** (`RETORNO`) con su correlativo, que
   referencia el correlativo de la solicitud que lo originó y suma al stock **con su fecha real**.
   Descartadas: (B) una `ENTRADA` con referencia — arrastra proveedor, factura y egreso que no
   aplican; (C) renglones negativos en la misma solicitud — rompe la inmutabilidad y pierde la
   fecha real de la devolución.
3. **La devolución no puede condicionar el cierre del trabajo.** Dato de Daniel: *"pueden cerrar
   una OT con un préstamo activo y registran la devolución en cualquier otro momento del mes"*.
   Eso descarta dejar la solicitud abierta esperando el retorno.
4. **La hoja de entrega de aceites no es una tabla nueva**: es el kardex filtrado por los ítems de
   aceite. `EXISTENCIA → ENTREGADO → EXISTENCIA ACTUAL` ya es el saldo corrido que el kardex
   calcula.
5. **El retorno no toca Contabilidad.** El gasto se contabiliza en la compra, no en el consumo.
6. **`entregado_a` es texto libre con sugerencias**, no un FK: reciben instructores (Héctor Amaya y
   Eduardo Tejada están en la base), mecánicos, y gente que puede no tener usuario. Un FK
   obligatorio trabaría el mostrador de bodega.
7. **Fuera de alcance de esta fase:** Orden de Trabajo y Reporte de Inspección (Fase 2), Préstamo
   de partes (Fase 3).

## Sección 1 — Documentos y numeración

| Tipo | Correlativo | Stock | Qué es |
|---|---|---|---|
| `REQUISICION` | `REQ-###-AAAA` | **no** | Borrador del técnico |
| `SALIDA` *(Solicitud al almacén)* | `SOL-###-AAAA` | resta | El `CAAA-004-F` |
| `RETORNO` | `RET-###-AAAA` | suma | Sobrantes que vuelven |
| `ENTRADA` · `AJUSTE` | sin cambios | | |

### La trampa de la numeración

Los **243 documentos históricos** son de tipo `SALIDA` con correlativo `REQ-001-2026` …
`REQ-244-2026` (el máximo es 244). Si la nueva serie de requisiciones arrancara en 1, existirían
**dos papeles distintos rotulados `REQ-001-2026`**.

Por eso el generador de correlativos de `REQUISICION` calcula su próximo número como el **máximo
sobre ambos tipos** para ese año — arranca en 245 en 2026 y en 1 en 2027. Las solicitudes estrenan
serie propia `SOL-001-2026`. Los históricos se quedan como están: son el registro real del
movimiento y se identifican por `origen='EXCEL_2026'`.

### Columnas nuevas en `taller_documento_inventario`

| Columna | Tipo | Para qué | Usada en |
|---|---|---|---|
| `id_requisicion` | FK a sí misma | la requisición de la que nació | Solicitud |
| `id_solicitud_origen` | FK a sí misma | la solicitud cuyo sobrante vuelve | Retorno |
| `orden_trabajo_no` | VARCHAR(40) | `CAAA/2026-0049` — texto; en Fase 2 pasa a FK | Solicitud |
| `numero_solicitud` | VARCHAR(20) | `0049` | Solicitud |
| `tacometro` | NUMERIC(10,2) | se teclea una vez y se hereda | Requisición, Solicitud |
| `cliente` | VARCHAR(160) | a quién pertenece el trabajo | Requisición, Solicitud |
| `solicitante` | VARCHAR(160) | persona que pide | Requisición, Solicitud |
| `entregado_por` | VARCHAR(160) | quién despacha de bodega | Solicitud, Retorno |
| `entregado_a` | VARCHAR(160) | a quién se le entrega | Solicitud |
| `observaciones` | TEXT | el recuadro "Observaciones y Correcciones" | Requisición |

`motivo` se conserva como el trabajo en una línea; `observaciones` es el recuadro largo. Son dos
campos distintos en el papel y no conviene fusionarlos.

`CHECK` nuevo: `id_solicitud_origen` solo puede tener valor si `tipo='RETORNO'`.

### Lo que no cambia

Kardex, saldo corrido, bloqueo por existencia con su capacidad de forzado, anulación, costos
pendientes y consumo por aeronave siguen igual. `RETORNO` entra al kardex como un renglón positivo
más, así que el saldo corrido lo absorbe sin tocar esa lógica.

## Sección 2 — Flujos

### Requisición

Cabecera (fecha, solicitante, cliente, avión, tacómetro, observaciones) + renglones (ítem,
cantidad). Al guardar toma su correlativo y **no toca el stock**.

**Es editable mientras no tenga solicitud.** La regla de "no se edita, se anula" existe porque los
documentos mueven existencia; un borrador que no mueve nada puede corregirse. Una vez despachada se
congela. El estado *despachada* es **derivado** (existe una solicitud con `id_requisicion` = ésta),
no una columna — para no tener dos fuentes de verdad.

### Solicitud

Desde la requisición, botón **Despachar**: precarga avión, cliente, tacómetro y renglones. Bodega
ajusta cantidades, agrega N° de OT, N° de solicitud, quién entrega y a quién. Al guardar descuenta
stock con el mismo bloqueo 409 + forzado que ya funciona.

- **Se puede crear sin requisición previa** — el aceite diario no tiene requisición ni OT.
- **El N° de OT es opcional**; si falta, se avisa sin bloquear.
- **Se admite despacho parcial.** Si bodega tiene 6 de 8 ítems se despacha lo que hay y la
  requisición muestra qué falta.

### Retorno

Desde la solicitud, botón **Registrar retorno**: cada renglón muestra cuánto salió y cuánto ya
volvió. Al guardar suma al stock con su fecha real.

| Regla | Respuesta |
|---|---|
| Retornar más de lo que salió (neto de retornos previos) | 400 con el detalle por ítem |
| Retorno sobre una solicitud anulada | 409 |
| Varios retornos por solicitud | permitido |
| Anular una solicitud que ya tiene retornos | **409**, indicando qué anular primero |
| Retorno y Contabilidad | no genera ni revierte egreso |

## Sección 3 — Pantallas

La pestaña **Documentos** absorbe casi todo: el filtro por tipo suma `Requisición` y `Retorno`.
Se agrega:

- Detalle de requisición → botón *Despachar*; si ya se despachó, enlace a su solicitud.
- Detalle de solicitud → botón *Registrar retorno* y la lista de retornos ligados.
- Atajo **"Requisiciones sin despachar"**.
- Pestaña nueva **Entrega de aceites** — reporte diario, otro público (jefe de taller) y otro ritmo.

## Sección 4 — PDFs

Con `pdfkit` en `utils/pdfGenerator.js`, donde ya viven voucheras y planillas.

1. **Requisición** — réplica del formato interno. La columna rotulada *"Costo Unitario"* pasa a
   llamarse **"Código"**, que es lo que de verdad se escribe ahí.
2. **Solicitud `CAAA-004-F`** — calcada: 6 campos de cabecera, tabla de 3 columnas, apartado
   *PARTES PARA RETORNAR AL ALMACÉN* llenado desde los retornos ligados, y pie con *PERSONA QUE
   ENTREGA REPUESTOS* + *FIRMA*. **El código y la revisión del formulario van como dato
   configurable, no incrustados**: la AAC puede publicar una Rev.01 y eso no debe ser un deploy.
3. **Entrega de aceites por día** — el kardex filtrado por los ítems de aceite (`000038` 100 AD,
   `000039` 100 AW, `000361` hidráulico) con las 8 columnas del cuaderno: fecha, existencia
   anterior, entregado, existencia actual, nombre, concepto y **dos columnas de firma en blanco**.

## Arreglo de datos incluido

`000038` y `000039` quedaron con unidad `UN` cuando deberían ser `QT` (cuartos). El normalizador de
la migración tomó la última unidad vista en las entradas del Excel, donde ese ítem estaba escrito
como `UN`, `QT`, `QTO` y `QTS`. Sin esto, la hoja de aceites diría "8 UN".

## Reporte adicional: posibles duplicados por n° de parte

Hallazgo del cotejo: hay **15 números de parte repartidos entre dos o más códigos**, y tres
explican negativos directamente:

| N° de parte | Códigos | Neto |
|---|---|---|
| `CH48110-1` | 000350 (+10) · 000685 (−7) | +3 |
| `MS24665-134` | 000286 (+94) · 000775 (−2) | +92 |
| `MS24665-351` | 000078 (+3) · 000776 (−1) | +2 |

`000775` y `000776` los creó el cargador del Excel porque la línea no cruzaba por código; cruzaban
por número de parte pero con otra descripción (`"CHAVETA"` vs `"COTTER PIN 1/16 X 3/4
MS24665-134"`). Se agrega un reporte de **posibles duplicados por n° de parte** en la pestaña de
costos pendientes. **No se fusionan solos**: fusionar mueve saldos y es decisión del mecánico, junto
con los negativos y las 24 diferencias del cuadre.

## Verificación

E2E contra Supabase real con limpieza total, siguiendo el patrón de la fase anterior (49/49):
continuidad del correlativo `REQ` desde 245 · la requisición no mueve stock · despacho que precarga
y descuenta · despacho parcial · solicitud sin requisición ni OT · retorno que suma con su fecha ·
rechazo de retorno excedido · rechazo de anulación con retornos vivos · saldo corrido del kardex
con salida y retorno intercalados · y los tres PDFs generados y abiertos.
