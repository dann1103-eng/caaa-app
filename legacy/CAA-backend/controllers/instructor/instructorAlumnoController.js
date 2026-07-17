const db = require("../../config/db");
const { logAuditoria } = require("../../utils/auditoria");
const { resolverIdInstructor, getSemanaProxima } = require("../../utils/instructorHelpers");
const { generarReciboNominaPDF } = require("../../utils/pdfGenerator");

// Recibo de nómina propio (PDF) — solo del instructor autenticado.
exports.descargarMiRecibo = async (req, res) => {
  try {
    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ ok: false, message: "No sos instructor" });
    const { idDet } = req.params;
    const dq = await db.query(`
      SELECT d.*, (u.nombre || ' ' || u.apellido) AS instructor_username
      FROM nomina_detalle d
      JOIN instructor i ON i.id_instructor = d.id_instructor
      JOIN usuario u ON u.id_usuario = i.id_usuario
      WHERE d.id = $1 AND d.id_instructor = $2
    `, [idDet, id_instructor]);
    if (!dq.rows.length) return res.status(404).json({ ok: false, message: "Recibo no encontrado" });
    const per = await db.query(`SELECT * FROM nomina_periodo WHERE id = $1`, [dq.rows[0].id_periodo]);
    const doc = generarReciboNominaPDF({ periodo: per.rows[0], detalle: dq.rows[0] });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="recibo-${idDet}.pdf"`);
    doc.pipe(res);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Firmar (acuse de recibido) el recibo propio.
exports.firmarMiRecibo = async (req, res) => {
  try {
    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ ok: false, message: "No sos instructor" });
    const { idDet } = req.params;
    const d = await db.query(`
      SELECT d.id, d.firmado_en, p.estado
      FROM nomina_detalle d JOIN nomina_periodo p ON p.id = d.id_periodo
      WHERE d.id = $1 AND d.id_instructor = $2
    `, [idDet, id_instructor]);
    if (!d.rows.length) return res.status(404).json({ ok: false, message: "Recibo no encontrado" });
    if (!["APROBADA", "PAGADA"].includes(d.rows[0].estado))
      return res.status(400).json({ ok: false, message: "El recibo aún no está disponible para firmar" });
    if (d.rows[0].firmado_en) return res.status(400).json({ ok: false, message: "Ya firmaste este recibo" });
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").slice(0, 64);
    await db.query(`UPDATE nomina_detalle SET firmado_en = NOW(), firmado_ip = $2 WHERE id = $1`, [idDet, ip]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.getMisAlumnos = async (req, res) => {
  try {
    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

    const semana = await getSemanaProxima();

    const r = await db.query(
      `SELECT
         a.id_alumno,
         u.nombre,
         u.apellido,
         u.nombre || ' ' || u.apellido AS nombre_completo,
         a.soleado,
         a.numero_licencia,
         COALESCE(ss.limite_vuelos_avion, a.limite_vuelos_avion, 3) AS limite_vuelos_avion,
         COALESCE(ss.limite_vuelos_simulador, a.limite_vuelos_simulador, 3) AS limite_vuelos_simulador,
         -- El tope por día no tiene override por semana: sale siempre del alumno.
         COALESCE(a.limite_vuelos_dia, 1) AS limite_vuelos_dia,
         a.id_instructor_vuelo,
         uv.nombre || ' ' || uv.apellido AS instructor_vuelo_nombre,
         ss.id_solicitud
       FROM alumno a
       JOIN usuario u ON u.id_usuario = a.id_usuario
       LEFT JOIN instructor iv ON iv.id_instructor = a.id_instructor_vuelo
       LEFT JOIN usuario uv ON uv.id_usuario = iv.id_usuario
       LEFT JOIN solicitud_semana ss
         ON ss.id_alumno = a.id_alumno
        AND ss.id_semana = $2
       WHERE a.id_instructor = $1
         AND a.activo = true
         AND NOT COALESCE(a.es_practicante, false)
         AND NOT COALESCE(a.es_externo, false)
       ORDER BY u.apellido, u.nombre`,
      [id_instructor, semana?.id_semana ?? null]
    );

    res.json({ semana: semana ?? null, alumnos: r.rows });
  } catch (e) {
    console.error("getMisAlumnos instructor:", e);
    res.status(500).json({ message: "Error al obtener alumnos" });
  }
};

// Lista de instructores de VUELO activos (para el picker del instructor de
// cabecera al asignar quién vuela realmente con su alumno).
exports.getInstructoresVuelo = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT i.id_instructor, u.nombre || ' ' || u.apellido AS nombre_completo
      FROM instructor i JOIN usuario u ON u.id_usuario = i.id_usuario
      WHERE i.activo = true AND i.es_instructor_vuelo = true
      ORDER BY u.apellido, u.nombre
    `);
    res.json(r.rows);
  } catch (e) {
    console.error("getInstructoresVuelo:", e);
    res.status(500).json({ message: "Error al obtener instructores de vuelo" });
  }
};

// PATCH /instructor/alumnos/:id_alumno/instructor-vuelo { id_instructor_vuelo }
// El instructor de CABECERA asigna quién es el instructor de VUELO real de su
// alumno (pueden no ser la misma persona). Solo aplica a solicitudes de horas
// futuras — no reasigna vuelos ya agendados. id_instructor_vuelo=null limpia
// la asignación (vuelve a usar el de cabecera como antes).
exports.actualizarInstructorVuelo = async (req, res) => {
  const { id_alumno } = req.params;
  const raw = req.body.id_instructor_vuelo;
  const idInstructorVuelo = (raw === undefined || raw === null || raw === "") ? null : parseInt(raw, 10);
  if (idInstructorVuelo != null && isNaN(idInstructorVuelo)) {
    return res.status(400).json({ message: "Instructor de vuelo inválido" });
  }

  try {
    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

    const pertenece = await db.query(
      "SELECT 1 FROM alumno WHERE id_alumno = $1 AND id_instructor = $2",
      [id_alumno, id_instructor]
    );
    if (pertenece.rows.length === 0) {
      return res.status(403).json({ message: "Ese alumno no te está asignado" });
    }

    if (idInstructorVuelo != null) {
      const valido = await db.query(
        "SELECT 1 FROM instructor WHERE id_instructor = $1 AND activo = true AND es_instructor_vuelo = true",
        [idInstructorVuelo]
      );
      if (valido.rows.length === 0) {
        return res.status(400).json({ message: "Ese instructor no está activo como instructor de vuelo" });
      }
    }

    await db.query(
      "UPDATE alumno SET id_instructor_vuelo = $1 WHERE id_alumno = $2",
      [idInstructorVuelo, id_alumno]
    );

    await logAuditoria(db, {
      actor: req.user,
      accion: "OTRO",
      entidad: "alumno",
      id_entidad: Number(id_alumno),
      descripcion: idInstructorVuelo
        ? `Instructor de cabecera asignó instructor de vuelo #${idInstructorVuelo} al alumno #${id_alumno}`
        : `Instructor de cabecera quitó la asignación de instructor de vuelo del alumno #${id_alumno}`,
    });

    res.json({ message: "Instructor de vuelo actualizado", id_instructor_vuelo: idInstructorVuelo });
  } catch (e) {
    console.error("actualizarInstructorVuelo:", e);
    res.status(500).json({ message: "Error al actualizar el instructor de vuelo" });
  }
};

// Edita el LÍMITE BASE de vuelos del alumno (alumno.limite_vuelos_avion/simulador).
// A diferencia de habilitarVueloExtra (que ajusta una semana concreta), esto define
// el valor por defecto permanente y está siempre disponible para el instructor del
// alumno, exista o no una semana próxima publicada.
exports.actualizarLimitesAlumno = async (req, res) => {
  const { id_alumno } = req.params;
  const limAvion = parseInt(req.body.limite_vuelos_avion, 10);
  const limSim = parseInt(req.body.limite_vuelos_simulador, 10);
  // Tope de aviones por día: OPCIONAL. Si el cliente no lo manda (versión vieja
  // del front), se conserva el valor que ya tenía el alumno en vez de pisarlo.
  const limDiaRaw = req.body.limite_vuelos_dia;
  const limDia = (limDiaRaw === undefined || limDiaRaw === null || limDiaRaw === "")
    ? null
    : parseInt(limDiaRaw, 10);

  const client = await db.connect();
  try {
    if (isNaN(limAvion) || limAvion < 0 || limAvion > 6 || isNaN(limSim) || limSim < 0 || limSim > 6) {
      return res.status(400).json({ message: "Los límites deben estar entre 0 y 6" });
    }
    // Mínimo 1: a diferencia de los semanales, un tope por día de 0 no significa
    // nada útil (bloquearía todos los días) y se pisaría con el límite semanal.
    if (limDia !== null && (isNaN(limDia) || limDia < 1 || limDia > 6)) {
      return res.status(400).json({ message: "El límite de vuelos por día debe estar entre 1 y 6" });
    }

    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

    const perteneceRes = await client.query(
      "SELECT limite_vuelos_avion, limite_vuelos_simulador, limite_vuelos_dia FROM alumno WHERE id_alumno = $1 AND id_instructor = $2",
      [id_alumno, id_instructor]
    );
    if (perteneceRes.rows.length === 0) {
      return res.status(403).json({ message: "Ese alumno no te está asignado" });
    }

    await client.query("BEGIN");
    const updRes = await client.query(
      `UPDATE alumno
          SET limite_vuelos_avion = $1,
              limite_vuelos_simulador = $2,
              limite_vuelos_dia = COALESCE($3::int, limite_vuelos_dia)
        WHERE id_alumno = $4
        RETURNING COALESCE(limite_vuelos_dia, 1) AS limite_vuelos_dia`,
      [limAvion, limSim, limDia, id_alumno]
    );
    const limDiaFinal = updRes.rows[0].limite_vuelos_dia;

    await logAuditoria(client, {
      actor: req.user,
      accion: "OTRO",
      entidad: "alumno",
      id_entidad: Number(id_alumno),
      descripcion: `Instructor ajustó límite base de vuelos alumno #${id_alumno}: Avion ${limAvion}, Sim ${limSim}, Día ${limDiaFinal}`,
      before_data: perteneceRes.rows[0],
      after_data: { limite_vuelos_avion: limAvion, limite_vuelos_simulador: limSim, limite_vuelos_dia: limDiaFinal },
    });

    await client.query("COMMIT");
    res.json({
      message: "Límites actualizados",
      limite_vuelos_avion: limAvion,
      limite_vuelos_simulador: limSim,
      limite_vuelos_dia: limDiaFinal
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("actualizarLimitesAlumno instructor:", e);
    res.status(500).json({ message: "Error al actualizar límites" });
  } finally {
    client.release();
  }
};

// Ficha propia del instructor (solo lectura): datos de empleado/nómina, licencia,
// cursos asignados y alumnos asignados. Espeja lo que ve Administración.
exports.miFicha = async (req, res) => {
  try {
    const id_usuario = req.user.id_usuario;
    const datos = await db.query(`
      SELECT u.username, u.nombre, u.apellido, u.correo,
             ins.id_instructor, ins.activo AS instructor_activo, ins.licencia,
             e.cargo, e.sueldo_base, e.es_servicios_profesionales,
             e.dui, e.nit, e.isss_num, e.afp_num,
             (SELECT COUNT(*) FROM alumno a WHERE a.id_instructor = ins.id_instructor) AS num_alumnos
      FROM usuario u
      LEFT JOIN instructor ins ON ins.id_usuario = u.id_usuario
      LEFT JOIN empleado e      ON e.id_usuario  = u.id_usuario
      WHERE u.id_usuario = $1
    `, [id_usuario]);
    if (!datos.rows.length) return res.status(404).json({ ok: false, message: "Instructor no encontrado" });

    const ficha = datos.rows[0];
    let cursos = [], alumnos = [];
    if (ficha.id_instructor) {
      cursos = (await db.query(
        `SELECT c.codigo, c.nombre
         FROM instructor_curso ic JOIN curso c ON c.id = ic.id_curso
         WHERE ic.id_instructor = $1 ORDER BY c.codigo`,
        [ficha.id_instructor]
      )).rows;
      alumnos = (await db.query(
        `SELECT u.nombre || ' ' || u.apellido AS nombre, l.nombre AS licencia
         FROM alumno a
         JOIN usuario u ON u.id_usuario = a.id_usuario
         LEFT JOIN licencia l ON l.id_licencia = a.id_licencia
         WHERE a.id_instructor = $1 AND a.activo = true
         ORDER BY u.apellido, u.nombre`,
        [ficha.id_instructor]
      )).rows;
    }
    res.json({ ok: true, data: { ...ficha, cursos, alumnos } });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Historial propio del instructor (solo lectura): planillas, horas instruidas,
// clases, exámenes y pago de teoría. Espeja usuariosController.historialInstructor.
exports.miHistorial = async (req, res) => {
  try {
    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ ok: false, message: "No sos instructor activo" });

    const planillas = await db.query(`
      SELECT p.id AS id_periodo, p.periodo_inicio, p.periodo_fin, p.anio, p.mes,
             p.tipo_planilla, p.estado, p.fecha_pago,
             d.id AS id_detalle, d.firmado_en,
             d.bruto, d.isr, d.isss, d.afp, d.retencion, d.total AS neto
      FROM nomina_detalle d
      JOIN nomina_periodo p ON p.id = d.id_periodo
      WHERE d.id_instructor = $1 AND p.estado <> 'ANULADA'
      ORDER BY p.anio DESC NULLS LAST, p.mes DESC NULLS LAST, p.periodo_inicio DESC
    `, [id_instructor]);

    const horas = await db.query(`
      SELECT COALESCE(SUM(rv.tacometro_llegada - rv.tacometro_salida), 0) AS horas_total,
             COUNT(*) AS vuelos
      FROM vuelo v
      JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      WHERE v.id_instructor = $1 AND v.estado = 'COMPLETADO'
        AND COALESCE(rv.es_inasistencia, false) = false
    `, [id_instructor]);

    const clases = await db.query(`
      SELECT s.id, s.fecha, s.tema, c.codigo AS curso_codigo, c.nombre AS curso_nombre
      FROM sesion_clase s
      LEFT JOIN curso c ON c.id = s.id_curso
      WHERE s.id_instructor = $1
      ORDER BY s.fecha DESC
    `, [id_instructor]);

    const examenes = await db.query(
      `SELECT COUNT(*) AS total FROM evaluacion WHERE id_instructor = $1`, [id_instructor]
    );

    const teoria = await db.query(`
      SELECT COALESCE(SUM(monto_usd) FILTER (WHERE estado = 'PAGADO'), 0)    AS pagado,
             COALESCE(SUM(monto_usd) FILTER (WHERE estado = 'PENDIENTE'), 0) AS pendiente
      FROM pago_teoria_pendiente WHERE id_instructor = $1
    `, [id_instructor]);

    res.json({ ok: true, data: {
      planillas: planillas.rows,
      horas: horas.rows[0],
      clases: clases.rows,
      examenes_total: Number(examenes.rows[0].total),
      teoria: teoria.rows[0],
    }});
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.habilitarVueloExtra = async (req, res) => {
  const { id_alumno } = req.params;
  const { id_semana, limite_vuelos_avion, limite_vuelos_simulador } = req.body;

  const client = await db.connect();
  try {
    if (!id_semana) {
      return res.status(400).json({ message: "id_semana es requerido" });
    }

    const limAvion = parseInt(limite_vuelos_avion, 10);
    const limSim = parseInt(limite_vuelos_simulador, 10);

    if (isNaN(limAvion) || limAvion < 0 || limAvion > 6 || isNaN(limSim) || limSim < 0 || limSim > 6) {
      return res.status(400).json({ message: "Los límites deben estar entre 0 y 6" });
    }

    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

    const perteneceRes = await db.query(
      "SELECT 1 FROM alumno WHERE id_alumno = $1 AND id_instructor = $2",
      [id_alumno, id_instructor]
    );
    if (perteneceRes.rows.length === 0) {
      return res.status(403).json({ message: "Ese alumno no te está asignado" });
    }

    await client.query("BEGIN");

    const ssRes = await client.query(
      `SELECT id_solicitud, limite_vuelos_avion, limite_vuelos_simulador
       FROM solicitud_semana
       WHERE id_alumno = $1 AND id_semana = $2
       FOR UPDATE`,
      [id_alumno, id_semana]
    );

    if (ssRes.rows.length > 0) {
      await client.query(
        `UPDATE solicitud_semana
         SET limite_vuelos_avion = $1, limite_vuelos_simulador = $2, fecha_actualizacion = NOW()
         WHERE id_solicitud = $3`,
        [limAvion, limSim, ssRes.rows[0].id_solicitud]
      );
    } else {
      await client.query(
        `INSERT INTO solicitud_semana (id_alumno, id_semana, limite_vuelos_avion, limite_vuelos_simulador, estado)
         VALUES ($1, $2, $3, $4, 'APROBADO')`,
        [id_alumno, id_semana, limAvion, limSim]
      );
    }

    await logAuditoria(client, {
      actor: req.user,
      accion: "OTRO",
      entidad: "solicitud_semana",
      id_entidad: Number(id_alumno),
      descripcion: `Instructor ajustó límites de vuelos alumno #${id_alumno}: Avion ${limAvion}, Sim ${limSim}`,
      after_data: { limite_vuelos_avion: limAvion, limite_vuelos_simulador: limSim },
    });

    await client.query("COMMIT");

    res.json({ message: "Límites actualizados", limite_vuelos_avion: limAvion, limite_vuelos_simulador: limSim });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("habilitarVueloExtra instructor:", e);
    res.status(500).json({ message: "Error al actualizar límite" });
  } finally {
    client.release();
  }
};
