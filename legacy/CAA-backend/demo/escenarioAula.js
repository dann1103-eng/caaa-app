/**
 * El Aula Virtual del demo: inscripciones, material, clases con asistencia,
 * exámenes y notas.
 *
 * Sin esto el módulo se ve completamente vacío —no hay alumno inscrito en ningún
 * curso— y es la mitad "de tierra" del sistema: la que se le muestra a una
 * escuela que además da teoría, o que ofrece programas que no vuelan.
 *
 * Todo con fechas RELATIVAS al día de la corrida, como el resto del escenario.
 */
const { insertarMuchos } = require("./lotes");
const { storageDisponible, subirArchivo } = require("../utils/storage");

const DIA = 86400000;
const sumarDias = (d, n) => new Date(d.getTime() + n * DIA);
const soloFecha = (d) => d.toISOString().slice(0, 10);

/** Material de estudio: lo que el instructor sube a cada unidad. */
const MATERIAL = [
  { unidad: 1, nombre: "Reglamento del aire — resumen", cuerpo:
    "REGLAMENTO DEL AIRE\n\nResumen de las reglas de vuelo visual y por instrumentos.\n\n" +
    "1. Reglas generales de vuelo\n2. Reglas de vuelo visual (VFR)\n3. Reglas de vuelo por instrumentos (IFR)\n" +
    "4. Señales visuales\n5. Interceptación de aeronaves civiles\n\n" +
    "Documento de ejemplo para la demostración del aula virtual." },
  { unidad: 2, nombre: "Sistemas de la aeronave", cuerpo:
    "CONOCIMIENTO GENERAL DE AERONAVES\n\nSistemas básicos de un monomotor de instrucción.\n\n" +
    "· Grupo motopropulsor\n· Sistema de combustible\n· Sistema eléctrico\n· Instrumentos de vuelo\n" +
    "· Tren de aterrizaje y frenos\n\nDocumento de ejemplo para la demostración del aula virtual." },
  { unidad: 3, nombre: "Hoja de planeamiento de vuelo", cuerpo:
    "PERFORMANCE Y PLANEAMIENTO\n\nGuía para completar la hoja de planeamiento.\n\n" +
    "1. Peso y balance\n2. Distancias de despegue y aterrizaje\n3. Consumo y autonomía\n" +
    "4. Alternativas y combustible de reserva\n\nDocumento de ejemplo para la demostración." },
];

/** Un PDF chiquito, sin dependencias: el visor del navegador lo abre igual. */
function pdfSimple(titulo, cuerpo) {
  const lineas = cuerpo.split("\n");
  const texto = lineas
    .map((l, i) => `BT /F1 ${i === 0 ? 14 : 10} Tf 56 ${740 - i * 18} Td (${l.replace(/[()\\]/g, "")}) Tj ET`)
    .join("\n");
  const contenido = `${texto}\n`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objetos.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") +
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/**
 * El progreso unidad por unidad, que es de donde salen la barra del curso y el
 * "0 / 6 unidades" del tablero del alumno.
 *
 * Tiene que ser COHERENTE con lo demás: si hay tres clases dictadas y dos
 * exámenes aprobados, un curso que dice "0 de 6, ninguna iniciada" se lee como
 * que el sistema no registró nada. Se marcan completadas las unidades ya
 * dictadas, en progreso la que sigue, y sin tocar el resto.
 */
async function progresoDeUnidades(c, alumnos, unids, dictadas, actualizadoPor) {
  const filas = [];
  for (const idA of alumnos) {
    unids.forEach((u, k) => {
      const estado = k < dictadas ? "COMPLETADA" : k === dictadas ? "EN_PROGRESO" : "NO_INICIADA";
      // Las no iniciadas no se escriben: la ausencia de fila YA significa eso, y
      // llenar la tabla de filas vacías solo hace ruido.
      if (estado === "NO_INICIADA") return;
      filas.push([idA, u.id, estado, estado === "COMPLETADA" ? u.horas_estimadas || 20 : 0, actualizadoPor]);
    });
  }
  await insertarMuchos(c, "progreso_unidad_alumno",
    ["id_alumno", "id_unidad", "estado", "horas_acumuladas", "actualizado_por"], filas);
  return filas.length;
}

/**
 * @param ctx.idsAlumno    alumnos de vuelo, en orden
 * @param ctx.idsInstructor instructores
 * @param ctx.idTierra     la alumna de sobrecargo (o null)
 */
async function sembrarAula(c, log, ctx) {
  const { idsAlumno, idsInstructor, idTierra } = ctx;
  const hoy = new Date();

  const cursos = (await c.query(`SELECT id, nombre FROM curso ORDER BY id`)).rows;
  const unidades = (await c.query(
    `SELECT id, id_curso, numero, nombre, horas_estimadas FROM unidad_teorica ORDER BY id_curso, numero`
  )).rows;
  const salones = (await c.query(`SELECT id FROM salon ORDER BY id`)).rows.map((r) => r.id);
  if (!cursos.length) return { inscripciones: 0 };

  const privado = cursos[0].id;                 // Piloto Privado
  const instrumentos = cursos[1]?.id || privado;
  const unidadesDe = (idCurso) => unidades.filter((u) => u.id_curso === idCurso);

  // ── Inscripciones ───────────────────────────────────────────────────────
  // Los primeros doce alumnos en Privado y cuatro más en Instrumentos, para que
  // el aula tenga dos cursos con gente y no uno solo.
  log("aula: inscripciones");
  const inscritos = [
    ...idsAlumno.slice(0, 12).map((id) => ({ id, curso: privado })),
    ...idsAlumno.slice(12, 16).map((id) => ({ id, curso: instrumentos })),
  ];
  // La alumna de sobrecargo va a SU programa de tierra. Es la que demuestra que
  // el sistema sirve para alumnos que no vuelan, así que no puede estar metida
  // en un curso de piloto "para que aparezca en algún lado".
  const sobrecargo = (await c.query(`SELECT id FROM curso WHERE codigo = 'SOB'`)).rows[0]?.id;
  if (idTierra && sobrecargo) inscritos.push({ id: idTierra, curso: sobrecargo });

  await insertarMuchos(c, "inscripcion_curso",
    ["id_alumno", "id_curso", "fecha_inicio", "estado", "horas_practicas_completadas"],
    inscritos.map((i, k) => [i.id, i.curso, soloFecha(sumarDias(hoy, -(120 - k * 4))),
                             "ACTIVO", (k * 3) % 40])
  );
  const idsInscripcion = new Map(
    (await c.query(`SELECT id, id_alumno FROM inscripcion_curso`)).rows
      .map((r) => [r.id_alumno, r.id])
  );

  // El avance práctico por tipo de aeronave: es lo que la ficha del alumno
  // muestra como barra de progreso del curso.
  await insertarMuchos(c, "inscripcion_curso_avance",
    ["id_inscripcion", "tipo_aeronave", "horas_requeridas", "horas_acumuladas"],
    // El avance práctico es por tipo de aeronave... salvo para el programa de
    // tierra, que no tiene ninguno: su progreso son las unidades aprobadas.
    inscritos.filter((i) => i.curso !== sobrecargo).flatMap((i, k) => [
      [idsInscripcion.get(i.id), "AVION", 40, Math.min(40, 8 + (k * 5) % 34)],
      [idsInscripcion.get(i.id), "SIMULADOR", 10, Math.min(10, 2 + (k * 2) % 8)],
    ])
  );

  // ── Material de estudio ─────────────────────────────────────────────────
  // ⚠️ Se sube de VERDAD a Supabase Storage. Solo corre en el servidor, que es
  // donde están las credenciales; en una corrida local se salta y lo dice. No se
  // crean las filas si el archivo no subió: un material que no se puede abrir es
  // peor para una demostración que no tener material.
  let materiales = 0;
  if (storageDisponible()) {
    const filas = [];
    for (const m of MATERIAL) {
      const unidad = unidades.find((u) => u.id_curso === privado && u.numero === m.unidad);
      if (!unidad) continue;
      const ruta = `demo/unidad-${unidad.id}/${m.nombre.replace(/[^\w]+/g, "-").toLowerCase()}.pdf`;
      try {
        await subirArchivo("caaa-archivos", ruta, pdfSimple(m.nombre, m.cuerpo), "application/pdf");
        filas.push([unidad.id, `${m.nombre}.pdf`, ruta, "application/pdf", idsInstructor[0]]);
      } catch (e) {
        log(`aula: no pude subir "${m.nombre}" (${e.message})`);
      }
    }
    await insertarMuchos(c, "material_unidad",
      ["id_unidad", "nombre", "archivo_path", "content_type", "subido_por"], filas);
    materiales = filas.length;
    log(`aula: ${materiales} documentos subidos`);
  } else {
    log("aula: sin storage configurado, se omite el material (corré el reinicio desde el servidor)");
  }

  // ── Clases dictadas, con su lista de asistencia ─────────────────────────
  log("aula: clases y asistencia");
  const unidsPrivado = unidadesDe(privado);
  const clases = unidsPrivado.slice(0, 6).map((u, k) => ({
    unidad: u,
    fecha: soloFecha(sumarDias(hoy, -(40 - k * 7))),
    instructor: idsInstructor[k % idsInstructor.length],
    salon: salones[k % (salones.length || 1)] || null,
    // La última todavía no se dio: queda programada, para que se vea el estado.
    estado: k < 5 ? "CERRADA" : "PROGRAMADA",
  }));
  await insertarMuchos(c, "sesion_clase",
    ["id_curso", "id_unidad", "fecha", "tema", "id_instructor", "creado_por",
     "hora_inicio", "hora_fin", "id_salon", "estado"],
    clases.map((cl) => [privado, cl.unidad.id, cl.fecha, cl.unidad.nombre,
                        cl.instructor, cl.instructor, "08:00", "10:00", cl.salon, cl.estado])
  );
  const idsSesion = new Map(
    (await c.query(`SELECT id, id_unidad FROM sesion_clase`)).rows.map((r) => [r.id_unidad, r.id])
  );

  // Asistencia solo de las clases ya dadas. Casi todos presentes, con alguna
  // ausencia y una llegada tarde: una lista perfecta no se ve real.
  const alumnosPrivado = inscritos.filter((i) => i.curso === privado).map((i) => i.id);
  const asistencia = [];
  clases.filter((cl) => cl.estado === "CERRADA").forEach((cl, k) => {
    alumnosPrivado.forEach((idA, j) => {
      const estado = (j + k) % 11 === 0 ? "AUSENTE" : (j + k) % 7 === 0 ? "TARDE" : "PRESENTE";
      asistencia.push([idsSesion.get(cl.unidad.id), idA, estado, cl.instructor]);
    });
  });
  await insertarMuchos(c, "asistencia_alumno",
    ["id_sesion", "id_alumno", "estado", "registrado_por"], asistencia);

  const dictadasPrivado = clases.filter((cl) => cl.estado === "CERRADA").length;
  await progresoDeUnidades(c, alumnosPrivado, unidsPrivado, dictadasPrivado, idsInstructor[0]);

  // ── Exámenes y notas ────────────────────────────────────────────────────
  // Dos orígenes distintos, que es la separación que pidió la escuela: los
  // INTERNOS los pone el instructor y los de la AAC son los oficiales.
  log("aula: exámenes y notas");
  const EXAMENES = [
    { unidad: 0, nombre: "Quiz — Regulaciones aéreas", tipo: "QUIZ", origen: "INTERNO", max: 100, min: 70, dias: -35 },
    { unidad: 1, nombre: "Examen — Sistemas de la aeronave", tipo: "EXAMEN", origen: "INTERNO", max: 100, min: 70, dias: -21 },
    { unidad: 2, nombre: "Tarea — Hoja de planeamiento", tipo: "TAREA", origen: "INTERNO", max: 100, min: 70, dias: -14 },
    { unidad: null, nombre: "Examen FINAL teórico", tipo: "FINAL", origen: "INTERNO", max: 100, min: 75, dias: -5 },
    { unidad: null, nombre: "Examen AAC — Piloto Privado", tipo: "EXAMEN", origen: "AAC", max: 100, min: 75, dias: 12 },
  ];
  await insertarMuchos(c, "evaluacion",
    ["id_curso", "id_unidad", "nombre", "tipo", "fecha_programada", "puntos_max",
     "nota_aprobacion", "id_instructor", "descripcion", "origen"],
    EXAMENES.map((e, k) => [
      privado, e.unidad === null ? null : unidsPrivado[e.unidad]?.id, e.nombre, e.tipo,
      soloFecha(sumarDias(hoy, e.dias)), e.max, e.min, idsInstructor[k % idsInstructor.length],
      e.origen === "AAC" ? "Examen oficial de la autoridad aeronáutica." : "Evaluación interna del curso.",
      e.origen,
    ])
  );
  const evals = (await c.query(`SELECT id, nombre, fecha_programada FROM evaluacion ORDER BY id`)).rows;

  // Notas: las de los exámenes ya pasados están calificadas; el de la AAC
  // todavía no se rindió y queda PENDIENTE, que es lo que el alumno ve.
  const notas = [];
  evals.forEach((ev, k) => {
    const futuro = EXAMENES[k]?.dias > 0;
    alumnosPrivado.forEach((idA, j) => {
      if (futuro) {
        notas.push([ev.id, idA, "PENDIENTE", null, null, null, null]);
        return;
      }
      // Una nota reprobada cada tanto: un cuadro donde todos aprueban no
      // muestra para qué sirve la pantalla.
      const reprueba = (j + k) % 9 === 0;
      const nota = reprueba ? 55 + ((j * 3) % 12) : 76 + ((j * 7 + k * 5) % 22);
      notas.push([ev.id, idA, "CALIFICADA", nota, ev.fecha_programada,
                  reprueba ? "Debe repetir la evaluación." : null, idsInstructor[k % idsInstructor.length]]);
    });
  });
  await insertarMuchos(c, "evaluacion_alumno",
    ["id_evaluacion", "id_alumno", "estado", "nota", "fecha_presentacion",
     "observaciones", "calificado_por"], notas);

  // ── El recorrido de la alumna de sobrecargo ─────────────────────────────
  // Pedido de Daniel: que al entrar con su usuario haya algo por donde navegar.
  // Clases ya dadas con su asistencia, clases por venir, y notas puestas — que
  // es exactamente lo que ve un alumno de tierra en su perfil.
  let claseSob = 0, notasSob = 0;
  if (idTierra && sobrecargo) {
    log("aula: el curso de sobrecargo");
    const unidsSob = unidades.filter((u) => u.id_curso === sobrecargo);
    const agenda = unidsSob.map((u, k) => ({
      unidad: u,
      // Tres ya dictadas y las que siguen agendadas hacia adelante: así su
      // pantalla tiene historial Y próximas clases.
      dias: -28 + k * 14,
      estado: k < 3 ? "CERRADA" : "PROGRAMADA",
    }));
    await insertarMuchos(c, "sesion_clase",
      ["id_curso", "id_unidad", "fecha", "tema", "id_instructor", "creado_por",
       "hora_inicio", "hora_fin", "id_salon", "estado"],
      agenda.map((a, k) => [sobrecargo, a.unidad.id, soloFecha(sumarDias(hoy, a.dias)),
                            a.unidad.nombre, idsInstructor[k % idsInstructor.length],
                            idsInstructor[0], "14:00", "17:00",
                            salones[(k + 1) % (salones.length || 1)] || null, a.estado])
    );
    const sesionesSob = (await c.query(
      `SELECT id, id_unidad FROM sesion_clase WHERE id_curso = $1`, [sobrecargo]
    )).rows;
    claseSob = sesionesSob.length;

    await insertarMuchos(c, "asistencia_alumno",
      ["id_sesion", "id_alumno", "estado", "registrado_por"],
      agenda.filter((a) => a.estado === "CERRADA").map((a, k) => [
        sesionesSob.find((s) => s.id_unidad === a.unidad.id)?.id, idTierra,
        k === 1 ? "TARDE" : "PRESENTE", idsInstructor[0],
      ])
    );

    // Dos evaluaciones rendidas y una por venir.
    const EVAL_SOB = [
      ["Quiz — Seguridad y equipos de emergencia", "QUIZ", 1, -22, 88],
      ["Examen — Primeros auxilios a bordo", "EXAMEN", 2, -10, 92],
      ["Examen FINAL — Tripulante de cabina", "FINAL", null, 20, null],
    ];
    await insertarMuchos(c, "evaluacion",
      ["id_curso", "id_unidad", "nombre", "tipo", "fecha_programada", "puntos_max",
       "nota_aprobacion", "id_instructor", "descripcion", "origen"],
      EVAL_SOB.map(([nombre, tipo, u, dias]) => [
        sobrecargo, u === null ? null : unidsSob[u]?.id, nombre, tipo,
        soloFecha(sumarDias(hoy, dias)), 100, tipo === "FINAL" ? 75 : 70,
        idsInstructor[0], "Programa de tripulante de cabina.", "INTERNO",
      ])
    );
    const evalsSob = (await c.query(
      `SELECT id, nombre, fecha_programada FROM evaluacion WHERE id_curso = $1 ORDER BY id`,
      [sobrecargo]
    )).rows;
    await insertarMuchos(c, "evaluacion_alumno",
      ["id_evaluacion", "id_alumno", "estado", "nota", "fecha_presentacion",
       "observaciones", "calificado_por"],
      evalsSob.map((ev, k) => {
        const nota = EVAL_SOB[k]?.[4];
        return nota == null
          ? [ev.id, idTierra, "PENDIENTE", null, null, null, null]
          : [ev.id, idTierra, "CALIFICADA", nota, ev.fecha_programada,
             "Muy buen desempeño en el simulacro.", idsInstructor[0]];
      })
    );
    notasSob = evalsSob.length;
    await progresoDeUnidades(c, [idTierra], unidsSob,
      agenda.filter((a) => a.estado === "CERRADA").length, idsInstructor[0]);
  }

  return {
    sobrecargo: { clases: claseSob, evaluaciones: notasSob },
    inscripciones: inscritos.length,
    materiales,
    clases: clases.length,
    asistencias: asistencia.length,
    evaluaciones: EXAMENES.length,
    notas: notas.length,
  };
}

module.exports = { sembrarAula };
