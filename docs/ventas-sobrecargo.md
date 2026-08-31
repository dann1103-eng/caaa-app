# Qué responder sobre cursos de sobrecargo

Para cuando una escuela pregunte *"¿y la gente que estudia sobrecargo?"*.
CAAA no da esos cursos; el sistema sí los soporta desde el 2026-08-31.

---

## La respuesta corta

> El sistema no es solo de vuelo: la parte académica es genérica. Un alumno de
> sobrecargo se inscribe, tiene su malla de materias, se le pasa lista, sube y
> descarga material, rinde exámenes con sus notas, se le lleva cuenta corriente y
> se le factura — exactamente igual que a un alumno de piloto. Lo único que no
> tiene es la parte de vuelo, porque no vuela: no agenda aeronaves, no lleva
> loadsheet y no necesita instructor de vuelo.

## Lo que ve el alumno de sobrecargo cuando entra

| Sí tiene | No tiene |
|---|---|
| Sus clases y horarios | Agendar vuelos |
| Material de cada unidad | Loadsheet (peso y balance) |
| Sus notas y exámenes | METAR y estado de operaciones |
| Su asistencia | Límites de vuelo semanales |
| Su cuenta corriente y sus pagos | Programación de aeronaves |
| Su perfil y sus documentos | |

Es el **mismo panel**, con los bloques de vuelo apagados. No es una pantalla
aparte ni un sistema aparte.

## Lo que ve la escuela

- Se da de alta como cualquier alumno, eligiendo el **programa** "Sobrecargo" en
  vez de una licencia de piloto.
- **No pide instructor de vuelo** — y si la escuela quiere asignarle un tutor,
  puede.
- No aparece en ninguna lista de agendado, ni en el roster de vuelo de un
  instructor, ni en el sistema de stand-by. No hay forma de ponerle un vuelo por
  error.
- Sí aparece en Cuentas, en Usuarios y en el aula virtual, porque factura y
  estudia como cualquiera.

## Si preguntan por otros cursos de tierra

Lo mismo sirve tal cual para **despachante de vuelo**, **mecánico**, o cualquier
programa que no vuele: es dar de alta un programa nuevo, no desarrollar nada.

## Lo que hay que ser honesto en decir

- **La malla curricular de sobrecargo no viene cargada.** El sistema recibe las
  materias, sus horas y sus evaluaciones, pero el contenido lo carga cada
  escuela — igual que pasa con los cursos de piloto.
- **No hay simulador de cabina ni nada específico de sobrecargo** (maniobras de
  evacuación, primeros auxilios como módulo con su propia certificación). Si lo
  piden, es desarrollo nuevo y conviene decirlo en la reunión, no después.
- **La certificación final** se registra como cualquier examen aprobado; no hay
  integración con la AAC para ese trámite.

## Por dentro (por si preguntan cómo está hecho)

`licencia` en el sistema significa *"el programa hacia el que el alumno
progresa"*. Sobrecargo es una fila más de esa tabla, marcada como que no se
vuela. Por eso todo lo académico, lo administrativo y lo contable funciona sin
cambios: no se duplicó nada.

Detalle técnico: `docs/superpowers/specs/2026-08-31-alumnos-que-no-vuelan-design.md`
