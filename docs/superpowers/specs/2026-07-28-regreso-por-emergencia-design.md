# Regreso por emergencia: la vouchera existe, el avión suma horas, nadie cobra

**Fecha:** 2026-07-28 · **Aprobado por:** Daniel (brainstorm en sesión)

## El problema

Hay vuelos que salen del hangar y **no llegan a volar**: se quedan en pista y se regresan por mal
clima, una falla del avión, o cualquier otra causa. El avión **sí se movió** — el TAC y el Hobbs
marcaron algo — así que sus horas deben contarse para mantenimiento. Pero **el alumno no voló**:
no se le puede cobrar la hora, y por lo tanto **al instructor tampoco se le paga** esa hora.

Hoy el sistema no tiene forma de expresar eso. Las únicas dos salidas son cobrar igual (injusto) o
no hacer la vouchera (y entonces el avión pierde sus horas de mantenimiento).

## Contexto — qué existe ya (verificado en el código)

Al firmar la vouchera (`instructorReporteController.firmarReporteVuelo`) pasan **cuatro cosas
independientes**:

1. **Horas del avión** (`:336`): `actualizarHorasAeronave(client, id, id_aeronave, diff, io)` con
   `diff` = TAC llegada − TAC salida. Alimenta `aeronave.horas_acumuladas`, inserta en
   `horas_vuelo_aeronave` y dispara las inspecciones 50/100h.
2. **Cobro al alumno** (`:407`): `cargarVueloACuentaDentroTx(...)` → `movimiento_cuenta` tipo
   `CARGO_VUELO`, baja el saldo, y **además avanza el curso** (`inscripcion_curso_avance`,
   `facturasController.js:243-252`).
3. **Horas de licencia del alumno** (`:345-350`): `alumno.horas_acumuladas += horas_cobradas ?? diffTAC`,
   gated por `sumaHorasLicencia` (solo NORMAL/CHEQUEO) y `!es_extracurricular`.
4. **Pago al instructor**: NO se calcula acá. La nómina lo suma después, por periodo, con
   `SUM(rv.tacometro_llegada − rv.tacometro_salida)` sobre los vuelos `COMPLETADO`.

**Precedente cercano — `es_inasistencia`** (el no-show del alumno): apaga TODO, y lo hace poniendo
TAC/Hobbs/combustible en NULL (`:288-298`). Por eso el avión **no** suma horas — correcto para un
no-show (el avión nunca se movió), pero es exactamente lo contrario de lo que necesita este caso.
Consecuencia importante: la inasistencia queda excluida de la nómina **sola**, porque su TAC es NULL.
**Un regreso por emergencia NO se excluiría solo** — su TAC está lleno. Hay que excluirlo explícitamente.

**El instructor NO puede re-firmar.** `ReporteVueloModal.jsx:106-108`: en modo instructor
`isReadonly` es true apenas el reporte pasa a `PENDIENTE_ALUMNO`, y el botón de firmar está detrás de
`!isReadonly` (`:581`). No existe flujo de rechazo del reporte por parte del alumno (verificado por
grep). O sea: **la marca se pone antes de firmar o no se pone.**

## Decisiones de Daniel (brainstorm)

1. **Horas de licencia del alumno: NO se acreditan.** No voló: ni se le cobra ni se le acredita.
   El avión sí suma sus horas de TAC.
2. **Motivo: lista + nota.** Selector (Clima / Falla mecánica / Otro) + detalle libre.
3. **Lo marca solo el instructor, antes de firmar.** No se construye flujo de corrección para
   Administración (ver "Limitación conocida").
4. **En reportes aparece marcado, con $0 y 0 horas facturables** (no se oculta).

## Diseño

### 0. El concepto que ordena todo: horas técnicas vs. horas facturables

- **Horas técnicas del avión** = TAC real. Alimentan `aeronave.horas_acumuladas`, el mantenimiento
  50/100h y las lecturas de TAC/Hobbs de los reportes. **Un regreso por emergencia las cuenta normal.**
- **Horas facturables** = las que mueven plata o progreso: cobro al alumno, horas de licencia,
  avance de curso y pago al instructor. **Un regreso por emergencia las pone en cero.**

Toda la feature es aplicar esa separación de forma consistente.

### 1. Modelo de datos (migración aditiva)

En `reporte_vuelo`:
- `regreso_emergencia BOOLEAN DEFAULT FALSE` — la marca.
- `motivo_emergencia VARCHAR(20)` con `CHECK (motivo_emergencia IS NULL OR motivo_emergencia = ANY
  (ARRAY['CLIMA','FALLA_MECANICA','OTRO']))` — misma forma que los enums nullables del repo
  (`20260723000001`). El CHECK **no** exige el valor: la obligatoriedad se valida en el servidor (§2).
- `detalle_emergencia TEXT` — la nota libre.

Se eligieron **columnas nuevas** en vez de (a) reusar `es_inasistencia` — conflacionaría dos casos con
efectos opuestos sobre las horas del avión — o (b) una columna `tipo_cierre` enum, que obligaría a
refactorizar la lógica de inasistencia que hoy funciona, sin beneficio inmediato.

### 2. Al firmar (`firmarReporteVuelo`)

| Efecto | Vuelo normal | Regreso por emergencia |
|---|---|---|
| Horas del avión (TAC) | ✔ | **✔ igual** |
| Mantenimiento 50/100h | ✔ | **✔ igual** |
| Cobro al alumno (`CARGO_VUELO`) | ✔ | **✘** |
| Avance de curso | ✔ | **✘** (vive dentro del cobro, que no corre) |
| Horas de licencia del alumno | ✔ | **✘** |
| Pago al instructor (nómina) | ✔ | **✘** (ver §3) |
| Vouchera + PDF | ✔ | **✔ existe**, con sello y motivo |
| Estado del vuelo | COMPLETADO | COMPLETADO |

Reglas concretas:
- **El TAC sigue siendo obligatorio** y conserva sus validaciones (llegada > salida, tope de 24h,
  `:309`/`:317`): es lo que alimenta el mantenimiento.
- **`motivo_emergencia` es obligatorio** cuando `regreso_emergencia = true` → 400 con mensaje claro,
  misma forma que el guard de `tipo_vuelo` (`:208`). `detalle_emergencia` es opcional.
- **`horas_cobradas` se fuerza a NULL** y **se salta su validación** (hoy el servidor exige > 0 si
  viene, `:221-229`, y el cliente la exige siempre, `ReporteVueloModal.jsx:224-228` — la rama de
  emergencia debe cortocircuitar ambas, igual que hace `esInasistencia` en `:198`).
- El estado del vuelo sigue siendo `COMPLETADO`: el ciclo operativo terminó y el avión volvió. No se
  toca la máquina de estados (sus CHECK constraints ya causaron incidentes, §6/§20 de CLAUDE.md).
- **Alcance: solo aeronaves reales, no simuladores.** El caso es "salió del hangar y se regresó";
  un simulador no tiene TAC ni hangar. El check no se ofrece si `aeronave.tipo = 'SIMULADOR'`.
- **Hardening: rechazar la re-firma.** Hoy `ON CONFLICT (id_vuelo) DO UPDATE` (`:271`) permite firmar
  dos veces por API, y ni el cobro (`cargarVueloACuentaDentroTx`) ni las horas del avión
  (`actualizarHorasAeronave`, `utils/aeronaveUtils.js:25-63`) son idempotentes → doble cobro y doble
  hora de célula. La UI ya lo impide, así que agregar un **409 si el reporte ya está firmado**
  (`estado IN ('PENDIENTE_ALUMNO','COMPLETADO')`) no rompe ningún flujo real y cierra el agujero.

### 3. Que al instructor no se le pague — un helper compartido, no 6 copias

Las horas se suman desde el TAC en **6 consultas** (verificadas):

| # | Archivo:línea | Qué es | Qué se hace |
|---|---|---|---|
| 1 | `nominaController.js:219` | horas por instructor del periodo (**la plata**) | excluir |
| 2 | `nominaController.js:263-266` | `nomina_detalle_vuelo`, desglose de lo que se paga | excluir |
| 3 | `instructorAlumnoController.js:324` | historial propio del instructor | excluir |
| 4 | `usuariosController.js:563` | historial del instructor visto por admin | excluir |
| 5 | `usuariosController.js:609` | bitácora del **alumno** vista por admin (`historialAlumno`) | fila visible, 0 horas |
| 6 | `alumnoCuentaController.js:121` | bitácora de vuelos del alumno | fila visible, 0 horas |

Copiar la condición seis veces es el patrón que ya se rompió en este repo (el renombre
`EN_VUELO`→`EN_PROGRESO` dejó lugares sin actualizar durante meses). Por eso, **nuevo
`utils/horasFacturables.js`** con dos predicados SQL explícitos, parametrizados por alias:

```js
// Agregados de horas PAGABLES/facturables (sitios 1, 3, 4): excluye inasistencia
// y regreso por emergencia.
function soloHorasFacturables(alias = "rv") { ... }

// Solo excluye el regreso por emergencia (sitio 2). El desglose de nómina HOY sí
// lista inasistencias con 0 horas y $0; no cambiamos ese comportamiento de paso.
function sinRegresoEmergencia(alias = "rv") { ... }
```

⚠️ **Parametrizar el alias es obligatorio**, no cosmético: `mantenimientoCubreFechaSQL`
(`utils/mantenimientoUtils.js:9-13`) hardcodeó el alias `m` y eso costó un
`column m.completado does not exist` (§22.I).

En los sitios 5 y 6 la fila **se conserva** (decisión #4) pero sus horas salen en 0 y se expone
`regreso_emergencia` para que la UI la etiquete.

⚠️ **Nota sobre un 7º sitio, hoy inerte:** `utils/instructorHelpers.js:34-64`
(`registrarHorasInstructor`) acredita `alumno.horas_acumuladas` desde **minutos de reloj**, no del
TAC, disparado en `FINALIZANDO → COMPLETADO` (`instructorVueloController.js:297-310`). Hoy es inocuo
porque la UI manda `tiempo_vuelo_min: 0` y el helper corta en `<= 0`. **Si alguna vez se activa, hay
que aplicarle la misma exclusión** o la decisión #1 se rompe en silencio.

### 4. Los PDFs — el detalle que se escapa

Forzar `horas_cobradas = NULL` **no** hace que los reportes impriman 0: ambos generadores hacen
fallback al TAC (`utils/pdfGenerator.js:509` y `:681-682`,
`horas_cobradas != null ? … : tacH`). Sin tocar eso, un regreso por emergencia imprimiría **las horas
voladas al lado de $0** — justo lo contrario de la decisión #4. Además `horas_cobradas = 0` no es
alternativa: el servidor rechaza `<= 0`.

Por eso hay que:
- Agregar `rv.regreso_emergencia` a las dos consultas de reporte (`turnoController.js:919-968` y
  `:1026-1062`).
- Hacer que ambos generadores impriman **0 / “—”** en la columna de horas y la etiqueta cuando la
  marca está puesta.

### 5. Visibilidad

- **Modal de la vouchera**: botón "Regreso por emergencia" junto al de inasistencia (solo instructor,
  solo aeronave real), badge rojo y banner con motivo + detalle, espejando el tratamiento de
  INASISTENCIA que ya existe.
- **PDF de la vouchera**: sello "REGRESO POR EMERGENCIA" + línea con motivo y detalle.
- **Reporte del día "Vuelos por avión"**: el monto ya sale $0 solo (viene de `movimiento_cuenta`,
  `turnoController.js:941-949`) y las lecturas de TAC se conservan reales. Se agregan las horas en 0
  (§4) y la etiqueta.
- **Voucheras del día (Administración)**: `voucherasController.js:33-63` es un SELECT **aparte** que
  alimenta `pages/Administracion/Voucheras.jsx` → `generarPdfVoucherasDia`. Ya selecciona
  `es_inasistencia`/`motivo_inasistencia`; hay que sumarle las 3 columnas nuevas y mapearlas, o el
  PDF por lote imprimiría los regresos por emergencia como voucheras normales.
- **Lecturas del modal**: `instructorReporteController.js:51` y `alumno/alumnoReporteController.js:14`
  deben devolver las 3 columnas nuevas, o la marca no vuelve a la pantalla al reabrir el reporte.
- **Guardado de borrador** (el hermano de la lectura, fácil de olvidar):
  `guardarReporteVueloInstructor` (`instructorReporteController.js:115-175`, `PUT /vuelos/:id/reporte-vuelo`)
  persiste `es_inasistencia`/`motivo_inasistencia` de forma **explícita** (`:139`, `:152`, `:167`), y el
  cliente los manda aparte del spread (`ReporteVueloModal.jsx:184`). Como la marca de emergencia vivirá
  en su propio estado de React (espejando `esInasistencia`), **no viajaría dentro de `datos`**: hay que
  sumar las 3 columnas al INSERT y al `ON CONFLICT DO UPDATE` de ese endpoint **y** al payload de
  `handleGuardar`. Sin esto: el instructor marca la emergencia → "Guardar borrador" → reabre → **la
  marca desapareció**, y firma una vouchera normal sin darse cuenta.

### 6. Alcance — qué NO se hace

- **Flujo de corrección para Administración** (marcar/desmarcar después de firmado). Decisión #3.
- Regreso por emergencia en simulador.
- Cambiar la máquina de estados del vuelo.
- Reportes/estadísticas por causa de emergencia (los datos quedan guardados para hacerlo luego).
- Arreglar la falta de idempotencia del cobro y de las horas de célula **en general** — solo se
  bloquea la re-firma (§2), que es la única puerta que existía.

**Limitación conocida (aceptada por Daniel):** si el instructor firma normal por error y recién
después se da cuenta, la corrección **no es automática**. Administración puede borrar el `CARGO_VUELO`
desde la cuenta corriente (el borrado directo ya existe desde el 2026-07-22), pero las horas de
licencia, el avance de curso y la nómina de ese vuelo quedarían contados. Si en la práctica el olvido
resulta común, el siguiente paso es construir el flujo de corrección de Administración.

## Verificación

E2E contra Supabase real dentro de `BEGIN…ROLLBACK`, firmando un vuelo con `regreso_emergencia`:

1. `aeronave.horas_acumuladas` **subió** por el TAC y quedó la fila en `horas_vuelo_aeronave`.
2. **No** se creó ningún `movimiento_cuenta` para ese vuelo; el saldo del alumno quedó igual.
3. `alumno.horas_acumuladas` quedó **intacto**, y `inscripcion_curso_avance` también.
4. La consulta de nómina (`nominaController:219`) da el **mismo total que antes** para ese instructor
   (assert sobre el **delta**, no sobre un 0 absoluto: en datos reales ese instructor tiene otros
   vuelos del periodo).
5. `motivo_emergencia` ausente con la marca puesta → **400**.
6. Re-firmar un reporte ya firmado → **409** (y el saldo/las horas de célula no se movieron).
7. **Ida y vuelta del borrador:** guardar el reporte como borrador con la marca puesta y volver a
   leerlo devuelve `regreso_emergencia = true` con su motivo (que la marca no se pierda al guardar).
8. **No-regresión:** un vuelo normal en la misma prueba cobra, acredita horas y suma a la nómina
   **exactamente igual que antes**.
