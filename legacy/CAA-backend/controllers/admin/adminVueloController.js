const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const transporter = require("../../utils/mailer");
const { horarioAlumnoEmail, horarioInstructorEmail } = require("../../utils/emailTemplates");
const { getNextSemanaId, getCurrentSemanaId, crearSemanaFutura } = require("../../utils/adminHelpers");
const { dispararOfertaPorCancelacion } = require("../../controllers/standbyController");

exports.getSemanas = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT
      id_semana,
      fecha_inicio,
      fecha_fin,
      publicada,
      fecha_publicacion,
      CASE
        WHEN CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin THEN 'ACTUAL'
        WHEN fecha_inicio > CURRENT_DATE THEN 'SIGUIENTE'
        ELSE 'PASADA'
      END AS tipo
    FROM semana_vuelo
    ORDER BY fecha_inicio
  `);
  res.json(result.rows);
});

exports.publicarSemana = catchAsync(async (req, res) => {
  const { id_semana } = req.body;

  if (!id_semana) {
    return res.status(400).json({ message: "ID de semana no proporcionado" });
  }

  console.log(`Iniciando publicación de semana ID: ${id_semana}`);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const semanaRes = await client.query(`
      SELECT id_semana, fecha_inicio, fecha_fin
      FROM semana_vuelo
      WHERE id_semana = $1 AND publicada = false
    `, [id_semana]);

    if (semanaRes.rows.length === 0) {
      throw new Error("No existe semana para publicar o ya ha sido publicada");
    }

    const { fecha_inicio, fecha_fin } = semanaRes.rows[0];

    // Solo cuentan (y se publican) los vuelos de baskets vigentes: se excluyen
    // solicitudes RECHAZADAS/CANCELADAS y detalles individuales RECHAZADA —
    // igual que getCalendario, para no publicar filas que nadie veía.
    const totalVuelosRes = await client.query(
      `SELECT COUNT(*)
         FROM solicitud_vuelo sv
         JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
        WHERE sv.id_semana = $1
          AND ss.estado NOT IN ('RECHAZADA','CANCELADA')
          AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')`,
      [id_semana]
    );
    if (parseInt(totalVuelosRes.rows[0].count) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "No se puede publicar una semana vacía. Debes agendar al menos un vuelo."
      });
    }

    const conflictsRes = await client.query(`
      WITH expanded_vuelos AS (
        SELECT 
          sv.id_detalle,
          sv.dia_semana,
          generate_series(sv.id_bloque, COALESCE(sv.id_bloque_fin, sv.id_bloque)) as id_bloque,
          sv.id_aeronave,
          COALESCE(sv.id_instructor, al.id_instructor) as id_instructor
        FROM solicitud_vuelo sv
        JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
        JOIN alumno al ON al.id_alumno = ss.id_alumno
        WHERE sv.id_semana = $1
          AND ss.estado NOT IN ('RECHAZADA','CANCELADA')
          AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')
      )
      SELECT
        (SELECT COUNT(*) FROM (SELECT 1 FROM expanded_vuelos GROUP BY dia_semana, id_bloque, id_aeronave HAVING COUNT(*) > 1) t) as aero,
        (SELECT COUNT(*) FROM (SELECT 1 FROM expanded_vuelos WHERE id_instructor IS NOT NULL GROUP BY dia_semana, id_bloque, id_instructor HAVING COUNT(*) > 1) t) as inst
    `, [id_semana]);

    const { aero, inst } = conflictsRes.rows[0];
    const totalAero = parseInt(aero || 0);
    const totalInst = parseInt(inst || 0);

    if (totalAero > 0 || totalInst > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `No se puede publicar: Existen ${totalAero} conflictos de aeronave y ${totalInst} de instructor pendientes de resolver.`
      });
    }

    await client.query("SELECT 1 FROM semana_vuelo WHERE id_semana = $1 FOR UPDATE", [id_semana]);
    await client.query("UPDATE semana_vuelo SET publicada = true, fecha_publicacion = now() WHERE id_semana = $1", [id_semana]);
    // Solo los baskets vigentes pasan a PUBLICADO (no RECHAZADA/CANCELADA).
    await client.query(`
      UPDATE solicitud_semana SET estado = 'PUBLICADO', fecha_actualizacion = now()
      WHERE id_semana = $1 AND estado NOT IN ('RECHAZADA','CANCELADA')
    `, [id_semana]);

    await client.query("DELETE FROM vuelo WHERE id_semana = $1", [id_semana]);
    await client.query(`
      INSERT INTO vuelo (id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo, id_bloque_fin, es_extracurricular, tipo_instruccion, categoria, nombre_externo, id_licencia_chequeo, debitar_saldo, estado, creado_por, fecha_vuelo)
      SELECT sv.id_detalle, sv.id_semana, ss.id_alumno, COALESCE(sv.id_instructor, al.id_instructor), sv.id_aeronave, sv.dia_semana, sv.id_bloque, sv.tipo_vuelo, sv.id_bloque_fin, COALESCE(sv.es_extracurricular, FALSE), COALESCE(sv.tipo_instruccion, 'NORMAL'), COALESCE(sv.categoria, 'NORMAL'), sv.nombre_externo, sv.id_licencia_chequeo, sv.debitar_saldo, 'PUBLICADO', 'ADMIN',
             sw.fecha_inicio + (sv.dia_semana - 1)
      FROM solicitud_vuelo sv
      JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
      JOIN alumno al ON al.id_alumno = ss.id_alumno
      JOIN semana_vuelo sw ON sw.id_semana = sv.id_semana
      WHERE sv.id_semana = $1
        AND ss.estado NOT IN ('RECHAZADA','CANCELADA')
        AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')
    `, [id_semana]);

    const vuelosRes = await client.query(`
      SELECT
        v.id_vuelo,
        v.id_semana,
        v.dia_semana,
        v.id_bloque,
        bh.hora_inicio,
        bh.hora_fin,
        a.codigo AS aeronave_codigo,
        ua.nombre AS alumno_nombre,
        ua.apellido AS alumno_apellido,
        ua.correo AS alumno_correo,
        ui.nombre AS instructor_nombre,
        ui.apellido AS instructor_apellido,
        ui.correo AS instructor_correo
      FROM vuelo v
      JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
      JOIN aeronave a ON a.id_aeronave = v.id_aeronave
      JOIN alumno al ON al.id_alumno = v.id_alumno
      JOIN usuario ua ON ua.id_usuario = al.id_usuario
      JOIN instructor i ON i.id_instructor = v.id_instructor
      JOIN usuario ui ON ui.id_usuario = i.id_usuario
      WHERE v.id_semana = $1
      ORDER BY v.dia_semana, bh.hora_inicio, a.codigo
    `, [id_semana]);

    const dias = ["N/A", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    const vuelos = vuelosRes.rows.map((row) => ({
      ...row,
      dia_nombre: dias[row.dia_semana] || "N/A",
      bloque: `${row.hora_inicio} - ${row.hora_fin}`,
      aeronave: row.aeronave_codigo,
      alumno: `${row.alumno_nombre} ${row.alumno_apellido}`,
      instructor: `${row.instructor_nombre} ${row.instructor_apellido}`
    }));

    await logAuditoria(client, {
      accion: "PUBLICAR_SEMANA",
      entidad: "semana_vuelo",
      id_entidad: id_semana,
      id_semana: id_semana,
      actor: req.user,
      req,
      descripcion: `Semana publicada: ${id_semana}`,
      metadata: { total_vuelos: vuelos.length },
    });

    const nuevaFechaInicio = new Date(fecha_inicio);
    nuevaFechaInicio.setDate(nuevaFechaInicio.getDate() + 7);
    const nuevaFechaFin = new Date(fecha_fin);
    nuevaFechaFin.setDate(nuevaFechaFin.getDate() + 7);

    const existeRes = await client.query("SELECT 1 FROM semana_vuelo WHERE fecha_inicio = $1", [nuevaFechaInicio]);
    if (existeRes.rows.length === 0) {
      await client.query("INSERT INTO semana_vuelo (fecha_inicio, fecha_fin, publicada) VALUES ($1, $2, false)", [nuevaFechaInicio, nuevaFechaFin]);
    }

    await client.query("COMMIT");

    const semanaLabel = `${new Date(fecha_inicio).toLocaleDateString("es-SV", { timeZone: "UTC" })} al ${new Date(fecha_fin).toLocaleDateString("es-SV", { timeZone: "UTC" })}`;

    // Un solo correo consolidado por persona (no uno por vuelo). Se agrupa por
    // correo; los vuelos de cada quien se ordenan por día y hora.
    const ordenar = (arr) => arr.sort(
      (a, b) => (a.dia_semana - b.dia_semana) || String(a.hora_inicio).localeCompare(String(b.hora_inicio))
    );
    const porAlumno = new Map();
    const porInstructor = new Map();
    for (const v of vuelos) {
      if (v.alumno_correo) {
        if (!porAlumno.has(v.alumno_correo)) porAlumno.set(v.alumno_correo, { nombre: v.alumno_nombre, vuelos: [] });
        porAlumno.get(v.alumno_correo).vuelos.push(v);
      }
      if (v.instructor_correo) {
        if (!porInstructor.has(v.instructor_correo)) porInstructor.set(v.instructor_correo, { nombre: v.instructor_nombre, vuelos: [] });
        porInstructor.get(v.instructor_correo).vuelos.push(v);
      }
    }

    for (const [correo, { nombre, vuelos: vs }] of porAlumno) {
      const { subject, html, text } = horarioAlumnoEmail({ nombre, semanaLabel, vuelos: ordenar(vs) });
      transporter.sendMail({ to: correo, subject, html, text })
        .catch(err => console.error(`Error enviando horario a alumno ${correo}:`, err));
    }
    for (const [correo, { nombre, vuelos: vs }] of porInstructor) {
      const { subject, html, text } = horarioInstructorEmail({ nombre, semanaLabel, vuelos: ordenar(vs) });
      transporter.sendMail({ to: correo, subject, html, text })
        .catch(err => console.error(`Error enviando horario a instructor ${correo}:`, err));
    }

    res.json({
      message: "Semana publicada y vuelos generados correctamente",
      total_vuelos: vuelos.length
    });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.getCalendario = catchAsync(async (req, res) => {
  const { week = "next" } = req.query;
  let idSemana = week === "current" ? await getCurrentSemanaId() : await getNextSemanaId();
  if (!idSemana) return res.json([]);

  const result = await db.query(`
    SELECT
      sv.id_detalle, sv.id_solicitud, ss.estado AS estado_solicitud, sv.estado AS estado_vuelo_individual,
      ss.comentario_alumno, sv.remarks_instructor,
      v.id_vuelo, v.estado AS estado_vuelo, COALESCE(v.estado, ss.estado) AS estado_mostrar,
      sv.id_semana, sv.dia_semana, sv.id_bloque, sv.tipo_vuelo, sv.id_bloque_fin, b.hora_inicio, b.hora_fin,
      sv.id_aeronave, ae.modelo AS aeronave_modelo, ae.codigo AS aeronave_codigo,
      ss.id_alumno, u_al.nombre || ' ' || u_al.apellido AS alumno_nombre,
      LEFT(u_al.nombre,1) || '.' || split_part(u_al.apellido,' ',1) AS alumno_nombre_corto,
      i.id_instructor, u_ins.nombre || ' ' || u_ins.apellido AS instructor_nombre,
      LEFT(u_ins.nombre,1) || '.' || split_part(u_ins.apellido,' ',1) AS instructor_nombre_corto,
      COALESCE(v.es_extracurricular, sv.es_extracurricular) AS es_extracurricular,
      -- Advertencia de saldo bajo: el saldo del alumno no cubre el costo
      -- estimado de ESE vuelo (tarifa efectiva × 1h; el precio especial del
      -- alumno manda sobre el estándar). Se excluyen las categorías que no
      -- auto-cobran al alumno (DEMO / CHEQUEO_LINEA / PRUEBA).
      COALESCE(cc.saldo_actual_usd, 0) AS saldo_alumno,
      COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd) AS tarifa_estimada,
      (
        COALESCE(v.categoria, sv.categoria, 'NORMAL') NOT IN ('DEMO','CHEQUEO_LINEA','PRUEBA')
        AND COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd) IS NOT NULL
        AND COALESCE(cc.saldo_actual_usd, 0) < COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd)
      ) AS saldo_bajo
    FROM solicitud_vuelo sv
    JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
    JOIN bloque_horario b ON b.id_bloque = sv.id_bloque
    JOIN aeronave ae ON ae.id_aeronave = sv.id_aeronave
    JOIN alumno al ON al.id_alumno = ss.id_alumno
    JOIN usuario u_al ON u_al.id_usuario = al.id_usuario
    LEFT JOIN vuelo v ON v.id_detalle = sv.id_detalle AND v.id_semana = sv.id_semana
    JOIN instructor i ON i.id_instructor = COALESCE(v.id_instructor, sv.id_instructor, al.id_instructor)
    JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario
    LEFT JOIN cuenta_corriente_alumno cc ON cc.id_alumno = ss.id_alumno
    LEFT JOIN LATERAL (
      SELECT at.tarifa_hora_usd FROM alumno_tarifa_aeronave ata
      JOIN aeronave_tarifa at ON at.id = ata.id_tarifa
      WHERE ata.id_alumno = ss.id_alumno AND ata.id_aeronave = sv.id_aeronave
      LIMIT 1
    ) tesp ON TRUE
    LEFT JOIN LATERAL (
      SELECT t.tarifa_hora_usd FROM aeronave_tarifa t
      WHERE t.id_aeronave = sv.id_aeronave AND COALESCE(t.es_estandar, TRUE) = TRUE
        AND t.vigente_desde <= CURRENT_DATE AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= CURRENT_DATE)
      ORDER BY t.vigente_desde DESC LIMIT 1
    ) test ON TRUE
    WHERE sv.id_semana = $1
      AND ss.estado NOT IN ('RECHAZADA', 'CANCELADA')
      AND (sv.estado IS NULL OR sv.estado != 'RECHAZADA')
      AND (v.estado IS NULL OR v.estado != 'CANCELADO')
    ORDER BY b.hora_inicio, sv.dia_semana, ae.modelo
  `, [idSemana]);

  const semRes = await db.query("SELECT publicada FROM semana_vuelo WHERE id_semana = $1", [idSemana]);

  // Vuelos CANCELADOS de la semana (para el panel "Vuelos cancelados" del
  // dashboard, que antes se calculaba desde items — que ya los excluye — y por
  // eso siempre salía vacío). Se devuelven aparte para no pintarlos en el grid.
  const cancelRes = await db.query(`
    SELECT v.id_vuelo, v.dia_semana, v.fecha_vuelo, v.fecha_cancelacion, v.tipo_cancelacion,
           b.hora_inicio, b.hora_fin, ae.codigo AS aeronave_codigo,
           u_al.nombre || ' ' || u_al.apellido AS alumno_nombre
    FROM vuelo v
    JOIN bloque_horario b ON b.id_bloque = v.id_bloque
    JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
    JOIN alumno al ON al.id_alumno = v.id_alumno
    JOIN usuario u_al ON u_al.id_usuario = al.id_usuario
    WHERE v.id_semana = $1 AND v.estado = 'CANCELADO'
    ORDER BY v.fecha_cancelacion DESC NULLS LAST, b.hora_inicio
  `, [idSemana]);

  res.json({ items: result.rows, publicada: semRes.rows[0]?.publicada || false, cancelados: cancelRes.rows });
});

// Antes de publicar: cuántos baskets vigentes hay y cuántos siguen en BORRADOR
// (es decir, que el instructor aún no envió a programación). Nunca bloquea;
// solo alimenta el confirm del botón "Publicar semana".
exports.prechequearPublicacion = catchAsync(async (req, res) => {
  const { id_semana } = req.query;
  if (!id_semana) return res.status(400).json({ message: "ID de semana no proporcionado" });

  const r = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE estado NOT IN ('RECHAZADA','CANCELADA'))              AS total,
      COUNT(*) FILTER (WHERE estado = 'BORRADOR')                                  AS sin_revision,
      COUNT(*) FILTER (WHERE estado = 'EN_REVISION')                               AS enviadas
    FROM solicitud_semana
    WHERE id_semana = $1
      AND id_solicitud IN (SELECT DISTINCT id_solicitud FROM solicitud_vuelo WHERE id_semana = $1)
  `, [id_semana]);

  const row = r.rows[0] || {};
  res.json({
    total: parseInt(row.total || 0),
    sin_revision: parseInt(row.sin_revision || 0),
    enviadas: parseInt(row.enviadas || 0),
  });
});

exports.asegurarSemanaFutura = catchAsync(async (req, res) => {
  // Disparador manual — la misma lógica ya corre sola al arrancar el
  // servidor y una vez al día (ver asegurarProximaSemanaDisponible en
  // server.js), así que esto queda como respaldo/uso puntual.
  const creada = await crearSemanaFutura(db);
  res.json({ message: "Semana futura creada", semana: creada });
});

exports.guardarCambios = catchAsync(async (req, res) => {
  const client = await db.connect();
  try {
    const { moves } = req.body;
    console.log("Datos recibidos en guardarCambios (Admin):", JSON.stringify(moves, null, 2));

    if (!Array.isArray(moves) || moves.length === 0) {
      return res.status(400).json({ message: "No hay movimientos" });
    }

    await client.query("BEGIN");
    for (let m of moves) {
      // 1. Actualizar solicitud
      await client.query(
        `UPDATE solicitud_vuelo SET dia_semana = $1, id_bloque = $2, id_aeronave = $3, id_bloque_fin = $4 WHERE id_detalle = $5`,
        [m.dia_semana, m.id_bloque, m.id_aeronave, m.id_bloque_fin || null, m.id_detalle]
      );

      // 2. Si existe el vuelo (semana publicada), actualizarlo y notificar
      const vueloRes = await client.query(`
        SELECT v.id_vuelo, sw.publicada, sw.fecha_inicio,
               ua.nombre AS alumno_nombre, ua.correo AS alumno_correo,
               bh.hora_inicio, bh.hora_fin, a.codigo AS aeronave_codigo
        FROM vuelo v
        JOIN semana_vuelo sw ON sw.id_semana = v.id_semana
        JOIN alumno al ON al.id_alumno = v.id_alumno
        JOIN usuario ua ON ua.id_usuario = al.id_usuario
        JOIN bloque_horario bh ON bh.id_bloque = $1
        JOIN aeronave a ON a.id_aeronave = $2
        WHERE v.id_detalle = $3
      `, [m.id_bloque, m.id_aeronave, m.id_detalle]);

      if (vueloRes.rows.length > 0) {
        const v = vueloRes.rows[0];

        if (!v.fecha_inicio) {
          throw new Error("No se pudo determinar la fecha de inicio de la semana para el ajuste de vuelo.");
        }

        // Formatear fecha a YYYY-MM-DD para evitar errores de tipo en PostgreSQL
        const fechaBase = new Date(v.fecha_inicio).toISOString().split('T')[0];

        // Actualizar tabla vuelo (incluyendo fecha_vuelo si cambió dia_semana)
        // Usamos ::DATE para forzar el tipo y evitar el error de "expression is of type integer"
        await client.query(`
          UPDATE vuelo 
          SET dia_semana = $1, id_bloque = $2, id_aeronave = $3, id_bloque_fin = $4,
              fecha_vuelo = ($5::DATE + ($1 - 1))
          WHERE id_detalle = $6
        `, [m.dia_semana, m.id_bloque, m.id_aeronave, m.id_bloque_fin || null, fechaBase, m.id_detalle]);

        // Si la semana ya estaba publicada, notificar al alumno
        if (v.publicada && v.alumno_correo) {
          const dias = ["N/A", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
          const diaNombre = dias[m.dia_semana] || "N/A";
          const bloque = `${v.hora_inicio?.slice(0, 5)} - ${v.hora_fin?.slice(0, 5)}`;

          transporter.sendMail({
            from: process.env.MAIL_FROM_ADDRESS,
            to: v.alumno_correo,
            subject: `Actualización en tu horario de vuelo`,
            text: `Hola ${v.alumno_nombre},\n\nSe ha realizado un ajuste en tu vuelo programado.\n\nNuevos detalles:\n• Día: ${diaNombre}\n• Bloque: ${bloque}\n• Aeronave: ${v.aeronave_codigo}\n\nPor favor revisa tu dashboard para más detalles.`,
          }).catch(err => console.error(`Error enviando email individual:`, err));
        }
      }
    }
    await client.query("COMMIT");

    const io = req.app.get('socketio');
    if (io) io.emit('guardar_cambios');

    res.json({ message: "Cambios guardados correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error en guardarCambios:", e);
    res.status(500).json({ message: "Error al guardar cambios" });
  } finally {
    client.release();
  }
});

exports.getBloquesBloqueados = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT id_bloque, dia_semana, motivo
    FROM bloque_bloqueado_dia
    ORDER BY dia_semana, id_bloque
  `);
  res.json(result.rows);
});

exports.getInstructoresActivos = catchAsync(async (req, res) => {
  // Solo instructores de VUELO: son los únicos asignables a un vuelo. El flag
  // se filtra aquí para que todos los selectores de agenda (modal + popover)
  // muestren únicamente a estos.
  const result = await db.query(`
    SELECT i.id_instructor, u.id_usuario, u.nombre, u.apellido, u.nombre || ' ' || u.apellido AS nombre_completo,
           i.es_instructor_vuelo, i.es_instructor_teoria, i.puede_programar
    FROM instructor i JOIN usuario u ON u.id_usuario = i.id_usuario
    WHERE i.activo = true AND i.es_instructor_vuelo = true
    ORDER BY u.apellido, u.nombre
  `);
  res.json(result.rows);
});

exports.cambiarInstructorVuelo = catchAsync(async (req, res) => {
  const { id_detalle } = req.params;
  const { id_instructor_nuevo } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE solicitud_vuelo SET id_instructor = $1 WHERE id_detalle = $2`, [id_instructor_nuevo, id_detalle]);
    await client.query(`UPDATE vuelo SET id_instructor = $1 WHERE id_detalle = $2`, [id_instructor_nuevo, id_detalle]);
    await client.query("COMMIT");
    res.json({ message: "Instructor actualizado correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});



exports.getBloquesHorario = catchAsync(async (req, res) => {
  const result = await db.query("SELECT * FROM bloque_horario ORDER BY hora_inicio");
  res.json(result.rows);
});


exports.rechazarSolicitudSemana = catchAsync(async (req, res) => {
  const { id_solicitud } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE solicitud_semana SET estado = 'RECHAZADA', fecha_actualizacion = now() WHERE id_solicitud = $1", [id_solicitud]);

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "solicitud_semana",
      id_entidad: id_solicitud,
      actor: req.user,
      descripcion: `Solicitud semanal #${id_solicitud} rechazada por admin`,
    });

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      io.emit("solicitud_rechazada", { id_solicitud });
    }

    res.json({ message: "Solicitud semanal rechazada" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.rechazarSolicitudIndividual = catchAsync(async (req, res) => {
  const { id_detalle } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // 1. Obtener id_solicitud para auditoría y socket
    const detailRes = await client.query("SELECT id_solicitud FROM solicitud_vuelo WHERE id_detalle = $1", [id_detalle]);
    if (detailRes.rows.length === 0) throw new Error("Registro no encontrado");
    const { id_solicitud } = detailRes.rows[0];

    // 2. Marcar como rechazada la solicitud individual
    // NOTA: Asegurarse de haber ejecutado: ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT 'ENVIADA';
    await client.query("UPDATE solicitud_vuelo SET estado = 'RECHAZADA' WHERE id_detalle = $1", [id_detalle]);

    // Si la semana ya está publicada, existe la fila en `vuelo`: rechazar debe
    // CANCELARLA de verdad (antes quedaba viva y seguía apareciendo para
    // Turno/operaciones aunque desapareciera del calendario de programación).
    await client.query(
      "UPDATE vuelo SET estado = 'CANCELADO', fecha_cancelacion = NOW() WHERE id_detalle = $1 AND estado <> 'CANCELADO'",
      [id_detalle]
    );

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "solicitud_vuelo",
      id_entidad: id_detalle,
      actor: req.user,
      descripcion: `Vuelo individual #${id_detalle} (Solicitud #${id_solicitud}) rechazado por admin`,
    });

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) {
      // Emitimos un evento específico o el general de solicitud_rechazada para que refresque
      io.emit("solicitud_rechazada", { id_solicitud, id_detalle });
    }

    res.json({ message: "Vuelo individual rechazado" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.cancelarSolicitud = catchAsync(async (req, res) => {
  const { id_solicitud } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE solicitud_semana SET estado = 'CANCELADA', fecha_actualizacion = now() WHERE id_solicitud = $1", [id_solicitud]);

    // Si la semana ya estaba publicada, cancelar los vuelos reales
    const cancelados = await client.query(`
      UPDATE vuelo SET estado = 'CANCELADO', fecha_cancelacion = NOW()
      WHERE id_detalle IN (SELECT id_detalle FROM solicitud_vuelo WHERE id_solicitud = $1)
        AND estado <> 'CANCELADO'
      RETURNING id_vuelo
    `, [id_solicitud]);

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "solicitud_semana",
      id_entidad: id_solicitud,
      actor: req.user,
      descripcion: `Solicitud #${id_solicitud} cancelada por admin`,
    });

    await client.query("COMMIT");

    // Stand-by: por cada vuelo cancelado, ofrecer el slot al siguiente candidato
    // (respeta el margen mínimo internamente). Best-effort: no aborta la respuesta.
    const io = req.app.get("io");
    for (const row of cancelados.rows) {
      try { await dispararOfertaPorCancelacion(db, row.id_vuelo, io); }
      catch (e) { console.error("stand-by tras cancelarSolicitud:", e.message); }
    }

    res.json({ message: "Solicitud cancelada" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
