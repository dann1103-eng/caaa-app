const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const { puedeAccederVuelo } = require("../../utils/ownership");
const { getEstadoCancelaciones } = require("../../services/cancelacionService");

exports.solicitarCancelacion = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const { motivo } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const alumnoRes = await client.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [req.user.id_usuario]);
    const idAlumno = alumnoRes.rows[0].id_alumno;

    // Límite duro: solo 1 cancelación por semana. Si ya hay una vigente
    // (PENDIENTE/ACEPTADA) para un vuelo de la MISMA semana → 409.
    const semRes = await client.query(`
      SELECT 1
        FROM solicitud_cancelacion sc
        JOIN vuelo v  ON v.id_vuelo = sc.id_vuelo
        JOIN vuelo vt ON vt.id_vuelo = $2
       WHERE sc.id_alumno = $1
         AND sc.estado IN ('PENDIENTE','ACEPTADA')
         AND v.id_semana = vt.id_semana
       LIMIT 1
    `, [idAlumno, id_vuelo]);
    if (semRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ya tenés una cancelación esta semana. Solo se permite 1 por semana." });
    }

    // Estado de cancelaciones ANTES de insertar → decide multa (mensual/racha).
    const estado = await getEstadoCancelaciones(idAlumno, id_vuelo, client);
    const tieneMulta = estado.proxima_tiene_multa;
    const montoMulta = estado.monto;

    await client.query(`
      INSERT INTO solicitud_cancelacion (id_vuelo, id_alumno, motivo, estado, tiene_multa, monto_multa)
      VALUES ($1, $2, $3, 'PENDIENTE', $4, $5)
    `, [id_vuelo, idAlumno, motivo, tieneMulta, montoMulta]);

    await logAuditoria(client, { accion: "SOLICITAR_CANCELACION", entidad: "vuelo", id_entidad: id_vuelo, actor: req.user, req, descripcion: `Alumno solicitó cancelación${tieneMulta ? ` (multa ${estado.motivo})` : ""}` });
    await client.query("COMMIT");
    res.json({ message: "Solicitud enviada correctamente", tiene_multa: tieneMulta, monto_multa: montoMulta, motivo: estado.motivo });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.getMisSolicitudesCancelacion = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT sc.*, v.dia_semana, a.codigo AS aeronave_codigo
    FROM solicitud_cancelacion sc
    JOIN vuelo v ON v.id_vuelo = sc.id_vuelo
    JOIN aeronave a ON a.id_aeronave = v.id_aeronave
    JOIN alumno al ON al.id_alumno = sc.id_alumno
    WHERE al.id_usuario = $1
    ORDER BY sc.creado_en DESC
  `, [req.user.id_usuario]);
  res.json(result.rows);
});

exports.quitarSolicitudCancelacion = catchAsync(async (req, res) => {
  const { id_solicitud_cancelacion } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const reqRes = await client.query(`SELECT id_alumno, estado FROM solicitud_cancelacion WHERE id_solicitud_cancelacion = $1 FOR UPDATE`, [id_solicitud_cancelacion]);
    if (reqRes.rows.length === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Solicitud no encontrada" }); }

    // IDOR: la solicitud debe pertenecer al alumno autenticado.
    const propRes = await client.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [req.user.id_usuario]);
    const idAlumnoPropio = propRes.rows[0]?.id_alumno;
    if (!idAlumnoPropio || reqRes.rows[0].id_alumno !== idAlumnoPropio) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No tenés acceso a esta solicitud" });
    }

    if (reqRes.rows[0].estado !== 'PENDIENTE') { await client.query("ROLLBACK"); return res.status(400).json({ message: "Solo podés quitar solicitudes PENDIENTES" }); }

    await client.query(`DELETE FROM solicitud_cancelacion WHERE id_solicitud_cancelacion = $1`, [id_solicitud_cancelacion]);
    await logAuditoria(client, { accion: "QUITAR_SOLICITUD_CANCELACION", entidad: "solicitud_cancelacion", id_entidad: id_solicitud_cancelacion, actor: req.user, req, descripcion: "Alumno quitó solicitud" });
    await client.query("COMMIT");
    res.json({ message: "Solicitud eliminada correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

