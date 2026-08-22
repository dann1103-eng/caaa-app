# Stickers de constancia para los libros del avión (célula, motor y hélice)

**Fecha:** 2026-08-22 · **Estado:** aprobado por Daniel, listo para implementar

Cada avión lleva **tres libros físicos** — célula, motor y hélice — exigidos por la
certificación de la AAC. Cada trabajo de mantenimiento se acredita pegando en ellos un
**sticker** impreso: quién lo hizo, con qué manual, bajo qué orden de trabajo, y en qué
horas estaba la aeronave. Hoy esos stickers se escriben a mano en Word, uno por avión y
por parte, y se imprimen en papel adhesivo carta que después se recorta.

---

## 1. El problema

Los stickers ya existen y están bien redactados; lo que está mal es **de dónde salen los
números**. Se transcriben a mano de un Word anterior, y eso ya produjo errores reales que
se pueden ver en los formatos que entregó Daniel:

- En el **YS-127-P** y el **YS-270-P**, el `T.T.` del motor y de la hélice está **copiado
  del de la célula** — los tres stickers dicen el mismo número, y no puede ser: cada parte
  lleva su propio reloj.
- El sticker de la hélice del **YS-127-P** de sep-2025 dice `T.T. 9,893.89` y el de
  jul-2026 dice `2,846.19`, con **el mismo S/N**. Uno de los dos está mal.
- El offset del **YS-334-PE** entre sep-2025 (`+4.07`) y feb-2026 (`+5.09`) cambió un
  punto sin motivo: aritmética a mano.

Y el sistema hoy no puede ayudar, porque le faltan las dos piezas: `taller_componente`
—la tabla que modela célula/motor/hélice con su offset— **está vacía** (solo 3 filas de
demo, con el modelo mal), y el módulo no tiene concepto de sticker.

## 2. Lo que los datos confirman

**El `T.T.` de cada parte es el TAC más un offset fijo, y el offset se sostiene exacto
entre stickers de fechas distintas:**

| Avión | Célula | Motor | Hélice |
|---|---|---|---|
| YS-334-PE | +5.10 | **+7,088.42** | **−1,846.32** |
| YS-333-PE | +10,513.0 | +5,382.8 | −0.1 |
| YS-127-P | +1,716.94 | *copiado* | −5,424.81 |
| YS-270-P | +1,922.00 | *copiado* | *copiado* |

En el Tomahawk el motor da `+7,088.42` **idéntico en los tres stickers** (feb, 15-jul y
30-jul de 2026) y la hélice `−1,846.32` idéntico en los tres. Eso es exactamente la
fórmula que `taller_componente` ya trae escrita. **El modelo estaba bien; nadie lo llenó.**

**El tacómetro del YS-334-PE dio la vuelta entre sep-2025 y feb-2026.** El sticker de
sep-2025 dice `TAC 9,588.18`; el de feb-2026 dice `TAC 10,000.03` — el instrumento llegó
a 9999.99 y volvió a 0000.03. Desde entonces los mecánicos le suman 10,000 a mano
(30-jul escribieron `10,373.99`), pero **los instructores digitan lo que ven**: 127
lecturas de ese avión en la BD, todas entre `331.07` y `429.10`. Los otros tres aviones no
tienen el problema (127: 8275–8289 contra un sticker de 8271 · 333: 5168–5209.7 contra
5209.7).

Ese es el "TAC desfasado" que Daniel recordaba, y es **un solo avión con un solo offset**.

## 3. Decisiones tomadas con Daniel

| Pregunta | Decisión |
|---|---|
| ¿De dónde salen `T.T.` y `TSO`? | **El sistema los calcula** desde un anclaje por parte, **pero el campo queda editable**; si el mecánico lo corrige, esa corrección **re-ancla** y el sistema sigue bien desde ahí. |
| ¿El cuerpo del sticker? | **Texto libre con precarga estándar**, por avión × parte × tipo de inspección. El bloque técnico se repite; lo del día no. |
| ¿Dónde se ven los libros? | Pestaña **Libros** dentro de *Trabajos*, que ya filtra por avión. Un libro por parte, con todos los mantenimientos resumidos por su sticker. |
| ¿Quién edita plantillas y anclajes? | **Solo el jefe de taller.** |
| ¿Impresión? | **Papel adhesivo carta**, se recortan a mano. |

## 4. Anatomía del sticker

Los 25 stickers de libro que entregó Daniel son **un solo formato**. Solo cambia el cuerpo.

```
[logo CAAA]  ORGANIZACIÓN DE MANTENIMIENTO AUTORIZADO
             CAAA S.A. de C.V.
             CO-OMA-CAAA-014                       <- certificado de la OMA

Matrícula: YS-334-PE    TAC: 10,373.99   M/N: PA-38-112     Ilopango, 30-jul-2026
Marca:     PIPER        T.T: 10,379.09   S/N: 38-78A0407
Modelo:    THOMAHAWK    TSO: N/A         T.C: A18SO

<cuerpo: qué se hizo · manual P/N, capítulo y páginas · RAC 43 Apéndice D ·
 a veces compresiones por cilindro o los AD/SB aplicados ·
 "...bajo la orden de trabajo CAAA/2026-0055" ·
 "Certifico que esta aeronave / este motor / esta hélice está en condiciones seguras...">

Roger Pérez                     Carlos Arévalo
TMA #915                        Lic. de Aprendiz #5798
```

Hay otros dos formatos, mucho más simples:

- **Mini "próxima inspección"**: matrícula + `Próxima Inspección de N horas · TAC: xxxx`.
  Siempre **TAC actual + 25 y + 50**. Se derivan solos, van de a dos.
- **Cierre / apertura de libro**: misma cabecera, sin cuerpo, con la frase *se cierra
  libro de registro por términos de espacio para anotaciones* / *se abre nuevo libro*,
  más *Efectuar próxima inspección de 100 horas con TAC: xxxx*. Los dos llevan **el
  mismo TAC y T.T.**: son el par del mismo momento. No cuelgan de una orden de trabajo.

**No existe formato de 25 h** entre los archivos entregados. El tipo se crea igual, con la
plantilla vacía: cuando lo tengan se escribe desde la app, sin desplegar.

## 5. Modelo

### 5.1 Se completa `taller_componente` (aditivo)

| Nueva | Para |
|---|---|
| `marca` | Marca (PIPER, LYCOMING, SENSENICH) |
| `modelo` | Modelo (THOMAHAWK, O-235-L2C) |
| `tipo_certificado` | `T.C.` (A18SO, E-223, P-904) |
| `tso_ancla` | TSO en el momento del anclaje. **NULL ⇒ imprime `N/A`**, que es el caso de toda célula |
| `ancla_actualizado_en` / `ancla_actualizado_por` / `ancla_origen` | Para que el jefe vea quién movió el anclaje y desde qué sticker |

Ya servían tal cual: `parte_no` → `M/N` · `serie_no` → `S/N` ·
`horas_aeronave_instalacion` → **el TAC del anclaje** · `horas_componente_instalacion` →
**el T.T. en ese TAC**.

### 5.2 `aeronave.tac_offset NUMERIC(10,2) NOT NULL DEFAULT 0`

Cuánto sumarle a la lectura del sistema para llegar al TAC que llevan los libros.
`YS-334-PE = 10000`; el resto `0`.

> ⚠️ **Se aplica SOLO al imprimir documentos del Taller.** No toca `horas_acumuladas`, ni
> el ciclo 25/50/100, ni la vouchera. Esos trabajan con *diferencias*, y una diferencia no
> cambia si se le suma una constante a los dos extremos. El radio de daño es mínimo a
> propósito.

### 5.3 `taller_sticker_plantilla` — el texto precargado

Clave `UNIQUE (id_aeronave, parte, tipo)` con
`tipo ∈ 25H · 50H · 100H · ANUAL · NO_PROGRAMADO · CIERRE · APERTURA`.
Es **por avión** porque el manual cambia: 761-660 el Tomahawk, D2064-1-13 el 152,
753-586 el Cherokee y el Arrow. Editable desde la app, mismo criterio que
`taller_formulario`: que una redacción nueva no obligue a desplegar.

### 5.4 `taller_sticker` — el sticker emitido, congelado

No se llama `orden_trabajo_sticker` porque **puede existir sin orden**: el cierre y la
apertura de libro no tienen una.

Guarda **todo lo que se imprimió**: TAC, T.T., TSO, M/N, S/N, T.C., marca, modelo, el
texto final, el número de orden, los dos firmantes con su licencia, y las dos próximas
inspecciones. Una vez pegado en el libro es un registro legal ante la AAC: si mañana
alguien corrige un anclaje, **el papel viejo no puede cambiar solo**. Misma lógica que el
`config_snapshot` de la planilla.

`estado ∈ EMITIDO · ANULADO`; anular es del jefe y pide motivo, como el resto del módulo.

### 5.5 Una fila en `taller_formulario`

Clave `STICKER`, código `CO-OMA-CAAA-014`. El número de certificado de la OMA no va
incrustado en el generador.

## 6. Cómo sale cada número

```
TAC impreso  =  lectura  +  aeronave.tac_offset
T.T.         =  (lectura − tac_ancla) + tt_ancla
TSO          =  (lectura − tac_ancla) + tso_ancla        (sin ancla => "N/A")
mini         =  TAC impreso + 25   y   TAC impreso + 50
```

> **El anclaje se guarda en la escala CRUDA del sistema**, no en la del libro. Así `T.T.` y
> `TSO` son *diferencias* y el offset se cancela solo — el `tac_offset` únicamente afecta
> al campo TAC y a los mini. Confundir las dos escalas acá es un error de 10,000 horas.

`lectura` sale de `orden_trabajo.tacometro` cuando la hay (ya la tecleó quien abrió el
trabajo) y si no de `aeronave.horas_acumuladas`. **Los tres campos son editables**: el TAC
también, porque el mecánico lee el instrumento en el momento y el acumulado del sistema
puede haber derivado.

**La red de seguridad:** si el mecánico corrige `T.T.` o `TSO`, al guardar el sticker el
sistema **re-ancla esa parte** con el valor corregido y el TAC del momento
(`tac_ancla = TAC impreso − tac_offset`). Corregir un sticker arregla el futuro, no solo
ese papel. Es lo que evita que la deriva se acumule.

## 7. Emisión

### 7.1 Qué libros toca el trabajo, se declara al abrirlo

Al abrir la orden —manualmente, tomando un avión de la cola o cuando el jefe la asigna— el mecánico
marca sobre qué va a trabajar: **célula, motor, hélice, o los tres** (`orden_trabajo.toca_celula` /
`_motor` / `_helice`, los tres `DEFAULT TRUE`).

**Es un default, no un candado.** Precarga las casillas al emitir, pero ahí se puede agregar o
quitar un libro: un trabajo descubre trabajo — la orden `CAAA/2026-0058` del YS-333-PE se abrió por
el motor y terminó llevándose también la hélice a overhaul. Mientras la orden siga `ABIERTA` la
declaración se puede corregir por `PATCH /taller/ordenes/:id`.

> Sin esto, el aviso **"órdenes firmadas sin sticker"** de la §8 lista **todas** las órdenes del
> avión en **los tres** libros: un cambio de aceite del motor aparecería como "falta pegar" en el
> libro de la célula y en el de la hélice, para siempre. El aviso existe para que no se escape nada;
> sin el filtro se vuelve ruido y deja de leerse.

### 7.2 El flujo

Desde la orden de trabajo, botón **"Stickers para los libros"**:

1. El mecánico elige a qué libros va — los tres por defecto en una inspección, uno solo en
   un trabajo puntual (como la remoción de motor del 333, que fue motor y hélice nada más).
2. El tipo se propone desde la orden (ya sabe si viene de una tarea programada de 50 o
   100 h por `id_cumplimiento`) y se puede cambiar.
3. Precarga: cabecera del avión y de cada parte, texto de la plantilla, `T.T.`/`TSO`
   calculados, mecánico y aprendiz de la orden.
4. El mecánico edita el texto libre y los números si hace falta.
5. Sale el PDF con los stickers elegidos **más el par de mini "próxima inspección"**, y
   quedan guardados.

**Cierre y apertura de libro** van por un camino aparte, sin orden: se elige avión y parte
y salen los dos juntos, con el mismo TAC y T.T.

## 8. Los libros del avión

*Trabajos* pasa de dos pestañas a tres: **Órdenes de trabajo · Libros · Por avión**.
Separadas a propósito: *Por avión* es el resumen operativo (qué se le hizo, cuánto
material consumió); *Libros* es el registro legal por parte, que es lo que audita la AAC.

Con el mismo selector de avión, tres libros: **Célula · Motor · Hélice**. Cada uno abre
con la ficha de la parte —marca, modelo, M/N, S/N, T.C., y su `T.T.` y `TSO` al día de
hoy—, que es la cabecera que se imprime. Debajo, la lista cronológica: fecha · tipo · TAC ·
T.T. · TSO · orden · mecánico. Ése es el índice del libro físico.

Dos cosas salen gratis del modelo:

- **Los stickers de cierre y apertura parten la lista en volúmenes** ("Libro 1", "Libro 2")
  sin tabla nueva ni numeración a mano: el evento ya es el borde.
- **Una orden firmada sin sticker emitido sale igual, marcada**, así se ve qué falta pegar — y solo
  en los libros que esa orden **declaró tocar** (§7.1).

Al abrir un renglón: el sticker tal como se imprimió (re-imprimible, **no recalculado**)
más el detalle completo de su orden. `OrdenDetalleModal` ya muestra reporte de inspección,
requisiciones, solicitudes de bodega, retornos y partes reemplazadas — se reusa entero. El
libro de papel tiene el sticker; éste tiene el sticker **y todo lo que hay detrás**.

## 9. Permisos

| Acción | Quién |
|---|---|
| Emitir el sticker, escribir su texto, firmarlo | `TECNICO` · `TALLER` · `ADMIN` |
| Editar la **plantilla** | **Jefe** (`TALLER` · `ADMIN`) |
| Cargar o corregir **ficha de la parte y anclajes** | **Jefe** |
| Anular un sticker | **Jefe** |

**Salvedad deliberada:** la corrección de `T.T.`/`TSO` que hace el mecánico al emitir
**re-ancla igual, aunque no sea jefe**. Ese número ya quedó impreso y firmado en un libro
oficial: es la realidad legal, y seguir calculando desde otro valor solo garantiza que el
próximo sticker salga mal. Lo que sí hace el sistema es **avisarle al jefe** — la ficha de
la parte muestra *anclaje actualizado por Roger Pérez el 22-ago desde el sticker de la
orden CAAA/2026-00XX*. El jefe sigue siendo el dueño del dato; lo que no puede es que el
cambio quede en silencio.

## 10. El PDF

Carta vertical, recuadros uno debajo del otro con **línea de corte punteada** y aire para
la tijera. Los mini van al final, dos por fila. Se genera con `utils/pdfTaller.js`, que ya
tiene los helpers de encabezado, campo, firma y tabla.

> El paginador **nunca parte un recuadro entre dos páginas**: un sticker cortado a la mitad
> no se puede pegar.

## 11. Siembra de los anclajes

Del sticker más reciente de cada avión:

| Avión | Célula | Motor | Hélice |
|---|---|---|---|
| YS-334-PE | T.T. 10,379.09 @ TAC 10,373.99 | T.T. 17,462.41 · TSO 1,832.03 | T.T. 8,527.67 · TSO 1,831.56 |
| YS-333-PE | T.T. 15,722.7 @ TAC 5,209.7 | *removido a reparación mayor* | *removido a overhaul* |
| YS-127-P | T.T. 9,987.94 @ TAC 8,271.00 | *T.T. copiado* | *T.T. contradictorio* |
| YS-270-P | T.T. 7,910.21 @ TAC 5,988.21 | *copiado + removido* | *copiado* · TSO 338.80 sirve |

Las **cuatro células entran con confianza**; el motor y la hélice del Tomahawk también. Lo
demás se deja **vacío a propósito**: el mecánico lo dicta una vez desde el libro y el primer
sticker lo ancla. Un campo vacío es mejor que un número copiado que se propaga.

- El motor del 333 y el del 270 están **fuera del avión ahora mismo**; al reinstalarlos el
  TSO arranca en 0 y hay que re-anclarlos.
- **YS-155-PE y YS-259-PE no tienen nada** — quedan fuera hasta que el mecánico dicte sus
  números.
- Las 3 filas de demo que hoy tiene `taller_componente` (dicen "Cessna 152" para un
  Tomahawk) **se reemplazan**.

## 12. Fuera de alcance

Numerar los volúmenes a mano (salen de los eventos de cierre/apertura) · rastrear ciclos
además de horas · el sticker de 25 h mientras no exista el formato · reconciliar contra la
tabla grande de conteo de horas y seguimiento de mantenimientos que Daniel todavía no
entregó — cuando llegue, se coteja, no se rehace · adjuntar los manuales del avión.

## 12.bis 🔴 Los bimotores necesitan CINCO libros, no tres

**El modelo de hoy asume un motor y una hélice por avión** (`taller_componente` guarda una
parte instalada por tipo, y los tres libros son fijos: célula, motor, hélice).

Un bimotor lleva **dos motores y dos hélices**, y cada uno tiene su propio libro con su
propio T.T. y su propio TSO — son cinco libros, no tres. El **YS-259-PE** (Cessna 310) ya
está en la flota y **la escuela acaba de comprar un segundo bimotor** (2026-08-22), así
que deja de ser hipotético.

Ninguno de los dos tiene partes cargadas todavía, así que **no hay nada mal registrado**:
el hueco es de alcance, no un dato corrupto. Lo que hace falta cuando se vayan a cargar:

- `taller_componente.posicion` ya existe (de la migración 011) y es donde iría `LH` / `RH`.
- `partesDe()` se queda con **una** fila por tipo — habría que devolver la lista.
- `PARTES` y `taller_sticker.parte` / `taller_sticker_plantilla.parte` tienen el CHECK en
  tres valores, y `orden_trabajo.toca_*` son tres banderas.
- La pestaña Libros muestra tres pestañas fijas.

**No modelarlo a ciegas:** primero hay que ver un juego de stickers real de un bimotor —
si distinguen los motores por posición o por número de serie, y si el libro de la célula
cambia en algo. Mismo criterio que se usó con los recurrentes y con Bimotor en su momento.

## 13. Riesgos conocidos

- **Las dos escalas del TAC.** Todo el diseño descansa en que el anclaje vive en escala
  cruda y el `tac_offset` se aplica solo al imprimir. Un error acá son 10,000 horas en un
  documento legal. Va con prueba explícita del YS-334-PE.
- **`horas_acumuladas` derivó de la lectura real** (433.15 contra 429.10 en el Tomahawk).
  Por eso el TAC del sticker es editable y por eso se prefiere `orden_trabajo.tacometro`.
- **`taller_componente` ya la consume `componenteController`**: al agregarle columnas hay
  que verificar que las consultas existentes sigan intactas.
