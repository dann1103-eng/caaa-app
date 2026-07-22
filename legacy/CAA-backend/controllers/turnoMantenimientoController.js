// Mantenimiento imprevisto desde el puesto de TURNO. Caso típico: en la
// inspección pre-vuelo se detecta una falla y el avión debe entrar a taller
// YA. Turno saca la aeronave de servicio (cerrando los bloques del día que
// taller reporte, con fecha estimada de fin opcional), se cancelan los vuelos
// afectados de ESA aeronave, se notifica a sus tripulaciones (alumno e
// instructor, in-app + correo) y cuando taller termina, Turno la marca
// operativa de nuevo. Reusa el mismo modelo del módulo de mantenimiento del
// admin (mantenimiento_aeronave + mantenimiento_bloque + sincronizarEstadoFlota),
// que ya alimenta la disponibilidad del agendado y los widgets de Proyección.
const db = require("../config/db");
const catchAsync = require("../utils/catchAsync");
const { logAuditoria } = require("../utils/auditoria");
const transporter = require("../utils/mailer");
const { sincronizarEstadoFlota } = require("../utils/mantenimientoUtils");
const { notificarStaff } = require("../utils/webpush");
const { notificarUsuario } = require("../utils/notificaciones");

const HOY_SV = `(NOW() AT TIME ZONE 'America/El_Salvador')::date`;

// Un vuelo cae dentro del cierre si: es de la aeronave, sigue vivo sin volar,
// y (a) es de HOY y su rango de bloques [id_bloque, id_bloque_fin] pisa alguno
// de los bloques cerrados, o (b) es de un día completo dentro de la ventana
// estimada del mantenimiento (mañana..fecha_fin).
const WHERE_VUELOS_AFECTADOS = `
  v.id_aeronave = $1
  AND v.estado IN ('PUBLICADO', 'SOLICITADO', 'AJUSTADO', 'PROGRAMADO')
  AND (
    (v.fecha_vuelo = ${HOY_SV}
     AND EXISTS (
       SELECT 1 FROM unnest($2::int[]) sb
       WHERE sb BETWEEN v.id_bloque AND COALESCE(v.id_bloque_fin, v.id_bloque)
     ))
    OR ($3::date IS NOT NULL AND v.fecha_vuelo > ${HOY_SV} AND v.fecha_vuelo <= $3::date)
  )
`;

function normalizarBloques(bloques) {
  return (Array.isArray(bloques) ? bloques : [])
    .map((b) => Number(b))
    .filter((b) => !isNaN(b));
}

// ── Estado de la flota para el panel de Turno ────────────────────────────────
// Cada aeronave (no simulador) con su mantenimiento EN_CURSO si lo tiene.
exports.getFlotaMantenimiento = catchAsync(async (req, res) => {
  const r = await db.query(`
    SELECT a.id_aeronave, a.codigo, a.modelo, a.activa, a.estado,
           m.id_mantenimiento, m.tipo AS mant_tipo, m.descripcion AS mant_descripcion,
           m.fecha_inicio::date AS mant_desde, m.fecha_fin::date AS mant_hasta
    FROM aeronave a
    LEFT JOIN LATERAL (
      SELECT * FROM mantenimiento_aeronave m
      WHERE m.id_aeronave = a.id_aeronave AND m.estado = 'EN_CURSO' AND m.completado = false
      ORDER BY m.id_mantenimiento DESC LIMIT 1
    ) m ON true
    WHERE a.tipo <> 'SIMULADOR'
    ORDER BY a.codigo
  `);
  res.json(r.rows);
});

// ── Vista previa: qué vuelos se cancelarían ──────────────────────────────────
exports.previewMantenimientoAeronave = catchAsync(async (req, res) => {
  const { id } = req.params; // id_aeronave
  const bloques = normalizarBloques(req.body.bloques);
  const fecha_fin = req.body.fecha_fin || null;

  const r = await db.query(
    `SELECT v.id_vuelo, v.fecha_vuelo, bh.hora_inicio,
            ua.nombre || ' ' || ua.apellido AS alumno,
            ui.nombre || ' ' || ui.apellido AS instructor
     FROM vuelo v
     JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
     JOIN alumno al ON al.id_alumno = v.id_alumno
     JOIN usuario ua ON ua.id_usuario = al.id_usuario
     JOIN instructor i ON i.id_instructor = v.id_instructor
     JOIN usuario ui ON ui.id_usuario = i.id_usuario
     WHERE ${WHERE_VUELOS_AFECTADOS}
     ORDER BY v.fecha_vuelo, bh.hora_inicio`,
    [id, bloques, fecha_fin]
  );
  res.json(r.rows);
});

// ── Meter la aeronave a mantenimiento imprevisto ─────────────────────────────
exports.iniciarMantenimientoAeronave = catchAsync(async (req, res) => {
  const { id } = req.params; // id_aeronave
  const { descripcion, fecha_fin } = req.body;
  const bloques = normalizarBloques(req.body.bloques);
  const io = req.app.get("io");
  const user = req.user;

  if (!descripcion || !String(descripcion).trim()) {
    return res.status(400).json({ message: "Describí la falla o el reporte de taller." });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const aeroRes = await client.query(
      `SELECT id_aeronave, codigo, tipo FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`,
      [id]
    );
    if (aeroRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Aeronave no encontrada" });
    }
    const { codigo } = aeroRes.rows[0];
    if (aeroRes.rows[0].tipo === "SIMULADOR") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El simulador no entra a mantenimiento de aeronave." });
    }

    const enCursoRes = await client.query(
      `SELECT 1 FROM mantenimiento_aeronave WHERE id_aeronave = $1 AND estado = 'EN_CURSO' AND completado = false LIMIT 1`,
      [id]
    );
    if (enCursoRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: `${codigo} ya tiene un mantenimiento en curso.` });
    }

    // fecha_fin NULL = abierto (fuera de servicio hasta que Turno la reactive).
    const mantRes = await client.query(
      `INSERT INTO mantenimiento_aeronave
         (id_aeronave, tipo, descripcion, fecha_inicio, fecha_fin, estado, completado, fecha_programada)
       VALUES ($1, 'CORRECTIVO', $2, ${HOY_SV}, $3, 'EN_CURSO', false, ${HOY_SV})
       RETURNING id_mantenimiento`,
      [id, String(descripcion).trim(), fecha_fin || null]
    );
    const id_mantenimiento = mantRes.rows[0].id_mantenimiento;

    for (const b of bloques) {
      await client.query(
        `INSERT INTO mantenimiento_bloque (id_mantenimiento, fecha, id_bloque)
         VALUES ($1, ${HOY_SV}, $2)`,
        [id_mantenimiento, b]
      );
    }

    // Saca el avión de servicio (activa=false, estado=MANTENIMIENTO).
    await sincronizarEstadoFlota(client, Number(id));

    // Cancelar los vuelos afectados y armar la lista de tripulaciones.
    const cancelRes = await client.query(
      `UPDATE vuelo v
       SET estado = 'CANCELADO', justificacion_cancelacion = $4,
           tipo_cancelacion = 'NORMAL', fecha_cancelacion = NOW()
       WHERE ${WHERE_VUELOS_AFECTADOS}
       RETURNING v.id_vuelo`,
      [id, bloques, fecha_fin || null, `Mantenimiento imprevisto de ${codigo}: ${String(descripcion).trim()}`]
    );
    const idsCancelados = cancelRes.rows.map((r) => r.id_vuelo);

    let tripulaciones = [];
    if (idsCancelados.length > 0) {
      const detRes = await client.query(
        `SELECT v.id_vuelo, v.fecha_vuelo, bh.hora_inicio,
                ua.id_usuario AS alumno_uid, ua.nombre AS alumno_nombre, ua.correo AS alumno_correo,
                ui.id_usuario AS instructor_uid, ui.nombre AS instructor_nombre, ui.correo AS instructor_correo
         FROM vuelo v
         JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
         JOIN alumno al ON al.id_alumno = v.id_alumno
         JOIN usuario ua ON ua.id_usuario = al.id_usuario
         JOIN instructor i ON i.id_instructor = v.id_instructor
         JOIN usuario ui ON ui.id_usuario = i.id_usuario
         WHERE v.id_vuelo = ANY($1)`,
        [idsCancelados]
      );
      tripulaciones = detRes.rows;

      const horaCancelacion = new Date().toISOString();
      for (const t of tripulaciones) {
        await client.query(
          `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por) VALUES ($1, 'CANCELADO', $2)`,
          [t.id_vuelo, user?.id_usuario ?? null]
        );

        const fechaStr = new Date(t.fecha_vuelo).toLocaleDateString("es-SV", { timeZone: "UTC" });
        const horaStr = (t.hora_inicio || "").slice(0, 5);
        const mensaje = `Tu vuelo del ${fechaStr} ${horaStr} en ${codigo} fue cancelado: aeronave en mantenimiento (${String(descripcion).trim()}).`;
        await notificarUsuario(client, t.alumno_uid, { tipo: "VUELO", mensaje, enlace: "/perfil" });
        await notificarUsuario(client, t.instructor_uid, { tipo: "VUELO", mensaje, enlace: "/perfil" });

        if (io) {
          io.emit("vuelo_estado_changed", { id_vuelo: t.id_vuelo, estado: "CANCELADO", registrado_en: horaCancelacion });
        }
      }
    }

    await logAuditoria(client, {
      accion: "OTRO", entidad: "aeronave", id_entidad: Number(id), actor: user, req,
      descripcion: `${codigo} a mantenimiento imprevisto (${bloques.length} bloque(s) hoy${fecha_fin ? `, hasta ${fecha_fin}` : ""}). ${idsCancelados.length} vuelo(s) cancelado(s).`,
    });

    await client.query("COMMIT");

    // Correos a las tripulaciones (best-effort, fuera de la transacción).
    for (const t of tripulaciones) {
      const fechaStr = new Date(t.fecha_vuelo).toLocaleDateString("es-SV", { timeZone: "UTC" });
      const horaStr = (t.hora_inicio || "").slice(0, 5);
      for (const [nombre, correo] of [[t.alumno_nombre, t.alumno_correo], [t.instructor_nombre, t.instructor_correo]]) {
        if (!correo) continue;
        transporter.sendMail({
          from: process.env.MAIL_FROM,
          to: correo,
          subject: `Vuelo cancelado — ${codigo} en mantenimiento`,
          text: `Hola ${nombre},\n\nTu vuelo del ${fechaStr} a las ${horaStr} en la aeronave ${codigo} ha sido cancelado porque la aeronave entró a mantenimiento imprevisto.\n\nMotivo reportado por taller: ${String(descripcion).trim()}\n\nPor favor coordiná la reprogramación con tu instructor o con programación.`,
        }).catch((e) => console.error("Error envío mail mantenimiento:", e));
      }
    }

    // Aviso en el ticker de Proyección (se limpia al reactivar la aeronave).
    try {
      const tickerContent = `${codigo} FUERA DE SERVICIO POR MANTENIMIENTO: ${String(descripcion).trim()}`.toUpperCase();
      const tk = await db.query(
        `INSERT INTO mensaje_turno (contenido, tipo, para_rol, id_usuario_origen, activo, expira_en)
         VALUES ($1, 'TURNO', null, $2, true, NULL) RETURNING id_mensaje, contenido, creado_en`,
        [tickerContent, user?.id_usuario ?? null]
      );
      if (io) io.emit("nuevo_ticker", tk.rows[0]);
    } catch (e) {
      console.error("Error ticker mantenimiento:", e);
    }

    notificarStaff(
      {
        title: `🔧 ${codigo} a mantenimiento`,
        body: `${String(descripcion).trim()} · ${idsCancelados.length} vuelo(s) cancelado(s)`,
        url: "/turno", tag: `mant-${id}`,
      },
      { excluirUid: user?.id_usuario, tipo: "MANTENIMIENTO" }
    );

    res.json({ message: "Aeronave en mantenimiento", id_mantenimiento, vuelos_cancelados: idsCancelados.length });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── Marcar el mantenimiento efectuado: la aeronave vuelve a operar ───────────
exports.completarMantenimientoAeronave = catchAsync(async (req, res) => {
  const { id } = req.params; // id_aeronave
  const io = req.app.get("io");
  const user = req.user;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const mantRes = await client.query(
      `SELECT m.id_mantenimiento, a.codigo
       FROM mantenimiento_aeronave m JOIN aeronave a ON a.id_aeronave = m.id_aeronave
       WHERE m.id_aeronave = $1 AND m.estado = 'EN_CURSO' AND m.completado = false
       ORDER BY m.id_mantenimiento DESC LIMIT 1 FOR UPDATE OF m`,
      [id]
    );
    if (mantRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Esta aeronave no tiene un mantenimiento en curso." });
    }
    const { id_mantenimiento, codigo } = mantRes.rows[0];

    await client.query(
      `UPDATE mantenimiento_aeronave
       SET estado = 'COMPLETADO', completado = true, fecha_completado = NOW()
       WHERE id_mantenimiento = $1`,
      [id_mantenimiento]
    );
    // Reactiva el avión solo si no le queda otro mantenimiento cubriendo hoy.
    await sincronizarEstadoFlota(client, Number(id));

    await logAuditoria(client, {
      accion: "OTRO", entidad: "aeronave", id_entidad: Number(id), actor: user, req,
      descripcion: `Mantenimiento ${id_mantenimiento} de ${codigo} completado desde Turno — aeronave operativa`,
    });

    await client.query("COMMIT");

    // Limpiar el aviso del ticker de esta aeronave.
    try {
      await db.query(
        `UPDATE mensaje_turno SET activo = false
         WHERE tipo = 'TURNO' AND activo = true AND contenido LIKE $1`,
        [`${codigo} FUERA DE SERVICIO POR MANTENIMIENTO%`]
      );
      if (io) io.emit("nuevo_ticker", { action: "refresh" });
    } catch (e) {
      console.error("Error limpiando ticker mantenimiento:", e);
    }

    notificarStaff(
      { title: `✅ ${codigo} operativa`, body: "Mantenimiento efectuado, la aeronave vuelve al servicio.", url: "/turno", tag: `mant-${id}` },
      { excluirUid: user?.id_usuario, tipo: "MANTENIMIENTO" }
    );

    res.json({ message: "Mantenimiento completado, aeronave operativa" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
