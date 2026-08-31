# Cola de trabajo del Taller, asignación, revisión del jefe y estimado de finalización

**Fecha:** 2026-08-18 · **Estado:** aprobado por Daniel, listo para implementar

Cierra el flujo del Taller de punta a punta: desde que Operaciones manda un avión a
mantenimiento hasta que el jefe aprueba el trabajo y avisa que se puede devolver al servicio.

---

## 1. El problema

Hoy el avión en mantenimiento y la orden de trabajo son **dos mundos que no se hablan**.

Cuando el mecánico abre un trabajo, la lista de aviones que ve son **todos**, no los que están
en mantenimiento. Nadie le dice "hay tres aviones esperando". `orden_trabajo.id_mantenimiento`
existe desde la migración de la fase 2 y **nada lo llena** — otra columna muerta, el tercer caso
del mismo patrón en este módulo (§33).

Tampoco hay dónde guardar "este trabajo es de Roger": el único campo de mecánico es el de quien
firma, y se llena al cerrar. Y cuando el mecánico firma, la orden pasa directo a `CERRADA`: no
hay revisión del jefe, que es justo lo que hace auditable el trabajo.

Falta además algo que la escuela vive todas las semanas: **el Taller descubre trabajo nuevo** y
el avión se va a tardar más de lo que Operaciones calculó. Hoy no tiene cómo decirlo.

## 2. Decisiones tomadas con Daniel

| Pregunta | Decisión |
|---|---|
| ¿Quién manda un avión a mantenimiento? | **Operaciones** (TURNO/ADMIN), como hoy. El Taller no gana permisos sobre la flota; solo ve la cola de lo que le mandaron. |
| Al aprobar el jefe, ¿qué pasa con el avión? | **Avisa a Operaciones** que está listo para devolver; ellos cierran el mantenimiento. Simétrico con la entrada: el Taller certifica, Operaciones dispone. |
| ¿El jefe puede aprobar su propio trabajo? | **Sí, pero queda marcado.** En un taller chico a veces no hay de otra; la orden lleva sello de que ejecutor y aprobador son la misma persona. |
| ¿Y la duración? | **Manda el Taller.** Si estiman más tiempo del que puso Operaciones, su fecha gana y los vuelos que queden adentro se cancelan. |

## 3. El circuito

```
TURNO/ADMIN manda el avión a MANTO          (sin cambios)
        ↓
  COLA DEL TALLER — aviones esperando trabajo
        ↓  el mecánico la toma, o el jefe se la asigna
  ORDEN DE TRABAJO abierta, enlazada al mantenimiento y asignada
        ↓  de ella cuelgan requisición → solicitud → retorno (ya funciona)
        ↓  el Taller puede mover el ESTIMADO DE FINALIZACIÓN en cualquier momento
  El mecánico firma  →  FIRMADA (terminada, esperando revisión)
        ↓
  El jefe revisa  →  APROBADA   ·  o la devuelve → vuelve a ABIERTA con nota
        ↓  cuando TODAS las órdenes del avión están aprobadas
  Aviso a Operaciones: "listo para devolver al servicio"
        ↓
  TURNO/ADMIN cierra el mantenimiento y el avión vuelve a volar
```

## 4. Modelo

### 4.1 La cola no es una tabla nueva

Sale de cruzar `mantenimiento_aeronave` (no completado, cubriendo hoy o futuro) con sus
`orden_trabajo`. Un avión en mantenimiento **sin orden aprobada** está esperando trabajo. Esto
por fin llena `id_mantenimiento`.

Se evita a propósito una cuarta entidad: el módulo ya tiene tres conceptos de "mantenimiento"
(`mantenimiento_aeronave`, `taller_tarea_programada`, `orden_trabajo`) y sumar otro confunde más
de lo que ordena.

**Un avión puede llevar varias órdenes.** En una 100 h aparecen discrepancias que son trabajos
aparte; cada una su orden, y el avión no se libera hasta que todas estén aprobadas o anuladas.

### 4.2 `orden_trabajo` — asignación y revisión

| Columna | Para qué |
|---|---|
| `id_mecanico_asignado` | quién lo está trabajando. **Distinto de `id_mecanico`**, que es quien firma y se llena al terminar. |
| `id_aprobador`, `fecha_aprobacion` | la firma del jefe. |
| `aprobacion_propia` | ejecutor y aprobador son la misma persona. |
| `nota_revision` | por qué el jefe la devolvió. |

**Estados:** `ABIERTA → FIRMADA → APROBADA`, más `ANULADA`. Antes eran `ABIERTA|CERRADA|ANULADA`.
Hoy **no hay ninguna orden en la base**, así que el cambio no arrastra datos.

Constraints: una `FIRMADA` o `APROBADA` tiene mecánico y fecha de firma; una `APROBADA` tiene
además aprobador y fecha de aprobación.

**Asignar no bloquea.** Otro mecánico puede tomar el mismo avión: en una inspección grande
trabajan varios. La asignación dice quién está en qué, no es un candado.

### 4.3 Estimado de finalización — manda el Taller

El Taller **escribe directo sobre `mantenimiento_aeronave.fecha_fin`**: una sola fuente de verdad,
y todo lo que ya lee esa fecha (`mantenimientoCubreFechaSQL`, la disponibilidad al agendar, el
widget de flota) sigue funcionando sin tocarse.

Lo que dijo Operaciones se conserva aparte para poder explicar el cambio:

| Columna nueva en `mantenimiento_aeronave` | Para qué |
|---|---|
| `fecha_fin_original` | lo que puso Operaciones. Se guarda **la primera vez** que el Taller mueve la fecha. |
| `estimado_por`, `estimado_en` | quién del Taller lo movió y cuándo. |
| `motivo_estimado` | por qué (texto libre: "se encontró corrosión en el tren"). |

**La hora sale de los bloques.** `fecha_fin` es el día; los `mantenimiento_bloque` de ese día
deciden qué vuelos caen. Si el avión queda listo el viernes a las 14:00, se bloquean los bloques
del viernes hasta esa hora y los vuelos de la tarde sobreviven.

**Cancelar y restaurar ya está resuelto:** `cancelarVuelosAfectadosPorMantenimiento`
(`utils/mantenimientoUtils.js`) recalcula sobre **toda** la ventana — cancela lo que quedó
adentro y **restaura** lo que quedó afuera si la fecha se acorta, devolviendo cada vuelo a su
estado previo (lo lleva embebido en la justificación). Extender y acortar salen simétricos gratis.

⚠️ **Antes de confirmar, dry-run.** Mismo patrón que `previewMantenimiento`: el Taller ve
cuántos vuelos va a cancelar y de quiénes, y recién ahí confirma. Mover una fecha puede cancelarle
el vuelo a diez alumnos; eso no se hace a ciegas.

## 5. Pantallas

**Mi taller (mecánico).** Sección nueva arriba de los botones: **"Aviones esperando trabajo"**.
Tocás uno y se abre la orden ya enlazada al mantenimiento y asignada a vos. Lo que el jefe te
asignó aparece marcado **"Asignado a vos"**. El botón de firmar pasa a decir **"Terminé — mandar
a revisión"**. Y un botón para **mover el estimado** del avión en el que estás trabajando.

**Trabajos del taller (jefe).** Pestaña **"Por revisar"** con las órdenes FIRMADAS: se abre con
todo su papeleo junto y se **Aprueba con mi firma** o se **Devuelve al mecánico** con la nota.
Desde la cola puede **asignar** un avión a un mecánico sin abrir la orden él mismo.

**Operaciones.** Al aprobarse la última orden de un avión, llega la notificación in-app (y push,
que ya está montado) de que está listo para devolver.

## 6. Fuera de alcance

Que el Taller mande aviones a mantenimiento · que la aprobación devuelva el avión al servicio
automáticamente · reprogramar los vuelos cancelados (se cancelan, no se mueven) · una cuarta
entidad de "tarea" separada de la orden de trabajo.

## 7. Riesgos conocidos

- **El cambio de estados toca `firmarOrden`**, que hoy escribe `CERRADA`. Hay que revisar todo lo
  que compare contra ese valor (listados, PDF, `MiTaller`, el folder del avión).
- **Mover la fecha cancela vuelos reales.** El dry-run es obligatorio en la UI, y el motivo del
  cambio también: es lo que le van a preguntar a Operaciones.
- **`mantenimientoCubreFechaSQL` hardcodea el alias `m`** (§22.I): cualquier subquery nueva que lo
  use tiene que llamarse `m`.
