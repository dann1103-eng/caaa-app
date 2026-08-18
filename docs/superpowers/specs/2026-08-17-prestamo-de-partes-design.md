# Préstamo de partes — diseño (Fase 3)

**Fecha:** 2026-08-17 · **Estado:** aprobado por Daniel (diseño conversacional, sesión 2026-08-17)

Última de las tres fases del papeleo del Taller. Continúa
`2026-08-17-solicitud-almacen-sobrantes-design.md` (Fase 1) y
`2026-08-17-orden-trabajo-e-interfaz-taller-design.md` (Fase 2), ambas desplegadas.

## El problema

La hoja de **préstamo de partes** es control interno (no la audita la AAC) y registra el material,
las herramientas y hasta los documentos que se prestan entre talleres del aeropuerto. Es
**bidireccional**: OMA-CAAA presta a un taller vecino, y también pide prestado.

Daniel: *"esto afecta al inventario en tiempo real porque si es entrada, es del tipo que no está
ligada a una factura; igual si es una salida no está ligada a una OT."*

Auditoría del formato en papel, con lo que hay que arreglar:

1. **La cantidad va dentro de la descripción** (`"100AW Aceite de Motor / Cant: 1 qt"`). No se puede
   sumar ni cruzar — el mismo vicio que hacía desaparecer movimientos en el Excel de bodega.
2. **La dirección del préstamo no es un campo.** Hay que deducirla de quién figura como solicitante.
   En una bitácora bidireccional por diseño, ese es el dato más importante y está implícito.
3. **La contraparte tampoco es un campo**: `ASERSA`, `WALTER TALLER AVIÓNICA`, `Haibel Herrera` van
   embebidos dentro de la celda del solicitante.
4. **El estado se escribe a mano dentro de otra celda** (`CAAA/OMA (PENDIENTE)`).
5. **No hay P/N ni código de bodega**, solo texto libre.
6. **No hay fecha comprometida de devolución.** Un renglón salió el 19/feb y volvió el 27/abril:
   dos meses afuera y nada avisaba.
7. **Mezcla cosas de bodega con cosas que no lo son**: aceite y filtros (sí son stock), herramientas
   (hay 49 catalogadas) y documentos del avión — `Libro de registro de horas`, `Certificado de
   Aeronavegabilidad` — que no son stock de ninguna manera.
8. Una sola hoja corrida para todo el año: no se puede filtrar ni cerrar un período.

## Decisiones tomadas (con Daniel)

1. **La devolución también mueve inventario.** Cuando lo prestado es un consumible que se instala,
   el taller compra uno nuevo y lo devuelve físicamente. El préstamo es un movimiento de dos tiempos.
2. **El estado del préstamo es independiente del de la orden de trabajo.** Dato de Daniel: *"pueden
   cerrar una OT con un préstamo activo y registran la devolución en cualquier otro momento del
   mes."* Nada de bloquear cierres esperando devoluciones.
3. **El formato se puede mejorar**: Daniel dijo explícitamente que no están cerrados a cambiarlo.
4. **Las líneas pueden o no ser de bodega** *(decisión tomada al diseñar, no consultada)*: si la
   línea apunta a un ítem del catálogo mueve existencia; si es texto libre —un libro, un
   certificado— solo queda registrada. Cubre los dos casos que conviven hoy en el papel sin obligar
   a catalogar documentos que no son stock.

## Sección 1 — Modelo

### `taller_prestamo` — la cabecera

```
id_prestamo       SERIAL PK
anio, numero, correlativo         'PR-001-2026'
direccion         RECIBIDO | ENTREGADO      ← el campo que hoy hay que deducir
contraparte       VARCHAR(160) NOT NULL      ← el taller vecino, ahora sí un campo
── entrega ──
fecha_entrega     DATE NOT NULL
solicitante       VARCHAR(160)
entregado_por     VARCHAR(160)
fecha_compromiso  DATE                       ← nuevo: cuándo se espera de vuelta
── devolución ──
fecha_devolucion  DATE
devuelto_por      VARCHAR(160)
recibido_por      VARCHAR(160)
── siempre ──
estado            PENDIENTE | DEVUELTO | ANULADO   ← derivado del papel, ahora explícito
nota, creado_por, creado_en, motivo_anulacion, anulado_en, anulado_por
```

`estado` es columna y no derivado porque un préstamo puede cerrarse **sin devolución física**
(se paga, se cruza en cuenta) y eso no se puede inferir de las fechas.

### `taller_prestamo_linea` — qué se prestó

```
id_linea, id_prestamo
id_repuesto   INTEGER NULL → taller_repuesto   ← si es de bodega, mueve existencia
descripcion   VARCHAR(200) NOT NULL            ← siempre, para lo que no está catalogado
parte_no      VARCHAR(80)
cantidad      NUMERIC(12,2) NOT NULL
unidad        VARCHAR(20)
```

La cantidad como **columna propia** es el arreglo del defecto 1.

### El movimiento de bodega

El préstamo **no escribe stock por su cuenta**: genera documentos del inventario, con un tipo nuevo
`PRESTAMO`, y deja que la maquinaria que ya existe (cantidad con signo, cache de stock, kardex con
saldo corrido, anulación con recálculo) haga el resto.

| Dirección | Al entregar | Al devolver |
|---|---|---|
| **RECIBIDO** (pedimos prestado) | entra al estante `+` | sale `−` |
| **ENTREGADO** (prestamos) | sale del estante `−` | vuelve a entrar `+` |

Las líneas sin `id_repuesto` no generan movimiento: se registran y nada más.

Prestar algo que no hay dispara el **mismo 409** que la salida normal, con su forzado por capacidad
de jefe de taller. Reusa `bloquearRepuestos` y el bloqueo por existencia sin código nuevo.

## Sección 2 — Flujos

**Registrar un préstamo.** Dirección, contraparte, fecha, quién pide y quién entrega, fecha
comprometida de devolución, y las líneas (ítem del catálogo o texto libre). Al guardar toma
`PR-001-2026` y genera su documento de bodega si hay líneas catalogadas.

**Registrar la devolución.** Fecha real, quién devuelve y quién recibe. Genera el documento inverso
y pasa el préstamo a `DEVUELTO`. **Admite devolución parcial:** se devuelve lo que volvió y el
préstamo sigue pendiente por el resto.

**Cerrar sin devolución.** Para el caso "se pagó" o "se cruzó en cuenta": pasa a `DEVUELTO` con nota,
sin movimiento inverso. Lo prestado quedó consumido.

**Anular.** Revierte los movimientos y saca el préstamo de la bitácora, conservando el correlativo.

### Avisos

Lo que arregla el defecto 6: un préstamo `PENDIENTE` cuya `fecha_compromiso` ya pasó —o que lleva
más de 30 días sin ella— sale marcado como **vencido**, y el dashboard del Taller lo cuenta.

## Sección 3 — Pantalla

Pestaña **Préstamos** dentro de Trabajos del taller, con dos vistas: *Pendientes* (lo que está
afuera o adentro sin cerrar, con los vencidos arriba) y *Todos* (la bitácora con filtros por
dirección, contraparte y fecha). Botón grande **Registrar préstamo** y, en cada pendiente,
**Registrar devolución**.

En **Mi taller** el técnico ve un aviso cuando hay préstamos vencidos, pero no los administra: el
préstamo lo maneja el jefe de taller.

## Fuera de alcance

El cruce de cuentas con el taller vecino (cuánto le debemos y cuánto nos deben en dinero). Hoy se
arregla de palabra entre talleres; si más adelante hace falta, el registro ya tiene los datos.

## Verificación

E2E contra Supabase real con limpieza total: correlativo, las cuatro combinaciones de dirección ×
momento y su efecto en el stock, devolución parcial, cierre sin devolución, bloqueo por existencia
al prestar, líneas sin catálogo que no mueven nada, y anulación que revierte. Revisión en el
navegador a 375px.
