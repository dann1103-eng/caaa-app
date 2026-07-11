const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const transporter = require("../../utils/mailer");
const { dispararOfertaPorCancelacion } = require("../standbyController");

exports.getSolicitudesCancelacion = catchAsync(async (req, res) => {
  const { estado } = req.query;

  // 1. Auto-Expiración: Marcar como EXPIRADA las solicitudes cuya fecha de vuelo ya pasó
  await db.query(`
    UPDATE solicitud_cancelacion sc
    SET estado = 'EXPIRADA'
    FROM vuelo v
    WHERE sc.id_vuelo = v.id_vuelo
      AND sc.estado = 'PENDIENTE'
      AND v.fecha_vuelo < CURRENT_DATE
  `);

  const where = estado === "HISTORIAL" 
    ? "sc.estado IN ('ACEPTADA', 'RECHAZADA', 'EXPIRADA')" 
    : "sc.estado = 'PENDIENTE' AND v.fecha_vuelo >= CURRENT_DATE";

  const result = await db.query(`
    SELECT 
      sc.id_solicitud_cancelacion AS id_solicitud,
      sc.estado,
      sc.motivo AS justificacion,
      sc.creado_en AS fecha_solicitud,
      (v.fecha_vuelo + b.hora_inicio::time) AS fecha_hora_vuelo,
      a.codigo AS aeronave_codigo,
      u.nombre AS alumno_nombre,
      u.apellido AS alumno_apellido,
      sc.tiene_multa AS con_multa,
      sc.monto_multa,
      sc.motivo,
      (
        SELECT COUNT(*)
        FROM solicitud_cancelacion sc2
        WHERE sc2.id_alumno = sc.id_alumno
          AND sc2.estado IN ('PENDIENTE','ACEPTADA')
          AND date_trunc('month', sc2.creado_en) = date_trunc('month', CURRENT_DATE)
      ) AS cancelaciones_mes,
      (
        SELECT COUNT(*)
        FROM solicitud_cancelacion sc2
        WHERE sc2.id_alumno = sc.id_alumno
          AND sc2.estado = 'ACEPTADA'
          AND date_trunc('month', sc2.creado_en) = date_trunc('month', CURRENT_DATE)
      ) AS cancelaciones_aceptadas_mes
    FROM solicitud_cancelacion sc
    JOIN vuelo v ON v.id_vuelo = sc.id_vuelo
    JOIN bloque_horario b ON b.id_bloque = v.id_bloque
    JOIN aeronave a ON a.id_aeronave = v.id_aeronave
    JOIN alumno al ON al.id_alumno = sc.id_alumno
    JOIN usuario u ON u.id_usuario = al.id_usuario
    WHERE ${where} 
    ORDER BY sc.creado_en DESC
  `);

  res.json(result.rows);
});

exports.resolverSolicitudCancelacion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { decision } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const solRes = await client.query(`SELECT sc.*, u.correo AS alumno_correo FROM solicitud_cancelacion sc JOIN alumno al ON al.id_alumno = sc.id_alumno JOIN usuario u ON u.id_usuario = al.id_usuario WHERE sc.id_solicitud_cancelacion = $1 FOR UPDATE`, [id]);
    if (solRes.rows.length === 0) throw new Error("Solicitud no encontrada");

    await client.query(`UPDATE solicitud_cancelacion SET estado = $1, resuelto_en = NOW(), resuelto_por = $2 WHERE id_solicitud_cancelacion = $3`, [decision, req.user.id_usuario, id]);
    
    if (decision === 'ACEPTADA') {
      await client.query(`UPDATE vuelo SET estado = 'CANCELADO', fecha_cancelacion = NOW() WHERE id_vuelo = $1`, [solRes.rows[0].id_vuelo]);
      // Lista de espera: ofrecer el cupo liberado al siguiente candidato (si hay
      // margen suficiente). NO se dispara en cierres de operaciones (esa ruta no
      // llama aquí). No debe abortar la cancelación si algo falla.
      try {
        await dispararOfertaPorCancelacion(client, solRes.rows[0].id_vuelo, req.app.get("io"));
      } catch (e) { console.error("[standby] disparo por cancelación:", e.message); }
    }

    await logAuditoria(client, { accion: "RESOLVER_SOLICITUD_CANCELACION", entidad: "solicitud_cancelacion", id_entidad: id, actor: req.user, req, descripcion: `Admin ${decision} solicitud` });
    
    await client.query("COMMIT");
    res.json({ message: `Solicitud ${decision.toLowerCase()}` });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
