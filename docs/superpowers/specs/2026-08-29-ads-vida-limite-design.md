# ADs, boletines de servicio y vida límite de componentes

**Fecha:** 2026-08-29
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** los ADs y la lista de vida límite. **El formulario 1000 y el 1020 quedan fuera**, en un spec aparte.

---

## 1. El caso

La escuela tiene, por avión, cuatro documentos de aeronavegabilidad que hoy viven como archivos sueltos
en las computadoras del taller:

| Documento | Qué es | Cada cuánto se usa |
|---|---|---|
| **Control de AD's y boletines** | lista de directivas de aeronavegabilidad con su última aplicación | en cada mantenimiento |
| **Listado de vida límite de componentes** | TBO y overhaul de partes, con horas restantes | en cada mantenimiento |
| Formato AAC-1000-A Rev.06 | información de inspección anual | una vez al año |
| Formato AAC-1020 Rev.04 | solicitud de certificado de aeronavegabilidad | una vez al año |

Los dos primeros **no son documentos: son datos vivos con seguimiento**. Cada renglón lleva última
aplicación (fecha y TAC), si es una vez o recurrente, el intervalo y la próxima. Eso no es un archivo
que se abre: es una tabla que el sistema debería calcular.

Los dos últimos sí son documentos, se llenan una vez al año y van en el spec siguiente.

### Lo que se busca

1. Que los ADs y la vida límite se consulten y editen desde la plataforma, **sin cambiar nada de lo que
   ya está en el papel**: mismas columnas, mismo orden, mismo contenido.
2. Que el sistema calcule el vencimiento en lugar de que se calcule a mano.
3. Que **le avise al jefe de taller** antes de que un ítem llegue a su límite.
4. Que se pueda exportar.

---

## 2. Los papeles reales (medido, no supuesto)

Cinco aviones con documentación entregada: `YS-127-P`, `YS-270-P`, `YS-333-PE`, `YS-334-PE` y
`YS-361-PE` (este último **externo**, `aeronave.es_externa = true`). No hay nada del `YS-155-PE`, del
`YS-259-PE` ni del segundo bimotor.

Las dos listas vienen partidas en **AVIÓN / MOTOR / HÉLICE**, los mismos tres libros que ya modela
`taller_componente`.

### Volumen

| | |
|---|---|
| Renglones de AD en total | **221** |
| Que aplican al avión (el resto es `N/A por serie` o `por modelo`) | 192 |
| **Recurrentes** — los únicos que necesitan seguimiento | **38** |
| De esos, con próxima aplicación escrita | 7 |
| De esos, que dicen **cada cuánto** se repiten | **9** |

En vida límite el panorama es mejor: la columna `TIME` casi siempre trae el intervalo
(`2,000 Hrs`, `12 Yrs`, `100 HRS`), así que ahí el cálculo sale completo desde el día uno.

### Estado del origen

- **Cuatro aviones traen los ADs en Excel** (3 hojas cada uno). El `YS-127-P` los tenía **solo
  escaneados**; se transcribieron a
  `docs/formatos-aac/aeronavegabilidad/Docs. YS-127-P/_transcripcion_OCR.json`
  (66 ADs + 33 renglones de vida límite + 13 anomalías anotadas, sin corregir ninguna).
- El `YS-361-PE` **no tiene lista de vida límite**.
- Los cuatro Excel son el mismo formulario con **columnas distintas en cada avión** (el 361 no tiene
  columna de TAC, el 334 junta fecha y tacómetro, el 333 no tiene `N° S.B`). El esquema canónico es el
  **superset de 9 columnas**; cada avión deja en blanco lo que no use.

### Defectos del origen que el sistema no debe heredar

Ninguno se corrige en la carga. Se importan tal cual y se marcan.

- **La aritmética no cierra.** En la vida límite del `YS-334-PE`, **15 de 33 renglones** tienen un
  `NEXT DUE` que no sale de `HOUR C/W + TIME`. El patrón sugiere que la próxima se actualizó y las
  columnas de respaldo quedaron en `08-03-2024`.
- **El `YS-333-PE` ya muestra `−4.7` horas** en los nueve ítems de overhaul de motor y hélice.
- **9 ADs del `YS-334-PE` están en las dos listas a la vez, diciendo cosas distintas.** Ver §5.
- **Dos notaciones de hora mezcladas** en el 127: el TACH en decimal (`8127.48`), el T.T. y el T.S.O.
  en horas:minutos (`9,844:42` = 9844.70 hrs, **no** 9844.42).
- **Contradicciones entre documentos del mismo avión**: la hélice del 334 es `McCauley 72CK-O-57 S/N
  K978` en la hoja de ADs y `Sensenich 72CK-O-56 S/N K2364` en la de vida límite.
- **Estados fuera del catálogo**: `O/C` (on condition) en la columna recurrente; y un AD con
  `UNA VEZ = SI` y `RECURRENTE = SI` a la vez.

---

## 3. Decisiones tomadas

| # | Decisión | Motivo |
|---|---|---|
| 1 | Los ADs y la vida límite viven **dentro de Aeronavegabilidad**, no en una sección nueva | El modelo ya vive ahí. Una sección aparte dejaría el mismo AD en dos pantallas contradiciéndose |
| 2 | **La próxima manda.** La fecha de cumplimiento es referencia vieja | Decisión de Daniel sobre el caso del 334 |
| 3 | Umbrales de aviso: **10 horas de vuelo, 7 días y 30 días** | |
| 4 | El aviso llega por la **franja en la pantalla + una tarjeta en Mi taller**. Sin campana ni push todavía | Correr un par de semanas verificando el número antes de empujarlo al teléfono |
| 5 | Un AD en las dos listas → **una sola fila, precargada con la lista de ADs, marcada para confirmar** | El sistema calcula, pero no elige en silencio cuando el papel se contradice |
| 6 | Doble base (`2,000 Hrs` + `12 Yrs`) → **un registro, mostrado e impreso como dos renglones** | Fidelidad renglón por renglón sin dejar alerta fantasma tras cumplirlo |
| 7 | Todos los cálculos en **escala de libro** (`horas_acumuladas + tac_offset`) | Los papeles están escritos en esa escala |

---

## 4. Modelo

Todo en `taller_tarea_programada`, que ya existe y cuyo CHECK ya acepta
`INSPECCION | AD | SB | VIDA_LIMITE | OTRO`. **Cuatro columnas nuevas, todas aditivas.**

Migración `supabase/migrations/20260829000001_aeronavegabilidad_ads_vida_limite.sql`:

```sql
ALTER TABLE taller_tarea_programada
  ADD COLUMN IF NOT EXISTS aplica                boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS observaciones         text,
  ADD COLUMN IF NOT EXISTS necesita_confirmacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nota_confirmacion     text,
  ADD COLUMN IF NOT EXISTS origen                varchar(20);
```

| Columna | Para qué |
|---|---|
| `aplica` | los 29 renglones `N/A por serie / por modelo / no instalado`. No se borran, no alertan, no ensucian la lista |
| `observaciones` | la columna `OBSERVACIONES` del papel, textual |
| `necesita_confirmacion` + `nota_confirmacion` | los conflictos de §5, con las dos versiones dentro de la nota |
| `origen` | `EXCEL_2026` / `OCR_2026` / `MANUAL`, para que la carga sea re-ejecutable (mismo patrón que la carga del inventario) |

**Lo que NO lleva columna:**

- *"Falta cada cuánto"* es derivable: `recurrente = true AND intervalo_horas IS NULL AND
  intervalo_dias IS NULL`. Se calcula, no se guarda.
- La doble base **ya cabe en una fila**: `intervalo_horas` e `intervalo_dias` conviven. La duplicación
  es solo de presentación (§6).

**El vínculo con el libro es `id_componente`**, que ya existe y apunta a la célula, el motor o la
hélice. Los cuatro aviones de la escuela ya tienen las tres filas de `taller_componente`; el importador
crea las que falten (el 361 no tiene ninguna).

---

## 5. Conflictos entre las dos listas

Medido en el `YS-334-PE`, que es donde ambas listas son legibles por máquina: **9 ADs aparecen en las
dos, con datos distintos.**

| AD | Vida límite | Lista de ADs |
|---|---|---|
| `98-03-16` | última 8543.60 → próxima 10,043.60 | última **10,000.03**, cada 100 h |
| `82-27-08` | cada **100 h** | cada **5,000 h** |
| `81-23-07` | próxima 9,543.60 → **vencido −456 h** | última 10,000.03, cada 1000 h → **al día** |

Tres de ellos (`79-08-02`, `78-26-06`, `78-23-04`) tienen en la lista de ADs un TAC de **783.0, 208.0 y
160.00** — ni la escala del sistema (454) ni la del libro (10,000). Una tercera escala sin explicar.

**Resolución:** una sola fila, **precargada con la lista de ADs** (que en los 9 casos trae la fecha más
nueva: feb-2026 contra mar-2024), con `necesita_confirmacion = true` y las dos versiones dentro de
`nota_confirmacion`. La fila sale marcada en la pantalla hasta que el jefe confirme cuál vale.

No se resuelve en silencio: en `82-27-08` el sistema estaría eligiendo entre 100 h y 5,000 h.

---

## 6. El cálculo

Un helper nuevo, `legacy/CAA-backend/utils/vencimientos.js`, con la regla en **un solo lugar** —
misma disciplina que `utils/horasFacturables.js` y `utils/inventarioHelpers.js`.

```
tac_libro   = aeronave.horas_acumuladas + aeronave.tac_offset
restan_h    = proxima_horas - tac_libro          (null si no hay proxima_horas)
restan_dias = proxima_fecha - hoy                (null si no hay proxima_fecha)

estado =
  NO_APLICA      si aplica = false
  SIN_INTERVALO  si recurrente y no hay intervalo ni próxima
  VENCIDO        si restan_h <= 0   o  restan_dias <= 0
  POR_VENCER     si restan_h <= 10  o  restan_dias <= 30
  VIGENTE        en otro caso
```

**Manda lo que venga primero** entre horas y calendario. Un ítem con doble base se evalúa contra las
dos y toma la peor.

Los umbrales (`10` horas, `7` y `30` días) son constantes exportadas del helper. El de 7 días alimenta
un segundo nivel visual dentro de `POR_VENCER`; no es un estado aparte.

⚠️ **Todo se compara en escala de libro.** Es la lección ya pagada con los stickers: el `YS-334-PE`
tiene `tac_offset = 10000` porque su tacómetro dio la vuelta, y comparar la próxima del papel
(`10,043.60`) contra `horas_acumuladas` (`454.27`) da 9,589 horas de diferencia sobre un dato del que
depende la aeronavegabilidad del avión.

---

## 7. Pantallas

### Aeronavegabilidad

Pasa de 3 secciones a **5 pestañas**: Componentes · Tareas · **ADs y boletines** · **Vida límite** ·
Historial.

Las Tareas siguen mostrando solo `tipo = INSPECCION`, así que las 11 filas de hoy no se mezclan con
las 221 nuevas.

**Arriba, la franja de atención**, en tres bandas que se ocultan si están vacías:
vencidos (rojo) · por vencer (ámbar) · sin intervalo definido (neutra).

La banda de *sin intervalo* es deliberada: **el sistema produce solo la lista de lo que hay que
preguntarle al mecánico**, en vez de que sea una conversación.

**La lista va agrupada por libro** (avión / motor / hélice), como el papel y como las tres hojas del
Excel. Cada grupo colapsa; los que no tienen renglones recurrentes arrancan cerrados.

**Filtros:** `Aplican` (por defecto) · `Recurrentes` · `No aplican` · `Todos`. Los que no aplican se
muestran en gris con el motivo a la vista, nunca se borran.

**Columnas**, el superset de los cinco papeles: `N° AD` · `N° S.B` · `Descripción` · `Observaciones` ·
`Última (fecha + TAC)` · `Una vez` · `Recurrente` · `Próxima` · `Restan`.

La columna *Última* va atenuada: es referencia vieja, no la fuente del cálculo (decisión 2).

**Doble base:** una fila con los dos intervalos **se renderiza y se imprime como dos renglones**
consecutivos, uno por base, con el resto de las columnas repetido — igual que el papel. Cumplir
cualquiera de los dos cumple el ítem completo.

### Refactor necesario

`pages/Taller/Aeronavegabilidad.jsx` tiene hoy **34 KB en un solo archivo**; sumarle dos pestañas lo
deja pasando los 45 KB. Se parte en `pages/Taller/aeronavegabilidad/`:

```
Aeronavegabilidad.jsx     selector de avión, franja de atención, pestañas
Componentes.jsx           (lo que hoy existe)
Tareas.jsx                (lo que hoy existe, filtrado a INSPECCION)
TablaSeguimiento.jsx      tabla compartida — ADs y vida límite son la misma tabla
ListaAD.jsx               encabezado y filtros de AD/SB
VidaLimite.jsx            encabezado y filtros de VIDA_LIMITE
Historial.jsx             (lo que hoy existe)
```

Es la mejora acotada que corresponde al archivo que estamos tocando; no se refactoriza nada más.

### Mi taller

Una tarjeta arriba, junto a los aviones que ya están en el hangar: conteo de vencidos y por vencer
**por avión**, con enlace a la pestaña correspondiente. Es donde el jefe ya está parado todos los días.

### Permisos

| Acción | Quién |
|---|---|
| Ver | `TECNICO` y `TALLER` |
| Registrar un cumplimiento | `TECNICO` y `TALLER` — es lo que hace mientras trabaja |
| Editar un renglón, resolver un conflicto | **solo `TALLER`** (jefe) — mismo criterio que las plantillas de stickers y los anclajes |

---

## 8. Carga de los 221 renglones

Script re-ejecutable en `supabase/dump/aeronavegabilidad/`, mismo patrón que la carga del inventario
(`extraer.py` → JSON → `cargar.js`):

- `--dry-run` que no escribe nada.
- Borra lo marcado con `origen` y vuelve a cargar, así se puede correr las veces que haga falta.
- Los cuatro Excel entran directo; el `YS-127-P` entra desde el JSON del OCR.
- Crea las filas de `taller_componente` que falten (el 361).
- **Deja un reporte** con: los conflictos detectados, los renglones sin intervalo, los que no pudo
  interpretar, y los que traen valores fuera del catálogo (`O/C`, `una vez` y `recurrente` a la vez).

El reporte es el entregable operativo: es la lista concreta que Daniel le lleva al mecánico.

---

## 9. Verificación

E2E contra Supabase real con limpieza total, como todo lo anterior del módulo:

1. **Escala de libro** — que el `YS-334-PE` compare contra 10,454 y no contra 454. Es la prueba que no
   puede faltar.
2. **Doble base** — un ítem con 2,000 h y 12 años vence por lo que llegue primero; se renderiza como
   dos renglones; cumplir uno cumple el ítem.
3. **`aplica = false`** nunca alerta, nunca entra en los conteos, sigue visible bajo su filtro.
4. **Sin intervalo** cae en su propia banda y no se cuenta como vigente ni como vencido.
5. **Umbrales** — 10 h, 7 y 30 días, cada uno en su frontera exacta.
6. **Permisos** — el técnico recibe 403 al editar un renglón y al resolver un conflicto; 200 al
   registrar un cumplimiento.
7. **Carga en seco** contra los 221 renglones reales, verificando el conteo por avión y por libro.
8. **Conflictos** — los 9 del 334 entran como una sola fila marcada, con las dos versiones en la nota.

Y las pantallas revisadas en el navegador a 1280 y 375 px con los datos reales ya cargados.

---

## 10. Fuera de alcance

- **El formulario 1000 y el 1020** — spec aparte. Depende de esto en un solo sentido: su sección D
  (T.T.S.N., T.S.L.O. y último overhaul de motor y hélice) sale de `taller_componente`, y hoy esos
  anclajes están incompletos justo en los aviones que hay que renovar.
- **Campana y web push** — la cañería ya existe; se suman cuando el número lleve un par de semanas
  verificado.
- **La sección E del 1000** (brújula, altímetros, transponder, que vencen por fecha) es **otra** lista
  de vida limitada, distinta de esta. Va con el 1000.
- **Los dos bimotores** — el modelo de tres libros no les alcanza (§37 de CLAUDE.md). No hay nada mal
  registrado todavía porque no tienen partes cargadas.
- Cargar el `YS-155-PE` y el `YS-259-PE`: no hay documentación entregada.

---

## 11. Trabajo humano que esto no resuelve

El software no puede inventar lo que no está en el papel. Queda para una sesión con José Estrada:

1. **Los 29 ADs recurrentes que dicen solo "SI": cada cuántas horas.** Sin eso no hay vencimiento que
   calcular. La sospecha razonable es que casi todos van pegados a la inspección de 100 h, pero lo
   confirma él.
2. **Los 9 conflictos del 334**, y el mismo cruce en los otros aviones cuando se pueda hacer.
3. **Los 21 renglones vacíos de la vida límite del 127.**
4. **El TAC perdido del AD `2018-07-03`** del 127 (quedó una fecha en la columna de horas).
5. **De dónde salen los TAC de 783.0, 208.0 y 160.00** en la lista de ADs del 334.
6. **El T.T. del motor y de la hélice del 127**, que en el papel viene copiado del de la célula
   (pendiente arrastrado desde los stickers).
