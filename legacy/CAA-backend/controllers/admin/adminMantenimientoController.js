const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const transporter = require("../../utils/mailer");
const { sincronizarEstadoFlota } = require("../../utils/mantenimientoUtils");

exports.getMantenimientoAeronaves = catchAsync(async (req, res) => {
  const aeronavesRes = await db.query(`
    SELECT a.*, (a.horas_proxima_revision - a.horas_acumuladas) AS horas_restantes,
    EXISTS(SELECT 1 FROM mantenimiento_aeronave m WHERE m.id_aeronave = a.id_aeronave AND m.estado = 'PENDIENTE' AND m.completado = false) AS requiere_mantenimiento
    FROM aeronave a WHERE a.activa = true ORDER BY a.codigo
  `);
  const mantenimientosRes = await db.query(`
    SELECT m.*, a.codigo AS aeronave_codigo FROM mantenimiento_aeronave m
    JOIN aeronave a ON a.id_aeronave = m.id_aeronave
    ORDER BY m.completado ASC, m.fecha_programada DESC
  `);
  res.json({ aeronaves: aeronavesRes.rows, mantenimientos: mantenimientosRes.rows });
});

exports.getMantenimientoDetalle = catchAsync(async (req, res) => {
  const { id } = req.params;
  const mantRes = await db.query(`SELECT m.*, a.codigo AS aeronave_codigo FROM mantenimiento_aeronave m JOIN aeronave a ON a.id_aeronave = m.id_aeronave WHERE m.id_mantenimiento = $1`, [id]);
  if (mantRes.rows.length === 0) return res.status(404).json({ message: "Mantenimiento no encontrado" });
  const blocksRes = await db.query(`SELECT fecha, id_bloque FROM mantenimiento_bloque WHERE id_mantenimiento = $1`, [id]);
  res.json({ ...mantRes.rows[0], bloques: blocksRes.rows });
});

exports.iniciarMantenimiento = catchAsync(async (req, res) => {
  const { id } = req.params; // id_aeronave
  const { tipo, descripcion, fecha_inicio, fecha_fin, horas_estimadas, bloques } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const aeronaveRes = await client.query(`SELECT id_aeronave, codigo FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`, [id]);
    if (aeronaveRes.rows.length === 0) throw new Error("Aeronave no encontrada");

    const mantRes = await client.query(`
      INSERT INTO mantenimiento_aeronave (id_aeronave, tipo, descripcion, fecha_inicio, fecha_fin, horas_estimadas, estado, completado, fecha_programada)
      VALUES ($1, $2, $3, $4, $5, $6, 'EN_CURSO', false, $7) RETURNING id_mantenimiento
    `, [id, tipo, descripcion, fecha_inicio, fecha_fin, horas_estimadas, fecha_inicio || new Date()]);
    
    const id_mantenimiento = mantRes.rows[0].id_mantenimiento;

    if (Array.isArray(bloques)) {
      for (const b of bloques) {
        await client.query(`INSERT INTO mantenimiento_bloque (id_mantenimiento, fecha, id_bloque) VALUES ($1, $2, $3)`, [id_mantenimiento, b.fecha, b.id_bloque]);
      }
    }

    // El avión sale de servicio SOLO si el mantenimiento cubre hoy (fecha_inicio
    // <= hoy). Un mantenimiento con fecha futura queda registrado pero el avión
    // sigue volable hasta que llegue su ventana (lo hace el job diario).
    await sincronizarEstadoFlota(client, Number(id));
    await logAuditoria(client, { accion: "OTRO", entidad: "aeronave", id_entidad: Number(id), actor: req.user, req, descripcion: `Programado mantenimiento ${tipo} para aeronave ${aeronaveRes.rows[0].codigo}` });

    await client.query("COMMIT");
    res.json({ message: "Mantenimiento registrado", id_mantenimiento });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.completarMantenimiento = catchAsync(async (req, res) => {
  const { id } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const mantRes = await client.query(`SELECT id_mantenimiento, tipo FROM mantenimiento_aeronave WHERE id_aeronave = $1 AND estado = 'EN_CURSO' LIMIT 1 FOR UPDATE`, [id]);
    if (mantRes.rows.length === 0) throw new Error("No hay mantenimiento en curso");

    await client.query(`UPDATE mantenimiento_aeronave SET estado = 'COMPLETADO', completado = true, fecha_completado = NOW() WHERE id_mantenimiento = $1`, [mantRes.rows[0].id_mantenimiento]);
    // Reactiva el avión solo si ya no le queda otro mantenimiento vigente hoy.
    await sincronizarEstadoFlota(client, Number(id));

    await client.query("COMMIT");
    res.json({ message: "Mantenimiento completado" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// Elimina un mantenimiento (p.ej. metido por error): borra el registro y sus
// bloques, y recalcula el estado del avión (lo reactiva si ya no le queda
// ningún mantenimiento vigente hoy).
exports.cancelarMantenimiento = catchAsync(async (req, res) => {
  const { id } = req.params; // id_mantenimiento
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const mantRes = await client.query(
      `SELECT m.id_mantenimiento, m.id_aeronave, m.tipo, a.codigo
         FROM mantenimiento_aeronave m JOIN aeronave a ON a.id_aeronave = m.id_aeronave
        WHERE m.id_mantenimiento = $1 FOR UPDATE`,
      [id]
    );
    if (mantRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Mantenimiento no encontrado" });
    }
    const { id_aeronave, tipo, codigo } = mantRes.rows[0];

    await client.query(`DELETE FROM mantenimiento_bloque WHERE id_mantenimiento = $1`, [id]);
    await client.query(`DELETE FROM mantenimiento_aeronave WHERE id_mantenimiento = $1`, [id]);

    // Recalcular estado del avión tras quitar el mantenimiento.
    await sincronizarEstadoFlota(client, Number(id_aeronave));

    await logAuditoria(client, {
      accion: "OTRO", entidad: "aeronave", id_entidad: Number(id_aeronave), actor: req.user, req,
      descripcion: `Eliminado mantenimiento ${tipo} (id ${id}) de aeronave ${codigo}`,
    });

    await client.query("COMMIT");
    res.json({ message: "Mantenimiento eliminado" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// Agrega días/bloques a un mantenimiento existente (modal "Gestionar"). Además
// de guardar los bloques, EXTIENDE la ventana [fecha_inicio, fecha_fin] del
// mantenimiento para cubrir los nuevos días — así el bloqueo del agendamiento
// (que es por rango de fechas) realmente los toma en cuenta. Luego recalcula el
// estado del avión (por si la extensión ya cubre hoy).
exports.agregarBloquesMantenimiento = catchAsync(async (req, res) => {
  const { id } = req.params; // id_aeronave
  const { id_mantenimiento, bloques } = req.body;
  if (!id_mantenimiento || !Array.isArray(bloques) || bloques.length === 0) {
    return res.status(400).json({ message: "id_mantenimiento y bloques son requeridos" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const mantRes = await client.query(
      `SELECT id_mantenimiento, id_aeronave FROM mantenimiento_aeronave
        WHERE id_mantenimiento = $1 AND id_aeronave = $2 FOR UPDATE`,
      [id_mantenimiento, id]
    );
    if (mantRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Mantenimiento no encontrado para esa aeronave" });
    }

    const fechas = [];
    for (const b of bloques) {
      await client.query(
        `INSERT INTO mantenimiento_bloque (id_mantenimiento, fecha, id_bloque) VALUES ($1, $2, $3)`,
        [id_mantenimiento, b.fecha, b.id_bloque]
      );
      if (b.fecha) fechas.push(b.fecha);
    }

    // Extiende la ventana del mantenimiento para cubrir los días agregados.
    if (fechas.length > 0) {
      const minFecha = fechas.reduce((a, b) => (a < b ? a : b));
      const maxFecha = fechas.reduce((a, b) => (a > b ? a : b));
      await client.query(
        `UPDATE mantenimiento_aeronave SET
           fecha_inicio = LEAST(COALESCE(fecha_inicio::date, fecha_programada), $2::date),
           fecha_fin    = GREATEST(COALESCE(fecha_fin::date, fecha_inicio::date, fecha_programada), $3::date)
         WHERE id_mantenimiento = $1`,
        [id_mantenimiento, minFecha, maxFecha]
      );
    }

    await sincronizarEstadoFlota(client, Number(id));
    await logAuditoria(client, {
      accion: "OTRO", entidad: "aeronave", id_entidad: Number(id), actor: req.user, req,
      descripcion: `Agregados ${bloques.length} bloque(s) al mantenimiento ${id_mantenimiento}`,
    });
    await client.query("COMMIT");
    res.json({ message: "Bloques agregados" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.getAlertasMantenimiento = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT id_aeronave, codigo, modelo, tipo,
           horas_acumuladas, horas_proxima_revision, tipo_proxima_revision,
           (horas_proxima_revision - horas_acumuladas) AS horas_restantes
    FROM aeronave
    WHERE activa = true
      AND tipo != 'SIMULADOR'
      AND horas_acumuladas >= horas_proxima_revision - 5
    ORDER BY (horas_proxima_revision - horas_acumuladas) ASC
  `);
  res.json(result.rows);
});

exports.previewMantenimiento = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { tipo, fecha_inicio, fecha_fin, bloques } = req.body;
  let queryVuelos = "";
  let paramsVuelos = [id];

  if (tipo === "PREVENTIVO" && Array.isArray(bloques) && bloques.length > 0) {
    const conditions = bloques.map((_, i) => `(v.fecha_vuelo = $${i*2 + 2} AND v.id_bloque = $${i*2 + 3})`).join(" OR ");
    queryVuelos = `SELECT v.id_vuelo, v.fecha_vuelo, bh.hora_inicio, u.nombre || ' ' || u.apellido AS alumno
                   FROM vuelo v JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
                   JOIN alumno al ON al.id_alumno = v.id_alumno
                   JOIN usuario u ON u.id_usuario = al.id_usuario
                   WHERE v.id_aeronave = $1 AND v.estado IN ('PUBLICADO', 'SOLICITADO') AND (${conditions})`;
    bloques.forEach(b => { paramsVuelos.push(b.fecha); paramsVuelos.push(b.id_bloque); });
  } else {
    queryVuelos = `SELECT v.id_vuelo, v.fecha_vuelo, bh.hora_inicio, u.nombre || ' ' || u.apellido AS alumno
                   FROM vuelo v JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
                   JOIN alumno al ON al.id_alumno = v.id_alumno
                   JOIN usuario u ON u.id_usuario = al.id_usuario
                   WHERE v.id_aeronave = $1 AND v.estado IN ('PUBLICADO', 'SOLICITADO') AND v.fecha_vuelo BETWEEN $2 AND $3`;
    paramsVuelos.push(fecha_inicio, fecha_fin);
  }

  const vuelosRes = await db.query(queryVuelos, paramsVuelos);
  res.json(vuelosRes.rows);
});

