const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");

const MOTIVOS = ["TRASLADO", "PRUEBA", "ADMINISTRATIVO", "OTRO"];

// Lista las reservas de una semana (para pintarlas en el calendario). Devuelve
// dia_semana (1=Lun..6=Sab) calculado desde la fecha y el lunes de la semana.
exports.listarReservas = catchAsync(async (req, res) => {
  const { id_semana } = req.query;
  if (!id_semana) return res.json([]);
  const r = await db.query(
    `SELECT rv.id, rv.id_aeronave, a.codigo AS aeronave_codigo, rv.fecha,
            (EXTRACT(ISODOW FROM rv.fecha))::int AS dia_semana,
            rv.id_bloque, rv.id_bloque_fin, rv.motivo, rv.descripcion,
            b1.hora_inicio, COALESCE(b2.hora_fin, b1.hora_fin) AS hora_fin
       FROM reserva_aeronave rv
       JOIN aeronave a ON a.id_aeronave = rv.id_aeronave
       JOIN bloque_horario b1 ON b1.id_bloque = rv.id_bloque
       LEFT JOIN bloque_horario b2 ON b2.id_bloque = rv.id_bloque_fin
       JOIN semana_vuelo sw ON sw.id_semana = $1
      WHERE rv.fecha BETWEEN sw.fecha_inicio AND sw.fecha_fin
      ORDER BY rv.fecha, b1.hora_inicio`,
    [id_semana]
  );
  res.json(r.rows);
});

// Crea una reserva de uso especial (sin alumno). Rechaza si el slot ya está
// ocupado por un vuelo no cancelado o por otra reserva.
exports.crearReserva = catchAsync(async (req, res) => {
  const { id_aeronave, id_bloque, id_bloque_fin, motivo, descripcion, id_semana, dia_semana } = req.body;
  let { fecha } = req.body;
  if (!id_aeronave || !id_bloque) {
    return res.status(400).json({ message: "Aeronave y bloque son requeridos" });
  }
  const motivoFinal = MOTIVOS.includes(motivo) ? motivo : "OTRO";
  const fin = Number(id_bloque_fin || id_bloque);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Si no viene una fecha explícita, se deriva de la semana + día (lo que
    // manda el modal del calendario).
    if (!fecha) {
      if (!id_semana || !dia_semana) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Falta fecha (o semana + día)" });
      }
      const fRes = await client.query(
        `SELECT (fecha_inicio + ($2::int - 1))::date AS fecha FROM semana_vuelo WHERE id_semana = $1`,
        [id_semana, dia_semana]
      );
      if (fRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Semana no encontrada" });
      }
      fecha = fRes.rows[0].fecha;
    }

    // Conflicto con un vuelo real (no cancelado) en ese avión/fecha/rango.
    const vueloOcup = await client.query(
      `SELECT 1 FROM vuelo v
        WHERE v.id_aeronave = $1 AND v.fecha_vuelo = $2 AND v.estado <> 'CANCELADO'
          AND NOT ($4 < v.id_bloque OR $3 > COALESCE(v.id_bloque_fin, v.id_bloque))
        LIMIT 1`,
      [id_aeronave, fecha, id_bloque, fin]
    );
    if (vueloOcup.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ese avión ya tiene un vuelo en ese horario" });
    }

    // Conflicto con otra reserva.
    const resOcup = await client.query(
      `SELECT 1 FROM reserva_aeronave rv
        WHERE rv.id_aeronave = $1 AND rv.fecha = $2
          AND NOT ($4 < rv.id_bloque OR $3 > COALESCE(rv.id_bloque_fin, rv.id_bloque))
        LIMIT 1`,
      [id_aeronave, fecha, id_bloque, fin]
    );
    if (resOcup.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ese avión ya está reservado en ese horario" });
    }

    const ins = await client.query(
      `INSERT INTO reserva_aeronave (id_aeronave, fecha, id_bloque, id_bloque_fin, motivo, descripcion, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [id_aeronave, fecha, id_bloque, id_bloque_fin || null, motivoFinal, descripcion || null, req.user?.id_usuario || null]
    );
    await logAuditoria(client, {
      accion: "OTRO", entidad: "aeronave", id_entidad: Number(id_aeronave), actor: req.user, req,
      descripcion: `Reserva de aeronave (${motivoFinal}) el ${fecha}`,
    });
    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "reserva" });

    res.json({ message: "Reserva creada", id: ins.rows[0].id });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.eliminarReserva = catchAsync(async (req, res) => {
  const { id } = req.params;
  const r = await db.query(`DELETE FROM reserva_aeronave WHERE id = $1 RETURNING id_aeronave`, [id]);
  if (r.rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
  await logAuditoria(db, {
    accion: "OTRO", entidad: "aeronave", id_entidad: r.rows[0].id_aeronave, actor: req.user, req,
    descripcion: `Eliminada reserva de aeronave (id ${id})`,
  });
  const io = req.app.get("io");
  if (io) io.emit("guardar_cambios", { origen: "reserva" });
  res.json({ message: "Reserva eliminada" });
});
