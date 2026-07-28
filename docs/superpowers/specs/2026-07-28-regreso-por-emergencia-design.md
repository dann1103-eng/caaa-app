# Regreso por emergencia: la vouchera existe, el avión suma horas, nadie cobra

**Fecha:** 2026-07-28 · **Aprobado por:** Daniel (brainstorm en sesión)

## El problema

Hay vuelos que salen del hangar y **no llegan a volar**: se quedan en pista y se regresan por mal
clima, una falla del avión, o cualquier otra causa. El avión **sí se movió** — el TAC y el Hobbs
marcaron algo — así que sus horas deben contarse para mantenimiento. Pero **el alumno no voló**:
no se le puede cobrar la hora, y por lo tanto **al instructor tampoco se le paga** esa hora.

Hoy el sistema no tiene forma de expresar eso. Las únicas dos salidas son cobrar igual (injusto) o
no hacer la vouchera (y entonces el avión pierde sus horas de mantenimiento).

## Contexto — qué existe ya

Al firmar la vouchera (`instructorReporteController.firmarReporteVuelo`) pasan **cuatro cosas
independientes**:

1. **Horas del avión**: `actualizarHorasAeronave(client, id, id_aeronave, diff, io)` con `diff` =
   TAC llegada − TAC salida. Alimenta `aeronave.horas_acumuladas` y dispara las inspecciones 50/100h.
2. **Cobro al alumno**: `cargarVueloACuentaDentroTx(...)` con `tacometro: horas_cobradas ?? diffTAC`
   → crea un `movimiento_cuenta` tipo `CARGO_VUELO` y baja el saldo.
3. **Horas de licencia del alumno**: `alumno.horas_acumuladas += horas_cobradas ?? diffTAC`, gated por
   `sumaHorasLicencia` (solo NORMAL/CHEQUEO) y `!es_extracurricular`.
4. **Pago al instructor**: NO se calcula acá. La nómina lo suma después, por periodo, con
   `SUM(rv.tacometro_llegada − rv.tacometro_salida)` sobre los vuelos `COMPLETADO`.

**Precedente cercano — `es_inasistencia`** (el no-show del alumno): apaga TODO, y lo hace poniendo
TAC/Hobbs/combustible en NULL. Por eso el avión **no** suma horas — que es correcto para un no-show
(el avión nunca se movió) pero es exactamente lo contrario de lo que necesita este caso.

## Decisiones de Daniel (brainstorm)

1. **Horas de licencia del alumno: NO se acreditan.** No voló: ni se le cobra ni se le acredita.
   El avión sí suma sus horas de TAC.
2. **Motivo: lista + nota.** Selector (Clima / Falla mecánica / Otro) + detalle libre.
3. **Lo marca solo el instructor al firmar.** No se construye un flujo de corrección para
   Administración (pero ver §4: la corrección del "uy, ya firmé" sí se cubre).
4. **En reportes aparece marcado, con $0 y 0 horas facturables** (no se oculta).

## Diseño

### 0. El concepto que ordena todo: horas técnicas vs. horas facturables

- **Horas técnicas del avión** = TAC real. Alimentan `aeronave.horas_acumuladas`, el mantenimiento
  50/100h y las lecturas del reporte por avión. **Un regreso por emergencia las cuenta normal.**
- **Horas facturables** = las que mueven plata o progreso: cobro al alumno, horas de licencia,
  avance de curso, y pago al instructor. **Un regreso por emergencia las pone en cero.**

Toda la feature es aplicar esa separación de forma consistente.

### 1. Modelo de datos (migración aditiva)

En `reporte_vuelo`:
- `regreso_emergencia BOOLEAN DEFAULT FALSE` — la marca.
- `motivo_emergencia VARCHAR(30)` — `CLIMA` | `FALLA_MECANICA` | `OTRO` (CHECK).
- `detalle_emergencia TEXT` — la nota libre.

Se eligió **columnas nuevas** en vez de (a) reusar `es_inasistencia` — conflacionaría dos casos con
efectos opuestos sobre las horas del avión — o (b) una columna `tipo_cierre` enum, que obligaría a
refactorizar la lógica de inasistencia que hoy funciona, sin beneficio inmediato.

### 2. Al firmar (`firmarReporteVuelo`)

| Efecto | Vuelo normal | Regreso por emergencia |
|---|---|---|
| Horas del avión (TAC) | ✔ | **✔ igual** |
| Mantenimiento 50/100h | ✔ | **✔ igual** |
| Cobro al alumno (`CARGO_VUELO`) | ✔ | **✘** |
| Horas de licencia del alumno | ✔ | **✘** |
| Avance de curso | ✔ | **✘** (va dentro del cobro, que no corre) |
| Pago al instructor (nómina) | ✔ | **✘** (ver §3) |
| Vouchera + PDF | ✔ | **✔ existe**, con sello y motivo |
| Estado del vuelo | COMPLETADO | COMPLETADO |

- **El TAC sigue siendo obligatorio** y conserva sus validaciones actuales (llegada > salida, tope
  de 24h): es lo que alimenta el mantenimiento.
- **`horas_cobradas` se fuerza a NULL** (como hace la inasistencia con sus campos), para que no quede
  un número que después confunda a Administración.
- El estado del vuelo sigue siendo `COMPLETADO`: el ciclo operativo terminó y el avión volvió. No se
  toca la máquina de estados (sus CHECK constraints ya causaron incidentes antes, §6/§20 de CLAUDE.md).
- **Alcance: solo aeronaves reales, no simuladores.** El caso es "salió del hangar y se regresó";
  un simulador no tiene TAC ni hangar. El check no se ofrece para `tipo='SIMULADOR'`.

### 3. Que al instructor no se le pague — un helper compartido, no 6 copias

Las horas del instructor se suman desde el TAC en **6 consultas distintas**:

| # | Archivo | Qué es |
|---|---|---|
| 1 | `nominaController.js:219` | horas por instructor del periodo (**la plata**) |
| 2 | `nominaController.js:263-266` | `nomina_detalle_vuelo`, el desglose por vuelo |
| 3 | `instructorAlumnoController.js:324` | historial propio del instructor |
| 4 | `usuariosController.js:563` | historial del instructor visto por admin |
| 5 | `usuariosController.js:609` | lista de vuelos de ese historial |
| 6 | `alumnoCuentaController.js:121` | bitácora de vuelos del alumno |

Copiar la condición seis veces es exactamente el patrón que ya se rompió en este repo (el renombre
`EN_VUELO`→`EN_PROGRESO` dejó lugares sin actualizar durante meses). Por eso:

**Nuevo `utils/horasFacturables.js`** con un predicado SQL único, parametrizado por alias:

```js
// Un vuelo aporta horas FACTURABLES (pago al instructor, bitácora, avance) solo si
// su reporte no es inasistencia ni regreso por emergencia. Las horas TÉCNICAS del
// avión (mantenimiento) NO usan este predicado — esas cuentan siempre.
function horasFacturablesSQL(alias = "rv") {
  return `COALESCE(${alias}.es_inasistencia, false) = false
          AND COALESCE(${alias}.regreso_emergencia, false) = false`;
}
```

⚠️ **Parametrizar el alias es obligatorio**, no cosmético: `mantenimientoCubreFechaSQL` hardcodeó el
alias `m` y eso costó un `column m.completado does not exist` (§22.I).

- **Agregados (1, 3, 4)**: el predicado va en el `WHERE`/`FILTER` → las horas no se suman.
- **Listas por vuelo (2, 5, 6)**: la fila **se conserva** (decisión de Daniel: aparece marcada) pero
  sus horas salen en 0 y se expone `regreso_emergencia` para que la UI la etiquete. En el caso 2
  (`nomina_detalle_vuelo`) la fila directamente no se inserta: es el desglose de lo que se paga.

### 4. La red de seguridad del "uy, ya había firmado"

Hoy el cobro **no tiene guarda de idempotencia**: `firmarReporteVuelo` hace `ON CONFLICT DO UPDATE`,
así que volver a firmar vuelve a cobrar. Esta feature hace ese camino probable (firmo normal → me
doy cuenta → re-firmo marcando la emergencia).

**Al firmar con `regreso_emergencia = true`, si ya existe un `CARGO_VUELO` no anulado de ese vuelo,
se elimina y se recalcula el saldo de la cuenta.** Se usa **borrado directo** (no fila de anulación)
por coherencia con el modelo de cuenta corriente tipo Excel que se adoptó el 2026-07-22.

También se revierte la suma de horas de licencia si el cobro previo las había acreditado
(`alumno.horas_acumuladas -= horas del movimiento borrado`), para que la corrección sea completa.

Esto NO es el flujo de corrección de Administración (que quedó fuera de alcance): es solo cerrar el
lazo del propio instructor cuando re-firma.

### 5. Visibilidad

- **Modal de la vouchera**: botón "Regreso por emergencia" junto al de inasistencia (solo instructor,
  solo aeronave real), badge rojo en el encabezado y banner con motivo + detalle, espejando el
  tratamiento visual de INASISTENCIA que ya existe.
- **PDF de la vouchera**: sello "REGRESO POR EMERGENCIA" y una línea con el motivo y el detalle.
- **Reporte del día "Vuelos por avión"**: el monto ya sale $0 solo (viene de `movimiento_cuenta`) y
  las lecturas de TAC se conservan reales (son datos del avión). Solo se agrega la etiqueta para que
  Administración entienda por qué ese vuelo no facturó.

### 6. Alcance — qué NO se hace

- Flujo para que Administración marque/desmarque la emergencia después (Daniel: solo el instructor).
- Regreso por emergencia en simulador.
- Cambiar la máquina de estados del vuelo.
- Reportes/estadísticas nuevas por causa de emergencia (los datos quedan guardados para hacerlo luego).
- Arreglar la falta de idempotencia del cobro en general (solo se cubre el caso de esta feature, §4).

## Verificación

E2E contra Supabase real dentro de `BEGIN…ROLLBACK`, firmando un vuelo con `regreso_emergencia`:

1. `aeronave.horas_acumuladas` **subió** por el TAC (y quedó registro en `horas_vuelo_aeronave`).
2. **No** se creó ningún `movimiento_cuenta` para ese vuelo; el saldo del alumno quedó igual.
3. `alumno.horas_acumuladas` quedó **intacto**.
4. La consulta de nómina (`nominaController:219`) devuelve **0 horas** para ese instructor por ese vuelo.
5. Caso corrección: firmar normal (se cobra) → re-firmar con emergencia → el `CARGO_VUELO` **ya no
   existe**, el saldo volvió a su valor original y las horas del alumno también.
6. Un vuelo normal en la misma prueba sigue cobrando y pagando **exactamente igual que antes**
   (no-regresión).
