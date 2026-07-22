const db = require("../../config/db");
const { generarReciboPDF } = require("../../utils/pdfGenerator");

exports.list = async (req, res) => {
  try {
    const { id_alumno, desde, hasta } = req.query;
    const params = [];
    const where = [];
    if (id_alumno) { params.push(id_alumno); where.push(`r.id_alumno = $${params.length}`); }
    if (desde) { params.push(desde); where.push(`r.fecha >= $${params.length}`); }
    if (hasta) { params.push(hasta); where.push(`r.fecha <= $${params.length}`); }
    const result = await db.query(`
      SELECT r.*, u.username AS alumno_username,
             reg.username AS registrado_por_username
      FROM recibo_pago r
      LEFT JOIN alumno a ON a.id_alumno = r.id_alumno
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      LEFT JOIN usuario reg ON reg.id_usuario = r.registrado_por
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.fecha DESC, r.id DESC
      LIMIT 500
    `, params);
    res.json({ ok: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_alumno, monto_usd, metodo, referencia, descripcion, fecha, items } = req.body;

    // Detalle por ítems (opcional): si viene, el TOTAL del recibo se calcula
    // acá (cantidad × precio unitario por línea) — el monto del cliente se
    // ignora para que nunca difiera de la suma del detalle.
    let detalle = [];
    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        const desc = String(it?.descripcion ?? "").trim();
        const cant = Number(it?.cantidad);
        const precio = Number(it?.precio_unitario);
        if (!desc) return res.status(400).json({ ok: false, message: "Cada ítem necesita una descripción" });
        if (!isFinite(cant) || cant <= 0) return res.status(400).json({ ok: false, message: `Cantidad inválida en "${desc}"` });
        if (!isFinite(precio) || precio < 0) return res.status(400).json({ ok: false, message: `Precio unitario inválido en "${desc}"` });
        detalle.push({ descripcion: desc.slice(0, 300), cantidad: cant, precio_unitario: precio, subtotal: Math.round(cant * precio * 100) / 100 });
      }
    }
    const montoFinal = detalle.length
      ? Math.round(detalle.reduce((s, d) => s + d.subtotal, 0) * 100) / 100
      : Number(monto_usd);

    if (!id_alumno || !montoFinal || montoFinal <= 0 || !metodo) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }
    await client.query("BEGIN");
    const corr = await client.query(`SELECT nextval('recibo_correlativo_seq') AS n`);
    const numero = corr.rows[0].n;

    const recibo = await client.query(`
      INSERT INTO recibo_pago (numero_correlativo, id_alumno, fecha, monto_usd, metodo, referencia, descripcion, registrado_por)
      VALUES ($1, $2, COALESCE($3, NOW()), $4, $5, $6, $7, $8) RETURNING *
    `, [numero, id_alumno, fecha || null, montoFinal, metodo, referencia || null, descripcion || null, req.user?.id_usuario || null]);

    for (const d of detalle) {
      await client.query(`
        INSERT INTO recibo_detalle (id_recibo, descripcion, cantidad, precio_unitario, subtotal)
        VALUES ($1, $2, $3, $4, $5)
      `, [recibo.rows[0].id, d.descripcion, d.cantidad, d.precio_unitario, d.subtotal]);
    }

    // Asegurar fila de cuenta
    let cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    if (cuenta.rows.length === 0) {
      await client.query(`INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd) VALUES ($1, 0)`, [id_alumno]);
      cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    }
    const nuevo_saldo = Number(cuenta.rows[0].saldo_actual_usd) + montoFinal;
    await client.query(`UPDATE cuenta_corriente_alumno SET saldo_actual_usd = $2, ultimo_movimiento_en = NOW() WHERE id_alumno = $1`, [id_alumno, nuevo_saldo]);

    await client.query(`
      INSERT INTO movimiento_cuenta (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, id_recibo, registrado_por)
      VALUES ($1, 'DEPOSITO', $2, $3, $4, $5, $6)
    `, [id_alumno, `Depósito - Recibo #${numero} (${metodo})`, montoFinal, nuevo_saldo, recibo.rows[0].id, req.user?.id_usuario || null]);

    await client.query("COMMIT");

    // Socket.IO refresh
    const io = req.app.get("io");
    if (io) io.emit("cuenta_alumno_movimiento", { id_alumno, saldo: nuevo_saldo });

    res.json({ ok: true, data: recibo.rows[0], saldo: nuevo_saldo });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.anular = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ ok: false, message: "Motivo requerido" });

    await client.query("BEGIN");
    const r = await client.query(`SELECT * FROM recibo_pago WHERE id = $1 AND anulado = FALSE FOR UPDATE`, [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, message: "Recibo no encontrado o ya anulado" });
    const recibo = r.rows[0];

    await client.query(`UPDATE recibo_pago SET anulado = TRUE, motivo_anulacion = $2 WHERE id = $1`, [id, motivo]);

    const cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [recibo.id_alumno]);
    const nuevo_saldo = Number(cuenta.rows[0].saldo_actual_usd) - Number(recibo.monto_usd);
    await client.query(`UPDATE cuenta_corriente_alumno SET saldo_actual_usd = $2, ultimo_movimiento_en = NOW() WHERE id_alumno = $1`, [recibo.id_alumno, nuevo_saldo]);

    await client.query(`
      INSERT INTO movimiento_cuenta (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, id_recibo, registrado_por)
      VALUES ($1, 'ANULACION', $2, $3, $4, $5, $6)
    `, [recibo.id_alumno, `Anulación recibo #${recibo.numero_correlativo}: ${motivo}`,
        -Number(recibo.monto_usd), nuevo_saldo, recibo.id, req.user?.id_usuario || null]);

    await client.query("COMMIT");
    res.json({ ok: true, saldo: nuevo_saldo });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.pdf = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query(`
      SELECT r.*, u.username AS alumno_username, u.correo AS alumno_correo
      FROM recibo_pago r
      LEFT JOIN alumno a ON a.id_alumno = r.id_alumno
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      WHERE r.id = $1
    `, [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, message: "Recibo no encontrado" });
    const recibo = r.rows[0];

    // Detalle por ítems (si el recibo se emitió detallado).
    const det = await db.query(`
      SELECT descripcion, cantidad, precio_unitario, subtotal
      FROM recibo_detalle WHERE id_recibo = $1 ORDER BY id
    `, [id]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="recibo-${recibo.numero_correlativo}.pdf"`);
    const pdf = generarReciboPDF({ recibo, alumno: { username: recibo.alumno_username, correo: recibo.alumno_correo }, items: det.rows });
    pdf.pipe(res);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
