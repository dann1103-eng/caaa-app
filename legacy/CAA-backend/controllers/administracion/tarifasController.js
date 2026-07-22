const db = require("../../config/db");

exports.listAeronaveTarifas = async (req, res) => {
  try {
    // Solo el precio ESTÁNDAR vigente de cada avión (los precios especiales se
    // gestionan aparte, por avión). Se cuenta cuántos precios especiales tiene
    // cada uno para mostrarlo en la tabla.
    const r = await db.query(`
      SELECT t.id, t.id_aeronave, t.modelo_aeronave, t.tarifa_hora_usd,
             t.vigente_desde, t.vigente_hasta, t.nombre, t.es_estandar,
             a.codigo AS aeronave_codigo, a.modelo AS aeronave_modelo,
             (SELECT COUNT(*) FROM aeronave_tarifa e
                WHERE e.id_aeronave = t.id_aeronave AND e.es_estandar = FALSE
                  AND (e.vigente_hasta IS NULL OR e.vigente_hasta >= CURRENT_DATE)
             ) AS precios_especiales
      FROM aeronave_tarifa t
      LEFT JOIN aeronave a ON a.id_aeronave = t.id_aeronave
      WHERE COALESCE(t.es_estandar, TRUE) = TRUE
        AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= CURRENT_DATE)
      ORDER BY t.modelo_aeronave, t.vigente_desde DESC
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Precios (estándar + especiales) vigentes de UN avión. Para el modal
 * "Gestionar precios" y para poblar el selector en el perfil del alumno.
 */
exports.getNivelesAeronave = async (req, res) => {
  try {
    const { id_aeronave } = req.params;
    const r = await db.query(`
      SELECT id, id_aeronave, nombre, tarifa_hora_usd, es_estandar, vigente_desde
      FROM aeronave_tarifa
      WHERE id_aeronave = $1
        AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
      ORDER BY es_estandar DESC, nombre
    `, [id_aeronave]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Crea un PRECIO ESPECIAL (no estándar) para un avión: nombre + tarifa fija.
 * No se versiona por fecha (Daniel: montos fijos editables) — queda vigente
 * hasta que se edite o se borre.
 */
exports.crearNivelTarifa = async (req, res) => {
  try {
    const { id_aeronave, nombre, tarifa_hora_usd } = req.body;
    if (!id_aeronave || !nombre?.trim() || tarifa_hora_usd == null || Number(tarifa_hora_usd) < 0) {
      return res.status(400).json({ ok: false, message: "Avión, nombre y tarifa (>= 0) son requeridos" });
    }
    const aero = await db.query(`SELECT modelo FROM aeronave WHERE id_aeronave = $1`, [id_aeronave]);
    if (aero.rows.length === 0) return res.status(400).json({ ok: false, message: "Aeronave no encontrada" });

    const r = await db.query(`
      INSERT INTO aeronave_tarifa (id_aeronave, modelo_aeronave, nombre, tarifa_hora_usd, es_estandar, vigente_desde, creado_por)
      VALUES ($1, $2, $3, $4, FALSE, CURRENT_DATE, $5)
      RETURNING *
    `, [id_aeronave, aero.rows[0].modelo, nombre.trim(), tarifa_hora_usd, req.user?.id_usuario || null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/** Edita un precio especial en el lugar (nombre y/o monto). Solo es_estandar=false. */
exports.editarNivelTarifa = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tarifa_hora_usd } = req.body;
    const r = await db.query(`
      UPDATE aeronave_tarifa
      SET nombre = COALESCE(NULLIF($2, ''), nombre),
          tarifa_hora_usd = COALESCE($3, tarifa_hora_usd)
      WHERE id = $1 AND es_estandar = FALSE
      RETURNING *
    `, [id, nombre ?? null, tarifa_hora_usd != null && tarifa_hora_usd !== '' ? Number(tarifa_hora_usd) : null]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, message: "Precio especial no encontrado" });
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/** Borra un precio especial (las asignaciones a alumnos caen por CASCADE → vuelven al estándar). */
exports.borrarNivelTarifa = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query(`DELETE FROM aeronave_tarifa WHERE id = $1 AND es_estandar = FALSE RETURNING id`, [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, message: "Precio especial no encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Precios por avión de un alumno: cada avión con su precio estándar, sus precios
 * especiales disponibles, y cuál tiene asignado el alumno (id_tarifa o null=estándar).
 */
exports.getPreciosAlumno = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const r = await db.query(`
      SELECT a.id_aeronave, a.codigo, a.modelo,
             est.id AS id_tarifa_estandar, est.tarifa_hora_usd AS tarifa_estandar,
             ata.id_tarifa AS id_tarifa_asignada,
             COALESCE(
               (SELECT json_agg(json_build_object(
                   'id', e.id, 'nombre', e.nombre, 'tarifa_hora_usd', e.tarifa_hora_usd)
                   ORDER BY e.nombre)
                FROM aeronave_tarifa e
                WHERE e.id_aeronave = a.id_aeronave AND e.es_estandar = FALSE
                  AND (e.vigente_hasta IS NULL OR e.vigente_hasta >= CURRENT_DATE)),
               '[]'
             ) AS especiales
      FROM aeronave a
      LEFT JOIN LATERAL (
        SELECT id, tarifa_hora_usd FROM aeronave_tarifa
        WHERE id_aeronave = a.id_aeronave AND es_estandar = TRUE
          AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
        ORDER BY vigente_desde DESC LIMIT 1
      ) est ON TRUE
      LEFT JOIN alumno_tarifa_aeronave ata
        ON ata.id_aeronave = a.id_aeronave AND ata.id_alumno = $1
      WHERE a.activa = TRUE
      ORDER BY a.codigo
    `, [id_alumno]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Asigna (o quita, si id_tarifa es null) el precio especial de un avión a un alumno.
 * Valida que la tarifa sea un precio especial de ESE avión.
 */
exports.setPrecioAlumno = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const { id_aeronave, id_tarifa } = req.body;
    if (!id_aeronave) return res.status(400).json({ ok: false, message: "id_aeronave requerido" });

    if (id_tarifa == null || id_tarifa === '') {
      // Quitar la asignación → el alumno vuelve al precio estándar.
      await db.query(`DELETE FROM alumno_tarifa_aeronave WHERE id_alumno = $1 AND id_aeronave = $2`, [id_alumno, id_aeronave]);
      return res.json({ ok: true, data: null });
    }

    const t = await db.query(
      `SELECT id FROM aeronave_tarifa WHERE id = $1 AND id_aeronave = $2 AND es_estandar = FALSE`,
      [id_tarifa, id_aeronave]
    );
    if (t.rows.length === 0) return res.status(400).json({ ok: false, message: "El precio no corresponde a ese avión" });

    const r = await db.query(`
      INSERT INTO alumno_tarifa_aeronave (id_alumno, id_aeronave, id_tarifa, asignado_por)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id_alumno, id_aeronave)
      DO UPDATE SET id_tarifa = EXCLUDED.id_tarifa, asignado_por = EXCLUDED.asignado_por, asignado_en = now()
      RETURNING *
    `, [id_alumno, id_aeronave, id_tarifa, req.user?.id_usuario || null]);
    res.json({ ok: true, data: r.rows[0] });
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

    // Cerrar la tarifa ESTÁNDAR vigente anterior (los precios especiales NO se
    // tocan). Por id_aeronave si lo hay, si no por modelo.
    if (id_aeronave) {
      await client.query(`
        UPDATE aeronave_tarifa
        SET vigente_hasta = ($1::date - INTERVAL '1 day')
        WHERE id_aeronave = $2 AND vigente_hasta IS NULL AND COALESCE(es_estandar, TRUE) = TRUE
      `, [vigente_desde, id_aeronave]);
    } else {
      await client.query(`
        UPDATE aeronave_tarifa
        SET vigente_hasta = ($1::date - INTERVAL '1 day')
        WHERE modelo_aeronave = $2 AND id_aeronave IS NULL AND vigente_hasta IS NULL AND COALESCE(es_estandar, TRUE) = TRUE
      `, [vigente_desde, modelo_aeronave]);
    }

    const r = await client.query(`
      INSERT INTO aeronave_tarifa (id_aeronave, modelo_aeronave, nombre, tarifa_hora_usd, es_estandar, vigente_desde, creado_por)
      VALUES ($1, $2, 'Estándar', $3, TRUE, $4, $5) RETURNING *
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
             it.es_servicios_profesionales,
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
      es_servicios_profesionales,
      vigente_desde
    } = req.body;

    if (!id_instructor) return res.status(400).json({ ok: false, message: "id_instructor requerido" });
    const tp = (tipo_pago || 'POR_HORA').toUpperCase();
    if (!['MENSUAL_FIJO','POR_HORA','MIXTO'].includes(tp)) {
      return res.status(400).json({ ok: false, message: "tipo_pago inválido" });
    }
    // Por defecto: mensual fijo → planta; lo demás → servicios. El selector explícito manda.
    const esServicios = es_servicios_profesionales != null
      ? !!es_servicios_profesionales
      : (tp !== 'MENSUAL_FIJO');
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
         es_servicios_profesionales, vigente_desde, creado_por)
      VALUES ($1, $2, $3, $4, $5, $4, $6, $7, $8)
      RETURNING *
    `, [id_instructor, tp, salMens, tarVuelo, tarTeoria, esServicios, desde, req.user?.id_usuario || null]);

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
