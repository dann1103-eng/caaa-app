const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const { puedeAccederVuelo } = require("../../utils/ownership");

const blankToNull = (v) => (v === "" || v === undefined ? null : v);
const toIntOrNull = (v) => {
  if (v === "" || v === undefined || v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
};

exports.getPlanVuelo = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const result = await db.query(`
    SELECT v.*, ae.codigo AS aeronave_codigo, u_al.nombre AS alumno_nombre, u_ins.nombre AS instructor_nombre
    FROM vuelo v
    JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
    JOIN alumno a ON a.id_alumno = v.id_alumno
    JOIN usuario u_al ON u_al.id_usuario = a.id_usuario
    JOIN instructor i ON i.id_instructor = v.id_instructor
    JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario
    WHERE v.id_vuelo = $1
  `, [id_vuelo]);
  
  if (result.rows.length === 0) return res.status(404).json({ message: "Vuelo no encontrado" });
  const planRes = await db.query(`SELECT * FROM plan_vuelo WHERE id_vuelo = $1`, [id_vuelo]);
  const p = planRes.rows[0];
  // Traducir columnas de BD -> nombres de campo que espera PlanVueloModal.jsx
  // (mismo mapeo, invertido, que guardarPlanVuelo).
  const plan = p ? {
    estado: p.estado,
    reglas_vuelo: p.reglas,
    hora_vuelo: p.hora_salida,
    altitud: p.altitud,
    ruta: p.ruta,
    tiempo_ruta: p.tiempo_ruta,
    combustible: p.combustible_abordo,
    personas_a_bordo: p.personas_abordo,
    velocidad: p.velocidad_verdadera,
    destino: p.destino,
    alternativo: p.aeropuerto_alterno,
    frecuencias: typeof p.frecuencias === "string" ? p.frecuencias : (p.frecuencias ?? null),
    vor_dme_adf: p.vor_dme_adf,
    observaciones: p.observaciones,
    piloto_al_mando: p.piloto_al_mando,
    despacho: p.despacho,
    lugar_salida: p.lugar_salida,
    fecha_vuelo: p.fecha_vuelo,
    colores: p.colores,
    ilop_radio: p.ilop_radio,
    pilot1_nombre: p.pilot1_nombre,
    pilot1_licencia: p.pilot1_licencia,
    pilot1_domicilio: p.pilot1_domicilio,
    pilot2_nombre: p.pilot2_nombre,
    pilot2_licencia: p.pilot2_licencia,
    pilot2_domicilio: p.pilot2_domicilio,
  } : null;
  res.json({ vuelo: result.rows[0], plan });
});

exports.guardarPlanVuelo = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const data = req.body;

  // El formulario (PlanVueloModal.jsx) usa sus propios nombres de campo, que
  // no coinciden 1 a 1 con las columnas de la tabla (reglas_vuelo -> reglas,
  // hora_vuelo -> hora_salida, etc.). Mapeo explícito para no perder datos.
  const params = [
    id_vuelo,
    blankToNull(data.reglas_vuelo),
    blankToNull(data.hora_vuelo),
    blankToNull(data.altitud),
    blankToNull(data.ruta),
    blankToNull(data.tiempo_ruta),
    blankToNull(data.combustible),
    toIntOrNull(data.personas_a_bordo),
    blankToNull(data.velocidad),
    blankToNull(data.destino),
    blankToNull(data.alternativo),
    data.frecuencias ? JSON.stringify(data.frecuencias) : null,
    blankToNull(data.vor_dme_adf),
    blankToNull(data.observaciones),
    blankToNull(data.piloto_al_mando),
    blankToNull(data.despacho),
    blankToNull(data.lugar_salida),
    blankToNull(data.fecha_vuelo),
    blankToNull(data.colores),
    blankToNull(data.ilop_radio),
    blankToNull(data.pilot1_nombre),
    blankToNull(data.pilot1_licencia),
    blankToNull(data.pilot1_domicilio),
    blankToNull(data.pilot2_nombre),
    blankToNull(data.pilot2_licencia),
    blankToNull(data.pilot2_domicilio),
  ];

  await db.query(`
    INSERT INTO plan_vuelo (
      id_vuelo, reglas, hora_salida, altitud, ruta, tiempo_ruta,
      combustible_abordo, personas_abordo, velocidad_verdadera, destino,
      aeropuerto_alterno, frecuencias, vor_dme_adf, observaciones,
      piloto_al_mando, despacho, lugar_salida, fecha_vuelo, colores,
      ilop_radio, pilot1_nombre, pilot1_licencia, pilot1_domicilio,
      pilot2_nombre, pilot2_licencia, pilot2_domicilio, estado
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'BORRADOR')
    ON CONFLICT (id_vuelo) DO UPDATE SET
      reglas = EXCLUDED.reglas,
      hora_salida = EXCLUDED.hora_salida,
      altitud = EXCLUDED.altitud,
      ruta = EXCLUDED.ruta,
      tiempo_ruta = EXCLUDED.tiempo_ruta,
      combustible_abordo = EXCLUDED.combustible_abordo,
      personas_abordo = EXCLUDED.personas_abordo,
      velocidad_verdadera = EXCLUDED.velocidad_verdadera,
      destino = EXCLUDED.destino,
      aeropuerto_alterno = EXCLUDED.aeropuerto_alterno,
      frecuencias = EXCLUDED.frecuencias,
      vor_dme_adf = EXCLUDED.vor_dme_adf,
      observaciones = EXCLUDED.observaciones,
      piloto_al_mando = EXCLUDED.piloto_al_mando,
      despacho = EXCLUDED.despacho,
      lugar_salida = EXCLUDED.lugar_salida,
      fecha_vuelo = EXCLUDED.fecha_vuelo,
      colores = EXCLUDED.colores,
      ilop_radio = EXCLUDED.ilop_radio,
      pilot1_nombre = EXCLUDED.pilot1_nombre,
      pilot1_licencia = EXCLUDED.pilot1_licencia,
      pilot1_domicilio = EXCLUDED.pilot1_domicilio,
      pilot2_nombre = EXCLUDED.pilot2_nombre,
      pilot2_licencia = EXCLUDED.pilot2_licencia,
      pilot2_domicilio = EXCLUDED.pilot2_domicilio,
      estado = CASE WHEN plan_vuelo.estado = 'COMPLETADO' THEN plan_vuelo.estado ELSE 'BORRADOR' END,
      actualizado_en = NOW()
  `, params);
  res.json({ message: "Plan de vuelo guardado" });
});

exports.completarPlanVuelo = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const archivo = req.file;
  if (!archivo) return res.status(400).json({ message: "Se requiere el PDF del plan de vuelo" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE plan_vuelo SET estado = 'COMPLETADO', archivo_pdf = $1, actualizado_en = NOW() WHERE id_vuelo = $2`, [archivo.filename, id_vuelo]);
    await logAuditoria(client, { accion: "FILL_PLAN_VUELO", entidad: "plan_vuelo", id_entidad: Number(id_vuelo), actor: req.user, req, descripcion: "Alumno completó plan de vuelo" });
    await client.query("COMMIT");
    res.json({ message: "Plan de vuelo completado", archivo_pdf: archivo.filename });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

