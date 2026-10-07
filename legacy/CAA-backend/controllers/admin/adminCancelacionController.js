const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const transporter = require("../../utils/mailer");
const { dispararOfertaPorCancelacion } = require("../standbyController");
const {
  AHORA_SV, salidaVueloSQL, esEmergenciaSQL, comoInstanteSQL, horasSQL, adjuntosJSONSQL,
} = require("../../services/cancelacionService");

// Con el vuelo en cualquiera de estos estados ya no hay nada que cancelar: salió
// o se voló. Aceptar la solicitud ahí cancelaría un avión en el aire.
const ESTADOS_YA_EN_CURSO = ["SALIDA_HANGAR", "EN_VUELO", "EN_PROGRESO", "REGRESO_HANGAR", "FINALIZANDO", "COMPLETADO"];

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

  // Las pendientes van por prioridad: primero las de emergencia, después el
  // vuelo que sale antes. El historial sigue por fecha de pedido.
  const orden = estado === "HISTORIAL"
    ? "sc.creado_en DESC"
    : `${esEmergenciaSQL("sc", "v", "b")} DESC, ${salidaVueloSQL("v", "b")} ASC, sc.creado_en ASC`;

  const result = await db.query(`
    SELECT 
      sc.id_solicitud_cancelacion AS id_solicitud,
      sc.estado,
      sc.motivo AS justificacion,
      -- Las dos horas van como instantes reales: sin zona, el proceso (UTC en
      -- Railway) las leía como UTC y la pantalla las mostraba 6 horas antes.
      ${comoInstanteSQL("sc.creado_en")} AS fecha_solicitud,
      ${comoInstanteSQL(salidaVueloSQL("v", "b"))} AS fecha_hora_vuelo,
      ${esEmergenciaSQL("sc", "v", "b")} AS es_emergencia,
      ${horasSQL(`${salidaVueloSQL("v", "b")} - sc.creado_en`)} AS horas_anticipacion,
      (${salidaVueloSQL("v", "b")} <= ${AHORA_SV}) AS ya_salio,
      a.codigo AS aeronave_codigo,
      u.nombre AS alumno_nombre,
      u.apellido AS alumno_apellido,
      sc.tiene_multa AS con_multa,
      -- Constancias que el alumno adjuntó. Con margen puede no haber ninguna;
      -- en una emergencia son requisito. Va como JSON para no multiplicar filas.
      ${adjuntosJSONSQL("sc")} AS adjuntos,
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
    ORDER BY ${orden}
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

    // ¿Era de emergencia? ¿El vuelo —o algún tramo de su ruta— ya salió?
    // Consulta aparte y SIN bloqueo, a propósito: sumar `vuelo` al FOR UPDATE de
    // arriba invertiría el orden de bloqueos frente a turnoMantenimientoController
    // (aeronave → vuelo) y abriría un deadlock (CLAUDE.md §27).
    const vueloRes = await client.query(`
      SELECT ${esEmergenciaSQL("sc", "v", "b")} AS es_emergencia,
             EXISTS (
               SELECT 1 FROM vuelo x
                WHERE (x.id_vuelo = v.id_vuelo OR (v.grupo_ruta IS NOT NULL AND x.grupo_ruta = v.grupo_ruta))
                  AND x.estado = ANY($2::text[])
             ) AS ya_en_curso
        FROM solicitud_cancelacion sc
        JOIN vuelo v ON v.id_vuelo = sc.id_vuelo
        JOIN bloque_horario b ON b.id_bloque = v.id_bloque
       WHERE sc.id_solicitud_cancelacion = $1
    `, [id, ESTADOS_YA_EN_CURSO]);
    const { es_emergencia: esEmergencia = false, ya_en_curso: yaEnCurso = false } = vueloRes.rows[0] || {};

    // Las solicitudes pueden llegar minutos antes de la salida y la lista solo
    // las vence al día siguiente, así que una puede seguir pendiente con el avión
    // ya afuera. Aceptarla pasaba a CANCELADO todo lo que no estuviera cancelado
    // o completado: un vuelo en curso incluido. Rechazarla sigue permitido.
    if (decision === 'ACEPTADA' && yaEnCurso) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Este vuelo ya salió o ya se completó: no se puede cancelar. Rechazá la solicitud." });
    }

    await client.query(`UPDATE solicitud_cancelacion SET estado = $1, resuelto_en = NOW(), resuelto_por = $2 WHERE id_solicitud_cancelacion = $3`, [decision, req.user.id_usuario, id]);
    
    if (decision === 'ACEPTADA') {
      // Rutas con parada: aceptar la cancelación de un tramo cancela TODA la
      // ruta (los demás tramos comparten grupo_ruta y no tienen sentido solos).
      await client.query(
        `UPDATE vuelo SET estado = 'CANCELADO', fecha_cancelacion = NOW(), tipo_cancelacion = $2
          WHERE (id_vuelo = $1
             OR grupo_ruta = (SELECT grupo_ruta FROM vuelo WHERE id_vuelo = $1 AND grupo_ruta IS NOT NULL))
            AND estado NOT IN ('CANCELADO','COMPLETADO')`,
        // El tipo ya lo saben mostrar el panel de vuelos cancelados y el reporte
        // de Turno; por esta vía quedaba en NULL.
        [solRes.rows[0].id_vuelo, esEmergencia ? "EMERGENCIA" : "NORMAL"]
      );
      // Lista de espera: ofrecer el cupo liberado al siguiente candidato (si hay
      // margen suficiente). NO se dispara en cierres de operaciones (esa ruta no
      // llama aquí). No debe abortar la cancelación si algo falla.
      try {
        await dispararOfertaPorCancelacion(client, solRes.rows[0].id_vuelo, req.app.get("io"));
      } catch (e) { console.error("[standby] disparo por cancelación:", e.message); }
    }

    await logAuditoria(client, { accion: "RESOLVER_SOLICITUD_CANCELACION", entidad: "solicitud_cancelacion", id_entidad: id, actor: req.user, req, descripcion: `Admin ${decision} solicitud` });

    await client.query("COMMIT");

    // Nunca se emitía: el badge de pendientes (AdminSidebar) y el auto-refresh
    // de la pantalla de Cancelaciones escuchan este evento desde que existen.
    const io = req.app.get("io");
    if (io) io.emit("solicitud_cancelacion_resuelta", { id_solicitud: Number(id), decision });

    res.json({ message: `Solicitud ${decision.toLowerCase()}` });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
