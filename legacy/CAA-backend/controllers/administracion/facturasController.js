const db = require("../../config/db");
const { generarFacturaPDF } = require("../../utils/pdfGenerator");

/**
 * Emisión manual de factura desde Administración.
 * Recibe id_alumno, concepto, líneas [{ descripcion, cantidad_horas, tarifa_hora_usd, subtotal_usd, id_vuelo? }].
 * Crea factura + factura_detalle, debita saldo, registra movimiento_cuenta CARGO_OTRO.
 */
exports.emitirManual = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_alumno, concepto, lineas, fecha_emision, iva_usd } = req.body;
    if (!id_alumno) return res.status(400).json({ ok: false, message: "id_alumno requerido" });
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ ok: false, message: "Debe incluir al menos una línea de detalle" });
    }

    await client.query("BEGIN");

    // Calcular totales
    const subtotal = lineas.reduce((s, l) => s + Number(l.subtotal_usd || (Number(l.cantidad_horas || 0) * Number(l.tarifa_hora_usd || 0))), 0);
    const iva = Number(iva_usd || 0);
    const total = +(subtotal + iva).toFixed(2);

    // Correlativo único
    const corr = await client.query(`SELECT nextval('factura_correlativo_seq') AS n`);
    const numero = corr.rows[0].n;

    const f = await client.query(`
      INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, concepto, emitida_por)
      VALUES ($1, $2, COALESCE($3, NOW()), $4, $5, $6, $7, $8)
      RETURNING *
    `, [numero, id_alumno, fecha_emision || null, subtotal.toFixed(2), iva.toFixed(2), total, concepto || `Factura #${numero}`, req.user?.id_usuario || null]);

    for (const l of lineas) {
      const cant = Number(l.cantidad_horas || 0);
      const tarifa = Number(l.tarifa_hora_usd || 0);
      const subL = Number(l.subtotal_usd || (cant * tarifa));
      await client.query(`
        INSERT INTO factura_detalle (id_factura, descripcion, cantidad_horas, tarifa_hora_usd, subtotal_usd, id_aeronave_tarifa, id_vuelo)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [f.rows[0].id, l.descripcion, cant, tarifa, subL.toFixed(2), l.id_aeronave_tarifa || null, l.id_vuelo || null]);
    }

    // Debita cuenta corriente
    let cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    if (cuenta.rows.length === 0) {
      await client.query(`INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd) VALUES ($1, 0)`, [id_alumno]);
      cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    }
    const nuevo_saldo = Number(cuenta.rows[0].saldo_actual_usd) - total;
    await client.query(`
      UPDATE cuenta_corriente_alumno
      SET saldo_actual_usd = $2, ultimo_movimiento_en = NOW(), ultima_factura_correlativo = $3
      WHERE id_alumno = $1
    `, [id_alumno, nuevo_saldo, numero]);

    await client.query(`
      INSERT INTO movimiento_cuenta
        (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, id_factura,
         instructor_nombre, avion_codigo, horas_vuelo, horas_totales,
         generado_automatico, registrado_por)
      VALUES ($1, 'CARGO_OTRO', $2, $3, $4, $5, $6, $7, $8, $9, FALSE, $10)
    `, [
      id_alumno,
      `Factura #${numero} - ${concepto || 'manual'}`,
      -total, nuevo_saldo, f.rows[0].id,
      null, null, null, null,
      req.user?.id_usuario || null
    ]);

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("cuenta_alumno_movimiento", { id_alumno: Number(id_alumno), saldo: nuevo_saldo });

    res.json({ ok: true, data: f.rows[0], saldo: nuevo_saldo });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.list = async (req, res) => {
  try {
    const { id_alumno, estado, desde, hasta } = req.query;
    const params = [];
    const where = [];
    if (id_alumno) { params.push(id_alumno); where.push(`f.id_alumno = $${params.length}`); }
    if (estado) { params.push(estado); where.push(`f.estado = $${params.length}`); }
    if (desde) { params.push(desde); where.push(`f.fecha_emision >= $${params.length}`); }
    if (hasta) { params.push(hasta); where.push(`f.fecha_emision <= $${params.length}`); }
    const result = await db.query(`
      SELECT f.*, u.username AS alumno_username
      FROM factura f
      LEFT JOIN alumno a ON a.id_alumno = f.id_alumno
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY f.fecha_emision DESC, f.id DESC
      LIMIT 500
    `, params);
    res.json({ ok: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Helper interno: aplica el CARGO por vuelo a la cuenta corriente del alumno.
 * Usado por instructor reporteController al firmar el reporte final.
 *
 * IMPORTANTE: el vuelo NO genera una factura formal. El modelo de negocio es de
 * saldo prepagado: el alumno deposita (recibo) y el vuelo solo DEBITA su cuenta
 * corriente (movimiento_cuenta tipo CARGO_VUELO). Las facturas son documentos
 * fiscales aparte que se emiten manualmente cuando hace falta (emitirManual).
 *
 * @param {pg.Client} client - cliente dentro de transacción
 * @param {Object} params - { id_vuelo, id_alumno, id_aeronave, tacometro, modelo_aeronave, fecha, emitida_por, es_extracurricular }
 * @returns {Object} { id_alumno, saldo_resultante, tarifa, total, es_extracurricular }
 */
exports.cargarVueloACuentaDentroTx = async function cargarVueloACuentaDentroTx(client, {
  id_vuelo, id_alumno, id_aeronave, tacometro, modelo_aeronave, fecha, emitida_por,
  es_extracurricular = false
}) {
  // PRECIO ESPECIAL del alumno para este avión (si tiene uno asignado en su
  // perfil): tiene prioridad sobre el estándar. Ver alumno_tarifa_aeronave.
  let tarifa = null;
  if (id_aeronave) {
    const especial = await client.query(`
      SELECT at.tarifa_hora_usd
      FROM alumno_tarifa_aeronave ata
      JOIN aeronave_tarifa at ON at.id = ata.id_tarifa
      WHERE ata.id_alumno = $1 AND ata.id_aeronave = $2
      LIMIT 1
    `, [id_alumno, id_aeronave]);
    if (especial.rows.length > 0) tarifa = Number(especial.rows[0].tarifa_hora_usd);
  }

  // Si no hay precio especial, tarifa ESTÁNDAR vigente. Se prioriza el match por
  // id_aeronave (vínculo robusto); si la tarifa no tiene id_aeronave (filas
  // antiguas), se cae al match por texto de modelo. Así el cargo automático no
  // depende de que el string de modelo de la aeronave y el de la tarifa coincidan.
  if (tarifa == null) {
    const tarifaRes = await client.query(`
      SELECT id, tarifa_hora_usd FROM aeronave_tarifa
      WHERE (
              ($1::int IS NOT NULL AND id_aeronave = $1)
              OR (id_aeronave IS NULL AND modelo_aeronave = $2)
            )
        AND COALESCE(es_estandar, TRUE) = TRUE
        AND vigente_desde <= $3::date
        AND (vigente_hasta IS NULL OR vigente_hasta >= $3::date)
      ORDER BY (id_aeronave = $1) DESC NULLS LAST, vigente_desde DESC
      LIMIT 1
    `, [id_aeronave || null, modelo_aeronave, fecha]);
    if (tarifaRes.rows.length === 0) {
      throw new Error(`No hay tarifa vigente para ${modelo_aeronave} (aeronave ${id_aeronave || '?'}) en ${fecha}`);
    }
    tarifa = Number(tarifaRes.rows[0].tarifa_hora_usd);
  }
  const total = +(tarifa * Number(tacometro)).toFixed(2);

  // Lock + actualizar cuenta
  let cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
  if (cuenta.rows.length === 0) {
    await client.query(`INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd) VALUES ($1, 0)`, [id_alumno]);
    cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
  }
  const nuevo_saldo = Number(cuenta.rows[0].saldo_actual_usd) - total;
  await client.query(`
    UPDATE cuenta_corriente_alumno
    SET saldo_actual_usd = $2, ultimo_movimiento_en = NOW()
    WHERE id_alumno = $1
  `, [id_alumno, nuevo_saldo]);

  // Buscar nombre del instructor y código de aeronave para columnas hoja azul
  const meta = await client.query(`
    SELECT u.username AS instructor_nombre, a.codigo AS avion_codigo,
           COALESCE(al.horas_acumuladas, 0) AS horas_totales_alumno
    FROM vuelo v
    LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
    LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
    LEFT JOIN aeronave a ON a.id_aeronave = v.id_aeronave
    LEFT JOIN alumno al ON al.id_alumno = v.id_alumno
    WHERE v.id_vuelo = $1
  `, [id_vuelo]);
  const m = meta.rows[0] || {};

  // Para vuelos extracurriculares: se cobra igual, pero NO se suma a las horas
  // totales (de licencia) ni se actualiza el avance del curso. Se etiqueta con nota.
  const horasTotalesMov = es_extracurricular
    ? Number(m.horas_totales_alumno || 0)
    : Number(m.horas_totales_alumno || 0) + Number(tacometro);
  const notaMov = es_extracurricular ? 'Extracurricular' : null;
  const descMov = es_extracurricular
    ? `Vuelo extracurricular #${id_vuelo} ${modelo_aeronave} ${tacometro}h × $${tarifa}`
    : `Vuelo #${id_vuelo} ${modelo_aeronave} ${tacometro}h × $${tarifa}`;

  await client.query(`
    INSERT INTO movimiento_cuenta
      (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, id_vuelo,
       instructor_nombre, avion_codigo, horas_vuelo, horas_totales, nota,
       generado_automatico, registrado_por)
    VALUES ($1, 'CARGO_VUELO', $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11)
  `, [id_alumno, descMov,
      -total, nuevo_saldo, id_vuelo,
      m.instructor_nombre || null, m.avion_codigo || modelo_aeronave, tacometro,
      horasTotalesMov, notaMov,
      emitida_por || null]);

  // Avance de curso: solo para vuelos de licencia (NO extracurriculares).
  if (!es_extracurricular) {
    await client.query(`
      UPDATE inscripcion_curso_avance
      SET horas_acumuladas = horas_acumuladas + $2
      WHERE id_inscripcion IN (
        SELECT id FROM inscripcion_curso WHERE id_alumno = $1 AND estado = 'ACTIVO' LIMIT 1
      )
      AND ($3 = ANY(string_to_array(tipo_aeronave, ' / ')) OR tipo_aeronave = $3 OR tipo_aeronave ILIKE '%' || $3 || '%')
    `, [id_alumno, tacometro, modelo_aeronave]);
  }

  return { id_alumno, saldo_resultante: nuevo_saldo, tarifa, total, es_extracurricular };
};

exports.anular = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ ok: false, message: "Motivo requerido" });
    await client.query("BEGIN");
    const fr = await client.query(`SELECT * FROM factura WHERE id = $1 AND estado = 'EMITIDA' FOR UPDATE`, [id]);
    if (fr.rows.length === 0) return res.status(404).json({ ok: false, message: "Factura no encontrada o ya anulada" });
    const factura = fr.rows[0];

    await client.query(`UPDATE factura SET estado = 'ANULADA', motivo_anulacion = $2 WHERE id = $1`, [id, motivo]);

    const cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [factura.id_alumno]);
    const nuevo_saldo = Number(cuenta.rows[0].saldo_actual_usd) + Number(factura.total_usd);
    await client.query(`UPDATE cuenta_corriente_alumno SET saldo_actual_usd = $2, ultimo_movimiento_en = NOW() WHERE id_alumno = $1`, [factura.id_alumno, nuevo_saldo]);

    await client.query(`
      INSERT INTO movimiento_cuenta (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, id_factura, registrado_por)
      VALUES ($1, 'ANULACION', $2, $3, $4, $5, $6)
    `, [factura.id_alumno, `Anulación factura #${factura.numero_correlativo}: ${motivo}`,
        Number(factura.total_usd), nuevo_saldo, factura.id, req.user?.id_usuario || null]);

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
    const fr = await db.query(`
      SELECT f.*, u.username AS alumno_username, u.correo AS alumno_correo, a.numero_licencia
      FROM factura f
      LEFT JOIN alumno a ON a.id_alumno = f.id_alumno
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      WHERE f.id = $1
    `, [id]);
    if (fr.rows.length === 0) return res.status(404).json({ ok: false, message: "Factura no encontrada" });

    const dr = await db.query(`SELECT * FROM factura_detalle WHERE id_factura = $1 ORDER BY id`, [id]);

    const factura = fr.rows[0];
    const alumno = {
      username: factura.alumno_username,
      correo: factura.alumno_correo,
      numero_licencia: factura.numero_licencia
    };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="factura-${factura.numero_correlativo}.pdf"`);
    const pdf = generarFacturaPDF({ factura, detalle: dr.rows, alumno });
    pdf.pipe(res);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
