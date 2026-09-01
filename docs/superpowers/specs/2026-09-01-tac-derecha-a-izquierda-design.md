# Llenado del TAC y el Hobbs de derecha a izquierda

**Fecha:** 2026-09-01 · **Estado:** aprobado por Daniel

## El problema

El instructor copia a la vouchera lo que marca el reloj del avión: cuatro dígitos
y sus decimales. Hoy el campo se llena de **izquierda a derecha** — los primeros
cuatro dígitos son la parte entera y lo que sobra son decimales — así que para
anotar `0847.25` hay que teclear `084725` **empezando por el cero**. Si se olvida
ese cero queda `8472.5`, un número diez veces mayor que además pasa los avisos de
coherencia si la otra lectura está igual de corrida.

Mientras se escribe, el punto decimal se va moviendo (`0` → `08` → `084` →
`0847` → `0847.2`), así que hasta el último golpe no se ve qué forma va a tener
el número. Nada le dice al instructor que faltan los dos decimales.

## La regla nueva

Los dígitos entran **por la derecha**, como el monto de una transferencia. El
punto queda clavado en su lugar desde el primer golpe y el molde es fijo:

| campo | molde | tecleando `84725` |
|---|---|---|
| Tacómetro | 4 enteros + **2** decimales | `0847.25` |
| Hobbs | 4 enteros + **1** decimal | `8472.5` |

```
(vacío)     0000.00
tecleás 8   0000.08
tecleás 4   0000.84
tecleás 7   0008.47
tecleás 2   0084.72
tecleás 5   0847.25
```

Borrar quita el último dígito y todo se corre a la derecha. **Cuando el molde se
llena, las teclas de más se ignoran**: el campo no acepta un séptimo dígito y no
descarta el primero — nada de recortes en silencio. Para cambiar el número hay
que borrar.

El molde de cuatro dígitos es fijo y **no crece**: son los que tiene la carátula
del instrumento, que es lo único que el instructor copia. Lo que pasa de ahí
—el `+10,000` del YS-334-PE, cuyo tacómetro dio la vuelta— vive en la escala de
libro, a nivel de sistema y del Taller, no en este campo.

## Cómo se ve

El molde completo está siempre puesto en gris claro y lo tecleado lo va pisando
en negro, de derecha a izquierda. Un `<input>` no pinta dos colores adentro, así
que el número se dibuja encima con un texto fantasma y el input queda arriba con
la letra transparente y el cursor visible. Ambos comparten tipografía monoespaciada
y `tabular-nums`, que es lo que mantiene los caracteres alineados al pixel.

El teclado que se abre en el celular es el numérico (`inputMode="numeric"`).

## Dónde se aplica

**Sí:**
- La vouchera (`ReporteVueloModal`): tacómetro de salida y llegada, Hobbs de
  salida y llegada. Incluye la variante de simulador, que solo tiene Hobbs.
- El mini-formulario de aterrizaje de tramo (`AterrizajeTramoModal`), que hoy no
  tiene máscara ni teclado numérico. Es el mismo dato —se escribe en la vouchera
  del tramo y queda como salida del siguiente— llenado desde el celular en pista.

**No:**
- El tacómetro del **Taller** (abrir orden de trabajo, requisición de material).
  Va en escala de libro, con cinco dígitos enteros: un molde de 4+2 le rompería
  el número justo en el avión donde importa. Queda como está.
- Combustible y "horas a cobrar": no son lecturas de instrumento sino cantidades
  que el instructor decide. Siguen con su decimal libre.

**Sin tocar:** todos los avisos de coherencia que ya existen (llegada mayor que
salida, diferencia máxima de 8 horas, el TAC de referencia al lado de "horas a
cobrar"). Esto es solo cómo se teclea el número.

## Los dos detalles que hay que cuidar

### El borrador guardado

Hoy `formatMedidor` recorta los ceros de cola: un TAC de `847.20` vuelve del
servidor como `0847.2`. Con decimales fijos, si el instructor toca ese campo se
releería como `084.72` — un número distinto, sin avisar. **Al cargar hay que
rellenar a los decimales exactos** (`0847.20`), no recortarlos.

Un valor viejo que **no cabe en el molde** (más decimales de los que tiene el
instrumento; la columna es `numeric(10,2)` y el Hobbs se llena con uno solo desde
julio) **no se reescribe solo**: el campo lo muestra tal cual, en modo libre, sin
el fantasma gris. Cuando el instructor lo borra, la máscara toma el control. No
se redondea ni se trunca un número guardado por iniciativa propia.

### El PDF de la vouchera

`reporteVueloPdf.js` tiene su **propia copia** de `formatMedidor`, con el mismo
recorte: un TAC de `847.20` se imprime `0847.2`, que se lee como un Hobbs. Pasa a
decimales fijos, y las dos copias se unifican en una sola función compartida
(`utils/medidor.js`) — que es la regla de la casa y ya nos mordió antes tenerla
duplicada.

## Piezas

- **`CAA-frontend/src/utils/medidor.js`** — las funciones puras: el molde, pasar
  de valor a dígitos y al revés, y el formateo para mostrar e imprimir. Sin React.
- **`CAA-frontend/src/components/MedidorInput/`** — el campo: fantasma gris,
  cursor siempre al final, teclado numérico. Lo usan las dos pantallas.
- **`ReporteVueloModal.jsx`** — usa el campo nuevo, arregla la carga del borrador.
- **`reporteVueloPdf.js`** — usa el formateo compartido.
- **`AterrizajeTramoModal.jsx`** — usa el campo nuevo.

## Cómo se comprueba

Con la vouchera abierta en el navegador, a 375 px y en escritorio:

1. Teclear `84725` en el tacómetro deja `0847.25`, y en el Hobbs `8472.5`.
2. Los ceros que faltan se ven grises y los tecleados negros, alineados con el
   input (sin corrimiento de un pixel).
3. Borrar corre el número a la derecha; borrar todo deja el molde entero gris.
4. Un séptimo dígito no entra.
5. Un borrador guardado con `847.20` reabre como `0847.20`, y al teclear un
   dígito más no se convierte en otro número.
6. Los avisos de coherencia siguen saltando igual.
