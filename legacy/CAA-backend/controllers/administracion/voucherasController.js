const db = require("../../config/db");

// ── Sección "Voucheras" de Administración ────────────────────────────────────
// Lista las voucheras (reportes post-vuelo) de un día, opcionalmente filtradas
// por aeronave, con TODO lo que el generador de PDF client-side necesita
// (lecturas, horas cobradas, firmas) — así el front puede tanto listar como
// armar el PDF del día completo sin más viajes al servidor.

exports.listAeronaves = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT id_aeronave, codigo, modelo, tipo, activa
      FROM aeronave
      ORDER BY codigo
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    console.error("voucheras.listAeronaves:", e);
    res.status(500).json({ ok: false, message: "Error al listar aeronaves" });
  }
};

exports.listVoucherasDia = async (req, res) => {
  try {
    let fecha = String(req.query.fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const hoy = await db.query(`SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::date::text AS d`);
      fecha = hoy.rows[0].d;
    }
    const idAeronave = parseInt(req.query.id_aeronave, 10) || null;

    // Solo vuelos COMPLETADOS con reporte (la vouchera existe recién cuando el
    // instructor la llenó). Incluye inasistencias: son parte del papeleo del día.
    const r = await db.query(`
      SELECT v.id_vuelo, v.fecha_vuelo::text AS fecha_vuelo,
             b.hora_inicio, b.hora_fin,
             a.id_aeronave, a.codigo AS aeronave_codigo, a.modelo AS aeronave_modelo, a.tipo AS aeronave_tipo,
             TRIM(u.nombre || ' ' || COALESCE(u.apellido, ''))  AS alumno_nombre,
             al.numero_licencia AS alumno_licencia,
             TRIM(u2.nombre || ' ' || COALESCE(u2.apellido, '')) AS instructor_nombre,
             i.licencia AS instructor_licencia,
             rv.id_reporte, rv.estado AS reporte_estado, rv.tipo_vuelo,
             rv.tacometro_salida, rv.tacometro_llegada,
             rv.hobbs_salida, rv.hobbs_llegada,
             rv.combustible_salida, rv.combustible_llegada, rv.cantidad_combustible,
             rv.horas_cobradas, rv.firma_alumno, rv.firma_instructor,
             COALESCE(rv.es_inasistencia, false) AS es_inasistencia, rv.motivo_inasistencia
      FROM vuelo v
      JOIN aeronave a        ON a.id_aeronave = v.id_aeronave
      JOIN alumno al         ON al.id_alumno = v.id_alumno
      JOIN usuario u         ON u.id_usuario = al.id_usuario
      LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
      LEFT JOIN usuario u2   ON u2.id_usuario = i.id_usuario
      JOIN bloque_horario b  ON b.id_bloque = v.id_bloque
      JOIN reporte_vuelo rv  ON rv.id_vuelo = v.id_vuelo
      WHERE v.fecha_vuelo = $1::date
        AND v.estado = 'COMPLETADO'
        AND ($2::int IS NULL OR v.id_aeronave = $2::int)
      ORDER BY a.codigo, b.hora_inicio, v.id_vuelo
    `, [fecha, idAeronave]);

    res.json({ ok: true, fecha, data: r.rows });
  } catch (e) {
    console.error("voucheras.listVoucherasDia:", e);
    res.status(500).json({ ok: false, message: "Error al listar las voucheras del día" });
  }
};
