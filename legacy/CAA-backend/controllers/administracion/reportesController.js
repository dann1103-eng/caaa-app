const db = require("../../config/db");

exports.ingresos = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const params = [];
    let where = '';
    if (desde) { params.push(desde); where += ` AND fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta); where += ` AND fecha <= $${params.length}`; }
    const r = await db.query(`
      SELECT date_trunc('month', fecha) AS mes,
             SUM(monto_usd) AS total,
             COUNT(*) AS num_recibos
      FROM recibo_pago
      WHERE anulado = FALSE ${where}
      GROUP BY date_trunc('month', fecha)
      ORDER BY mes DESC
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.egresos = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const params = [];
    let where = '';
    if (desde) { params.push(desde); where += ` AND fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta); where += ` AND fecha <= $${params.length}`; }
    const r = await db.query(`
      SELECT categoria, SUM(monto_usd) AS total, COUNT(*) AS num
      FROM egreso
      WHERE 1=1 ${where}
      GROUP BY categoria
      ORDER BY total DESC
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.pyl = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const params = [desde || '2026-01-01', hasta || new Date().toISOString().slice(0,10)];
    const r = await db.query(`
      SELECT
        (SELECT COALESCE(SUM(monto_usd),0) FROM recibo_pago WHERE anulado=FALSE AND fecha BETWEEN $1::date AND $2::date) AS ingresos,
        (SELECT COALESCE(SUM(monto_usd),0) FROM egreso WHERE fecha BETWEEN $1::date AND $2::date) AS egresos,
        (SELECT COALESCE(SUM(total_usd),0) FROM factura WHERE estado='EMITIDA' AND fecha_emision BETWEEN $1::date AND $2::date) AS facturado
    `, params);
    const row = r.rows[0];
    row.margen = Number(row.ingresos) - Number(row.egresos);
    res.json({ ok: true, data: row });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.morosos = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT a.id_alumno, u.username, COALESCE(c.saldo_actual_usd, 0) AS saldo
      FROM alumno a
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      LEFT JOIN cuenta_corriente_alumno c ON c.id_alumno = a.id_alumno
      WHERE COALESCE(c.saldo_actual_usd, 0) < 200
      ORDER BY c.saldo_actual_usd ASC NULLS FIRST
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.kpisDashboard = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        (SELECT COALESCE(SUM(monto_usd),0) FROM recibo_pago WHERE anulado=FALSE AND fecha >= date_trunc('month', CURRENT_DATE)) AS ingresos_mes,
        (SELECT COALESCE(SUM(monto_usd),0) FROM egreso WHERE fecha >= date_trunc('month', CURRENT_DATE)) AS egresos_mes,
        (SELECT COUNT(*) FROM alumno a LEFT JOIN cuenta_corriente_alumno c ON c.id_alumno = a.id_alumno WHERE COALESCE(c.saldo_actual_usd,0) < 200) AS alumnos_saldo_bajo,
        (SELECT COALESCE(SUM(saldo_actual_usd),0) FROM cuenta_corriente_alumno) AS saldo_total_alumnos,
        (SELECT COUNT(*) FROM factura WHERE estado='EMITIDA' AND fecha_emision >= date_trunc('month', CURRENT_DATE)) AS facturas_mes,
        (SELECT COUNT(*) FROM recibo_pago WHERE anulado=FALSE AND fecha >= date_trunc('month', CURRENT_DATE)) AS recibos_mes
    `);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
