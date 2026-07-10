const db = require("../config/db");

async function getNextSemanaId() {
  const semanaRes = await db.query(`
    SELECT id_semana
    FROM semana_vuelo
    WHERE fecha_inicio > CURRENT_DATE
    ORDER BY fecha_inicio
    LIMIT 1
  `);
  if (semanaRes.rows.length === 0) return null;
  return semanaRes.rows[0].id_semana;
}

async function getCurrentSemanaId() {
  const res = await db.query(`
    SELECT id_semana
    FROM semana_vuelo
    WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
    LIMIT 1
  `);
  return res.rows[0]?.id_semana;
}

/**
 * Crea la siguiente semana_vuelo (lunes→sábado) a partir de la última
 * existente (o desde hoy si no hay ninguna todavía). Misma lógica que usaba
 * el endpoint manual POST /api/admin/asegurar-semana-futura — extraída aquí
 * para poder reutilizarla también desde el job automático de abajo.
 */
async function crearSemanaFutura(conn = db) {
  const lastRes = await conn.query(`
    SELECT fecha_fin FROM semana_vuelo ORDER BY fecha_fin DESC LIMIT 1
  `);

  let startDate;
  if (lastRes.rows.length === 0) {
    startDate = new Date();
  } else {
    startDate = new Date(lastRes.rows[0].fecha_fin);
    startDate.setDate(startDate.getDate() + 1);
  }

  // Alinear al lunes de esa semana (0=domingo..6=sábado en Date.getDay()).
  const day = startDate.getDay();
  const diff = (day + 6) % 7;
  startDate.setDate(startDate.getDate() - diff);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  const result = await conn.query(
    `INSERT INTO semana_vuelo (fecha_inicio, fecha_fin)
     VALUES ($1, $2) RETURNING id_semana, fecha_inicio, fecha_fin`,
    [startDate, endDate]
  );
  return result.rows[0];
}

/**
 * Garantiza que siempre exista al menos una semana_vuelo con
 * fecha_inicio > hoy, para que el auto-agendamiento del alumno
 * (agendarController.guardarSolicitud) y el calendario de "semana
 * siguiente" de Programación nunca se queden sin semana destino —
 * sin depender de que alguien publique una semana manualmente primero.
 * Es seguro llamarla repetidas veces: si ya existe una semana futura, no hace nada.
 */
async function asegurarProximaSemanaDisponible(conn = db) {
  const existe = await conn.query(
    `SELECT 1 FROM semana_vuelo WHERE fecha_inicio > CURRENT_DATE LIMIT 1`
  );
  if (existe.rows.length > 0) return null;

  const creada = await crearSemanaFutura(conn);
  console.log(
    `[auto] Semana futura creada automáticamente: #${creada.id_semana} ` +
    `(${creada.fecha_inicio.toISOString().slice(0, 10)} → ${creada.fecha_fin.toISOString().slice(0, 10)})`
  );
  return creada;
}

module.exports = {
  getNextSemanaId,
  getCurrentSemanaId,
  crearSemanaFutura,
  asegurarProximaSemanaDisponible,
};
