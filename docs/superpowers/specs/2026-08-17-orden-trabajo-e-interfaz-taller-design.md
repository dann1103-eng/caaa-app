# Orden de Trabajo, Reporte de Inspección e interfaz del Taller — diseño (Fase 2)

**Fecha:** 2026-08-17 · **Estado:** pendiente de revisión de Daniel

Continúa `2026-08-17-solicitud-almacen-sobrantes-design.md` (Fase 1, desplegada).

## Por qué esta fase y el rediseño van juntos

Daniel pidió una interfaz distinta para el Taller:

> *"que sea una pestaña con botones grandes de todas las cosas que puede hacer, como iniciar un
> mantenimiento, y con eso los botones de crear requisición y eso que alimente la hoja de solicitud,
> la hoja de trabajo y demás"*
>
> *"un buscador para ver todos los documentos adjuntos a un mantenimiento: requisiciones, OT,
> reporte, solicitud de taller, e incluso el préstamo si aplicó"*

Eso no es un cambio de pantallas: es **poner el mantenimiento en el centro**. Hoy el sistema piensa
en documentos sueltos y él quiere que el técnico abra *un trabajo* y que todo cuelgue de ahí. La
pieza que falta para eso es la **Orden de Trabajo**, que es justo esta fase. Construir la interfaz
antes significaría construirla dos veces, así que van en la misma entrega.

## Decisiones tomadas (con Daniel)

1. **Los mecánicos son usuarios del sistema con su licencia TMA en la ficha.** Firmar es una acción
   del sistema, no un texto tecleado: queda registrado quién firmó y cuándo, y el PDF sale con su
   nombre y número. Descartado el texto libre, que permite escribir el nombre de cualquiera.
2. **El Reporte de Inspección lo llena el Taller**, eligiendo de una lista al piloto que reportó el
   avión. No se toca ninguna pantalla de Operaciones ni se le pide nada nuevo a los instructores.
3. **Dos perfiles con pantallas distintas**: el **técnico** ve una pantalla simplificada solo con lo
   que puede hacer; el **jefe de taller** ve los listados, el buscador y los reportes.
4. **Fuera de alcance:** los manuales del avión adjuntos (Daniel los pasará después) y el Préstamo
   de partes (Fase 3, aunque el buscador ya deja el lugar para mostrarlo).

## Sección 1 — La Orden de Trabajo

Réplica del `CAAA-006-F` Rev.02, cotejado con dos órdenes reales (`CAAA/2026-0042` y `0049`).

### Cuándo nace

⚠️ **La OT se numera al abrir el trabajo, no al firmarlo.** El papel se llena al final (dato de
Daniel), pero su número ya aparece en la Solicitud al Almacén, que se hace antes. Evidencia: la
solicitud del 09-jul lleva `CAAA/2026-0049` y la firma del mecánico es de ese mismo día, mientras la
cabecera de la OT dice 06-jul.

Por eso la OT se crea **al iniciar el mantenimiento** —con su correlativo `CAAA/AAAA-####`— y se
completa después. Estados: `ABIERTA` → `CERRADA` (al firmar) → `ANULADA`.

### Campos

**Cabecera:** matrícula · fecha (apertura) · tacómetro · tipo de aeronave · piloto/operador.
**Cuerpo:** `discrepancia` (el trabajo a efectuar o la falla) · `accion_correctiva` (texto largo).
**Firma:** mecánico (usuario + licencia TMA) · fecha de firma (distinta de la de cabecera) ·
`r_ii` (sigla que nadie supo explicar, texto libre como el `PA` de la requisición) · aprendiz
(usuario + n° de certificado).
**Parte Reemplazada:** tabla de cantidad · P/N ON · S/N ON · nombre · P/N OFF · S/N OFF.

`aeronave` necesita un campo nuevo: la **designación del fabricante** (`PA-28R-180`), que el papel
pide y la BD no tiene — hoy solo guarda el modelo interno (`ARROW`).

`usuario` necesita **`licencia_tma`** y **`certificado_aprendiz`** para las firmas.

### La certificación

La Acción Correctiva siempre cierra con *"Certifico que esta aeronave está en condición segura de
vuelo"*. Al firmar, el sistema la agrega si no está, y **congela el documento**: una OT cerrada no se
edita, se anula y se rehace, igual que los demás documentos de bodega.

## Sección 2 — El Reporte de Inspección

Formato sin código de formulario (no lo controla la AAC). Es la entrega del avión de Operaciones al
Taller y **el disparador de todo el circuito**.

Campos: matrícula · tacómetro · fecha · **piloto que reporta** (elegido de los instructores del
sistema) · tipo de inspección · observaciones · trabajo realizado · firma de Operaciones y de
Mecánico.

**Se pre-llena solo.** El sistema ya sabe las horas del avión y cuándo vence la próxima inspección
(`aeronave.horas_proxima_revision` y `taller_tarea_programada`), así que al abrirlo propone
matrícula, tacómetro y qué inspección toca. El mecánico solo confirma y escribe las observaciones.

⚠️ **Antes de construirlo hay que revisar el seguimiento programado.** El YS-127-P tiene una sola
tarea, *"Inspección 25 horas"*, con `ultima_horas = 8271.00` — el tacómetro de un trabajo que todos
los papeles llaman **100 horas**. O la tarea está mal etiquetada o la de 100 h no se rastrea. Si el
sistema va a proponer qué inspección toca, ese dato tiene que estar bien primero.

## Sección 3 — Los dos perfiles

Hoy existe un solo rol `TALLER`. Se separan en dos, con pantallas distintas.

### Técnico — una pantalla, botones grandes, mobile-first

Pensada para trabajar de pie, con guantes y el celular en una mano. Sin tablas, sin filtros, sin
jerga de documentos. Botones de 60px de alto y ancho completo, en verbo:

```
┌────────────────────────────────┐
│  ▶  Iniciar un mantenimiento   │   abre la OT y queda como "trabajo en curso"
├────────────────────────────────┤
│  📋  Pedir material            │   crea la requisición del trabajo en curso
│  🛢  Sacar aceite              │   la entrega de mostrador
│  ↩  Devolver sobrante          │   sobre las solicitudes del trabajo
├────────────────────────────────┤
│  ✍  Firmar mi trabajo          │   cierra la OT: acción correctiva + firma
└────────────────────────────────┘

TRABAJOS EN CURSO
  CAAA/2026-0051 · YS-334-PE · Inspección 50 h · 2 requisiciones
```

La clave: **el trabajo en curso es el contexto.** Si el técnico tiene una OT abierta, "Pedir
material" ya sabe el avión, el cliente y el tacómetro, y no vuelve a preguntarlos. Eso es lo que hoy
obliga a teclear el tacómetro tres veces en tres papeles.

Puede: abrir mantenimientos, pedir material, sacar aceite, devolver sobrantes y firmar lo suyo.
**No puede:** anular documentos, forzar salidas sin existencia ni ver los reportes de cuadre.

### Jefe de taller — la misma dinámica que el físico

Conserva todo lo que hay hoy (inventario completo, aeronavegabilidad, documentos, reportes) y suma
lo que Daniel pidió:

- **Ficha por avión**: todos los documentos de esa matrícula en una sola vista — órdenes de trabajo,
  requisiciones, solicitudes, retornos, inspecciones cumplidas y consumo de material.
- **Buscador por mantenimiento**: se elige una OT y salen **todos los papeles que le cuelgan**
  (reporte de inspección, requisiciones, solicitudes, retornos y, cuando exista la Fase 3, el
  préstamo). Es el equivalente digital del folder que hoy arman a mano.
- Puede forzar salidas, anular y ver el cuadre — lo que hoy habilita `puede_forzar_inventario`.

## Sección 4 — Cómo se amarra todo

La OT pasa a ser la columna vertebral. `orden_trabajo_no`, que en la Fase 1 quedó como texto en la
solicitud, **se convierte en enlace real**:

```
REPORTE DE INSPECCIÓN ──┐
                        ├──► ORDEN DE TRABAJO ──┬──► REQUISICIÓN ──► SOLICITUD ──► RETORNO
   (dispara)            │    (el trabajo)       ├──► PARTE REEMPLAZADA
                        │                       └──► PRÉSTAMO (Fase 3)
```

Migración de datos: las solicitudes existentes conservan su `orden_trabajo_no` en texto; cuando la OT
correspondiente se cree, se pueden enlazar. **No se inventan OT retroactivas** para los 243
documentos históricos.

## Riesgos

1. **Separar el rol `TALLER` en dos toca los permisos de un módulo que ya está en uso.** El enum
   `audit_actor_rol` tiene que incluir el rol nuevo antes de que exista, o toda acción auditada hace
   rollback — el mismo tropiezo que ya está documentado con `ADMINISTRACION`.
2. **La OT abierta como contexto implícito puede confundir** si un técnico deja trabajos abiertos.
   La pantalla debe mostrar siempre y de forma visible sobre qué trabajo está actuando.
3. **El seguimiento programado tiene datos dudosos** (ver Sección 2). Hay que revisarlo con el
   mecánico antes de que el sistema proponga inspecciones solo.

## Verificación

E2E contra Supabase real con limpieza total, y revisión en el navegador **a 375px de ancho**, que es
como lo va a usar el técnico. Los PDFs se revisan renderizados, no por el código.
