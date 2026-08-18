/**
 * Orden de Trabajo y Reporte de Inspección.
 *
 * La OT es el trabajo del taller y la columna vertebral del papeleo: se abre al
 * recibir el avión (ahí toma su correlativo) y se cierra al firmarla. De ella
 * cuelgan las requisiciones, las solicitudes al almacén, los retornos y las
 * partes reemplazadas.
 *
 * ⚠️ Se numera al ABRIR aunque el papel se llene al final: su número ya aparece
 * en la Solicitud al Almacén, que se hace antes.
 *
 * Spec: docs/superpowers/specs/2026-08-17-orden-trabajo-e-interfaz-taller-design.md
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { generarOrdenTrabajoPDF, generarReporteInspeccionPDF } = require("../../utils/pdfTaller");

const LOCK_CORRELATIVO = 4713;
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const txt = (v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());

/** Frase de liberación que cierra toda acción correctiva en el papel. */
const CERTIFICACION = "Certifico que esta aeronave está en condición segura de vuelo.";

/**
 * Correlativo de la orden de trabajo: CAAA/2026-0049. Formato del papel, con
 * el año adelante y 4 dígitos, y reinicia cada año.
 */
async function siguienteCorrelativoOT(client, anio) {
  await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2)::int)", [LOCK_CORRELATIVO, `OT-${anio}`]);
  const r = await client.query(
    "SELECT COALESCE(MAX(numero),0)+1 AS n FROM orden_trabajo WHERE anio = $1", [anio]
  );
  const numero = Number(r.rows[0].n);
  return { numero, correlativo: `CAAA/${anio}-${String(numero).padStart(4, "0")}` };
}

async function siguienteCorrelativoRI(client, anio) {
  await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2)::int)", [LOCK_CORRELATIVO, `RI-${anio}`]);
  const r = await client.query(
    "SELECT COALESCE(MAX(numero),0)+1 AS n FROM reporte_inspeccion WHERE anio = $1", [anio]
  );
  const numero = Number(r.rows[0].n);
  return { numero, correlativo: `RI-${String(numero).padStart(3, "0")}-${anio}` };
}

const SELECT_OT = `
  SELECT o.*,
         a.codigo AS aeronave_codigo, a.modelo, a.designacion, a.es_externa,
         TRIM(COALESCE(me.nombre,'') || ' ' || COALESCE(me.apellido,'')) AS mecanico_nombre,
         me.licencia_tma,
         TRIM(COALESCE(ap.nombre,'') || ' ' || COALESCE(ap.apellido,'')) AS aprendiz_nombre,
         ap.certificado_aprendiz,
         ri.correlativo AS reporte_correlativo,
         (SELECT COUNT(*) FROM taller_documento_inventario d
           WHERE d.id_orden_trabajo = o.id_orden AND d.estado = 'VIGENTE')::int AS documentos,
         (SELECT COUNT(*) FROM orden_trabajo_parte p WHERE p.id_orden = o.id_orden)::int AS partes
    FROM orden_trabajo o
    JOIN aeronave a  ON a.id_aeronave = o.id_aeronave
    LEFT JOIN usuario me ON me.id_usuario = o.id_mecanico
    LEFT JOIN usuario ap ON ap.id_usuario = o.id_aprendiz
    LEFT JOIN reporte_inspeccion ri ON ri.id_reporte = o.id_reporte`;

// ── Órdenes de trabajo ──────────────────────────────────────────────────────

exports.listOrdenes = catchAsync(async (req, res) => {
  const { estado, id_aeronave, desde, hasta, q, mias } = req.query;
  const cond = ["1=1"];
  const params = [];
  const p = (v) => `$${params.push(v)}`;

  if (estado) cond.push(`o.estado = ${p(estado)}`);
  if (id_aeronave) cond.push(`o.id_aeronave = ${p(Number(id_aeronave))}`);
  if (desde) cond.push(`o.fecha >= ${p(desde)}::date`);
  if (hasta) cond.push(`o.fecha <= ${p(hasta)}::date`);
  // "Mis trabajos": los que abrió este usuario y siguen abiertos. Es lo que la
  // pantalla del técnico usa como contexto.
  if (mias === "true") cond.push(`o.creado_por = ${p(req.user?.id_usuario || 0)}`);
  if (q) {
    const ph = p(`%${q}%`);
    cond.push(`(o.correlativo ILIKE ${ph} OR o.discrepancia ILIKE ${ph} OR o.accion_correctiva ILIKE ${ph} OR a.codigo ILIKE ${ph})`);
  }

  const r = await db.query(
    `${SELECT_OT} WHERE ${cond.join(" AND ")} ORDER BY o.fecha DESC, o.id_orden DESC LIMIT 300`,
    params
  );
  res.json(r.rows);
});

exports.getOrden = catchAsync(async (req, res) => {
  const { id } = req.params;
  const o = await db.query(`${SELECT_OT} WHERE o.id_orden = $1`, [id]);
  if (!o.rows.length) return res.status(404).json({ message: "Orden de trabajo no encontrada" });

  // Todo lo que cuelga del trabajo, que es lo que el jefe de taller arma hoy a
  // mano en un folder.
  const [partes, docs, reporte] = await Promise.all([
    db.query("SELECT * FROM orden_trabajo_parte WHERE id_orden = $1 ORDER BY orden, id_parte", [id]),
    db.query(
      `SELECT d.id_documento, d.tipo, d.correlativo, d.fecha, d.estado, d.motivo,
              COUNT(m.id_mov)::int AS renglones
         FROM taller_documento_inventario d
         LEFT JOIN taller_movimiento_inventario m ON m.id_documento = d.id_documento
        WHERE d.id_orden_trabajo = $1
        GROUP BY d.id_documento
        ORDER BY d.fecha, d.id_documento`, [id]),
    o.rows[0].id_reporte
      ? db.query("SELECT * FROM reporte_inspeccion WHERE id_reporte = $1", [o.rows[0].id_reporte])
      : { rows: [] },
  ]);

  res.json({
    orden: o.rows[0],
    partes: partes.rows,
    documentos: docs.rows,
    reporte: reporte.rows[0] || null,
  });
});

/**
 * Abre un trabajo. Es el "Iniciar mantenimiento" del técnico: pide lo mínimo
 * —avión, qué hay que hacer y el tacómetro— y a partir de ahí todo lo demás
 * hereda esos datos en vez de volver a pedirlos.
 */
exports.crearOrden = catchAsync(async (req, res) => {
  const {
    id_aeronave, fecha, tacometro, piloto_operador, discrepancia,
    id_reporte, id_cumplimiento, id_mantenimiento,
  } = req.body;

  if (!id_aeronave) return res.status(400).json({ message: "Elegí la aeronave" });
  if (!txt(discrepancia)) {
    return res.status(400).json({ message: "Escribí qué trabajo hay que hacer o cuál es la falla" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const anio = Number(String(fecha || "").slice(0, 4)) || new Date().getFullYear();
    const { numero, correlativo } = await siguienteCorrelativoOT(client, anio);

    const r = await client.query(
      `INSERT INTO orden_trabajo
         (anio, numero, correlativo, id_aeronave, fecha, tacometro, piloto_operador,
          discrepancia, id_reporte, id_cumplimiento, id_mantenimiento, creado_por)
       VALUES ($1,$2,$3,$4, COALESCE($5::date, CURRENT_DATE), $6::numeric, $7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [anio, numero, correlativo, id_aeronave, fecha || null, num(tacometro), txt(piloto_operador),
       txt(discrepancia), id_reporte || null, id_cumplimiento || null, id_mantenimiento || null,
       req.user?.id_usuario || null]
    );
    await client.query("COMMIT");
    res.json(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

/** Edita una orden ABIERTA. Al cerrarse se congela. */
exports.editarOrden = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    fecha, tacometro, piloto_operador, discrepancia, accion_correctiva,
    id_cumplimiento, id_mantenimiento, partes,
  } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const o = await client.query("SELECT * FROM orden_trabajo WHERE id_orden = $1 FOR UPDATE", [id]);
    if (!o.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Orden no encontrada" }); }
    if (o.rows[0].estado !== "ABIERTA") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: `Esta orden está ${o.rows[0].estado.toLowerCase()} y ya no se edita.` });
    }

    // Se actualiza SOLO lo que vino en el cuerpo. Con un SET fijo, un PATCH
    // parcial —mandar solo las partes, por ejemplo— borraba el piloto y la
    // acción correctiva poniéndolos en null. Lo detectó el PDF de la orden, que
    // salió con el campo del piloto vacío.
    const tiene = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
    const sets = [];
    const vals = [id];
    const put = (col, valor, cast = "") => { vals.push(valor); sets.push(`${col} = $${vals.length}${cast}`); };

    if (tiene("fecha") && fecha) put("fecha", fecha, "::date");
    if (tiene("tacometro")) put("tacometro", num(tacometro), "::numeric");
    if (tiene("piloto_operador")) put("piloto_operador", txt(piloto_operador));
    if (tiene("discrepancia") && txt(discrepancia)) put("discrepancia", txt(discrepancia));
    if (tiene("accion_correctiva")) put("accion_correctiva", txt(accion_correctiva));
    if (tiene("id_cumplimiento")) put("id_cumplimiento", id_cumplimiento || null);
    if (tiene("id_mantenimiento")) put("id_mantenimiento", id_mantenimiento || null);

    if (sets.length) {
      await client.query(
        `UPDATE orden_trabajo SET ${sets.join(", ")} WHERE id_orden = $1`, vals
      );
    }

    // Las partes reemplazadas se reemplazan enteras: la orden está abierta y no
    // hay historia que preservar.
    if (Array.isArray(partes)) {
      await client.query("DELETE FROM orden_trabajo_parte WHERE id_orden = $1", [id]);
      for (const [i, x] of partes.entries()) {
        if (!txt(x.nombre)) continue;
        await client.query(
          `INSERT INTO orden_trabajo_parte (id_orden, cantidad, nombre, pn_on, sn_on, pn_off, sn_off, id_repuesto, orden)
           VALUES ($1, COALESCE($2::numeric,1), $3,$4,$5,$6,$7,$8,$9)`,
          [id, num(x.cantidad), txt(x.nombre), txt(x.pn_on), txt(x.sn_on),
           txt(x.pn_off), txt(x.sn_off), x.id_repuesto || null, i + 1]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

/**
 * Firma y cierra la orden.
 *
 * Firmar es una acción del sistema y no un nombre tecleado: el mecánico es un
 * usuario y su licencia sale de su ficha, así que queda registrado quién firmó
 * y cuándo. Al cerrar, el documento se congela.
 */
exports.firmarOrden = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { accion_correctiva, id_aprendiz, r_ii, fecha_firma } = req.body;

  if (!txt(accion_correctiva)) {
    return res.status(400).json({ message: "Escribí la acción correctiva antes de firmar" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const o = await client.query("SELECT * FROM orden_trabajo WHERE id_orden = $1 FOR UPDATE", [id]);
    if (!o.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Orden no encontrada" }); }
    if (o.rows[0].estado !== "ABIERTA") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: `Esta orden ya está ${o.rows[0].estado.toLowerCase()}.` });
    }

    // Quien firma tiene que tener licencia: es lo que va impreso en el papel y
    // lo que respalda la liberación de la aeronave.
    const u = await client.query(
      "SELECT licencia_tma FROM usuario WHERE id_usuario = $1", [req.user?.id_usuario || 0]
    );
    if (!u.rows[0]?.licencia_tma) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Tu usuario no tiene número de licencia TMA cargado, y va impreso en la orden. Pedile a Administración que lo agregue a tu ficha.",
      });
    }

    // La certificación cierra siempre la acción correctiva; se agrega si falta.
    let texto = txt(accion_correctiva);
    if (!texto.toLowerCase().includes("condición segura de vuelo")
        && !texto.toLowerCase().includes("condicion segura de vuelo")) {
      texto = `${texto} ${CERTIFICACION}`;
    }

    const r = await client.query(
      `UPDATE orden_trabajo SET
         accion_correctiva = $2,
         id_mecanico       = $3,
         id_aprendiz       = $4,
         r_ii              = $5,
         fecha_firma       = COALESCE($6::date, CURRENT_DATE),
         firmado_en        = NOW(),
         estado            = 'CERRADA'
       WHERE id_orden = $1 RETURNING *`,
      [id, texto, req.user.id_usuario, id_aprendiz || null, txt(r_ii), fecha_firma || null]
    );

    await client.query("COMMIT");
    res.json(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.anularOrden = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { motivo_anulacion } = req.body;
  if (!txt(motivo_anulacion)) return res.status(400).json({ message: "Escribí el motivo de la anulación" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const o = await client.query("SELECT estado FROM orden_trabajo WHERE id_orden = $1 FOR UPDATE", [id]);
    if (!o.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Orden no encontrada" }); }
    if (o.rows[0].estado === "ANULADA") { await client.query("ROLLBACK"); return res.status(409).json({ message: "Ya está anulada" }); }

    // Los documentos de bodega vigentes son movimientos reales de material: no
    // se pueden dejar colgando de una orden anulada sin resolverlos primero.
    const docs = await client.query(
      `SELECT correlativo FROM taller_documento_inventario
        WHERE id_orden_trabajo = $1 AND estado = 'VIGENTE' ORDER BY correlativo`, [id]
    );
    if (docs.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: `Esta orden tiene documentos de bodega vigentes (${docs.rows.map((x) => x.correlativo).join(", ")}). Anulalos primero.`,
        documentos: docs.rows.map((x) => x.correlativo),
      });
    }

    await client.query(
      `UPDATE orden_trabajo
          SET estado='ANULADA', anulado_en=NOW(), anulado_por=$2, motivo_anulacion=$3
        WHERE id_orden = $1`,
      [id, req.user?.id_usuario || null, txt(motivo_anulacion)]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── Reporte de Inspección ───────────────────────────────────────────────────

/**
 * Lo que el sistema ya sabe del avión, para pre-llenar el reporte: el tacómetro
 * actual y qué inspección viene. Así el mecánico solo confirma.
 */
exports.sugerenciaInspeccion = catchAsync(async (req, res) => {
  const { id_aeronave } = req.params;
  const a = await db.query(
    `SELECT id_aeronave, codigo, modelo, designacion,
            COALESCE(horas_acumuladas,0) AS horas_acumuladas,
            horas_proxima_revision, tipo_proxima_revision
       FROM aeronave WHERE id_aeronave = $1`, [id_aeronave]
  );
  if (!a.rows.length) return res.status(404).json({ message: "Aeronave no encontrada" });

  const tareas = await db.query(
    `SELECT id_tarea, nombre, tipo, intervalo_horas, proxima_horas, proxima_fecha
       FROM taller_tarea_programada
      WHERE id_aeronave = $1 AND activo = true
      ORDER BY proxima_horas NULLS LAST`, [id_aeronave]
  );
  res.json({ aeronave: a.rows[0], tareas: tareas.rows });
});

exports.listReportes = catchAsync(async (req, res) => {
  const { id_aeronave, desde, hasta } = req.query;
  const cond = ["r.estado = 'VIGENTE'"];
  const params = [];
  const p = (v) => `$${params.push(v)}`;
  if (id_aeronave) cond.push(`r.id_aeronave = ${p(Number(id_aeronave))}`);
  if (desde) cond.push(`r.fecha >= ${p(desde)}::date`);
  if (hasta) cond.push(`r.fecha <= ${p(hasta)}::date`);

  const r = await db.query(
    `SELECT r.*, a.codigo AS aeronave_codigo,
            COALESCE(TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')), r.piloto_nombre) AS piloto,
            (SELECT o.correlativo FROM orden_trabajo o WHERE o.id_reporte = r.id_reporte LIMIT 1) AS orden_correlativo
       FROM reporte_inspeccion r
       JOIN aeronave a ON a.id_aeronave = r.id_aeronave
       LEFT JOIN usuario u ON u.id_usuario = r.id_piloto
      WHERE ${cond.join(" AND ")}
      ORDER BY r.fecha DESC, r.id_reporte DESC LIMIT 200`,
    params
  );
  res.json(r.rows);
});

exports.crearReporte = catchAsync(async (req, res) => {
  const {
    id_aeronave, fecha, tacometro, id_piloto, piloto_nombre,
    tipo_inspeccion, observaciones,
  } = req.body;
  if (!id_aeronave) return res.status(400).json({ message: "Elegí la aeronave" });
  if (!id_piloto && !txt(piloto_nombre)) {
    return res.status(400).json({ message: "Anotá qué piloto reportó el avión" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const anio = Number(String(fecha || "").slice(0, 4)) || new Date().getFullYear();
    const { numero, correlativo } = await siguienteCorrelativoRI(client, anio);
    const r = await client.query(
      `INSERT INTO reporte_inspeccion
         (anio, numero, correlativo, id_aeronave, fecha, tacometro, id_piloto, piloto_nombre,
          tipo_inspeccion, observaciones, recibido_por, creado_por)
       VALUES ($1,$2,$3,$4, COALESCE($5::date, CURRENT_DATE), $6::numeric,$7,$8,$9,$10,$11,$11)
       RETURNING *`,
      [anio, numero, correlativo, id_aeronave, fecha || null, num(tacometro),
       id_piloto || null, txt(piloto_nombre), txt(tipo_inspeccion), txt(observaciones),
       req.user?.id_usuario || null]
    );
    await client.query("COMMIT");
    res.json(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── El folder del avión y el buscador por mantenimiento ─────────────────────

/**
 * Todo lo que existe de una aeronave en el Taller, en una sola vista.
 * Es el equivalente digital del folder que hoy arman a mano.
 */
exports.fichaAeronave = catchAsync(async (req, res) => {
  const { id_aeronave } = req.params;
  const a = await db.query(
    "SELECT id_aeronave, codigo, modelo, designacion, es_externa, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision FROM aeronave WHERE id_aeronave = $1",
    [id_aeronave]
  );
  if (!a.rows.length) return res.status(404).json({ message: "Aeronave no encontrada" });

  const [ordenes, reportes, documentos, consumo] = await Promise.all([
    db.query(`${SELECT_OT} WHERE o.id_aeronave = $1 ORDER BY o.fecha DESC LIMIT 100`, [id_aeronave]),
    db.query(
      `SELECT id_reporte, correlativo, fecha, tipo_inspeccion, tacometro
         FROM reporte_inspeccion WHERE id_aeronave = $1 AND estado='VIGENTE'
        ORDER BY fecha DESC LIMIT 100`, [id_aeronave]),
    db.query(
      `SELECT d.id_documento, d.tipo, d.correlativo, d.fecha, d.motivo, d.orden_trabajo_no,
              d.id_orden_trabajo, COUNT(m.id_mov)::int AS renglones
         FROM taller_documento_inventario d
         LEFT JOIN taller_movimiento_inventario m ON m.id_documento = d.id_documento
        WHERE d.id_aeronave = $1 AND d.estado = 'VIGENTE'
        GROUP BY d.id_documento ORDER BY d.fecha DESC LIMIT 200`, [id_aeronave]),
    db.query(
      `SELECT COALESCE(SUM(ABS(m.cantidad)),0) AS unidades,
              ROUND(COALESCE(SUM(ABS(m.cantidad) * COALESCE(m.costo_unitario,0)),0),2) AS valor
         FROM taller_documento_inventario d
         JOIN taller_movimiento_inventario m ON m.id_documento = d.id_documento
        WHERE d.id_aeronave = $1 AND d.tipo='SALIDA' AND d.estado='VIGENTE'`, [id_aeronave]),
  ]);

  res.json({
    aeronave: a.rows[0],
    ordenes: ordenes.rows,
    reportes: reportes.rows,
    documentos: documentos.rows,
    consumo: consumo.rows[0],
  });
});

// ── Impresión ───────────────────────────────────────────────────────────────

async function formularioDe(clave) {
  const r = await db.query("SELECT * FROM taller_formulario WHERE clave = $1", [clave]);
  return r.rows[0] || null;
}

/** La Orden de Trabajo en el formato CAAA-006-F, con sus partes reemplazadas. */
exports.imprimirOrden = catchAsync(async (req, res) => {
  const { id } = req.params;
  const o = await db.query(`${SELECT_OT} WHERE o.id_orden = $1`, [id]);
  if (!o.rows.length) return res.status(404).json({ message: "Orden de trabajo no encontrada" });
  const partes = await db.query(
    "SELECT * FROM orden_trabajo_parte WHERE id_orden = $1 ORDER BY orden, id_parte", [id]
  );
  const pdf = generarOrdenTrabajoPDF({
    orden: o.rows[0], partes: partes.rows, formulario: await formularioDe("ORDEN_TRABAJO"),
  });
  res.setHeader("Content-Type", "application/pdf");
  // El correlativo lleva barra (CAAA/2026-0049) y no sirve como nombre de archivo.
  res.setHeader("Content-Disposition", `inline; filename="${String(o.rows[0].correlativo).replace(/\//g, "-")}.pdf"`);
  pdf.pipe(res);
});

/** El Reporte de Inspección, la entrega del avión al taller. */
exports.imprimirReporte = catchAsync(async (req, res) => {
  const { id } = req.params;
  const r = await db.query(
    `SELECT ri.*, a.codigo AS aeronave_codigo,
            COALESCE(TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')), ri.piloto_nombre) AS piloto
       FROM reporte_inspeccion ri
       JOIN aeronave a ON a.id_aeronave = ri.id_aeronave
       LEFT JOIN usuario u ON u.id_usuario = ri.id_piloto
      WHERE ri.id_reporte = $1`, [id]
  );
  if (!r.rows.length) return res.status(404).json({ message: "Reporte no encontrado" });
  const pdf = generarReporteInspeccionPDF({
    reporte: r.rows[0], formulario: await formularioDe("REPORTE_INSPECCION"),
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${r.rows[0].correlativo}.pdf"`);
  pdf.pipe(res);
});
