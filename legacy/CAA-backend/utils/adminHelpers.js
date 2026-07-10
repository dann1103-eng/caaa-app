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
 * Crea UNA semana_vuelo nueva (lunes + 6 días) inmediatamente posterior a la
 * última existente (o cubriendo hoy si la BD está vacía). NO garantiza que la
 * semana creada quede en el futuro — para eso está asegurarProximaSemanaDisponible,
 * que la llama en bucle hasta alcanzar el futuro. La usa también el endpoint
 * manual POST /api/admin/asegurar-semana-futura.
 *
 * Alineación al lunes:
 *  - BD vacía  → lunes de la semana ACTUAL (hacia atrás) para cubrir hoy.
 *  - Con datos → lunes SIGUIENTE al fin de la última semana (hacia adelante).
 *    Se alinea hacia adelante a propósito: las semanas terminan en sábado, así
 *    que el día siguiente es domingo; alinear "hacia atrás" caería sobre el
 *    lunes de la semana previa y crearía una semana solapada/duplicada.
 */
async function crearSemanaFutura(conn = db) {
  const lastRes = await conn.query(`
    SELECT fecha_fin FROM semana_vuelo ORDER BY fecha_fin DESC LIMIT 1
  `);

  let startDate;
  // getDay(): Dom=0, Lun=1, ... Sáb=6
  if (lastRes.rows.length === 0) {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7)); // atrás → lunes actual
  } else {
    startDate = new Date(lastRes.rows[0].fecha_fin);
    startDate.setDate(startDate.getDate() + 1);
    startDate.setDate(startDate.getDate() + ((8 - startDate.getDay()) % 7)); // adelante → próximo lunes
  }

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
 * Garantiza que exista al menos una semana_vuelo con fecha_inicio > hoy, para
 * que el auto-agendamiento del alumno (agendarController.guardarSolicitud) y el
 * calendario de "semana siguiente" de Programación nunca se queden sin semana
 * destino — sin depender de que alguien publique una semana manualmente.
 *
 * Crea semanas en bucle (cada una 7 días después de la anterior) hasta llegar
 * al futuro. Esto cubre el caso importante de que la última semana quede varias
 * semanas ATRÁS en el tiempo (hueco): en vez de crear una sola semana pasada,
 * rellena el hueco de una pasada y deja disponible la semana actual y la próxima.
 * Es seguro llamarla repetidas veces: si ya existe una semana futura, no hace nada.
 */
async function asegurarProximaSemanaDisponible(conn = db) {
  const creadas = [];
  const MAX_ITER = 60; // tope de seguridad (~1 año) contra un bucle accidental
  for (let i = 0; i < MAX_ITER; i++) {
    const existe = await conn.query(
      `SELECT 1 FROM semana_vuelo WHERE fecha_inicio > CURRENT_DATE LIMIT 1`
    );
    if (existe.rows.length > 0) break;

    const creada = await crearSemanaFutura(conn);
    creadas.push(creada);
    console.log(
      `[auto] Semana creada automáticamente: #${creada.id_semana} ` +
      `(${creada.fecha_inicio.toISOString().slice(0, 10)} → ${creada.fecha_fin.toISOString().slice(0, 10)})`
    );
  }
  return creadas;
}

module.exports = {
  getNextSemanaId,
  getCurrentSemanaId,
  crearSemanaFutura,
  asegurarProximaSemanaDisponible,
};
