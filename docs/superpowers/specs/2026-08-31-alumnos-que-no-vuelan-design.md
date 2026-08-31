# Alumnos que no vuelan (sobrecargo y cualquier curso de tierra)

**Fecha:** 2026-08-31
**Estado:** diseño aprobado
**Origen:** escuelas que además dan cursos de sobrecargo van a preguntar qué pasa con esa gente.
CAAA no los da, así que esto se construye para poder responder — y para la demo.

---

## 1. El caso

Un alumno de sobrecargo no vuela: no tiene instructor de vuelo, no tiene licencia de piloto, no
reserva aeronaves. Pero sí se inscribe a un curso, va a clases, se le pasa lista, rinde exámenes,
paga y se gradúa.

**Casi todo eso ya funciona.** Verificado en el esquema antes de diseñar:

| | |
|---|---|
| `curso` | `codigo, nombre, descripcion, horas_teoricas, costo_teorico_usd, gastos_administrativos_usd, total_usd_estimado, pago_teoria_instructor_usd` — **ni una columna de vuelo** |
| Aula virtual | unidades, material, `sesion_clase`, `asistencia_alumno`, `evaluacion`, notas: todo por `id_curso` |
| Cuenta corriente | `movimiento_cuenta` va por `id_alumno`; no sabe de aviones |
| Pago de teoría al instructor | por `curso.pago_teoria_instructor_usd`, ya existe |

**Lo único que estorba son dos columnas de la ficha de alumno:**

```
alumno.id_instructor   NOT NULL   ← un instructor de VUELO
alumno.id_licencia     NOT NULL   ← una licencia de PILOTO
```

Sin eso, dar de alta a un alumno de sobrecargo obliga a inventarle un instructor y una licencia de
piloto — exactamente la clase de dato falso que después ensucia reportes y nóminas.

---

## 2. El concepto que ordena todo

`licencia` ya significa *"la habilitación hacia la que el alumno progresa"*, y todo el sistema se
apoya en ella. **Sobrecargo es exactamente eso, solo que no se vuela.**

Así que `licencia` gana **una** columna y Sobrecargo es una fila más:

```sql
ALTER TABLE licencia ADD COLUMN vuela boolean NOT NULL DEFAULT true;
INSERT INTO licencia (nombre, nivel, dia_apertura_agenda, vuela)
     VALUES ('Sobrecargo', 1, 1, false);
```

Consecuencias, todas a favor:

- **`alumno.id_licencia` sigue NOT NULL.** No se toca. El alumno de tierra tiene un programa como
  cualquier otro, y el avance, la ficha y los reportes siguen funcionando igual.
- **No puede reservar aunque quisiera**: no se le asigna ninguna aeronave en `licencia_aeronave`, que
  es el mismo mecanismo que dejó a Bimotor sin aviones durante meses sin romper nada (§18, §22.G).
- **Un solo dato manda**: si el programa vuela o no. No hay dos fuentes que puedan divergir.

⚠️ **Por qué la bandera va en `licencia` y no en `alumno`.** Los dos tipos especiales que ya existen
(`es_practicante`, `es_externo`) están sobre `alumno` porque describen a la *persona*. "Volar o no"
describe al *programa*: si mañana la escuela abre Despachante o Mecánico de línea, es una fila más y
ningún alumno cambia. Ponerlo en `alumno` obligaría a recordar marcarlo en cada alta.

---

## 3. Cambios de esquema

Migración `20260831000001_alumnos_que_no_vuelan.sql`:

| | |
|---|---|
| `licencia.vuela boolean NOT NULL DEFAULT true` | aditiva; los 5 programas actuales quedan en `true` sin tocarlos |
| `alumno.id_instructor` → **nullable** | decisión de Daniel: sin tutor obligatorio, pero quien quiera asignarlo puede |
| fila `Sobrecargo` en `licencia` | `vuela = false`, sin aeronaves asociadas |

Nada más. **Ninguna tabla nueva.**

⚠️ `alumno.id_instructor` pasa de NOT NULL a nullable: es el único cambio **no** aditivo. El backend
viejo lo tolera (nunca inserta NULL), pero todo lo que lo lea tiene que aguantar el vacío — ver §5.

---

## 4. Un fragmento compartido, no copiado

El riesgo real es el de siempre: un tipo especial de registro **se filtra en los selectores**. Con las
aeronaves externas hubo que filtrar **16 consultas** (§29.D), y con los practicantes y externos otras
tantas.

Así que el filtro vive **una sola vez**, misma disciplina que `documentoCuentaSQL()` en bodega (§30) y
`soloHorasFacturables()` en nómina (§27):

```js
// legacy/CAA-backend/utils/alumnoVuela.js
alumnoVuelaSQL(alias)   // → AND EXISTS (SELECT 1 FROM licencia l
                        //               WHERE l.id_licencia = <alias>.id_licencia AND l.vuela)
```

**Dónde se aplica: solo en los selectores** — los lugares que listan alumnos *para elegir uno*:

- agendar (alumno y staff)
- roster del instructor (`mis-alumnos`)
- standby
- editar tripulación
- Usuarios → Alumnos (ahí se muestran **todos**, pero con la etiqueta del programa)

**Dónde NO se aplica:** las ~35 consultas que entran *desde un vuelo* (`vuelo JOIN alumno`). Un alumno
que no vuela no tiene vuelos, así que nunca aparece. Filtrarlas sería ruido.

---

## 5. Lo que hay que revisar por el `id_instructor` vacío

El instructor deja de estar garantizado. Los sitios que lo asumen:

- `instructorAlumnoController` (roster, límites, historial) — ya filtra por instructor, así que un
  alumno sin instructor simplemente no aparece: correcto.
- `AlumnoFicha` → Perfil: el selector "Instructor asignado" tiene que admitir *(sin asignar)*.
- `adminUsuarioController.actualizarAlumnoFull`: aceptar `id_instructor = null`.
- Alta de alumno en Usuarios: el instructor deja de ser obligatorio **cuando el programa no vuela**.
- Cualquier `JOIN instructor` sobre `alumno` tiene que ser `LEFT JOIN`, o el alumno desaparece de la
  lista sin que nadie se entere. **Es el riesgo más silencioso de este cambio.**

---

## 6. El panel del alumno

Mismo panel, bloques encendidos según si su programa vuela. Armado como **lista de bloques con una
condición cada uno**, no cableado, para poder sumarle cosas propias del alumno de tierra sin partir la
pantalla en dos (pedido de Daniel).

| Bloque | Vuela | No vuela |
|---|---|---|
| METAR · estado de operaciones · mis vuelos · agendar · loadsheet · documentos de vuelo | ✔ | — |
| Próximas clases · material · mis notas · asistencia · cuenta corriente · perfil | ✔ | ✔ |

El backend manda `vuela` en el login y en el perfil del alumno; el front no lo deduce.

---

## 7. Avance del curso

`inscripcion_curso_avance` es `tipo_aeronave, horas_requeridas, horas_acumuladas`: **horas por tipo de
avión**. Una inscripción de sobrecargo simplemente **no tiene filas ahí**, y el curso se completa por
el lado académico (`inscripcion_curso.estado`, asistencia y exámenes), que es genérico.

Hay que verificar que las pantallas de curso aguanten cero filas de avance sin romperse.

---

## 8. Verificación

E2E contra Supabase real con limpieza total, como todo lo anterior:

1. Alta de un alumno de sobrecargo **sin instructor** → 200, y la ficha lo devuelve con vacío.
2. Ese alumno **no aparece** en: agendar, roster del instructor, standby, editar tripulación.
3. Ese alumno **sí aparece** en: Usuarios → Alumnos, Cuentas, y la inscripción a un curso.
4. **No puede reservar**: `licencia_aeronave` vacío para Sobrecargo ⇒ el picker no le ofrece nada y el
   guardado lo rechaza.
5. El ciclo académico completo: inscribir → pasar lista → calificar → cobrar a cuenta corriente.
6. **Los alumnos de vuelo no cambian**: mismos conteos en los selectores antes y después.
7. El panel del alumno de tierra no muestra ningún bloque de vuelo; el de vuelo no pierde ninguno.

---

## 9. Fuera de alcance

- **Renombrar `licencia` a `programa`** en el código. Sería más preciso, pero toca cientos de líneas
  para ganar vocabulario. Se documenta y listo.
- **Un panel propio** para alumnos de tierra: es la dualidad que se viene limpiando en Taller (§36).
- **Malla curricular de sobrecargo** (materias reales, horas, requisitos AAC): el sistema queda listo
  para recibirla; el contenido lo pone cada escuela.
- **El entorno de demo** — proyecto duplicado e independiente, con su documentación de puesta en
  marcha. Va aparte, después de esto.
