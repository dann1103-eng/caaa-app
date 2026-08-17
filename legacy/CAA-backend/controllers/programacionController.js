const db = require("../config/db");
const { logAuditoria } = require("../utils/auditoria");
const transporter = require("../utils/mailer");
const { puedeProgramar } = require("../utils/capacidades");
const solicitudService = require("../services/solicitudService");
const { notificarUsuario } = require("../utils/notificaciones");
const { mantenimientoCubreFechaSQL, soloFecha } = require("../utils/mantenimientoUtils");
const { normalizarCategoria, resolverVueloEspecial } = require("../utils/practicanteHelper");

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

async function requireProgramacion(req, res) {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado" });
    return null;
  }
  // ADMIN y PROGRAMACION siempre; INSTRUCTOR solo con el toggle puede_programar.
  if (!(await puedeProgramar(req))) {
    res.status(403).json({ message: "Acceso denegado" });
    return null;
  }
  return req.user;
}

async function requireProgramacionOrAdmin(req, res) {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado" });
    return null;
  }
  // PROYECCION y DUENO son lectura-only: pasan directo a estos endpoints de
  // solo consulta (estado de flota / resumen de mantenimiento) sin necesitar
  // capacidad de programar.
  if (req.user.rol === "PROYECCION" || req.user.rol === "DUENO") return req.user;
  if (!(await puedeProgramar(req))) {
    res.status(403).json({ message: "Acceso denegado" });
    return null;
  }
  return req.user;
}

// La pestaña "Próxima" del calendario de Programación puede, en la práctica,
// ya estar publicada (p.ej. si se publicó con anticipación) — el tab en sí no
// dice nada del estado real en BD. Este endpoint devuelve el estado real de la
// semana que corresponde a cada pestaña, para que el frontend no lo asuma por
// el nombre del tab (bug real: el modal de agendar decidía "solicitud vs.
// vuelo directo" mirando solo si el tab era "current", así que agendar en una
// "Próxima" ya publicada caía siempre en el endpoint de solicitud y el
// backend lo rechazaba con 403 "usá el agendado directo").
exports.getEstadoSemana = async (req, res) => {
  try {
    const user = await requireProgramacion(req, res);
    if (!user) return;

    const { week = "next" } = req.query;
    if (!["current", "next"].includes(week)) {
      return res.status(400).json({ message: "week inválido (current|next)" });
    }

    const idSemana = week === "current" ? await getCurrentSemanaId(db) : await getNextSemanaId(db);
    if (!idSemana) return res.json({ id_semana: null, publicada: false });

    const r = await db.query("SELECT publicada FROM semana_vuelo WHERE id_semana = $1", [idSemana]);
    res.json({ id_semana: idSemana, publicada: r.rows[0]?.publicada || false });
  } catch (e) {
    console.error("Error getEstadoSemana:", e);
    res.status(500).json({ message: "Error obtener estado de la semana" });
  }
};

exports.getCalendario = async (req, res) => {
  try {
    const user = await requireProgramacion(req, res);
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
          LEFT(u_al.nombre,1) || '.' || split_part(u_al.apellido,' ',1) AS alumno_nombre_corto,

          v.id_instructor,
          COALESCE(u_ins.nombre || ' ' || u_ins.apellido, 'Sin Instructor') AS instructor_nombre,
          LEFT(u_ins.nombre,1) || '.' || split_part(u_ins.apellido,' ',1) AS instructor_nombre_corto,

          v.estado AS estado_vuelo,
          v.justificacion_cancelacion,
          v.es_extracurricular,

          'PUBLICADO' AS estado_solicitud,
          v.estado AS estado_mostrar,

          -- Advertencia de saldo bajo (ver adminVueloController.getCalendario)
          COALESCE(cc.saldo_actual_usd, 0) AS saldo_alumno,
          COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd) AS tarifa_estimada,
          v.categoria,
          v.tipo_instruccion,
          v.debitar_saldo,
          (
            (
              COALESCE(v.categoria, 'NORMAL') NOT IN ('DEMO','CHEQUEO_LINEA','PRUEBA')
              OR (
                COALESCE(v.categoria, 'NORMAL') = 'CHEQUEO_LINEA'
                AND v.tipo_instruccion = 'REFRESH'
                AND v.debitar_saldo = TRUE
              )
            )
            AND COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd) IS NOT NULL
            AND COALESCE(cc.saldo_actual_usd, 0) < COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd)
          ) AS saldo_bajo
        FROM vuelo v
        JOIN bloque_horario b ON b.id_bloque = v.id_bloque
        JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave

        LEFT JOIN alumno al ON al.id_alumno = v.id_alumno
        LEFT JOIN usuario u_al ON u_al.id_usuario = al.id_usuario

        LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
        LEFT JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario

        LEFT JOIN cuenta_corriente_alumno cc ON cc.id_alumno = v.id_alumno
        LEFT JOIN LATERAL (
          SELECT at.tarifa_hora_usd FROM alumno_tarifa_aeronave ata
          JOIN aeronave_tarifa at ON at.id = ata.id_tarifa
          WHERE ata.id_alumno = v.id_alumno AND ata.id_aeronave = v.id_aeronave
          LIMIT 1
        ) tesp ON TRUE
        LEFT JOIN LATERAL (
          SELECT t.tarifa_hora_usd FROM aeronave_tarifa t
          WHERE t.id_aeronave = v.id_aeronave AND COALESCE(t.es_estandar, TRUE) = TRUE
            AND t.vigente_desde <= CURRENT_DATE AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= CURRENT_DATE)
          ORDER BY t.vigente_desde DESC LIMIT 1
        ) test ON TRUE

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
        ss.comentario_alumno,
        sv.remarks_instructor,
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
        LEFT(u_al.nombre,1) || '.' || split_part(u_al.apellido,' ',1) AS alumno_nombre_corto,

        i.id_instructor,
        COALESCE(u_ins.nombre || ' ' || u_ins.apellido, 'Sin Instructor') AS instructor_nombre,
        LEFT(u_ins.nombre,1) || '.' || split_part(u_ins.apellido,' ',1) AS instructor_nombre_corto,

        NULL::int AS id_vuelo,
        NULL::text AS estado_vuelo,
        sv.es_extracurricular,

        ss.estado AS estado_mostrar,

        -- Advertencia de saldo bajo (ver adminVueloController.getCalendario)
        COALESCE(cc.saldo_actual_usd, 0) AS saldo_alumno,
        COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd) AS tarifa_estimada,
        sv.categoria,
        sv.tipo_instruccion,
        sv.debitar_saldo,
        (
          (
            COALESCE(sv.categoria, 'NORMAL') NOT IN ('DEMO','CHEQUEO_LINEA','PRUEBA')
            OR (
              COALESCE(sv.categoria, 'NORMAL') = 'CHEQUEO_LINEA'
              AND sv.tipo_instruccion = 'REFRESH'
              AND sv.debitar_saldo = TRUE
            )
          )
          AND COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd) IS NOT NULL
          AND COALESCE(cc.saldo_actual_usd, 0) < COALESCE(tesp.tarifa_hora_usd, test.tarifa_hora_usd)
        ) AS saldo_bajo
      FROM solicitud_vuelo sv
      JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
      JOIN bloque_horario b ON b.id_bloque = sv.id_bloque
      JOIN aeronave ae ON ae.id_aeronave = sv.id_aeronave

      LEFT JOIN alumno al ON al.id_alumno = ss.id_alumno
      LEFT JOIN usuario u_al ON u_al.id_usuario = al.id_usuario

      JOIN instructor i ON i.id_instructor = COALESCE(sv.id_instructor, al.id_instructor)
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
    const user = await requireProgramacion(req, res);
    if (!user) return;

    // Se devuelven TODAS las aeronaves no dadas de baja, incluidas las que hoy
    // están en el taller — mismo criterio que ya usa el picker del alumno
    // (agendarController.getAeronavesPermitidas): "activa" es "disponible HOY",
    // pero acá se agenda para cualquier día futuro. El freno de mantenimiento
    // pasó a ser una ADVERTENCIA en agendarSolicitud/agendarVueloDirecto, no la
    // desaparición del selector.
    const result = await db.query(`
      WITH sem AS (
        SELECT fecha_inicio
          FROM semana_vuelo
         WHERE fecha_inicio > CURRENT_DATE
         ORDER BY fecha_inicio
         LIMIT 1
      )
      SELECT
        a.id_aeronave, a.codigo, a.modelo, a.tipo,
        mact.id_mantenimiento IS NOT NULL AS en_mantenimiento,
        mact.fecha_fin::date AS mantenimiento_hasta,
        COALESCE((
          SELECT array_agg(d ORDER BY d)
            FROM generate_series(1, 6) AS d
           WHERE EXISTS (
             -- El alias TIENE que ser 'm': mantenimientoCubreFechaSQL lo hardcodea.
             SELECT 1 FROM mantenimiento_aeronave m
              WHERE m.id_aeronave = a.id_aeronave
                AND ${mantenimientoCubreFechaSQL("((SELECT fecha_inicio FROM sem) + (d - 1))")}
           )
        ), '{}') AS dias_bloqueados
      FROM aeronave a
      LEFT JOIN LATERAL (
        SELECT m2.id_mantenimiento, m2.fecha_fin
          FROM mantenimiento_aeronave m2
         WHERE m2.id_aeronave = a.id_aeronave
           AND m2.completado = false
           AND COALESCE(m2.estado, '') <> 'CANCELADO'
         ORDER BY m2.fecha_fin IS NULL DESC, m2.fecha_fin DESC
         LIMIT 1
      ) mact ON true
      WHERE NOT (a.activa = false AND a.estado = 'ACTIVO')
        AND a.es_externa = false
      ORDER BY a.codigo
    `);

    res.json(result.rows);
  } catch (e) {
    console.error("Error getAeronavesActivas:", e);
    res.status(500).json({ message: "Error obtener aeronaves" });
  }
};

exports.enRevision = async (req, res) => {
  try {
    const user = await requireProgramacion(req, res);
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
    const user = await requireProgramacion(req, res);
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

    // Validación de conflictos + reubicación (aparcar → validar → colocar) en
    // el service compartido con la variante del instructor.
    await solicitudService.aplicarMovimientos(client, { id_semana, movimientos });

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
    const user = await requireProgramacionOrAdmin(req, res);
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
          -- EN_VUELO es el nombre viejo del estado (ver migración 009); el
          -- código real avanza a EN_PROGRESO. Sin este valor, un vuelo
          -- realmente en curso nunca coincidía y la aeronave se mostraba
          -- "en tierra" en vez de "volando".
          AND v2.estado IN ('EN_PROGRESO', 'EN_VUELO', 'SALIDA_HANGAR', 'REGRESO_HANGAR')
          AND EXISTS (
            SELECT 1 FROM semana_vuelo sw
            WHERE sw.id_semana = v2.id_semana
              AND CURRENT_DATE BETWEEN sw.fecha_inicio AND sw.fecha_fin
          )
          AND v2.dia_semana = EXTRACT(ISODOW FROM CURRENT_DATE)::int
        LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT m.id_mantenimiento
        FROM mantenimiento_aeronave m
        WHERE m.id_aeronave = a.id_aeronave
          AND ${mantenimientoCubreFechaSQL("CURRENT_DATE")}
        LIMIT 1
      ) m ON true
      -- Sin filtro por a.activa: una aeronave en mantenimiento hoy tiene
      -- activa=false (sincronizarEstadoFlota), pero el widget "Estado de la
      -- flota" existe justamente para mostrar ESE estado (etiqueta roja
      -- "Mantenimiento") — filtrar por activa la hacía desaparecer del todo
      -- en vez de mostrarla como en mantenimiento.
      WHERE a.tipo != 'SIMULADOR' AND a.es_externa = false
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
    const user = await requireProgramacionOrAdmin(req, res);
    if (!user) return;

    // Fuente única: la próxima revisión sale del cache sincronizado desde el
    // módulo Taller (aeronave.horas_proxima_revision / horas_ultima_revision).
    // Fallback al ciclo 50/100 viejo si la aeronave no tiene inspección cacheada.
    const r = await db.query(`
      SELECT
        a.id_aeronave,
        a.codigo,
        a.tipo,
        a.estado,
        a.horas_acumuladas,
        a.tipo_proxima_revision,
        COALESCE(a.horas_proxima_revision,
          CASE WHEN COALESCE(a.horas_acumuladas, 0) < 50 THEN 50 ELSE 100 END
        ) AS horas_proxima_revision,
        COALESCE(a.horas_ultima_revision, 0) AS horas_ultima_revision,
        (COALESCE(a.horas_proxima_revision,
          CASE WHEN COALESCE(a.horas_acumuladas, 0) < 50 THEN 50 ELSE 100 END
        ) - COALESCE(a.horas_acumuladas, 0)) AS horas_restantes
      FROM aeronave a
      WHERE a.activa = true
        AND a.tipo != 'SIMULADOR'
        AND a.es_externa = false
      ORDER BY horas_restantes ASC
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
    const user = await requireProgramacion(req, res);
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
         AND id_aeronave = $4 AND estado NOT IN ('CANCELADO', 'COMPLETADO')`,
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
    const user = await requireProgramacion(req, res);
    if (!user) return;

    const { id_semana, id_bloque, dia_semana } = req.query;

    // Fecha concreta del slot = lunes de la semana + (dia_semana - 1).
    const fechaSlot = `((SELECT fecha_inicio FROM semana_vuelo WHERE id_semana = $1) + ($3::int - 1))`;
    const r = await db.query(
      `SELECT a.id_aeronave, a.codigo, a.modelo
       FROM aeronave a
       WHERE a.activa = true
         AND a.estado = 'ACTIVO'
         AND a.tipo != 'SIMULADOR'
         AND a.es_externa = false
         AND NOT EXISTS (
           SELECT 1 FROM vuelo v
           WHERE v.id_aeronave = a.id_aeronave
             AND v.id_semana = $1
             AND v.id_bloque = $2
             AND v.dia_semana = $3
             AND v.estado NOT IN ('CANCELADO', 'COMPLETADO')
         )
         AND NOT EXISTS (
           SELECT 1 FROM mantenimiento_aeronave m
           WHERE m.id_aeronave = a.id_aeronave
             AND ${mantenimientoCubreFechaSQL(fechaSlot)}
         )
         AND NOT EXISTS (
           SELECT 1 FROM reserva_aeronave rv
           WHERE rv.id_aeronave = a.id_aeronave
             AND rv.fecha = ${fechaSlot}
             AND $2::int BETWEEN rv.id_bloque AND COALESCE(rv.id_bloque_fin, rv.id_bloque)
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

// ── Agendar desde el calendario del dashboard ─────────────────────────────
// Un solo vuelo, aditivo. Lo usan ADMIN/PROGRAMACION y el instructor con
// puede_programar (todos pasan por requireProgramacion).

// (A) Semana NO publicada → crea una solicitud (aditiva, sin pisar el basket).
exports.agendarSolicitud = async (req, res) => {
  const client = await db.connect();
  try {
    const user = await requireProgramacion(req, res);
    if (!user) return;

    const {
      id_alumno, id_instructor, dia_semana, id_bloque, id_bloque_fin, id_aeronave, tipo_vuelo, es_extracurricular,
      categoria: categoriaBody, id_licencia_chequeo, id_usuario_practicante, tipo_instruccion, nombre_externo,
    } = req.body;
    const categoria = normalizarCategoria(categoriaBody);

    if (!dia_semana || !id_bloque || !id_aeronave) {
      return res.status(400).json({ message: "Faltan datos del vuelo (día, bloque, aeronave)" });
    }
    if ((categoria === "NORMAL" || categoria === "CHEQUEO") && !id_alumno) {
      return res.status(400).json({ message: "Falta el alumno" });
    }
    if (categoria === "CHEQUEO_LINEA" && !id_usuario_practicante) {
      return res.status(400).json({ message: "Falta el instructor practicante" });
    }
    if (Number(dia_semana) < 1 || Number(dia_semana) > 6) {
      return res.status(400).json({ message: "Día inválido (Lunes a Sábado)" });
    }

    const semana = await solicitudService.getNextSemana(client);
    if (!semana) return res.status(404).json({ message: "No hay semana próxima" });
    if (semana.publicada) return res.status(403).json({ message: "La semana ya está publicada — usá el agendado directo." });

    await client.query("BEGIN");
    const out = await solicitudService.insertarSolicitudVuelo(client, {
      id_alumno, id_semana: semana.id_semana, dia_semana, id_bloque, id_bloque_fin,
      id_aeronave, tipo_vuelo, id_instructor: id_instructor || null, es_extracurricular,
      categoria, id_licencia_chequeo, id_usuario_practicante, tipo_instruccion, nombre_externo,
    });
    await logAuditoria(client, {
      accion: "OTRO", entidad: "solicitud_vuelo", id_entidad: out.id_detalle, id_semana: semana.id_semana,
      actor: user, req, descripcion: `Agendado manual (solicitud) alumno ${out.id_alumno}`,
    });
    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "agendar" });

    res.json({ message: "Vuelo agendado", ...out });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status === 400 || e.code === "VALIDATION") return res.status(400).json({ message: e.message });
    if (e.code === "23505") return res.status(409).json({ message: e.detail ? `Conflicto de datos: ${e.message}` : (e.message || "Ese bloque y aeronave ya está ocupado") });
    if (e.code === "23506") return res.status(409).json({ message: "El alumno ya tiene un vuelo en ese horario" });
    if (e.code === "23507") return res.status(409).json({ message: "El instructor ya tiene un vuelo en ese horario" });
    console.error("agendarSolicitud:", e);
    res.status(500).json({ message: "Error al agendar el vuelo" });
  } finally {
    client.release();
  }
};

// (B) Semana publicada / en curso → crea el vuelo directo (con solicitud_vuelo
// de respaldo para que sea editable por id_detalle), notifica y avisa.
// TURNO también puede (agregar un vuelo omitido durante el día en curso),
// además de ADMIN/PROGRAMACION/instructor-con-toggle.
exports.agendarVueloDirecto = async (req, res) => {
  const client = await db.connect();
  try {
    let user = req.user;
    if (!user) { client.release(); return res.status(401).json({ message: "No autenticado" }); }
    if (user.rol !== "TURNO" && !(await puedeProgramar(req))) {
      client.release();
      return res.status(403).json({ message: "Acceso denegado" });
    }
    if (!user) return;

    const {
      id_semana, id_alumno: idAlumnoBody, id_instructor, dia_semana, id_bloque, id_bloque_fin,
      id_aeronave, tipo_vuelo, es_extracurricular, id_usuario_practicante, id_licencia_chequeo,
      tipo_instruccion: tipoInstruccionBody, categoria: categoriaBody, nombre_externo: nombreExternoBody,
      con_parada, tramos_ruta,
    } = req.body;
    const categoria = normalizarCategoria(categoriaBody);

    // NORMAL/CHEQUEO exigen id_alumno; CHEQUEO_LINEA (instructor-con-instructor)
    // deriva el slot de estudiante de la ficha espejo del practicante; DEMO usa
    // la ficha placeholder compartida (no exige nada del pasajero).
    if (!id_semana || !id_instructor || !dia_semana || !id_bloque || !id_aeronave) {
      return res.status(400).json({ message: "Faltan datos del vuelo (semana, instructor, día, bloque, aeronave)" });
    }
    if ((categoria === "NORMAL" || categoria === "CHEQUEO") && !idAlumnoBody) {
      return res.status(400).json({ message: "Falta el alumno" });
    }
    if (categoria === "CHEQUEO_LINEA" && !id_usuario_practicante) {
      return res.status(400).json({ message: "Falta el instructor practicante" });
    }
    if (Number(dia_semana) < 1 || Number(dia_semana) > 6) {
      return res.status(400).json({ message: "Día inválido (Lunes a Sábado)" });
    }

    const semRes = await client.query("SELECT id_semana, fecha_inicio, publicada FROM semana_vuelo WHERE id_semana = $1", [id_semana]);
    if (semRes.rows.length === 0) return res.status(404).json({ message: "Semana no encontrada" });
    if (!semRes.rows[0].publicada) return res.status(400).json({ message: "La semana no está publicada — usá el agendado normal." });

    const fin = Number(id_bloque_fin || id_bloque);

    const { normalizarParadas, construirTramos } = require("../utils/rutaTramos");
    const conParada = (tipo_vuelo === "RUTA") && con_parada === true;
    let paradasRuta = null;
    if (conParada) {
      try { paradasRuta = normalizarParadas(tramos_ruta); }
      catch (e) { return res.status(400).json({ message: e.message }); }
    }

    // Conflictos contra vuelos reales (no cancelados), por rango de bloques.
    // Un vuelo marcado como inasistencia (reporte_vuelo.es_inasistencia) nunca
    // llegó a ocupar la aeronave/al alumno/al instructor de verdad — no debe
    // seguir bloqueando ese horario para un reemplazo (aplica también a RUTAs
    // que abarcan varios bloques: el no-show libera todos los que reservaba).
    // Un vuelo COMPLETADO libera igual: ya cerró, no puede ocupar el avión a
    // futuro — caso real: una RUTA de 2 bloques que regresa temprano y se
    // quiere agendar el vuelo de regreso dentro de su segundo bloque.
    const conflicto = async (campo, valor, label, code) => {
      const columna = campo === "aeronave" ? "id_aeronave" : campo === "alumno" ? "id_alumno" : "id_instructor";
      const q = `SELECT 1 FROM vuelo WHERE id_semana=$1 AND dia_semana=$2 AND ${columna}=$3 AND estado NOT IN ('CANCELADO', 'COMPLETADO')
             AND NOT ($5 < id_bloque OR $4 > COALESCE(id_bloque_fin, id_bloque))
             AND NOT EXISTS (SELECT 1 FROM reporte_vuelo rv WHERE rv.id_vuelo = vuelo.id_vuelo AND rv.es_inasistencia = true)
             LIMIT 1`;
      const r = await client.query(q, [id_semana, dia_semana, valor, id_bloque, fin]);
      if (r.rows.length) throw Object.assign(new Error(label), { code });
    };

    await client.query("BEGIN");

    const resuelto = await resolverVueloEspecial(client, {
      categoria, id_alumno: idAlumnoBody, id_instructor, id_usuario_practicante,
      tipo_instruccion: tipoInstruccionBody, nombre_externo: nombreExternoBody, id_licencia_chequeo,
    });
    const id_alumno = resuelto.id_alumno;
    const tipoInstruccion = resuelto.tipo_instruccion || "NORMAL";
    const nombreExterno = resuelto.nombre_externo;
    const idLicenciaChequeoEfectiva = resuelto.id_licencia_chequeo;

    await conflicto("aeronave", id_aeronave, "Ese bloque y aeronave ya está ocupado", "23505");
    if (!resuelto.saltarConflictoAlumno) {
      await conflicto("alumno", id_alumno, "El alumno ya tiene un vuelo en ese horario", "23506");
    }
    await conflicto("instructor", id_instructor, "El instructor ya tiene un vuelo en ese horario", "23507");

    // Conflicto con una reserva de uso especial (traslado/prueba/etc.) del avión.
    const reservaOcup = await client.query(
      `SELECT 1 FROM reserva_aeronave rv
        WHERE rv.id_aeronave = $3
          AND rv.fecha = (SELECT fecha_inicio FROM semana_vuelo WHERE id_semana = $1) + ($2::int - 1)
          AND NOT ($5 < rv.id_bloque OR $4 > COALESCE(rv.id_bloque_fin, rv.id_bloque))
        LIMIT 1`,
      [id_semana, dia_semana, id_aeronave, id_bloque, fin]
    );
    if (reservaOcup.rows.length) throw Object.assign(new Error("Ese avión está reservado (uso especial) en ese horario"), { code: "23505" });

    // Mantenimiento, validado contra la FECHA REAL del slot — advertencia, no
    // bloqueo (pedido explícito: Programación puede agendar igual, asumiendo
    // el riesgo). Antes esta ruta (semana publicada) no chequeaba mantenimiento
    // en absoluto; la semana NO publicada sí lo hacía vía solicitudService.
    const fechaSlotDirectoSQL = `((SELECT fecha_inicio FROM semana_vuelo WHERE id_semana = $1) + ($2::int - 1))`;
    const mantDirectoRes = await client.query(
      `SELECT a.codigo, ${fechaSlotDirectoSQL} AS fecha_slot,
              (SELECT MIN(m.fecha_fin::date) FROM mantenimiento_aeronave m
                WHERE m.id_aeronave = a.id_aeronave
                  AND ${mantenimientoCubreFechaSQL(fechaSlotDirectoSQL)}) AS hasta
         FROM aeronave a
        WHERE a.id_aeronave = $3
          AND EXISTS (SELECT 1 FROM mantenimiento_aeronave m
                       WHERE m.id_aeronave = a.id_aeronave
                         AND ${mantenimientoCubreFechaSQL(fechaSlotDirectoSQL)})`,
      [id_semana, dia_semana, id_aeronave]
    );
    let advertenciaMantenimiento = null;
    if (mantDirectoRes.rows.length > 0) {
      const { codigo, fecha_slot, hasta } = mantDirectoRes.rows[0];
      advertenciaMantenimiento =
        `${codigo} está en mantenimiento el ${soloFecha(fecha_slot)}` +
        (hasta ? ` (vuelve el ${soloFecha(hasta)}).` : " (sin fecha de regreso todavía).") +
        " El vuelo se agendó igual, pero corre riesgo de no poder realizarse.";
    }

    // Basket + solicitud_vuelo de respaldo (id_detalle para editar en el calendario).
    const ss = await client.query(
      `INSERT INTO solicitud_semana (id_semana, id_alumno, estado)
       VALUES ($1, $2, 'PUBLICADO')
       ON CONFLICT (id_semana, id_alumno) DO UPDATE SET fecha_actualizacion = now()
       RETURNING id_solicitud`,
      [id_semana, id_alumno]
    );
    const id_solicitud = ss.rows[0].id_solicitud;

    const sv = await client.query(
      `INSERT INTO solicitud_vuelo (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, id_instructor, es_extracurricular, tipo_instruccion, categoria, nombre_externo, id_licencia_chequeo, con_parada, tramos_ruta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id_detalle`,
      [id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo || "LOCAL", fin, id_instructor, es_extracurricular === true, tipoInstruccion, categoria, nombreExterno, idLicenciaChequeoEfectiva, conParada, paradasRuta ? JSON.stringify(paradasRuta) : null]
    );
    const id_detalle = sv.rows[0].id_detalle;

    let id_vuelo;
    if (conParada) {
      const tramos = construirTramos({ paradas: paradasRuta, id_bloque, id_bloque_fin: fin });
      for (const t of tramos) {
        // ⚠️ uq_vuelo_detalle es UNIQUE sobre vuelo.id_detalle: los N tramos NO
        // pueden compartirlo. Solo el tramo 1 lo lleva; los demás van con NULL
        // (Postgres admite varios NULL en un índice único). El vínculo entre
        // tramos es grupo_ruta, que sí conserva el id_detalle de la solicitud.
        const vueT = await client.query(
          `INSERT INTO vuelo (id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo, id_bloque_fin, es_extracurricular, tipo_instruccion, categoria, nombre_externo, id_licencia_chequeo, estado, creado_por, fecha_vuelo, grupo_ruta, orden_tramo, total_tramos, icao_origen, icao_destino)
           VALUES ($19,$2,$3,$4,$5,$6,$7,'RUTA',$8,$9,$10,$11,$12,$13,$14,'PROGRAMACION',
                   (SELECT fecha_inicio FROM semana_vuelo WHERE id_semana=$2) + ($6 - 1),
                   $1,$15,$16,$17,$18)
           RETURNING id_vuelo`,
          [id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, t.id_bloque, t.id_bloque_fin, es_extracurricular === true, tipoInstruccion, categoria, nombreExterno, idLicenciaChequeoEfectiva, t.orden_tramo === 1 ? "PUBLICADO" : "EN_ESPERA_TRAMO", t.orden_tramo, t.total_tramos, t.icao_origen, t.icao_destino, t.orden_tramo === 1 ? id_detalle : null]
        );
        if (t.orden_tramo === 1) id_vuelo = vueT.rows[0].id_vuelo;
      }
    } else {
      const vue = await client.query(
        `INSERT INTO vuelo (id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo, id_bloque_fin, es_extracurricular, tipo_instruccion, categoria, nombre_externo, id_licencia_chequeo, estado, creado_por, fecha_vuelo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PUBLICADO','PROGRAMACION',
                 (SELECT fecha_inicio FROM semana_vuelo WHERE id_semana=$2) + ($6 - 1))
         RETURNING id_vuelo`,
        [id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo || "LOCAL", fin, es_extracurricular === true, tipoInstruccion, categoria, nombreExterno, idLicenciaChequeoEfectiva]
      );
      id_vuelo = vue.rows[0].id_vuelo;
    }

    // Notificar (in-app) al alumno y al instructor.
    const uids = await client.query(
      `SELECT a.id_usuario AS alumno_uid, i.id_usuario AS instructor_uid, ae.codigo AS aeronave
         FROM alumno a, instructor i, aeronave ae
        WHERE a.id_alumno = $1 AND i.id_instructor = $2 AND ae.id_aeronave = $3`,
      [id_alumno, id_instructor, id_aeronave]
    );
    const info = uids.rows[0] || {};
    const dias = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const msg = `Se te agendó un vuelo el ${dias[Number(dia_semana)]} (aeronave ${info.aeronave || ""}).`;
    if (info.alumno_uid) await notificarUsuario(client, info.alumno_uid, { tipo: "VUELO", mensaje: msg, enlace: "/alumno/dashboard" });
    if (info.instructor_uid) await notificarUsuario(client, info.instructor_uid, { tipo: "VUELO", mensaje: msg, enlace: "/instructor" });

    await logAuditoria(client, {
      accion: "OTRO", entidad: "vuelo", id_entidad: id_vuelo, id_semana,
      actor: user, req, descripcion: `Agendado directo (semana publicada) alumno ${id_alumno}`,
    });

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "agendar-directo" });

    res.json({ message: "Vuelo agendado y publicado", id_vuelo, id_detalle, advertencia: advertenciaMantenimiento });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "VALIDATION") return res.status(400).json({ message: e.message });
    if (e.code === "23505") return res.status(409).json({ message: e.detail ? `Conflicto de datos: ${e.message}` : (e.message || "Ese bloque y aeronave ya está ocupado") });
    if (e.code === "23506") return res.status(409).json({ message: "El alumno ya tiene un vuelo en ese horario" });
    if (e.code === "23507") return res.status(409).json({ message: "El instructor ya tiene un vuelo en ese horario" });
    console.error("agendarVueloDirecto:", e);
    res.status(500).json({ message: "Error al agendar el vuelo" });
  } finally {
    client.release();
  }
};

exports.guardarSolicitudProgramacion = async (req, res) => {
  const client = await db.connect();
  try {
    const user = await requireProgramacion(req, res);
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
        INSERT INTO solicitud_vuelo (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, id_instructor, es_extracurricular)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          Number(id_solicitud),
          Number(id_semana),
          Number(v.dia_semana),
          Number(v.id_bloque),
          Number(v.id_aeronave),
          v.tipo_vuelo || 'LOCAL',
          Number(v.id_bloque_fin || v.id_bloque),
          Number(id_instructor),
          v.es_extracurricular === true
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

// Widget de ocupación de salones — "ahora mismo", reusado en Proyección,
// Turno, Programación, Admin y la Agenda del instructor. El estado se deriva
// de sesion_clase.estado (EN_CURSO manda, no el bloque programado), no de la
// hora del reloj.
exports.getSalonesOcupacion = async (req, res) => {
  try {
    const hoy = await db.query(`SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::date AS d`);
    const fecha = hoy.rows[0].d;

    const r = await db.query(`
      SELECT s.id, s.nombre,
             en_curso.curso_codigo AS ec_curso, en_curso.unidad_nombre AS ec_unidad, en_curso.instructor_nombre AS ec_instructor,
             reserva.motivo AS rs_motivo, reserva.descripcion AS rs_descripcion,
             proxima.tipo AS px_tipo, proxima.hora_inicio AS px_hora, proxima.titulo AS px_titulo,
             proxima.detalle AS px_detalle, proxima.instructor_nombre AS px_instructor
        FROM salon s
        LEFT JOIN LATERAL (
          SELECT c.codigo AS curso_codigo, u.nombre AS unidad_nombre,
                 TRIM(ui.nombre || ' ' || COALESCE(ui.apellido,'')) AS instructor_nombre
            FROM sesion_clase sc
            JOIN curso c ON c.id = sc.id_curso
            LEFT JOIN unidad_teorica u ON u.id = sc.id_unidad
            LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
            LEFT JOIN usuario ui ON ui.id_usuario = i.id_usuario
           WHERE sc.id_salon = s.id AND sc.fecha = $1 AND sc.estado = 'EN_CURSO'
           LIMIT 1
        ) en_curso ON true
        LEFT JOIN LATERAL (
          SELECT motivo, descripcion FROM reserva_salon rs2
            JOIN bloque_horario bh ON bh.id_bloque = rs2.id_bloque
           WHERE rs2.id_salon = s.id AND rs2.fecha = $1
             AND bh.hora_inicio <= (NOW() AT TIME ZONE 'America/El_Salvador')::time
             AND COALESCE((SELECT hora_fin FROM bloque_horario WHERE id_bloque = rs2.id_bloque_fin), bh.hora_fin)
                 >= (NOW() AT TIME ZONE 'America/El_Salvador')::time
           LIMIT 1
        ) reserva ON true
        LEFT JOIN LATERAL (
          -- Lo próximo que viene en este salón hoy, sea clase o reserva de uso
          -- especial — lo que empiece primero después de ahora.
          SELECT tipo, hora_inicio, titulo, detalle, instructor_nombre FROM (
            SELECT 'CLASE'::text AS tipo, bh.hora_inicio, c.codigo AS titulo, u.nombre AS detalle,
                   TRIM(ui.nombre || ' ' || COALESCE(ui.apellido,'')) AS instructor_nombre
              FROM sesion_clase sc
              JOIN bloque_horario bh ON bh.id_bloque = sc.id_bloque
              JOIN curso c ON c.id = sc.id_curso
              LEFT JOIN unidad_teorica u ON u.id = sc.id_unidad
              LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
              LEFT JOIN usuario ui ON ui.id_usuario = i.id_usuario
             WHERE sc.id_salon = s.id AND sc.fecha = $1 AND sc.estado = 'PROGRAMADA'
               AND bh.hora_inicio > (NOW() AT TIME ZONE 'America/El_Salvador')::time
            UNION ALL
            SELECT 'RESERVA'::text AS tipo, bh2.hora_inicio, rs3.motivo AS titulo, rs3.descripcion AS detalle,
                   NULL AS instructor_nombre
              FROM reserva_salon rs3
              JOIN bloque_horario bh2 ON bh2.id_bloque = rs3.id_bloque
             WHERE rs3.id_salon = s.id AND rs3.fecha = $1
               AND bh2.hora_inicio > (NOW() AT TIME ZONE 'America/El_Salvador')::time
          ) combinado
          ORDER BY hora_inicio LIMIT 1
        ) proxima ON true
       WHERE s.activo = true
       ORDER BY s.id
    `, [fecha]);

    const data = r.rows.map((row) => {
      if (row.ec_curso) {
        return { id: row.id, nombre: row.nombre, estado: "EN_SESION", instructor: row.ec_instructor, curso: row.ec_curso, unidad: row.ec_unidad };
      }
      if (row.rs_motivo) {
        return { id: row.id, nombre: row.nombre, estado: "RESERVADO", motivo: row.rs_motivo, descripcion: row.rs_descripcion };
      }
      if (row.px_tipo === "CLASE") {
        return { id: row.id, nombre: row.nombre, estado: "PROXIMA", tipo: "CLASE", hora: row.px_hora, instructor: row.px_instructor, curso: row.px_titulo, unidad: row.px_detalle };
      }
      if (row.px_tipo === "RESERVA") {
        return { id: row.id, nombre: row.nombre, estado: "PROXIMA", tipo: "RESERVA", hora: row.px_hora, motivo: row.px_titulo, descripcion: row.px_detalle };
      }
      return { id: row.id, nombre: row.nombre, estado: "LIBRE" };
    });

    res.json(data);
  } catch (e) {
    console.error("getSalonesOcupacion:", e);
    res.status(500).json({ message: "Error al obtener ocupación de salones" });
  }
};

