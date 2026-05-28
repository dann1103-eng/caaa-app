const db = require("../config/db");
const { logAuditoria } = require("../utils/auditoria");
const transporter = require("../utils/mailer");

async function getNextSemanaId(client) {
  const semanaRes = await client.query(`
    SELECT id_semana
    FROM semana_vuelo
    WHERE fecha_inicio > CURRENT_DATE
    ORDER BY fecha_inicio
    LIMIT 1
  `);
  if (semanaRes.rows.length === 0) return null;
  return semanaRes.rows[0].id_semana;
}

async function getNextSemanaPublicada(client) {
  const semanaRes = await client.query(`
    SELECT publicada
    FROM semana_vuelo
    WHERE fecha_inicio > CURRENT_DATE
    ORDER BY fecha_inicio
    LIMIT 1
  `);
  return semanaRes.rows[0]?.publicada || false;
}
const getCurrentSemanaId = async (db) => {
  const res = await db.query(`
    SELECT id_semana
    FROM semana_vuelo
    WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
    LIMIT 1
  `);
  return res.rows[0]?.id_semana;
};

function requireProgramacion(req, res) {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado" });
    return null;
  }
  if (req.user.rol !== "PROGRAMACION") {
    res.status(403).json({ message: "Acceso denegado" });
    return null;
  }
  return req.user;
}

function requireProgramacionOrAdmin(req, res) {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado" });
    return null;
  }
  if (!["PROGRAMACION", "ADMIN", "PROYECCION"].includes(req.user.rol)) {
    res.status(403).json({ message: "Acceso denegado" });
    return null;
  }
  return req.user;
}

exports.getCalendario = async (req, res) => {
  try {
    const user = requireProgramacion(req, res);
    if (!user) return;

    const { week = "next" } = req.query;
    if (!["current", "next"].includes(week)) {
      return res.status(400).json({ message: "week inválido (current|next)" });
    }

    let idSemana = null;
    if (week === "current") {
      idSemana = await getCurrentSemanaId(db); 
    } else {
      idSemana = await getNextSemanaId(db); 
    }

    if (!idSemana) return res.json([]);

    if (week === "current") {
      const result = await db.query(
        `
        SELECT
          v.id_vuelo,
          v.id_detalle,
          v.id_semana,
          v.dia_semana,
          v.id_bloque,
          v.tipo_vuelo,
          v.id_bloque_fin,
          b.hora_inicio,
          b.hora_fin,

          v.id_aeronave,
          ae.modelo AS aeronave_modelo,
          ae.codigo AS aeronave_codigo,

          v.id_alumno,
          COALESCE(u_al.nombre || ' ' || u_al.apellido, 'Sin Alumno') AS alumno_nombre,

          v.id_instructor,
          COALESCE(u_ins.nombre || ' ' || u_ins.apellido, 'Sin Instructor') AS instructor_nombre,

          v.estado AS estado_vuelo,
          v.justificacion_cancelacion,

          'PUBLICADO' AS estado_solicitud,
          v.estado AS estado_mostrar
        FROM vuelo v
        JOIN bloque_horario b ON b.id_bloque = v.id_bloque
        JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave

        LEFT JOIN alumno al ON al.id_alumno = v.id_alumno
        LEFT JOIN usuario u_al ON u_al.id_usuario = al.id_usuario

        LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
        LEFT JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario

        WHERE v.id_semana = $1
        ORDER BY b.hora_inicio, v.dia_semana, ae.modelo
        `,
        [idSemana]
      );

      return res.json(result.rows);
    }

    const result = await db.query(
      `
      SELECT
        sv.id_detalle,
        sv.id_solicitud,
        ss.estado AS estado_solicitud,
        sv.estado AS estado_vuelo_individual,

        sv.id_semana,
        sv.dia_semana,
        sv.id_bloque,
        sv.tipo_vuelo,
        sv.id_bloque_fin,
        b.hora_inicio,
        b.hora_fin,

        sv.id_aeronave,
        ae.modelo AS aeronave_modelo,
        ae.codigo AS aeronave_codigo,

        ss.id_alumno,
        COALESCE(u_al.nombre || ' ' || u_al.apellido, 'Sin Alumno') AS alumno_nombre,

        i.id_instructor,
        COALESCE(u_ins.nombre || ' ' || u_ins.apellido, 'Sin Instructor') AS instructor_nombre,

        NULL::int AS id_vuelo,
        NULL::text AS estado_vuelo,

        ss.estado AS estado_mostrar
      FROM solicitud_vuelo sv
      JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
      JOIN bloque_horario b ON b.id_bloque = sv.id_bloque
      JOIN aeronave ae ON ae.id_aeronave = sv.id_aeronave

      LEFT JOIN alumno al ON al.id_alumno = ss.id_alumno
      LEFT JOIN usuario u_al ON u_al.id_usuario = al.id_usuario

      JOIN instructor i ON i.id_instructor = COALESCE(sv.id_instructor, al.id_instructor)
      JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario

      WHERE sv.id_semana = $1
        AND ss.estado NOT IN ('RECHAZADA', 'CANCELADA')
        AND (sv.estado IS NULL OR sv.estado != 'RECHAZADA')
      ORDER BY b.hora_inicio, sv.dia_semana, ae.modelo
      `,
      [idSemana]
    );

    return res.json(result.rows);
  } catch (e) {
    console.error("Error getCalendario:", e);
    res.status(500).json({ message: "Error obtener calendario" });
  }
};

exports.getAeronavesActivas = async (req, res) => {
  try {
    const user = requireProgramacion(req, res);
    if (!user) return;

    const result = await db.query(`
      SELECT id_aeronave, codigo, modelo, tipo
      FROM aeronave
      WHERE activa = true
      ORDER BY codigo
    `);

    res.json(result.rows);
  } catch (e) {
    console.error("Error getAeronavesActivas:", e);
    res.status(500).json({ message: "Error obtener aeronaves" });
  }
};

exports.enRevision = async (req, res) => {
  try {
    const user = requireProgramacion(req, res);
    if (!user) return;

    const { id_solicitud } = req.params;

    const r = await db.query(
      `
      UPDATE solicitud_semana
      SET estado='BORRADOR',
          fecha_actualizacion=now()
      WHERE id_solicitud=$1
        AND estado='BORRADOR'
      RETURNING id_solicitud
      `,
      [id_solicitud]
    );

    if (r.rows.length === 0) {
      return res.status(400).json({ message: "No se pudo pasar a revisión (ya está en revisión o publicada)" });
    }

    res.json({ message: "Solicitud en revisión" });
  } catch (e) {
    console.error("Error enRevision:", e);
    res.status(500).json({ message: "Error" });
  }
};

exports.guardarCambios = async (req, res) => {
  const client = await db.connect();

  try {
    const user = requireProgramacion(req, res);
    if (!user) return;

    const { movimientos } = req.body;

    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      return res.status(400).json({ message: "No hay cambios para guardar" });
    }

    const semanaRes = await client.query(
      `
      SELECT w.id_semana, w.publicada
      FROM solicitud_vuelo sv
      JOIN semana_vuelo w ON w.id_semana = sv.id_semana
      WHERE sv.id_detalle = $1
      `,
      [movimientos[0].id_detalle]
    );

    if (semanaRes.rows.length === 0) {
      return res.status(404).json({ message: "Semana no encontrada" });
    }

    const { id_semana, publicada } = semanaRes.rows[0];

    if (publicada) {
      return res.status(403).json({
        message: "La semana ya fue publicada. Programación no puede modificar."
      });
    }

    await client.query("BEGIN");

    const idsMovidos = movimientos.map((m) => m.id_detalle);

    const infoMovidosRes = await client.query(
      `
      SELECT
        sv.id_detalle,
        ss.id_alumno,
        COALESCE(sv.id_instructor, al.id_instructor) AS id_instructor
      FROM solicitud_vuelo sv
      JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
      JOIN alumno al ON al.id_alumno = ss.id_alumno
      WHERE sv.id_detalle = ANY($1::int[])
      `,
      [idsMovidos]
    );

    const infoPorDetalle = new Map(
      infoMovidosRes.rows.map((r) => [Number(r.id_detalle), r])
    );

    const destinosBloqueAeronave = new Set();
    const destinosAlumno = new Set();
    const destinosInstructor = new Set();

    for (const m of movimientos) {
      const info = infoPorDetalle.get(Number(m.id_detalle));
      if (!info) {
        throw new Error(`No se encontró información del detalle ${m.id_detalle}`);
      }

      const keyBloqueAeronave = `${m.dia_semana}-${m.id_bloque}-${m.id_aeronave}`;
      if (destinosBloqueAeronave.has(keyBloqueAeronave)) {
        throw Object.assign(
          new Error("Dos vuelos no pueden quedar en el mismo bloque y aeronave"),
          { code: "23505" }
        );
      }
      destinosBloqueAeronave.add(keyBloqueAeronave);

      const keyAlumno = `${info.id_alumno}-${m.dia_semana}-${m.id_bloque}`;
      if (destinosAlumno.has(keyAlumno)) {
        throw Object.assign(
          new Error("Un alumno no puede tener dos vuelos en el mismo horario"),
          { code: "23506" }
        );
      }
      destinosAlumno.add(keyAlumno);

      const keyInstructor = `${info.id_instructor}-${m.dia_semana}-${m.id_bloque}`;
      if (destinosInstructor.has(keyInstructor)) {
        throw Object.assign(
          new Error("Un instructor no puede tener dos vuelos en el mismo horario"),
          { code: "23507" }
        );
      }
      destinosInstructor.add(keyInstructor);
    }

    for (let idx = 0; idx < movimientos.length; idx++) {
  const m = movimientos[idx];

  await client.query(
    `
    UPDATE solicitud_vuelo
    SET dia_semana = 0,
        id_bloque = $1
    WHERE id_detalle = $2
    `,
    [idx + 1, m.id_detalle]
  );
}

    for (const m of movimientos) {
      const info = infoPorDetalle.get(Number(m.id_detalle));

      const ocupadoBloqueAeronave = await client.query(
        `
        SELECT 1
        FROM solicitud_vuelo
        WHERE id_semana = $1
          AND dia_semana = $2
          AND id_bloque = $3
          AND id_aeronave = $4
          AND id_detalle <> ALL($5::int[])
        LIMIT 1
        `,
        [id_semana, m.dia_semana, m.id_bloque, m.id_aeronave, idsMovidos]
      );

      if (ocupadoBloqueAeronave.rows.length > 0) {
        throw Object.assign(
          new Error("Ese bloque y aeronave ya está ocupado"),
          { code: "23505" }
        );
      }

      const ocupadoAlumno = await client.query(
        `
        SELECT 1
        FROM solicitud_vuelo sv
        JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
        WHERE sv.id_semana = $1
          AND ss.id_alumno = $2
          AND sv.dia_semana = $3
          AND sv.id_bloque = $4
          AND sv.id_detalle <> ALL($5::int[])
        LIMIT 1
        `,
        [id_semana, info.id_alumno, m.dia_semana, m.id_bloque, idsMovidos]
      );

      if (ocupadoAlumno.rows.length > 0) {
        throw Object.assign(
          new Error("El alumno ya tiene un vuelo en ese horario"),
          { code: "23506" }
        );
      }

      const ocupadoInstructor = await client.query(
        `
        SELECT 1
        FROM solicitud_vuelo sv
        JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
        JOIN alumno al ON al.id_alumno = ss.id_alumno
        WHERE sv.id_semana = $1
          AND COALESCE(sv.id_instructor, al.id_instructor) = $2
          AND sv.dia_semana = $3
          AND sv.id_bloque = $4
          AND sv.id_detalle <> ALL($5::int[])
        LIMIT 1
        `,
        [id_semana, info.id_instructor, m.dia_semana, m.id_bloque, idsMovidos]
      );


      if (ocupadoInstructor.rows.length > 0) {
        throw Object.assign(
          new Error("El instructor ya tiene un vuelo en ese horario"),
          { code: "23507" }
        );
      }
    }

    for (const m of movimientos) {
      await client.query(
        `
        UPDATE solicitud_vuelo
        SET dia_semana = $1,
            id_bloque_fin = CASE WHEN id_bloque_fin IS NOT NULL THEN $2 + (id_bloque_fin - id_bloque) ELSE id_bloque_fin END,
            id_bloque = $2,
            id_aeronave = $3
        WHERE id_detalle = $4
        `,
        [m.dia_semana, m.id_bloque, m.id_aeronave, m.id_detalle]
      );
    }

    await logAuditoria(client, {
      accion: "GUARDAR_CAMBIOS",
      entidad: "calendario_programacion",
      id_entidad: null,
      id_semana,
      actor: user,
      req,
      descripcion: `Programación guardó ${movimientos.length} movimientos`,
      metadata: { movimientos }
    });

    await client.query("COMMIT");

    const semanaPublicadaRes = await client.query(
      'SELECT publicada FROM semana_vuelo WHERE id_semana = $1',
      [id_semana]
    );

    if (semanaPublicadaRes.rows[0]?.publicada) {
      for (const m of movimientos) {
        const alRes = await client.query(
          `SELECT u.correo, u.nombre, b.hora_inicio, b.hora_fin, ae.codigo AS aeronave, sv.fecha_inicio
           FROM vuelo v
           JOIN alumno a ON a.id_alumno = v.id_alumno
           JOIN usuario u ON u.id_usuario = a.id_usuario
           JOIN bloque_horario b ON b.id_bloque = v.id_bloque
           JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
           JOIN semana_vuelo sv ON sv.id_semana = v.id_semana
           WHERE v.id_detalle = $1`,
          [m.id_detalle]
        );
        if (alRes.rows.length > 0) {
          const vData = alRes.rows[0];
          if (vData.correo) {
            const diasStr = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
            const fechaVuelo = new Date(vData.fecha_inicio);
            fechaVuelo.setDate(fechaVuelo.getDate() + (m.dia_semana - 1));
            
            const txt = `Hola ${vData.nombre},\n\nTu vuelo ha sido reprogramado para el día ${diasStr[m.dia_semana]} ${fechaVuelo.toLocaleDateString("es-SV", { timeZone: "UTC" })}, bloque ${vData.hora_inicio}-${vData.hora_fin} en la aeronave ${vData.aeronave}.`;
            transporter.sendMail({
              from: process.env.MAIL_FROM_ADDRESS,
              to: vData.correo,
              subject: "Tu vuelo ha sido reprogramado",
              text: txt
            }).catch(err => console.error(err));
          }
        }
      }
    }

    return res.json({
      message: "Cambios guardados correctamente"
    });

  } catch (e) {
    await client.query("ROLLBACK");

    if (e.code === "23505") {
      return res.status(409).json({
        message: "Conflicto: ese bloque y aeronave ya están ocupados"
      });
    }

    if (e.code === "23506") {
      return res.status(409).json({
        message: "Conflicto: el alumno ya tiene un vuelo en ese horario"
      });
    }

    if (e.code === "23507") {
      return res.status(409).json({
        message: "Conflicto: el instructor ya tiene un vuelo en ese horario"
      });
    }

    console.error("guardarCambios PROGRAMACION:", e);
    return res.status(500).json({
      message: "Error al guardar cambios"
    });

  } finally {
    client.release();
  }
};

exports.getBloquesBloqueados = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id_bloque, dia_semana, motivo
      FROM bloque_bloqueado_dia
      ORDER BY dia_semana, id_bloque
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error bloques bloqueados:", error);
    res.status(500).json({ message: "Error obtener bloqueos" });
  }
};



exports.getEstadoFlota = async (req, res) => {
  try {
    const user = requireProgramacionOrAdmin(req, res);
    if (!user) return;

    const r = await db.query(`
      SELECT
        a.id_aeronave,
        a.codigo,
        a.modelo,
        a.tipo,
        a.estado,
        a.horas_acumuladas,
        a.horas_proxima_revision,
        CASE
          WHEN v.id_vuelo IS NOT NULL               THEN 'VOLANDO'
          WHEN a.estado = 'MANTENIMIENTO'            THEN 'MANTENIMIENTO'
          WHEN m.id_mantenimiento IS NOT NULL        THEN 'MANTENIMIENTO'
          ELSE                                            'EN_TIERRA'
        END AS estado_actual
      FROM aeronave a
      LEFT JOIN LATERAL (
        SELECT v2.id_vuelo
        FROM vuelo v2
        WHERE v2.id_aeronave = a.id_aeronave
          AND v2.estado IN ('EN_VUELO', 'SALIDA_HANGAR', 'REGRESO_HANGAR')
          AND EXISTS (
            SELECT 1 FROM semana_vuelo sw
            WHERE sw.id_semana = v2.id_semana
              AND CURRENT_DATE BETWEEN sw.fecha_inicio AND sw.fecha_fin
          )
          AND v2.dia_semana = EXTRACT(ISODOW FROM CURRENT_DATE)::int
        LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT m2.id_mantenimiento
        FROM mantenimiento_aeronave m2
        WHERE m2.id_aeronave = a.id_aeronave
          AND m2.completado = false
        LIMIT 1
      ) m ON true
      WHERE a.activa = true
        AND a.tipo != 'SIMULADOR'
      ORDER BY
        CASE
          WHEN v.id_vuelo IS NOT NULL        THEN 1
          WHEN m.id_mantenimiento IS NOT NULL THEN 2
          ELSE                                    3
        END,
        a.codigo
    `);

    res.json(r.rows);
  } catch (e) {
    console.error("getEstadoFlota:", e);
    res.status(500).json({ message: "Error al obtener estado de la flota" });
  }
};

exports.getMantenimientoResumen = async (req, res) => {
  try {
    const user = requireProgramacionOrAdmin(req, res);
    if (!user) return;

    const r = await db.query(`
      SELECT
        a.id_aeronave,
        a.codigo,
        a.tipo,
        a.estado,
        a.horas_acumuladas,
        CASE
          WHEN COALESCE(a.horas_acumuladas, 0) < 50  THEN '50HR'
          ELSE '100HR'
        END AS tipo_proxima_revision,
        CASE
          WHEN COALESCE(a.horas_acumuladas, 0) < 50  THEN 50
          ELSE 100
        END AS horas_proxima_revision,
        CASE
          WHEN COALESCE(a.horas_acumuladas, 0) < 50  THEN 50  - COALESCE(a.horas_acumuladas, 0)
          ELSE                                              100 - COALESCE(a.horas_acumuladas, 0)
        END AS horas_restantes
      FROM aeronave a
      WHERE a.activa = true
        AND a.tipo != 'SIMULADOR'
      ORDER BY (
        CASE
          WHEN COALESCE(a.horas_acumuladas, 0) < 50  THEN 50  - COALESCE(a.horas_acumuladas, 0)
          ELSE                                              100 - COALESCE(a.horas_acumuladas, 0)
        END
      ) ASC
      LIMIT 3
    `);

    res.json(r.rows);
  } catch (e) {
    console.error("getMantenimientoResumen:", e);
    res.status(500).json({ message: "Error al obtener resumen de mantenimiento" });
  }
};

exports.reasignarAeronave = async (req, res) => {
  const { id_vuelo } = req.params;
  const { id_aeronave } = req.body;
  const client = await db.connect();
  try {
    const user = requireProgramacion(req, res);
    if (!user) return;

    if (!id_aeronave) {
      return res.status(400).json({ message: "id_aeronave es requerido" });
    }

    await client.query("BEGIN");

    const vueloRes = await client.query(
      `SELECT id_vuelo, id_bloque, dia_semana, id_semana, estado, justificacion_cancelacion
       FROM vuelo WHERE id_vuelo = $1 FOR UPDATE`,
      [id_vuelo]
    );

    if (vueloRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Vuelo no encontrado" });
    }

    const vuelo = vueloRes.rows[0];

    if (vuelo.estado !== "CANCELADO" || !vuelo.justificacion_cancelacion?.toLowerCase().includes("mantenimiento")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Solo se pueden reasignar vuelos cancelados por mantenimiento" });
    }

    const aeronaveRes = await client.query(
      `SELECT id_aeronave, codigo, estado FROM aeronave WHERE id_aeronave = $1 AND activa = true`,
      [id_aeronave]
    );
    if (aeronaveRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Aeronave no disponible" });
    }
    if (aeronaveRes.rows[0].estado === "MANTENIMIENTO") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "La aeronave seleccionada está en mantenimiento" });
    }

    const conflicto = await client.query(
      `SELECT 1 FROM vuelo
       WHERE id_semana = $1 AND id_bloque = $2 AND dia_semana = $3
         AND id_aeronave = $4 AND estado NOT IN ('CANCELADO')`,
      [vuelo.id_semana, vuelo.id_bloque, vuelo.dia_semana, id_aeronave]
    );
    if (conflicto.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La aeronave ya tiene un vuelo asignado en ese bloque" });
    }

    await client.query(
      `UPDATE vuelo
       SET id_aeronave = $1,
           estado = 'PUBLICADO',
           justificacion_cancelacion = NULL,
           tipo_cancelacion = NULL,
           fecha_cancelacion = NULL,
           cancelado_por_id_usuario = NULL
       WHERE id_vuelo = $2`,
      [id_aeronave, id_vuelo]
    );

    const io = req.app.get("io");
    if (io) {
      io.emit("vuelo_estado_changed", { id_vuelo: Number(id_vuelo), estado: "PUBLICADO" });
    }

    await client.query("COMMIT");

    res.json({ message: "Aeronave reasignada correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("reasignarAeronave:", e);
    res.status(500).json({ message: "Error al reasignar aeronave" });
  } finally {
    client.release();
  }
};

exports.getAeronavesDisponibles = async (req, res) => {
  try {
    const user = requireProgramacion(req, res);
    if (!user) return;

    const { id_semana, id_bloque, dia_semana } = req.query;

    const r = await db.query(
      `SELECT a.id_aeronave, a.codigo, a.modelo
       FROM aeronave a
       WHERE a.activa = true
         AND a.estado = 'ACTIVO'
         AND a.tipo != 'SIMULADOR'
         AND NOT EXISTS (
           SELECT 1 FROM vuelo v
           WHERE v.id_aeronave = a.id_aeronave
             AND v.id_semana = $1
             AND v.id_bloque = $2
             AND v.dia_semana = $3
             AND v.estado NOT IN ('CANCELADO')
         )
       ORDER BY a.codigo`,
      [id_semana, id_bloque, dia_semana]
    );

    res.json(r.rows);
  } catch (e) {
    console.error("getAeronavesDisponibles:", e);
    res.status(500).json({ message: "Error al obtener aeronaves disponibles" });
  }
};

exports.guardarSolicitudProgramacion = async (req, res) => {
  const client = await db.connect();
  try {
    const user = requireProgramacion(req, res);
    if (!user) return;

    const { id_alumno, id_instructor, vuelos } = req.body;

    if (!id_alumno || !Array.isArray(vuelos)) {
      return res.status(400).json({ message: "Alumno y vuelos son requeridos" });
    }

    const id_semana = await getNextSemanaId(client);
    if (!id_semana) {
      return res.status(404).json({ message: "No se encontró la semana siguiente" });
    }

    const publicada = await getNextSemanaPublicada(client);
    if (publicada) {
      return res.status(403).json({ message: "La semana ya está publicada" });
    }

    await client.query("BEGIN");

    // Crear o actualizar solicitud_semana para el alumno
    const solicitudRes = await client.query(
      `
      INSERT INTO solicitud_semana (id_semana, id_alumno, estado)
      VALUES ($1, $2, 'BORRADOR')
      ON CONFLICT (id_semana, id_alumno)
      DO UPDATE SET fecha_actualizacion = now(), estado = 'BORRADOR'
      RETURNING id_solicitud
      `,
      [id_semana, id_alumno]
    );

    const { id_solicitud } = solicitudRes.rows[0];

    // Eliminar vuelos previos de esta solicitud si el usuario de programación está "re-guardando"
    // Pero ojo: esto podría borrar vuelos que el alumno ya pidió. 
    // Si el usuario de programación está replicando el flujo, asumo que está gestionando la solicitud completa.
    await client.query("DELETE FROM solicitud_vuelo WHERE id_solicitud = $1", [id_solicitud]);

    for (const v of vuelos) {
      await client.query(
        `
        INSERT INTO solicitud_vuelo (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, id_instructor)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          Number(id_solicitud), 
          Number(id_semana), 
          Number(v.dia_semana), 
          Number(v.id_bloque), 
          Number(v.id_aeronave), 
          v.tipo_vuelo || 'LOCAL', 
          Number(v.id_bloque_fin || v.id_bloque),
          Number(id_instructor)
        ]
      );
    }

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "solicitud_semana",
      id_entidad: id_solicitud,
      actor: user,
      req,
      descripcion: `Programación creó/actualizó solicitud para alumno ${id_alumno} con ${vuelos.length} vuelos`,
      metadata: { id_alumno: Number(id_alumno), id_instructor: Number(id_instructor), vuelos }
    });

    await client.query("COMMIT");
    res.json({ message: "Solicitud guardada correctamente", id_solicitud });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("guardarSolicitudProgramacion Error:", e);
    res.status(500).json({ message: "Error al guardar la solicitud", detail: e.message });
  } finally {
    client.release();
  }
};

