const db = require("../../config/db");
const { calcularPlanta, retencionServicios, round2, CONFIG_DEFAULT } = require("../../utils/deducciones");
const { generarPlanillaPDF, generarReciboNominaPDF } = require("../../utils/pdfGenerator");

const DET_SELECT = `
  SELECT d.*,
         COALESCE(u.nombre || ' ' || u.apellido, e.nombre) AS instructor_username,
         e.cargo AS empleado_cargo
  FROM nomina_detalle d
  LEFT JOIN instructor i ON i.id_instructor = d.id_instructor
  LEFT JOIN usuario u    ON u.id_usuario    = i.id_usuario
  LEFT JOIN empleado e   ON e.id            = d.id_empleado
`;

const num = (v) => (v === "" || v == null ? 0 : Number(v));

/** Configuración fiscal vigente (última versión con vigente_desde <= hoy). */
async function getConfigActiva(client) {
  const q = client || db;
  const r = await q.query(
    `SELECT * FROM config_fiscal WHERE vigente_desde <= CURRENT_DATE ORDER BY vigente_desde DESC LIMIT 1`
  );
  return r.rows[0] || null;
}

// ── Configuración fiscal ──────────────────────────────────────────────
exports.getConfigFiscal = async (req, res) => {
  try {
    const c = await getConfigActiva();
    res.json({ ok: true, data: c || { ...CONFIG_DEFAULT, vigente_desde: null } });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.updateConfigFiscal = async (req, res) => {
  try {
    const b = req.body || {};
    const tramos = Array.isArray(b.isr_tramos_json) ? b.isr_tramos_json : [];
    const r = await db.query(`
      INSERT INTO config_fiscal
        (vigente_desde, isss_empleado_rate, isss_patrono_rate, isss_tope_usd,
         afp_empleado_rate, afp_patrono_rate, afp_tope_usd,
         isr_tramos_json, servicios_isr_rate, notas, creado_por)
      VALUES (CURRENT_DATE, $1,$2,$3, $4,$5,$6, $7::jsonb, $8, $9, $10)
      ON CONFLICT (vigente_desde) DO UPDATE SET
        isss_empleado_rate = EXCLUDED.isss_empleado_rate,
        isss_patrono_rate  = EXCLUDED.isss_patrono_rate,
        isss_tope_usd      = EXCLUDED.isss_tope_usd,
        afp_empleado_rate  = EXCLUDED.afp_empleado_rate,
        afp_patrono_rate   = EXCLUDED.afp_patrono_rate,
        afp_tope_usd       = EXCLUDED.afp_tope_usd,
        isr_tramos_json    = EXCLUDED.isr_tramos_json,
        servicios_isr_rate = EXCLUDED.servicios_isr_rate,
        notas              = EXCLUDED.notas
      RETURNING *
    `, [
      num(b.isss_empleado_rate), num(b.isss_patrono_rate), num(b.isss_tope_usd),
      num(b.afp_empleado_rate), num(b.afp_patrono_rate),
      (b.afp_tope_usd === "" || b.afp_tope_usd == null) ? null : num(b.afp_tope_usd),
      JSON.stringify(tramos), num(b.servicios_isr_rate), b.notas || null,
      req.user?.id_usuario || null,
    ]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ── Periodos ──────────────────────────────────────────────────────────
exports.listPeriodos = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT p.*,
             (SELECT COALESCE(SUM(total),0) FROM nomina_detalle d WHERE d.id_periodo = p.id) AS total_periodo,
             (SELECT COALESCE(SUM(costo_patronal),0) FROM nomina_detalle d WHERE d.id_periodo = p.id) AS costo_patronal_total,
             (SELECT COUNT(*) FROM nomina_detalle d WHERE d.id_periodo = p.id) AS instructores_count
      FROM nomina_periodo p
      ORDER BY p.anio DESC NULLS LAST, p.mes DESC NULLS LAST, p.periodo_inicio DESC
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
             COALESCE(u.nombre || ' ' || u.apellido, e.nombre) AS instructor_username,
             e.cargo AS empleado_cargo
      FROM nomina_detalle d
      LEFT JOIN instructor i ON i.id_instructor = d.id_instructor
      LEFT JOIN usuario u    ON u.id_usuario    = i.id_usuario
      LEFT JOIN empleado e   ON e.id            = d.id_empleado
      WHERE d.id_periodo = $1
      ORDER BY COALESCE(u.nombre, e.nombre)
    `, [id]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Inserta un detalle aplicando deducciones (empleado + patrono) según la config.
 * bruto = monto_vuelo + monto_teorico + salario_mensual.
 */
async function insertarDetalle(client, x, cfg) {
  const bruto = round2(num(x.monto_vuelo) + num(x.monto_teorico) + num(x.salario_mensual));

  let isr = 0, isss = 0, afp = 0, retencion = 0, isss_patrono = 0, afp_patrono = 0;
  if (x.tipo_planilla === "PLANTA") {
    const d = calcularPlanta(bruto, cfg);
    isr = d.isr; isss = d.isss; afp = d.afp;
    isss_patrono = d.isss_patrono; afp_patrono = d.afp_patrono;
  } else {
    retencion = retencionServicios(bruto, cfg);
  }
  const total = round2(bruto - isr - isss - afp - retencion);
  const costo_patronal = round2(bruto + isss_patrono + afp_patrono);

  const det = await client.query(`
    INSERT INTO nomina_detalle
      (id_periodo, id_instructor, id_empleado, tipo_pago,
       horas_voladas, tarifa_hora, monto_vuelo,
       horas_teoricas, tarifa_hora_teoria, monto_teorico,
       salario_mensual, bruto, isr, isss, afp, retencion,
       isss_patrono, afp_patrono, costo_patronal,
       subtotal, total)
    VALUES ($1,$2,$3,$4, $5,$6,$7, $8,$9,$10, $11,$12,$13,$14,$15,$16, $17,$18,$19, $12,$20)
    RETURNING id
  `, [
    x.id_periodo, x.id_instructor, x.id_empleado, x.tipo_pago,
    x.horasVuelo, x.tarVuelo, x.monto_vuelo,
    0, x.tarTeoria, x.monto_teorico,
    x.salario_mensual, bruto, isr, isss, afp, retencion,
    isss_patrono, afp_patrono, costo_patronal,
    total,
  ]);
  return det.rows[0].id;
}

/**
 * Genera una planilla para un MES (anio + mes). El tipo determina deducciones.
 * Acepta también { periodo_inicio, periodo_fin } por compatibilidad.
 */
exports.calcular = async (req, res) => {
  const client = await db.connect();
  try {
    const tipo_planilla = (req.body.tipo_planilla || "SERVICIOS").toUpperCase();
    if (!["PLANTA", "SERVICIOS"].includes(tipo_planilla)) {
      return res.status(400).json({ ok: false, message: "tipo_planilla inválido" });
    }

    let anio = parseInt(req.body.anio, 10);
    let mes = parseInt(req.body.mes, 10);
    let periodo_inicio, periodo_fin;

    if (anio && mes >= 1 && mes <= 12) {
      periodo_inicio = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const fin = new Date(anio, mes, 0); // último día del mes
      periodo_fin = `${anio}-${String(mes).padStart(2, "0")}-${String(fin.getDate()).padStart(2, "0")}`;
    } else if (req.body.periodo_inicio && req.body.periodo_fin) {
      periodo_inicio = req.body.periodo_inicio;
      periodo_fin = req.body.periodo_fin;
      anio = new Date(periodo_inicio).getUTCFullYear();
      mes = new Date(periodo_inicio).getUTCMonth() + 1;
    } else {
      return res.status(400).json({ ok: false, message: "Mes y año requeridos" });
    }

    await client.query("BEGIN");

    const dup = await client.query(
      `SELECT 1 FROM nomina_periodo WHERE anio=$1 AND mes=$2 AND tipo_planilla=$3 AND estado <> 'ANULADA' LIMIT 1`,
      [anio, mes, tipo_planilla]
    );
    if (dup.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, message: "Ya existe una planilla de ese tipo para ese mes (anúlala primero si querés regenerarla)." });
    }

    const cfg = await getConfigActiva(client);
    if (!cfg) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "No hay configuración fiscal. Configúrala primero." });
    }

    const p = await client.query(`
      INSERT INTO nomina_periodo (periodo_inicio, periodo_fin, anio, mes, estado, tipo_planilla, creado_por)
      VALUES ($1, $2, $3, $4, 'BORRADOR', $5, $6) RETURNING *
    `, [periodo_inicio, periodo_fin, anio, mes, tipo_planilla, req.user?.id_usuario || null]);
    const id_periodo = p.rows[0].id;

    const esServicios = tipo_planilla === "SERVICIOS";

    const instructoresRes = await client.query(`
      SELECT i.id_instructor, it.tipo_pago, it.salario_mensual_fijo, it.tarifa_hora_vuelo, it.tarifa_hora_teoria
      FROM instructor i
      JOIN LATERAL (
        SELECT tipo_pago, salario_mensual_fijo, tarifa_hora_vuelo, tarifa_hora_teoria, es_servicios_profesionales
        FROM instructor_tarifa
        WHERE id_instructor = i.id_instructor
          AND vigente_desde <= $1::date AND (vigente_hasta IS NULL OR vigente_hasta >= $1::date)
        ORDER BY vigente_desde DESC LIMIT 1
      ) it ON TRUE
      WHERE it.es_servicios_profesionales = $2
    `, [periodo_fin, esServicios]);

    const empleadosRes = await client.query(`
      SELECT id AS id_empleado, nombre, sueldo_base
      FROM empleado WHERE activo = TRUE AND es_servicios_profesionales = $1
    `, [esServicios]);

    const horasRes = await client.query(`
      SELECT v.id_instructor, COALESCE(SUM(rv.tacometro_llegada - rv.tacometro_salida), 0) AS horas
      FROM vuelo v
      LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      WHERE v.estado = 'COMPLETADO' AND v.fecha_vuelo BETWEEN $1::date AND $2::date AND v.id_instructor IS NOT NULL
      GROUP BY v.id_instructor
    `, [periodo_inicio, periodo_fin]);
    const horasPorInstructor = new Map(horasRes.rows.map(r => [Number(r.id_instructor), Number(r.horas || 0)]));

    for (const inst of instructoresRes.rows) {
      const id_inst = Number(inst.id_instructor);
      const tipo_pago = inst.tipo_pago || "POR_HORA";
      const salMens = Number(inst.salario_mensual_fijo || 0);
      const tarVuelo = Number(inst.tarifa_hora_vuelo || 0);
      const tarTeoria = Number(inst.tarifa_hora_teoria || 0);
      const horasVuelo = horasPorInstructor.get(id_inst) || 0;

      let monto_vuelo = 0, monto_teorico = 0, salario_mensual = 0, pagosTeoria = [];
      if (esServicios) {
        const teoriaRes = await client.query(`
          SELECT id, monto_usd FROM pago_teoria_pendiente
          WHERE id_instructor = $1 AND estado = 'PENDIENTE' AND id_nomina_detalle IS NULL
        `, [id_inst]);
        pagosTeoria = teoriaRes.rows;
        monto_vuelo = round2(horasVuelo * tarVuelo);
        monto_teorico = round2(teoriaRes.rows.reduce((s, x) => s + Number(x.monto_usd), 0));
      } else {
        salario_mensual = salMens;
      }

      const id_detalle = await insertarDetalle(client, {
        id_periodo, id_instructor: id_inst, id_empleado: null,
        tipo_pago, tipo_planilla, horasVuelo, tarVuelo, monto_vuelo,
        tarTeoria, monto_teorico, salario_mensual,
      }, cfg);

      if (pagosTeoria.length > 0) {
        await client.query(
          `UPDATE pago_teoria_pendiente SET id_nomina_detalle = $1 WHERE id = ANY($2::bigint[])`,
          [id_detalle, pagosTeoria.map(x => x.id)]
        );
      }

      if (esServicios && tarVuelo > 0 && horasVuelo > 0) {
        await client.query(`
          INSERT INTO nomina_detalle_vuelo (id_nomina_detalle, id_vuelo, horas, monto)
          SELECT $1, v.id_vuelo,
                 COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0),
                 COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0) * $2
          FROM vuelo v
          LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
          WHERE v.estado = 'COMPLETADO' AND v.fecha_vuelo BETWEEN $3::date AND $4::date AND v.id_instructor = $5
        `, [id_detalle, tarVuelo, periodo_inicio, periodo_fin, id_inst]);
      }
    }

    for (const emp of empleadosRes.rows) {
      await insertarDetalle(client, {
        id_periodo, id_instructor: null, id_empleado: Number(emp.id_empleado),
        tipo_pago: "MENSUAL_FIJO", tipo_planilla,
        horasVuelo: 0, tarVuelo: 0, monto_vuelo: 0,
        tarTeoria: 0, monto_teorico: 0, salario_mensual: Number(emp.sueldo_base || 0),
      }, cfg);
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

/** Editar un detalle (recalcula con la config del snapshot o la vigente). */
exports.editarDetalle = async (req, res) => {
  const client = await db.connect();
  try {
    const { idDet } = req.params;
    const {
      horas_teoricas, tarifa_hora_teoria, horas_voladas, tarifa_hora,
      salario_mensual, bonos, descuentos, observaciones
    } = req.body;

    await client.query("BEGIN");
    const cur = await client.query(`SELECT * FROM nomina_detalle WHERE id = $1 FOR UPDATE`, [idDet]);
    if (cur.rows.length === 0) { await client.query("ROLLBACK"); return res.status(404).json({ ok: false, message: "Detalle no encontrado" }); }
    const d = cur.rows[0];

    const per = await client.query(`SELECT estado, tipo_planilla, config_snapshot FROM nomina_periodo WHERE id = $1`, [d.id_periodo]);
    const estado = per.rows[0]?.estado;
    if (estado === "PAGADA" || estado === "ANULADA") {
      await client.query("ROLLBACK");
      return res.status(403).json({ ok: false, message: "No se puede editar una nómina pagada o anulada" });
    }
    const tipo_planilla = per.rows[0]?.tipo_planilla || "SERVICIOS";
    const cfg = per.rows[0]?.config_snapshot || await getConfigActiva(client) || CONFIG_DEFAULT;

    const ht  = horas_teoricas     != null ? Number(horas_teoricas)     : Number(d.horas_teoricas);
    const tht = tarifa_hora_teoria != null ? Number(tarifa_hora_teoria) : Number(d.tarifa_hora_teoria);
    const hv  = horas_voladas      != null ? Number(horas_voladas)      : Number(d.horas_voladas);
    const thv = tarifa_hora        != null ? Number(tarifa_hora)        : Number(d.tarifa_hora);
    const sm  = salario_mensual    != null ? Number(salario_mensual)    : Number(d.salario_mensual);
    const bn  = bonos              != null ? Number(bonos)              : Number(d.bonos);
    const ds  = descuentos         != null ? Number(descuentos)         : Number(d.descuentos);

    const monto_vuelo = round2(hv * thv);
    const monto_teorico = round2(ht * tht);
    const bruto = round2(monto_vuelo + monto_teorico + sm + bn);

    let isr = 0, isss = 0, afp = 0, retencion = 0, isss_patrono = 0, afp_patrono = 0;
    if (tipo_planilla === "PLANTA") {
      const ded = calcularPlanta(bruto, cfg);
      isr = ded.isr; isss = ded.isss; afp = ded.afp;
      isss_patrono = ded.isss_patrono; afp_patrono = ded.afp_patrono;
    } else {
      retencion = retencionServicios(bruto, cfg);
    }
    const total = round2(bruto - isr - isss - afp - retencion - ds);
    const costo_patronal = round2(bruto + isss_patrono + afp_patrono);

    await client.query(`
      UPDATE nomina_detalle SET
        horas_teoricas=$2, tarifa_hora_teoria=$3, monto_teorico=$4,
        horas_voladas=$5, tarifa_hora=$6, monto_vuelo=$7, salario_mensual=$8,
        bruto=$9, isr=$10, isss=$11, afp=$12, retencion=$13,
        isss_patrono=$14, afp_patrono=$15, costo_patronal=$16,
        bonos=$17, descuentos=$18, subtotal=$9, total=$19,
        observaciones = COALESCE($20, observaciones)
      WHERE id = $1
    `, [idDet, ht, tht, monto_teorico, hv, thv, monto_vuelo, sm,
        bruto, isr, isss, afp, retencion, isss_patrono, afp_patrono, costo_patronal,
        bn, ds, total, observaciones || null]);

    await client.query("COMMIT");
    res.json({ ok: true, data: { id: idDet, bruto, isr, isss, afp, retencion, isss_patrono, afp_patrono, costo_patronal, total } });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

/** Aprobar/sellar: congela la config fiscal y un snapshot de cada persona. */
exports.aprobar = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");
    const cfg = await getConfigActiva(client);
    const r = await client.query(`
      UPDATE nomina_periodo SET estado='APROBADA', aprobado_por=$2, config_snapshot=$3::jsonb
      WHERE id=$1 AND estado='BORRADOR' RETURNING *
    `, [id, req.user?.id_usuario || null, cfg ? JSON.stringify(cfg) : null]);
    if (r.rows.length === 0) { await client.query("ROLLBACK"); return res.status(400).json({ ok: false, message: "Sólo se pueden aprobar nóminas BORRADOR" }); }

    // Snapshot de datos de cada persona (para el recibo / auditoría).
    await client.query(`
      UPDATE nomina_detalle d SET user_snapshot = s.snap
      FROM (
        SELECT d2.id,
          jsonb_build_object(
            'nombre', COALESCE(u.nombre || ' ' || u.apellido, e.nombre),
            'cargo',  COALESCE(e.cargo, 'Instructor'),
            'dui',    e.dui, 'nit', e.nit, 'isss', e.isss_num, 'afp', e.afp_num
          ) AS snap
        FROM nomina_detalle d2
        LEFT JOIN instructor i ON i.id_instructor = d2.id_instructor
        LEFT JOIN usuario u    ON u.id_usuario    = i.id_usuario
        LEFT JOIN empleado e   ON e.id            = d2.id_empleado
        WHERE d2.id_periodo = $1
      ) s
      WHERE d.id = s.id
    `, [id]);

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.pagar = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");
    const p = await client.query(`
      UPDATE nomina_periodo SET estado='PAGADA', fecha_pago=CURRENT_DATE
      WHERE id=$1 AND estado='APROBADA' RETURNING *
    `, [id]);
    if (p.rows.length === 0) { await client.query("ROLLBACK"); return res.status(400).json({ ok: false, message: "Sólo se pueden pagar nóminas APROBADAS" }); }
    const total = await client.query(`SELECT COALESCE(SUM(total),0) AS t FROM nomina_detalle WHERE id_periodo=$1`, [id]);
    const etiqueta = p.rows[0].tipo_planilla === "PLANTA" ? "Planta" : "Servicios prof.";
    await client.query(`
      INSERT INTO egreso (categoria, concepto, monto_usd, fecha, id_nomina, registrado_por)
      VALUES ('NOMINA', $1, $2, CURRENT_DATE, $3, $4)
    `, [`Nómina ${etiqueta} ${p.rows[0].periodo_inicio} a ${p.rows[0].periodo_fin}`, total.rows[0].t, id, req.user?.id_usuario || null]);

    await client.query(`
      UPDATE pago_teoria_pendiente SET estado='PAGADO', pagado_en=NOW()
      WHERE estado='PENDIENTE' AND id_nomina_detalle IN (SELECT id FROM nomina_detalle WHERE id_periodo=$1)
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

/** Anular un periodo. Si estaba PAGADA, revierte el egreso y los pagos de teoría. */
exports.anular = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const motivo = req.body?.motivo || null;
    await client.query("BEGIN");
    const per = await client.query(`SELECT * FROM nomina_periodo WHERE id=$1 FOR UPDATE`, [id]);
    if (!per.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ ok: false, message: "Periodo no encontrado" }); }
    if (per.rows[0].estado === "ANULADA") { await client.query("ROLLBACK"); return res.status(400).json({ ok: false, message: "El periodo ya está anulado" }); }

    if (per.rows[0].estado === "PAGADA") {
      await client.query(`DELETE FROM egreso WHERE id_nomina = $1`, [id]);
      await client.query(`
        UPDATE pago_teoria_pendiente SET estado='PENDIENTE', pagado_en=NULL
        WHERE id_nomina_detalle IN (SELECT id FROM nomina_detalle WHERE id_periodo=$1)
      `, [id]);
    }
    // Desvincular pagos de teoría para que puedan reincluirse en otra planilla.
    await client.query(`
      UPDATE pago_teoria_pendiente SET id_nomina_detalle = NULL
      WHERE id_nomina_detalle IN (SELECT id FROM nomina_detalle WHERE id_periodo=$1)
    `, [id]);

    await client.query(`
      UPDATE nomina_periodo SET estado='ANULADA', fecha_anulacion=NOW(), motivo_anulacion=$2, anulado_por=$3
      WHERE id=$1
    `, [id, motivo, req.user?.id_usuario || null]);

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

// ── PDFs ──────────────────────────────────────────────────────────────
exports.descargarPlanillaPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const per = await db.query(`SELECT * FROM nomina_periodo WHERE id = $1`, [id]);
    if (!per.rows.length) return res.status(404).json({ ok: false, message: "Periodo no encontrado" });
    const det = await db.query(`${DET_SELECT} WHERE d.id_periodo = $1 ORDER BY COALESCE(u.nombre, e.nombre)`, [id]);
    const doc = generarPlanillaPDF({ periodo: per.rows[0], detalles: det.rows });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="planilla-${per.rows[0].anio || ""}-${String(per.rows[0].mes || "").padStart(2, "0")}.pdf"`);
    doc.pipe(res);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.descargarReciboPDF = async (req, res) => {
  try {
    const { idDet } = req.params;
    const dq = await db.query(`${DET_SELECT} WHERE d.id = $1`, [idDet]);
    if (!dq.rows.length) return res.status(404).json({ ok: false, message: "Detalle no encontrado" });
    const per = await db.query(`SELECT * FROM nomina_periodo WHERE id = $1`, [dq.rows[0].id_periodo]);
    const doc = generarReciboNominaPDF({ periodo: per.rows[0], detalle: dq.rows[0] });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="recibo-${idDet}.pdf"`);
    doc.pipe(res);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

module.exports.getConfigActiva = getConfigActiva;
