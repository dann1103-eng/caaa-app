const db = require("../../config/db");

exports.listPeriodos = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT p.*,
             (SELECT COALESCE(SUM(total),0) FROM nomina_detalle d WHERE d.id_periodo = p.id) AS total_periodo,
             (SELECT COUNT(*) FROM nomina_detalle d WHERE d.id_periodo = p.id) AS instructores_count
      FROM nomina_periodo p
      ORDER BY p.periodo_inicio DESC
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.detallesPeriodo = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query(`
      SELECT d.*, u.username AS instructor_username
      FROM nomina_detalle d
      LEFT JOIN instructor i ON i.id_instructor = d.id_instructor
      LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
      WHERE d.id_periodo = $1
      ORDER BY u.username
    `, [id]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Calcula nómina para todos los instructores que tienen tarifa vigente.
 *
 * Comportamiento por tipo_pago:
 *  - MENSUAL_FIJO: subtotal = salario_mensual_fijo. Las horas se registran
 *    como referencia pero no afectan el monto base.
 *  - POR_HORA:     subtotal = horas_vuelo × tarifa_hora_vuelo
 *                          + horas_teoricas × tarifa_hora_teoria.
 *  - MIXTO:        subtotal = salario + (horas extras × tarifa correspondiente).
 *
 * Las horas voladas se obtienen de los vuelos COMPLETADOS en el periodo.
 * Las horas teóricas inician en 0 — se ingresan manualmente editando el detalle.
 */
exports.calcular = async (req, res) => {
  const client = await db.connect();
  try {
    const { periodo_inicio, periodo_fin } = req.body;
    if (!periodo_inicio || !periodo_fin) {
      return res.status(400).json({ ok: false, message: "Periodo requerido" });
    }

    await client.query("BEGIN");

    const p = await client.query(`
      INSERT INTO nomina_periodo (periodo_inicio, periodo_fin, estado, creado_por)
      VALUES ($1, $2, 'BORRADOR', $3) RETURNING *
    `, [periodo_inicio, periodo_fin, req.user?.id_usuario || null]);
    const id_periodo = p.rows[0].id;

    // Todos los instructores con tarifa vigente al final del periodo
    const instructoresRes = await client.query(`
      SELECT i.id_instructor,
             it.tipo_pago,
             it.salario_mensual_fijo,
             it.tarifa_hora_vuelo,
             it.tarifa_hora_teoria
      FROM instructor i
      LEFT JOIN LATERAL (
        SELECT tipo_pago, salario_mensual_fijo, tarifa_hora_vuelo, tarifa_hora_teoria
        FROM instructor_tarifa
        WHERE id_instructor = i.id_instructor
          AND vigente_desde <= $1::date
          AND (vigente_hasta IS NULL OR vigente_hasta >= $1::date)
        ORDER BY vigente_desde DESC LIMIT 1
      ) it ON TRUE
      WHERE it.tipo_pago IS NOT NULL
    `, [periodo_fin]);

    // Sumar horas voladas reales por instructor en el periodo
    const horasRes = await client.query(`
      SELECT v.id_instructor,
             COALESCE(SUM(rv.tacometro_llegada - rv.tacometro_salida), 0) AS horas
      FROM vuelo v
      LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      WHERE v.estado = 'COMPLETADO'
        AND v.fecha BETWEEN $1::date AND $2::date
        AND v.id_instructor IS NOT NULL
      GROUP BY v.id_instructor
    `, [periodo_inicio, periodo_fin]);

    const horasPorInstructor = new Map(
      horasRes.rows.map(r => [Number(r.id_instructor), Number(r.horas || 0)])
    );

    for (const inst of instructoresRes.rows) {
      const id_inst   = Number(inst.id_instructor);
      const tipo_pago = inst.tipo_pago || 'POR_HORA';
      const salMens   = Number(inst.salario_mensual_fijo || 0);
      const tarVuelo  = Number(inst.tarifa_hora_vuelo || 0);
      const tarTeoria = Number(inst.tarifa_hora_teoria || 0);

      const horasVuelo = horasPorInstructor.get(id_inst) || 0;
      const horasTeoria = 0; // se ingresan manualmente luego editando el detalle

      let monto_vuelo = 0, monto_teorico = 0, salario_mensual = 0;
      if (tipo_pago === 'MENSUAL_FIJO') {
        salario_mensual = salMens;
      } else if (tipo_pago === 'POR_HORA') {
        monto_vuelo   = +(horasVuelo * tarVuelo).toFixed(2);
        monto_teorico = +(horasTeoria * tarTeoria).toFixed(2);
      } else {
        // MIXTO
        salario_mensual = salMens;
        monto_vuelo   = +(horasVuelo * tarVuelo).toFixed(2);
        monto_teorico = +(horasTeoria * tarTeoria).toFixed(2);
      }

      const subtotal = +(monto_vuelo + monto_teorico + salario_mensual).toFixed(2);
      const total = subtotal;

      const det = await client.query(`
        INSERT INTO nomina_detalle
          (id_periodo, id_instructor, tipo_pago,
           horas_voladas, tarifa_hora, monto_vuelo,
           horas_teoricas, tarifa_hora_teoria, monto_teorico,
           salario_mensual, subtotal, total)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        RETURNING id
      `, [id_periodo, id_inst, tipo_pago,
          horasVuelo, tarVuelo, monto_vuelo,
          horasTeoria, tarTeoria, monto_teorico,
          salario_mensual, subtotal]);

      // Trazabilidad por vuelo (solo si tiene tarifa por hora de vuelo)
      if (tarVuelo > 0 && horasVuelo > 0) {
        await client.query(`
          INSERT INTO nomina_detalle_vuelo (id_nomina_detalle, id_vuelo, horas, monto)
          SELECT $1, v.id_vuelo,
                 COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0),
                 COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0) * $2
          FROM vuelo v
          LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
          WHERE v.estado = 'COMPLETADO'
            AND v.fecha BETWEEN $3::date AND $4::date
            AND v.id_instructor = $5
        `, [det.rows[0].id, tarVuelo, periodo_inicio, periodo_fin, id_inst]);
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, data: p.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

/**
 * Editar un detalle de nómina (ajustar horas teóricas, bonos, descuentos,
 * o sobrescribir cualquier campo). Recalcula total.
 */
exports.editarDetalle = async (req, res) => {
  const client = await db.connect();
  try {
    const { idDet } = req.params;
    const {
      horas_teoricas, tarifa_hora_teoria,
      horas_voladas, tarifa_hora,
      salario_mensual,
      bonos, descuentos,
      observaciones
    } = req.body;

    await client.query("BEGIN");

    const cur = await client.query(`SELECT * FROM nomina_detalle WHERE id = $1 FOR UPDATE`, [idDet]);
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Detalle no encontrado" });
    }
    const d = cur.rows[0];

    // Verificar que el periodo aún sea editable
    const per = await client.query(`SELECT estado FROM nomina_periodo WHERE id = $1`, [d.id_periodo]);
    if (per.rows[0]?.estado === 'PAGADA') {
      await client.query("ROLLBACK");
      return res.status(403).json({ ok: false, message: "No se puede editar una nómina ya pagada" });
    }

    const ht  = horas_teoricas       != null ? Number(horas_teoricas)       : Number(d.horas_teoricas);
    const tht = tarifa_hora_teoria   != null ? Number(tarifa_hora_teoria)   : Number(d.tarifa_hora_teoria);
    const hv  = horas_voladas        != null ? Number(horas_voladas)        : Number(d.horas_voladas);
    const thv = tarifa_hora          != null ? Number(tarifa_hora)          : Number(d.tarifa_hora);
    const sm  = salario_mensual      != null ? Number(salario_mensual)      : Number(d.salario_mensual);
    const bn  = bonos                != null ? Number(bonos)                : Number(d.bonos);
    const ds  = descuentos           != null ? Number(descuentos)           : Number(d.descuentos);

    const monto_vuelo   = +(hv * thv).toFixed(2);
    const monto_teorico = +(ht * tht).toFixed(2);
    const subtotal      = +(monto_vuelo + monto_teorico + sm).toFixed(2);
    const total         = +(subtotal + bn - ds).toFixed(2);

    await client.query(`
      UPDATE nomina_detalle SET
        horas_teoricas      = $2,
        tarifa_hora_teoria  = $3,
        monto_teorico       = $4,
        horas_voladas       = $5,
        tarifa_hora         = $6,
        monto_vuelo         = $7,
        salario_mensual     = $8,
        bonos               = $9,
        descuentos          = $10,
        subtotal            = $11,
        total               = $12,
        observaciones       = COALESCE($13, observaciones)
      WHERE id = $1
    `, [idDet, ht, tht, monto_teorico, hv, thv, monto_vuelo, sm, bn, ds, subtotal, total, observaciones || null]);

    await client.query("COMMIT");
    res.json({ ok: true, data: { id: idDet, monto_vuelo, monto_teorico, subtotal, total } });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.aprobar = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query(`
      UPDATE nomina_periodo SET estado = 'APROBADA', aprobado_por = $2
      WHERE id = $1 AND estado = 'BORRADOR' RETURNING *
    `, [id, req.user?.id_usuario || null]);
    if (r.rows.length === 0) {
      return res.status(400).json({ ok: false, message: "Sólo se pueden aprobar nóminas BORRADOR" });
    }
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.pagar = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");
    const p = await client.query(`
      UPDATE nomina_periodo SET estado = 'PAGADA', fecha_pago = CURRENT_DATE
      WHERE id = $1 AND estado = 'APROBADA' RETURNING *
    `, [id]);
    if (p.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "Sólo se pueden pagar nóminas APROBADAS" });
    }
    const total = await client.query(`SELECT COALESCE(SUM(total),0) AS t FROM nomina_detalle WHERE id_periodo = $1`, [id]);
    await client.query(`
      INSERT INTO egreso (categoria, concepto, monto_usd, fecha, id_nomina, registrado_por)
      VALUES ('NOMINA', $1, $2, CURRENT_DATE, $3, $4)
    `, [`Nómina ${p.rows[0].periodo_inicio} a ${p.rows[0].periodo_fin}`, total.rows[0].t, id, req.user?.id_usuario || null]);
    await client.query("COMMIT");
    res.json({ ok: true, data: p.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
