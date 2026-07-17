const db = require("../../config/db");
const { logAuditoria } = require("../../utils/auditoria");
const { resolverIdInstructor } = require("../../utils/instructorHelpers");
const solicitudService = require("../../services/solicitudService");

// "Mío" = el instructor efectivo del vuelo soy yo: override puntual del
// vuelo/solicitud, si no el instructor de VUELO asignado al alumno (puede no
// ser el de cabecera), y si tampoco hay ninguno, el de cabecera (compat con
// alumnos que aún no tienen instructor de vuelo asignado). Mismo criterio en
// todos los endpoints de este controller y en solicitudService.js.

/**
 * GET /instructor/solicitudes/calendario?week=next
 * Calendario COMPLETO de la escuela (para ver ocupación/conflictos), con un
 * flag es_mio por tarjeta: solo esas puede editar el instructor.
 */
exports.getCalendario = async (req, res) => {
  try {
    const idInstructor = await resolverIdInstructor(req.user.id_usuario);
    if (!idInstructor) return res.status(403).json({ message: "No sos instructor" });

    const semanaRes = await db.query(`
      SELECT id_semana, publicada FROM semana_vuelo
      WHERE fecha_inicio > CURRENT_DATE ORDER BY fecha_inicio LIMIT 1
    `);
    if (semanaRes.rows.length === 0) return res.json({ items: [], publicada: false });
    const { id_semana, publicada } = semanaRes.rows[0];

    const result = await db.query(`
      SELECT
        sv.id_detalle, sv.id_solicitud, ss.estado AS estado_solicitud, ss.comentario_alumno, sv.estado AS estado_vuelo_individual,
        v.id_vuelo, v.estado AS estado_vuelo, COALESCE(v.estado, ss.estado) AS estado_mostrar,
        sv.id_semana, sv.dia_semana, sv.id_bloque, sv.tipo_vuelo, sv.id_bloque_fin, b.hora_inicio, b.hora_fin,
        sv.id_aeronave, ae.modelo AS aeronave_modelo, ae.codigo AS aeronave_codigo,
        ss.id_alumno, u_al.nombre || ' ' || u_al.apellido AS alumno_nombre,
        LEFT(u_al.nombre,1) || '.' || split_part(u_al.apellido,' ',1) AS alumno_nombre_corto,
        i.id_instructor, u_ins.nombre || ' ' || u_ins.apellido AS instructor_nombre,
        LEFT(u_ins.nombre,1) || '.' || split_part(u_ins.apellido,' ',1) AS instructor_nombre_corto,
        COALESCE(v.es_extracurricular, sv.es_extracurricular) AS es_extracurricular,
        (COALESCE(sv.id_instructor, al.id_instructor_vuelo, al.id_instructor) = $2) AS es_mio
      FROM solicitud_vuelo sv
      JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
      JOIN bloque_horario b ON b.id_bloque = sv.id_bloque
      JOIN aeronave ae ON ae.id_aeronave = sv.id_aeronave
      JOIN alumno al ON al.id_alumno = ss.id_alumno
      JOIN usuario u_al ON u_al.id_usuario = al.id_usuario
      LEFT JOIN vuelo v ON v.id_detalle = sv.id_detalle AND v.id_semana = sv.id_semana
      JOIN instructor i ON i.id_instructor = COALESCE(v.id_instructor, sv.id_instructor, al.id_instructor_vuelo, al.id_instructor)
      JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario
      WHERE sv.id_semana = $1
        AND ss.estado NOT IN ('RECHAZADA', 'CANCELADA')
        AND (sv.estado IS NULL OR sv.estado != 'RECHAZADA')
        AND (v.estado IS NULL OR v.estado != 'CANCELADO')
      ORDER BY b.hora_inicio, sv.dia_semana, ae.modelo
    `, [id_semana, idInstructor]);

    // Aeronaves activas para el popover (el instructor puede cambiar de avión).
    const aeroRes = await db.query(`
      SELECT id_aeronave, codigo, modelo, activa
      FROM aeronave
      WHERE activa = true AND estado = 'ACTIVO'
      ORDER BY codigo
    `);

    res.json({ items: result.rows, publicada, aeronaves: aeroRes.rows });
  } catch (e) {
    console.error("instructorSolicitud.getCalendario:", e);
    res.status(500).json({ message: "Error al obtener el calendario" });
  }
};

/**
 * GET /instructor/solicitudes/resumen
 * Baskets de MIS alumnos (los que tengo asignados como instructor de vuelo) en
 * la semana próxima: estado, comentario y nº de vuelos, para revisar/enviar.
 */
exports.getResumen = async (req, res) => {
  try {
    const idInstructor = await resolverIdInstructor(req.user.id_usuario);
    if (!idInstructor) return res.status(403).json({ message: "No sos instructor" });

    const semanaRes = await db.query(`
      SELECT id_semana, publicada FROM semana_vuelo
      WHERE fecha_inicio > CURRENT_DATE ORDER BY fecha_inicio LIMIT 1
    `);
    if (semanaRes.rows.length === 0) return res.json({ semana: null, alumnos: [] });
    const { id_semana, publicada } = semanaRes.rows[0];

    const r = await db.query(`
      SELECT
        a.id_alumno,
        u.nombre || ' ' || u.apellido AS alumno_nombre,
        ss.id_solicitud, ss.estado, ss.comentario_alumno, ss.enviada_instructor_en,
        COALESCE((SELECT COUNT(*) FROM solicitud_vuelo sv
                    WHERE sv.id_solicitud = ss.id_solicitud
                      AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')), 0) AS n_vuelos
      FROM alumno a
      JOIN usuario u ON u.id_usuario = a.id_usuario
      LEFT JOIN solicitud_semana ss ON ss.id_alumno = a.id_alumno AND ss.id_semana = $1
      WHERE COALESCE(a.id_instructor_vuelo, a.id_instructor) = $2 AND a.activo
      ORDER BY u.nombre, u.apellido
    `, [id_semana, idInstructor]);

    res.json({ semana: { id_semana, publicada }, alumnos: r.rows });
  } catch (e) {
    console.error("instructorSolicitud.getResumen:", e);
    res.status(500).json({ message: "Error al obtener el resumen" });
  }
};

/**
 * PUT /instructor/solicitudes/guardar-cambios  { movimientos }
 * Reubica vuelos de MIS alumnos. Rechaza (403) si algún id_detalle no es mío.
 */
exports.guardarCambios = async (req, res) => {
  const client = await db.connect();
  try {
    const idInstructor = await resolverIdInstructor(req.user.id_usuario);
    if (!idInstructor) return res.status(403).json({ message: "No sos instructor" });

    const { movimientos } = req.body;
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      return res.status(400).json({ message: "No hay cambios para guardar" });
    }

    const semanaRes = await client.query(`
      SELECT w.id_semana, w.publicada
      FROM solicitud_vuelo sv JOIN semana_vuelo w ON w.id_semana = sv.id_semana
      WHERE sv.id_detalle = $1
    `, [movimientos[0].id_detalle]);
    if (semanaRes.rows.length === 0) return res.status(404).json({ message: "Semana no encontrada" });
    const { id_semana, publicada } = semanaRes.rows[0];
    if (publicada) return res.status(403).json({ message: "La semana ya fue publicada." });

    await client.query("BEGIN");

    await solicitudService.aplicarMovimientos(client, {
      id_semana,
      movimientos,
      // Todos los detalles movidos deben tener como instructor efectivo a este.
      assertOwnership: (infoPorDetalle) => {
        for (const info of infoPorDetalle.values()) {
          if (Number(info.id_instructor) !== Number(idInstructor)) {
            throw Object.assign(new Error("Solo podés mover vuelos de tus alumnos"), { status: 403 });
          }
        }
      },
      // El instructor de vuelo tiene la misma facultad que el alumno de pedir
      // horas aunque ya haya otra solicitud sobre la misma aeronave/instructor
      // en ese horario — el choque real lo resuelve Programación al publicar.
      saltarConflictoAeronave: true,
      saltarConflictoInstructor: true,
    });

    await logAuditoria(client, {
      accion: "GUARDAR_CAMBIOS",
      entidad: "solicitud_vuelo",
      id_entidad: null,
      id_semana,
      actor: req.user,
      req,
      descripcion: `Instructor ${idInstructor} movió ${movimientos.length} vuelos de sus alumnos`,
      metadata: { movimientos },
    });

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "instructor" });

    res.json({ message: "Cambios guardados correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status === 403) return res.status(403).json({ message: e.message });
    if (e.code === "23505") return res.status(409).json({ message: "Conflicto: ese bloque y aeronave ya están ocupados" });
    if (e.code === "23506") return res.status(409).json({ message: "Conflicto: el alumno ya tiene un vuelo en ese horario" });
    if (e.code === "23507") return res.status(409).json({ message: "Conflicto: el instructor ya tiene un vuelo en ese horario" });
    console.error("instructorSolicitud.guardarCambios:", e);
    res.status(500).json({ message: "Error al guardar cambios" });
  } finally {
    client.release();
  }
};

/**
 * POST /instructor/solicitudes  { id_alumno, dia_semana, id_bloque, id_bloque_fin?, id_aeronave, tipo_vuelo?, es_extracurricular? }
 * Crea un vuelo para uno de MIS alumnos (aditivo, semana próxima no publicada).
 */
exports.crearSolicitud = async (req, res) => {
  const client = await db.connect();
  try {
    const idInstructor = await resolverIdInstructor(req.user.id_usuario);
    if (!idInstructor) return res.status(403).json({ message: "No sos instructor" });

    const { id_alumno, dia_semana, id_bloque, id_bloque_fin, id_aeronave, tipo_vuelo, es_extracurricular } = req.body;
    if (!id_alumno || !dia_semana || !id_bloque || !id_aeronave) {
      return res.status(400).json({ message: "Faltan datos del vuelo" });
    }

    // El alumno debe ser mío (instructor de vuelo asignado, o de cabecera si no tiene uno).
    const own = await client.query(
      `SELECT 1 FROM alumno WHERE id_alumno = $1 AND COALESCE(id_instructor_vuelo, id_instructor) = $2`,
      [id_alumno, idInstructor]
    );
    if (own.rows.length === 0) return res.status(403).json({ message: "Ese alumno no es tuyo" });

    const semana = await solicitudService.getNextSemana(client);
    if (!semana) return res.status(404).json({ message: "No hay semana próxima" });
    if (semana.publicada) return res.status(403).json({ message: "La semana ya está publicada" });

    await client.query("BEGIN");
    const out = await solicitudService.insertarSolicitudVuelo(client, {
      id_alumno, id_semana: semana.id_semana, dia_semana, id_bloque, id_bloque_fin,
      id_aeronave, tipo_vuelo, id_instructor: idInstructor, es_extracurricular,
      // Misma facultad que el alumno al pedir horas: puede solicitar aunque la
      // aeronave o el instructor ya estén pedidos por otra solicitud en ese
      // horario — el choque real lo resuelve Programación al publicar.
      saltarConflictoAeronave: true,
      saltarConflictoInstructor: true,
    });
    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "instructor" });

    res.json({ message: "Vuelo agregado", ...out });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status === 400) return res.status(400).json({ message: e.message });
    if (e.code === "23505") return res.status(409).json({ message: "Ese bloque y aeronave ya está ocupado" });
    if (e.code === "23506") return res.status(409).json({ message: "El alumno ya tiene un vuelo en ese horario" });
    if (e.code === "23507") return res.status(409).json({ message: "El instructor ya tiene un vuelo en ese horario" });
    console.error("instructorSolicitud.crearSolicitud:", e);
    res.status(500).json({ message: "Error al agregar el vuelo" });
  } finally {
    client.release();
  }
};

/**
 * DELETE /instructor/solicitudes/:id_detalle
 * Quita un vuelo de un alumno mío (seguro pre-publicación: aún no hay vuelo).
 */
exports.eliminarSolicitud = async (req, res) => {
  const client = await db.connect();
  try {
    const idInstructor = await resolverIdInstructor(req.user.id_usuario);
    if (!idInstructor) return res.status(403).json({ message: "No sos instructor" });

    const { id_detalle } = req.params;
    const info = await client.query(`
      SELECT sv.id_detalle, w.publicada,
             COALESCE(sv.id_instructor, al.id_instructor_vuelo, al.id_instructor) AS id_instructor
      FROM solicitud_vuelo sv
      JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
      JOIN alumno al ON al.id_alumno = ss.id_alumno
      JOIN semana_vuelo w ON w.id_semana = sv.id_semana
      WHERE sv.id_detalle = $1
    `, [id_detalle]);
    if (info.rows.length === 0) return res.status(404).json({ message: "Vuelo no encontrado" });
    if (Number(info.rows[0].id_instructor) !== Number(idInstructor)) {
      return res.status(403).json({ message: "Solo podés quitar vuelos de tus alumnos" });
    }
    if (info.rows[0].publicada) return res.status(403).json({ message: "La semana ya fue publicada" });

    await client.query("BEGIN");
    await client.query(`DELETE FROM solicitud_vuelo WHERE id_detalle = $1`, [id_detalle]);
    await logAuditoria(client, {
      accion: "OTRO", entidad: "solicitud_vuelo", id_entidad: id_detalle,
      actor: req.user, req, descripcion: `Instructor ${idInstructor} quitó un vuelo de solicitud`,
    });
    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "instructor" });

    res.json({ message: "Vuelo quitado" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("instructorSolicitud.eliminarSolicitud:", e);
    res.status(500).json({ message: "Error al quitar el vuelo" });
  } finally {
    client.release();
  }
};

/**
 * POST /instructor/solicitudes/:id_solicitud/enviar
 * Envía a programación el basket de un alumno mío (BORRADOR → EN_REVISION).
 */
exports.enviarSolicitud = async (req, res) => {
  const client = await db.connect();
  try {
    const idInstructor = await resolverIdInstructor(req.user.id_usuario);
    if (!idInstructor) return res.status(403).json({ message: "No sos instructor" });

    const { id_solicitud } = req.params;
    await client.query("BEGIN");
    const info = await client.query(`
      SELECT ss.id_solicitud, ss.estado, w.publicada,
             COALESCE(al.id_instructor_vuelo, al.id_instructor) AS id_instructor,
             (SELECT COUNT(*) FROM solicitud_vuelo sv WHERE sv.id_solicitud = ss.id_solicitud
                AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')) AS n_vuelos
      FROM solicitud_semana ss
      JOIN alumno al ON al.id_alumno = ss.id_alumno
      JOIN semana_vuelo w ON w.id_semana = ss.id_semana
      WHERE ss.id_solicitud = $1
      FOR UPDATE OF ss
    `, [id_solicitud]);
    if (info.rows.length === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Solicitud no encontrada" }); }
    const row = info.rows[0];
    if (Number(row.id_instructor) !== Number(idInstructor)) { await client.query("ROLLBACK"); return res.status(403).json({ message: "Ese alumno no es tuyo" }); }
    if (row.publicada) { await client.query("ROLLBACK"); return res.status(403).json({ message: "La semana ya fue publicada" }); }
    if (row.estado !== "BORRADOR") { await client.query("ROLLBACK"); return res.status(400).json({ message: "La solicitud no está en borrador" }); }
    if (Number(row.n_vuelos) === 0) { await client.query("ROLLBACK"); return res.status(400).json({ message: "No hay vuelos para enviar" }); }

    await client.query(`
      UPDATE solicitud_semana
      SET estado = 'EN_REVISION', enviada_instructor_en = now(), enviada_por = $2, fecha_actualizacion = now()
      WHERE id_solicitud = $1
    `, [id_solicitud, req.user.id_usuario]);
    await logAuditoria(client, {
      accion: "OTRO", entidad: "solicitud_semana", id_entidad: id_solicitud,
      actor: req.user, req, descripcion: `Instructor ${idInstructor} envió a programación la solicitud ${id_solicitud}`,
    });
    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "instructor" });

    res.json({ message: "Enviada a programación" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("instructorSolicitud.enviarSolicitud:", e);
    res.status(500).json({ message: "Error al enviar la solicitud" });
  } finally {
    client.release();
  }
};

/**
 * POST /instructor/solicitudes/enviar-todas
 * Envía a programación TODOS los baskets BORRADOR (con vuelos) de mis alumnos.
 */
exports.enviarTodas = async (req, res) => {
  const client = await db.connect();
  try {
    const idInstructor = await resolverIdInstructor(req.user.id_usuario);
    if (!idInstructor) return res.status(403).json({ message: "No sos instructor" });

    const semana = await solicitudService.getNextSemana(client);
    if (!semana) return res.status(404).json({ message: "No hay semana próxima" });
    if (semana.publicada) return res.status(403).json({ message: "La semana ya fue publicada" });

    await client.query("BEGIN");
    const upd = await client.query(`
      UPDATE solicitud_semana ss
      SET estado = 'EN_REVISION', enviada_instructor_en = now(), enviada_por = $3, fecha_actualizacion = now()
      FROM alumno al
      WHERE ss.id_alumno = al.id_alumno
        AND COALESCE(al.id_instructor_vuelo, al.id_instructor) = $2
        AND ss.id_semana = $1
        AND ss.estado = 'BORRADOR'
        AND EXISTS (SELECT 1 FROM solicitud_vuelo sv WHERE sv.id_solicitud = ss.id_solicitud
                      AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA'))
      RETURNING ss.id_solicitud
    `, [semana.id_semana, idInstructor, req.user.id_usuario]);

    await logAuditoria(client, {
      accion: "OTRO", entidad: "solicitud_semana", id_entidad: null, id_semana: semana.id_semana,
      actor: req.user, req, descripcion: `Instructor ${idInstructor} envió ${upd.rows.length} solicitudes a programación`,
    });
    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "instructor" });

    res.json({ message: `Enviadas ${upd.rows.length} solicitudes`, enviadas: upd.rows.length });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("instructorSolicitud.enviarTodas:", e);
    res.status(500).json({ message: "Error al enviar las solicitudes" });
  } finally {
    client.release();
  }
};
