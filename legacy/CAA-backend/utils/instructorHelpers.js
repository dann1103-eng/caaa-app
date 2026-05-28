const db = require("../config/db");
const transporter = require("./mailer");

async function resolverIdInstructor(id_usuario) {
  const r = await db.query(
    "SELECT id_instructor FROM instructor WHERE id_usuario = $1",
    [id_usuario]
  );
  return r.rows[0]?.id_instructor ?? null;
}

async function getSemanaActual() {
  const r = await db.query(
    `SELECT id_semana, fecha_inicio, fecha_fin
     FROM semana_vuelo
     WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
       AND publicada = true
     LIMIT 1`
  );
  return r.rows[0] ?? null;
}

async function getSemanaProxima() {
  const r = await db.query(
    `SELECT id_semana, fecha_inicio, fecha_fin
     FROM semana_vuelo
     WHERE fecha_inicio > CURRENT_DATE
     ORDER BY fecha_inicio
     LIMIT 1`
  );
  return r.rows[0] ?? null;
}

async function registrarHorasInstructor(client, id_vuelo, id_aeronave, id_alumno, tiempo_vuelo_min, io, id_usuario = null) {
  const horasVoladas = parseFloat((tiempo_vuelo_min / 60).toFixed(4));
  if (horasVoladas <= 0) return;

  const aeronaveRes = await client.query(
    `SELECT COALESCE(horas_acumuladas, 0) AS horas_acumuladas, codigo 
     FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`,
    [id_aeronave]
  );
  if (aeronaveRes.rows.length === 0) return;

  const horasAntes = parseFloat(aeronaveRes.rows[0].horas_acumuladas);
  const nuevasHoras = horasAntes + horasVoladas;
  const codigo = aeronaveRes.rows[0].codigo;

  const alumnoRes = await client.query(
    `SELECT COALESCE(horas_acumuladas, 0) AS horas_acumuladas 
     FROM alumno WHERE id_alumno = $1 FOR UPDATE`,
    [id_alumno]
  );
  if (alumnoRes.rows.length === 0) return;
  const nuevasHorasAlumno = parseFloat(alumnoRes.rows[0].horas_acumuladas) + horasVoladas;

  await client.query(
    `UPDATE alumno SET horas_acumuladas = $1 WHERE id_alumno = $2`,
    [nuevasHorasAlumno, id_alumno]
  );

  // NOTA: Las horas de la aeronave y mantenimiento ya no se actualizan aquí por minutos de reloj,
  // sino en el reporte de vuelo mediante el Tacómetro (TAC).
}

module.exports = {
  resolverIdInstructor,
  getSemanaActual,
  getSemanaProxima,
  registrarHorasInstructor,
};
