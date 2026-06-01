const db = require("../../config/db");

exports.listAeronaveTarifas = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT t.id, t.id_aeronave, t.modelo_aeronave, t.tarifa_hora_usd,
             t.vigente_desde, t.vigente_hasta,
             a.codigo AS aeronave_codigo, a.modelo AS aeronave_modelo
      FROM aeronave_tarifa t
      LEFT JOIN aeronave a ON a.id_aeronave = t.id_aeronave
      WHERE t.vigente_hasta IS NULL OR t.vigente_hasta >= CURRENT_DATE
      ORDER BY t.modelo_aeronave, t.vigente_desde DESC
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Lista de aeronaves activas para asignarles tarifa (dropdown del formulario).
 * Las tarifas se vinculan por id_aeronave para que el cargo automático al
 * cerrar un vuelo encuentre la tarifa sin depender del texto del modelo.
 */
exports.listAeronaves = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT id_aeronave, codigo, modelo, tipo
      FROM aeronave
      WHERE activa = true
      ORDER BY codigo
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.historialAeronave = async (req, res) => {
  try {
    const { id_aeronave, modelo } = req.query;
    // Preferir id_aeronave; mantener `modelo` por retrocompatibilidad.
    const r = id_aeronave
      ? await db.query(`
          SELECT id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_en
          FROM aeronave_tarifa
          WHERE id_aeronave = $1
          ORDER BY vigente_desde DESC
        `, [id_aeronave])
      : await db.query(`
          SELECT id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_en
          FROM aeronave_tarifa
          WHERE modelo_aeronave = $1
          ORDER BY vigente_desde DESC
        `, [modelo]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.upsertAeronaveTarifa = async (req, res) => {
  const client = await db.connect();
  try {
    let { id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde } = req.body;
    if (tarifa_hora_usd == null || !vigente_desde || (!id_aeronave && !modelo_aeronave)) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }

    await client.query("BEGIN");

    // Si viene id_aeronave, derivar el modelo desde la aeronave (fuente única
    // de verdad) para que el texto de la tarifa coincida con el del vuelo.
    if (id_aeronave) {
      const aero = await client.query(
        `SELECT modelo FROM aeronave WHERE id_aeronave = $1`, [id_aeronave]
      );
      if (aero.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, message: "Aeronave no encontrada" });
      }
      modelo_aeronave = aero.rows[0].modelo;
    }

    // Cerrar la tarifa vigente anterior: por id_aeronave si lo hay, si no por modelo.
    if (id_aeronave) {
      await client.query(`
        UPDATE aeronave_tarifa
        SET vigente_hasta = ($1::date - INTERVAL '1 day')
        WHERE id_aeronave = $2 AND vigente_hasta IS NULL
      `, [vigente_desde, id_aeronave]);
    } else {
      await client.query(`
        UPDATE aeronave_tarifa
        SET vigente_hasta = ($1::date - INTERVAL '1 day')
        WHERE modelo_aeronave = $2 AND id_aeronave IS NULL AND vigente_hasta IS NULL
      `, [vigente_desde, modelo_aeronave]);
    }

    const r = await client.query(`
      INSERT INTO aeronave_tarifa (id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, creado_por)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [id_aeronave || null, modelo_aeronave, tarifa_hora_usd, vigente_desde, req.user?.id_usuario || null]);
    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.listInstructorTarifas = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT it.id, it.id_instructor, u.username as instructor_nombre,
             it.tipo_pago, it.salario_mensual_fijo,
             it.tarifa_hora_vuelo, it.tarifa_hora_teoria,
             it.tarifa_hora_usd, it.vigente_desde, it.vigente_hasta
      FROM instructor_tarifa it
      LEFT JOIN instructor i ON i.id_instructor = it.id_instructor
      LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
      WHERE it.vigente_hasta IS NULL OR it.vigente_hasta >= CURRENT_DATE
      ORDER BY u.username
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Lista de instructores disponibles para asignarles tarifa.
 * Útil al crear una tarifa nueva: muestra todos los instructores existentes
 * con o sin tarifa configurada.
 */
exports.listInstructoresDisponibles = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT i.id_instructor, u.username,
             (SELECT it.tipo_pago FROM instructor_tarifa it
                WHERE it.id_instructor = i.id_instructor
                  AND (it.vigente_hasta IS NULL OR it.vigente_hasta >= CURRENT_DATE)
                ORDER BY it.vigente_desde DESC LIMIT 1) AS tipo_pago_actual
      FROM instructor i
      LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
      ORDER BY u.username
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.upsertInstructorTarifa = async (req, res) => {
  const client = await db.connect();
  try {
    const {
      id_instructor, tipo_pago,
      salario_mensual_fijo,
      tarifa_hora_vuelo,
      tarifa_hora_teoria,
      vigente_desde
    } = req.body;

    if (!id_instructor) return res.status(400).json({ ok: false, message: "id_instructor requerido" });
    const tp = (tipo_pago || 'POR_HORA').toUpperCase();
    if (!['MENSUAL_FIJO','POR_HORA','MIXTO'].includes(tp)) {
      return res.status(400).json({ ok: false, message: "tipo_pago inválido" });
    }
    const desde = vigente_desde || new Date().toISOString().slice(0, 10);

    await client.query("BEGIN");
    await client.query(`
      UPDATE instructor_tarifa
      SET vigente_hasta = ($1::date - INTERVAL '1 day')
      WHERE id_instructor = $2 AND vigente_hasta IS NULL
    `, [desde, id_instructor]);

    const salMens   = Number(salario_mensual_fijo || 0);
    const tarVuelo  = Number(tarifa_hora_vuelo || 0);
    const tarTeoria = Number(tarifa_hora_teoria || 0);

    const r = await client.query(`
      INSERT INTO instructor_tarifa
        (id_instructor, tipo_pago, salario_mensual_fijo,
         tarifa_hora_vuelo, tarifa_hora_teoria, tarifa_hora_usd,
         vigente_desde, creado_por)
      VALUES ($1, $2, $3, $4, $5, $4, $6, $7)
      RETURNING *
    `, [id_instructor, tp, salMens, tarVuelo, tarTeoria, desde, req.user?.id_usuario || null]);

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
