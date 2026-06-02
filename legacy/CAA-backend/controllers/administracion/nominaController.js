const db = require("../../config/db");
const { calcularDeduccionesPlanta, retencionServicios } = require("../../utils/deducciones");

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
      SELECT d.*,
             COALESCE(u.username, e.nombre) AS instructor_username,
             e.cargo AS empleado_cargo
      FROM nomina_detalle d
      LEFT JOIN instructor i ON i.id_instructor = d.id_instructor
      LEFT JOIN usuario u    ON u.id_usuario    = i.id_usuario
      LEFT JOIN empleado e   ON e.id            = d.id_empleado
      WHERE d.id_periodo = $1
      ORDER BY COALESCE(u.username, e.nombre)
    `, [id]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Calcula una planilla del periodo. El tipo determina las deducciones:
 *
 *  - tipo_planilla = 'SERVICIOS' (profesionales): retención del 10% sobre el bruto.
 *      · Instructores con es_servicios_profesionales = true: bruto = horas voladas ×
 *        tarifa de vuelo + pagos de teoría por curso aprobado pendientes.
 *      · Empleados con es_servicios_profesionales = true: bruto = sueldo_base (editable).
 *
 *  - tipo_planilla = 'PLANTA' (mensual fijo): ISR (por tramos) + ISSS + AFP.
 *      · Instructores con es_servicios_profesionales = false: bruto = salario mensual fijo.
 *      · Empleados con es_servicios_profesionales = false: bruto = sueldo_base.
 *
 * Las horas voladas se obtienen de los vuelos COMPLETADOS del periodo.
 */
exports.calcular = async (req, res) => {
  const client = await db.connect();
  try {
    const { periodo_inicio, periodo_fin } = req.body;
    const tipo_planilla = (req.body.tipo_planilla || 'SERVICIOS').toUpperCase();
    if (!periodo_inicio || !periodo_fin) {
      return res.status(400).json({ ok: false, message: "Periodo requerido" });
    }
    if (!['PLANTA', 'SERVICIOS'].includes(tipo_planilla)) {
      return res.status(400).json({ ok: false, message: "tipo_planilla inválido" });
    }

    await client.query("BEGIN");

    const p = await client.query(`
      INSERT INTO nomina_periodo (periodo_inicio, periodo_fin, estado, tipo_planilla, creado_por)
      VALUES ($1, $2, 'BORRADOR', $3, $4) RETURNING *
    `, [periodo_inicio, periodo_fin, tipo_planilla, req.user?.id_usuario || null]);
    const id_periodo = p.rows[0].id;

    const esServicios = tipo_planilla === 'SERVICIOS';

    // Instructores con tarifa vigente al final del periodo cuyo flag coincide con la planilla.
    const instructoresRes = await client.query(`
      SELECT i.id_instructor,
             it.tipo_pago,
             it.salario_mensual_fijo,
             it.tarifa_hora_vuelo,
             it.tarifa_hora_teoria
      FROM instructor i
      JOIN LATERAL (
        SELECT tipo_pago, salario_mensual_fijo, tarifa_hora_vuelo, tarifa_hora_teoria,
               es_servicios_profesionales
        FROM instructor_tarifa
        WHERE id_instructor = i.id_instructor
          AND vigente_desde <= $1::date
          AND (vigente_hasta IS NULL OR vigente_hasta >= $1::date)
        ORDER BY vigente_desde DESC LIMIT 1
      ) it ON TRUE
      WHERE it.es_servicios_profesionales = $2
    `, [periodo_fin, esServicios]);

    // Empleados (personal administrativo) cuyo flag coincide con la planilla.
    const empleadosRes = await client.query(`
      SELECT id AS id_empleado, nombre, sueldo_base
      FROM empleado
      WHERE activo = TRUE AND es_servicios_profesionales = $1
    `, [esServicios]);

    // Horas voladas reales por instructor en el periodo (sólo relevante para servicios).
    const horasRes = await client.query(`
      SELECT v.id_instructor,
             COALESCE(SUM(rv.tacometro_llegada - rv.tacometro_salida), 0) AS horas
      FROM vuelo v
      LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      WHERE v.estado = 'COMPLETADO'
        AND v.fecha_vuelo BETWEEN $1::date AND $2::date
        AND v.id_instructor IS NOT NULL
      GROUP BY v.id_instructor
    `, [periodo_inicio, periodo_fin]);
    const horasPorInstructor = new Map(
      horasRes.rows.map(r => [Number(r.id_instructor), Number(r.horas || 0)])
    );

    // ── Instructores ────────────────────────────────────────────────────
    for (const inst of instructoresRes.rows) {
      const id_inst   = Number(inst.id_instructor);
      const tipo_pago = inst.tipo_pago || 'POR_HORA';
      const salMens   = Number(inst.salario_mensual_fijo || 0);
      const tarVuelo  = Number(inst.tarifa_hora_vuelo || 0);
      const tarTeoria = Number(inst.tarifa_hora_teoria || 0);
      const horasVuelo = horasPorInstructor.get(id_inst) || 0;

      let monto_vuelo = 0, monto_teorico = 0, salario_mensual = 0;
      let pagosTeoria = [];

      if (esServicios) {
        // Pago de teoría por curso aprobado: pendientes aún no incluidos en otra nómina.
        const teoriaRes = await client.query(`
          SELECT id, monto_usd FROM pago_teoria_pendiente
          WHERE id_instructor = $1 AND estado = 'PENDIENTE' AND id_nomina_detalle IS NULL
        `, [id_inst]);
        pagosTeoria = teoriaRes.rows;
        const pagoTeoriaCursos = teoriaRes.rows.reduce((s, x) => s + Number(x.monto_usd), 0);
        monto_vuelo   = +(horasVuelo * tarVuelo).toFixed(2);
        monto_teorico = +pagoTeoriaCursos.toFixed(2);
      } else {
        // Planta: salario mensual fijo.
        salario_mensual = salMens;
      }

      const id_detalle = await insertarDetalle(client, {
        id_periodo, id_instructor: id_inst, id_empleado: null,
        tipo_pago, tipo_planilla,
        horasVuelo, tarVuelo, monto_vuelo,
        tarTeoria, monto_teorico, salario_mensual,
      });

      // Vincular pagos de teoría a este detalle (se marcan PAGADO al pagar el periodo).
      if (pagosTeoria.length > 0) {
        await client.query(
          `UPDATE pago_teoria_pendiente SET id_nomina_detalle = $1 WHERE id = ANY($2::bigint[])`,
          [id_detalle, pagosTeoria.map(x => x.id)]
        );
      }

      // Trazabilidad por vuelo (sólo servicios con tarifa por hora).
      if (esServicios && tarVuelo > 0 && horasVuelo > 0) {
        await client.query(`
          INSERT INTO nomina_detalle_vuelo (id_nomina_detalle, id_vuelo, horas, monto)
          SELECT $1, v.id_vuelo,
                 COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0),
                 COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0) * $2
          FROM vuelo v
          LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
          WHERE v.estado = 'COMPLETADO'
            AND v.fecha_vuelo BETWEEN $3::date AND $4::date
            AND v.id_instructor = $5
        `, [id_detalle, tarVuelo, periodo_inicio, periodo_fin, id_inst]);
      }
    }

    // ── Empleados de planta / servicios ─────────────────────────────────
    for (const emp of empleadosRes.rows) {
      const sueldo = Number(emp.sueldo_base || 0);
      await insertarDetalle(client, {
        id_periodo, id_instructor: null, id_empleado: Number(emp.id_empleado),
        tipo_pago: 'MENSUAL_FIJO', tipo_planilla,
        horasVuelo: 0, tarVuelo: 0, monto_vuelo: 0,
        tarTeoria: 0, monto_teorico: 0, salario_mensual: sueldo,
      });
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
 * Inserta un detalle aplicando las deducciones del tipo de planilla y devuelve su id.
 * El bruto se compone de monto_vuelo + monto_teorico + salario_mensual.
 */
async function insertarDetalle(client, x) {
  const bruto = +(Number(x.monto_vuelo) + Number(x.monto_teorico) + Number(x.salario_mensual)).toFixed(2);

  let isr = 0, isss = 0, afp = 0, retencion = 0;
  if (x.tipo_planilla === 'PLANTA') {
    const d = calcularDeduccionesPlanta(bruto);
    isr = d.isr; isss = d.isss; afp = d.afp;
  } else {
    retencion = retencionServicios(bruto);
  }
  const total = +(bruto - isr - isss - afp - retencion).toFixed(2);

  const det = await client.query(`
    INSERT INTO nomina_detalle
      (id_periodo, id_instructor, id_empleado, tipo_pago,
       horas_voladas, tarifa_hora, monto_vuelo,
       horas_teoricas, tarifa_hora_teoria, monto_teorico,
       salario_mensual, bruto, isr, isss, afp, retencion,
       subtotal, total)
    VALUES ($1,$2,$3,$4, $5,$6,$7, $8,$9,$10, $11,$12,$13,$14,$15,$16, $12,$17)
    RETURNING id
  `, [
    x.id_periodo, x.id_instructor, x.id_empleado, x.tipo_pago,
    x.horasVuelo, x.tarVuelo, x.monto_vuelo,
    0, x.tarTeoria, x.monto_teorico,
    x.salario_mensual, bruto, isr, isss, afp, retencion,
    total,
  ]);
  return det.rows[0].id;
}

/**
 * Editar un detalle de nómina. Recalcula bruto, deducciones y total según el
 * tipo de planilla del periodo.
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

    const per = await client.query(`SELECT estado, tipo_planilla FROM nomina_periodo WHERE id = $1`, [d.id_periodo]);
    if (per.rows[0]?.estado === 'PAGADA') {
      await client.query("ROLLBACK");
      return res.status(403).json({ ok: false, message: "No se puede editar una nómina ya pagada" });
    }
    const tipo_planilla = per.rows[0]?.tipo_planilla || 'SERVICIOS';

    const ht  = horas_teoricas       != null ? Number(horas_teoricas)       : Number(d.horas_teoricas);
    const tht = tarifa_hora_teoria   != null ? Number(tarifa_hora_teoria)   : Number(d.tarifa_hora_teoria);
    const hv  = horas_voladas        != null ? Number(horas_voladas)        : Number(d.horas_voladas);
    const thv = tarifa_hora          != null ? Number(tarifa_hora)          : Number(d.tarifa_hora);
    const sm  = salario_mensual      != null ? Number(salario_mensual)      : Number(d.salario_mensual);
    const bn  = bonos                != null ? Number(bonos)                : Number(d.bonos);
    const ds  = descuentos           != null ? Number(descuentos)           : Number(d.descuentos);

    const monto_vuelo   = +(hv * thv).toFixed(2);
    const monto_teorico = +(ht * tht).toFixed(2);
    const bruto         = +(monto_vuelo + monto_teorico + sm).toFixed(2);

    let isr = 0, isss = 0, afp = 0, retencion = 0;
    if (tipo_planilla === 'PLANTA') {
      const ded = calcularDeduccionesPlanta(bruto);
      isr = ded.isr; isss = ded.isss; afp = ded.afp;
    } else {
      retencion = retencionServicios(bruto);
    }
    const total = +(bruto - isr - isss - afp - retencion + bn - ds).toFixed(2);

    await client.query(`
      UPDATE nomina_detalle SET
        horas_teoricas      = $2,
        tarifa_hora_teoria  = $3,
        monto_teorico       = $4,
        horas_voladas       = $5,
        tarifa_hora         = $6,
        monto_vuelo         = $7,
        salario_mensual     = $8,
        bruto               = $9,
        isr                 = $10,
        isss                = $11,
        afp                 = $12,
        retencion           = $13,
        bonos               = $14,
        descuentos          = $15,
        subtotal            = $9,
        total               = $16,
        observaciones       = COALESCE($17, observaciones)
      WHERE id = $1
    `, [idDet, ht, tht, monto_teorico, hv, thv, monto_vuelo, sm,
        bruto, isr, isss, afp, retencion, bn, ds, total, observaciones || null]);

    await client.query("COMMIT");
    res.json({ ok: true, data: { id: idDet, bruto, isr, isss, afp, retencion, total } });
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
    const etiqueta = p.rows[0].tipo_planilla === 'PLANTA' ? 'Planta' : 'Servicios prof.';
    await client.query(`
      INSERT INTO egreso (categoria, concepto, monto_usd, fecha, id_nomina, registrado_por)
      VALUES ('NOMINA', $1, $2, CURRENT_DATE, $3, $4)
    `, [`Nómina ${etiqueta} ${p.rows[0].periodo_inicio} a ${p.rows[0].periodo_fin}`,
        total.rows[0].t, id, req.user?.id_usuario || null]);

    // Marcar como PAGADO los pagos de teoría vinculados a los detalles de este periodo.
    await client.query(`
      UPDATE pago_teoria_pendiente SET estado = 'PAGADO', pagado_en = NOW()
      WHERE estado = 'PENDIENTE' AND id_nomina_detalle IN (
        SELECT id FROM nomina_detalle WHERE id_periodo = $1
      )
    `, [id]);

    await client.query("COMMIT");
    res.json({ ok: true, data: p.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
