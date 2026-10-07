// legacy/CAA-backend/tests/cancelacionEmergenciaSQL.test.js
//
// La regla "emergencia = pedida con menos de 24 h para la salida" vive en
// fragmentos SQL, así que se prueba contra Postgres. Solo LEE: las filas se
// arman con VALUES, salvo el caso de las rutas con parada, que mira las rutas
// que existan. Sin credenciales de base (DB_HOST) se salta.
//
// Cada caso corre con la sesión en UTC y en El Salvador: la cuenta no puede
// depender de la zona de la sesión (CLAUDE.md §35.A).
const test = require("node:test");
const assert = require("node:assert/strict");
require("dotenv").config({ quiet: true });
const { Pool } = require("pg");
const {
  esEmergenciaSQL, seriaEmergenciaSQL, comoInstanteSQL, horasSQL, salidaVueloSQL, AHORA_SV,
} = require("../services/cancelacionService");

const sinBase = !process.env.DB_HOST;
const ZONAS = ["UTC", "America/El_Salvador"];

let pool;
test.before(() => {
  if (sinBase) return;
  pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    max: 1,
  });
});
test.after(async () => { if (pool) await pool.end(); });

/** Corre `fn(consulta)` una vez por zona de sesión. */
async function enCadaZona(fn) {
  const c = await pool.connect();
  try {
    for (const zona of ZONAS) {
      await c.query(`SET timezone = '${zona}'`);
      await fn((sql, params) => c.query(sql, params).then((r) => r.rows[0]), zona);
    }
  } finally {
    await c.query("RESET timezone").catch(() => {});
    c.release();
  }
}

const SOLICITUD = `
  SELECT ${esEmergenciaSQL("sc", "v", "b")} AS e
    FROM (VALUES ($1::timestamp)) AS sc(creado_en),
         (VALUES ($2::date, NULL::int)) AS v(fecha_vuelo, grupo_ruta),
         (VALUES ($3::time))      AS b(hora_inicio)`;

test("pedida 23 h 59 min antes de la salida: es emergencia", { skip: sinBase }, async () => {
  await enCadaZona(async (q, zona) => {
    const r = await q(SOLICITUD, ["2026-10-06 13:31:00", "2026-10-07", "13:30"]);
    assert.equal(r.e, true, zona);
  });
});

test("pedida con 24 h exactas o más: no es emergencia", { skip: sinBase }, async () => {
  await enCadaZona(async (q, zona) => {
    assert.equal((await q(SOLICITUD, ["2026-10-06 13:30:00", "2026-10-07", "13:30"])).e, false, `24 h, ${zona}`);
    assert.equal((await q(SOLICITUD, ["2026-10-06 12:30:00", "2026-10-07", "13:30"])).e, false, `25 h, ${zona}`);
    assert.equal((await q(SOLICITUD, ["2026-10-01 09:00:00", "2026-10-07", "13:30"])).e, false, `días, ${zona}`);
  });
});

// El caso real del 2026-10-06: pedida a las 15:01 para un vuelo del día
// siguiente a las 13:30 (22.5 h).
test("la solicitud 33 (15:01 para las 13:30 del día siguiente) es emergencia", { skip: sinBase }, async () => {
  await enCadaZona(async (q, zona) => {
    const r = await q(SOLICITUD, ["2026-10-06 15:01:26.829", "2026-10-07", "13:30:00"]);
    assert.equal(r.e, true, zona);
  });
});

// Antes de que la solicitud exista, la misma cuenta contra "ahora".
const VUELO_A = `
  WITH x AS (SELECT ${AHORA_SV} + ($1 || ' minutes')::interval AS salida)
  SELECT ${seriaEmergenciaSQL("v", "b")} AS e,
         (${salidaVueloSQL("v", "b")} <= ${AHORA_SV}) AS ya_salio
    FROM (SELECT salida::date AS fecha_vuelo, NULL::int AS grupo_ruta FROM x) v,
         (SELECT salida::time AS hora_inicio FROM x) b`;

test("un vuelo que sale en 23 h sería emergencia; en 25 h, no", { skip: sinBase }, async () => {
  await enCadaZona(async (q, zona) => {
    assert.equal((await q(VUELO_A, [23 * 60])).e, true, `23 h, ${zona}`);
    assert.equal((await q(VUELO_A, [25 * 60])).e, false, `25 h, ${zona}`);
  });
});

test("un vuelo que salió hace 5 minutos ya salió; uno en 5 minutos, no", { skip: sinBase }, async () => {
  await enCadaZona(async (q, zona) => {
    assert.equal((await q(VUELO_A, [-5])).ya_salio, true, zona);
    assert.equal((await q(VUELO_A, [5])).ya_salio, false, zona);
  });
});

// Una ruta con parada se cancela entera, así que su salida es la del tramo 1
// aunque la solicitud se haya pedido sobre el tramo 2 o el 3. Solo lectura
// sobre las rutas que existan; si no hay ninguna, no hay nada que comparar.
test("en una ruta con parada, la salida de cualquier tramo es la del tramo 1", { skip: sinBase }, async (t) => {
  const { rows } = await pool.query(`
    SELECT v.id_vuelo, v.orden_tramo,
           ${salidaVueloSQL("v", "b")} AS salida,
           (v.fecha_vuelo + b.hora_inicio::time) AS propia,
           (SELECT t1.fecha_vuelo + b1.hora_inicio::time
              FROM vuelo t1 JOIN bloque_horario b1 ON b1.id_bloque = t1.id_bloque
             WHERE t1.grupo_ruta = v.grupo_ruta AND t1.orden_tramo = 1) AS del_tramo_1
      FROM vuelo v
      JOIN bloque_horario b ON b.id_bloque = v.id_bloque
     WHERE v.grupo_ruta IS NOT NULL
     ORDER BY v.grupo_ruta, v.orden_tramo
     LIMIT 60`);
  if (rows.length === 0) return t.skip("no hay rutas con parada en la base");
  for (const r of rows) {
    assert.equal(r.salida.getTime(), r.del_tramo_1.getTime(), `vuelo ${r.id_vuelo} (tramo ${r.orden_tramo})`);
  }
  // Y que la prueba muerda: algún tramo posterior tiene un bloque distinto al
  // del tramo 1, o sea que con la cuenta vieja habría salido otra hora.
  const posteriores = rows.filter((r) => r.orden_tramo > 1);
  if (posteriores.length > 0) {
    assert.ok(posteriores.some((r) => r.propia.getTime() !== r.salida.getTime()),
      "ningún tramo posterior difiere del tramo 1: la prueba no distingue nada");
  }
});

// Lo que viaja al navegador tiene que ser el instante real: las 13:30 de El
// Salvador son las 19:30 UTC, lea quien lea y en la zona que sea.
test("una hora local sale hacia el cliente como instante real", { skip: sinBase }, async () => {
  await enCadaZona(async (q, zona) => {
    const r = await q(`SELECT ${comoInstanteSQL("$1::timestamp")} AS t`, ["2026-10-07 13:30:00"]);
    assert.equal(r.t.toISOString(), "2026-10-07T19:30:00.000Z", zona);
  });
});

test("las horas de anticipación salen como número con un decimal", { skip: sinBase }, async () => {
  await enCadaZona(async (q, zona) => {
    const r = await q(`SELECT ${horasSQL("interval '22 hours 29 minutes'")} AS h`);
    assert.equal(r.h, 22.5, zona);
    assert.equal(typeof r.h, "number", zona);
  });
});
