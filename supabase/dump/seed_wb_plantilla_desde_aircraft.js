// Re-siembra AUTORITATIVA de `wb_plantilla` desde el catálogo del frontend
// (CAA-frontend/src/loadsheet/data/aircraft.js), que es la fuente única de verdad
// de peso & balance. Corrige la deriva actual (columnas nunca llenadas, número de
// estaciones desactualizado, etc.) sin duplicar los datos en este script.
//
// Uso (¡importante el cwd!): desde legacy/CAA-backend, para que dotenv encuentre
// el .env real:
//   cd legacy/CAA-backend
//   node ../../supabase/dump/seed_wb_plantilla_desde_aircraft.js
//
// Es transaccional: hace la verificación de paridad (re-lee lo escrito, lo pasa
// por el mapper inverso y lo compara contra AIRCRAFT) ANTES del COMMIT. Si algo
// no cuadra, hace ROLLBACK y no deja nada a medias.
//
// ⚠️ Este archivo vive en supabase/dump/, fuera del árbol de legacy/CAA-backend,
// así que NO comparte su node_modules: un `require("dotenv")` o `require("pg")`
// a secas fallaría con MODULE_NOT_FOUND (Node resuelve módulos relativos al
// archivo que hace el require, no al cwd). Por eso dotenv, el pool y el mapper
// se cargan con rutas resueltas a mano hacia legacy/CAA-backend.

const path = require("path");
const url = require("url");

require(
  path.resolve(__dirname, "../../legacy/CAA-backend/node_modules/dotenv")
).config();

const pool = require(
  path.resolve(__dirname, "../../legacy/CAA-backend/config/db.js")
);
const { objetoAircraftAFila, filaAObjetoAircraft } = require(
  path.resolve(__dirname, "../../legacy/CAA-backend/utils/wbPlantilla.js")
);

// Clave interna en aircraft.js -> matrícula real (aeronave.codigo) en Supabase.
// ⚠️ pa28_270 -> YS-270-PE: el objeto AIRCRAFT.pa28_270.reg trae 'YS-270-P' (sin
// la E final, error histórico ya documentado en CLAUDE.md §7). La matrícula
// correcta es YS-270-PE; por eso el mapper deriva `reg` de `aeronave.codigo` y
// la verificación de paridad excluye `reg` de la comparación (ver más abajo).
const KEY_A_MATRICULA = {
  pa28r180: "YS-127-P",
  c310: "YS-259-PE",
  pa28_270: "YS-270-PE",
  pa28_140: "YS-155-PE",
  c152: "YS-333-PE",
  pa38: "YS-334-PE",
};

// Campos que NO deben compararse en la verificación de paridad:
// - reg: se deriva de aeronave.codigo (la matrícula real), no del `reg` textual
//   de aircraft.js, que para pa28_270 está mal escrito.
// - empty_moment: el mapper lo recalcula (empty_weight * empty_arm) si no es
//   provisto; aunque en los 6 aviones actuales coincide con el literal de
//   aircraft.js, no es un valor que se preserve 1:1 por diseño.
const IGNORAR_EN_PARIDAD = ["reg", "empty_moment"];

/** Normaliza objetos/arrays para comparar por valor, sin importar el orden en
 * que jsonb devuelve las claves de un objeto (Postgres no garantiza preservar
 * el orden de inserción de las claves de un jsonb). Los arrays SÍ preservan
 * orden (importa el orden de las estaciones), así que no se reordenan. */
function canon(valor) {
  if (Array.isArray(valor)) return valor.map(canon);
  if (valor && typeof valor === "object") {
    return Object.keys(valor)
      .sort()
      .reduce((acc, k) => {
        acc[k] = canon(valor[k]);
        return acc;
      }, {});
  }
  return valor;
}

function sinClaves(obj, claves) {
  const copia = { ...obj };
  for (const k of claves) delete copia[k];
  return copia;
}

function normalizarParaComparar(obj) {
  return JSON.stringify(canon(sinClaves(obj, IGNORAR_EN_PARIDAD)));
}

function sonIguales(a, b) {
  return normalizarParaComparar(a) === normalizarParaComparar(b);
}

// Helpers de binding para columnas nullable: node-postgres NO acepta `undefined`
// como parámetro (revienta distinto de `null`), así que todo campo opcional que
// pueda faltar en un objeto AIRCRAFT se normaliza explícitamente a null.
const nn = (v) => (v === undefined ? null : v);
// jsonb: pasar un array/objeto JS crudo como parámetro lo serializa `pg` como
// literal de ARRAY de Postgres (`{...}`), NO como JSON. Hay que stringificarlo
// a mano. null se preserva como SQL NULL real (no la palabra jsonb "null").
const jn = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

(async () => {
  const mod = await import(
    url.pathToFileURL(
      path.resolve(
        __dirname,
        "../../CAA-frontend/src/loadsheet/data/aircraft.js"
      )
    ).href
  );
  const AIRCRAFT = mod.AIRCRAFT;

  const client = await pool.connect();
  const procesados = []; // { key, matricula, idAeronave, idWbPlantilla }

  try {
    await client.query("BEGIN");

    for (const [key, matricula] of Object.entries(KEY_A_MATRICULA)) {
      const aircraftObj = AIRCRAFT[key];
      if (!aircraftObj) {
        console.warn(
          `⚠️  SKIP ${key}: no existe en AIRCRAFT (aircraft.js). No debería pasar.`
        );
        continue;
      }

      const { rows } = await client.query(
        "SELECT id_aeronave, id_wb_plantilla FROM aeronave WHERE codigo = $1",
        [matricula]
      );

      if (rows.length === 0) {
        console.warn(
          `⚠️  SKIP ${key} (${matricula}): no existe fila en 'aeronave' con ese código. No debería pasar para las 6 aeronaves esperadas.`
        );
        continue;
      }

      const { id_aeronave, id_wb_plantilla } = rows[0];
      const fila = objetoAircraftAFila(aircraftObj);

      const valores = [
        fila.nombre, // 1
        fila.empty_weight, // 2
        fila.empty_weight_arm, // 3
        fila.empty_weight_moment, // 4
        fila.max_takeoff_weight, // 5
        fila.max_landing_weight, // 6
        nn(fila.max_useful_load), // 7
        fila.fuel_capacity_gal, // 8
        fila.fuel_usable_gal, // 9
        fila.fuel_burn_gal_hr, // 10
        fila.fuel_lb_gal, // 11
        nn(fila.default_power), // 12
        nn(fila.default_flow_gal), // 13
        fila.moment_div1000, // 14
        nn(fila.fuel_burn_note), // 15
        nn(fila.model), // 16
        nn(fila.sheet), // 17
        jn(fila.oil), // 18
        jn(fila.estaciones), // 19
        jn(fila.limits_normal), // 20
        jn(fila.limits_utility), // 21
      ];

      let idWb = id_wb_plantilla;

      if (idWb) {
        await client.query(
          `UPDATE wb_plantilla SET
             nombre = $1,
             empty_weight = $2,
             empty_weight_arm = $3,
             empty_weight_moment = $4,
             max_takeoff_weight = $5,
             max_landing_weight = $6,
             max_useful_load = $7,
             fuel_capacity_gal = $8,
             fuel_usable_gal = $9,
             fuel_burn_gal_hr = $10,
             fuel_lb_gal = $11,
             default_power = $12,
             default_flow_gal = $13,
             moment_div1000 = $14,
             fuel_burn_note = $15,
             model = $16,
             sheet = $17,
             oil = $18::jsonb,
             estaciones = $19::jsonb,
             limits_normal = $20::jsonb,
             limits_utility = $21::jsonb
           WHERE id_wb_plantilla = $22`,
          [...valores, idWb]
        );
        console.log(
          `✏️  UPDATE wb_plantilla id_wb_plantilla=${idWb}  (${key} -> ${matricula}, id_aeronave=${id_aeronave})`
        );
      } else {
        const insertRes = await client.query(
          `INSERT INTO wb_plantilla
             (nombre, empty_weight, empty_weight_arm, empty_weight_moment,
              max_takeoff_weight, max_landing_weight, max_useful_load,
              fuel_capacity_gal, fuel_usable_gal, fuel_burn_gal_hr, fuel_lb_gal,
              default_power, default_flow_gal, moment_div1000, fuel_burn_note,
              model, sheet, oil, estaciones, limits_normal, limits_utility)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                   $18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb)
           RETURNING id_wb_plantilla`,
          valores
        );
        idWb = insertRes.rows[0].id_wb_plantilla;
        await client.query(
          "UPDATE aeronave SET id_wb_plantilla = $1 WHERE id_aeronave = $2",
          [idWb, id_aeronave]
        );
        console.log(
          `➕ INSERT wb_plantilla id_wb_plantilla=${idWb} + UPDATE aeronave id_aeronave=${id_aeronave}  (${key} -> ${matricula})`
        );
      }

      procesados.push({ key, matricula, idAeronave: id_aeronave, idWbPlantilla: idWb });
    }

    // --- Verificación de paridad, ANTES del COMMIT ---
    let fallos = 0;
    for (const p of procesados) {
      const { rows } = await client.query(
        "SELECT * FROM wb_plantilla WHERE id_wb_plantilla = $1",
        [p.idWbPlantilla]
      );
      const filaDB = rows[0];
      const objDesdeDB = filaAObjetoAircraft(filaDB, { codigo: p.matricula });
      const objOriginal = AIRCRAFT[p.key];

      if (!sonIguales(objOriginal, objDesdeDB)) {
        fallos++;
        console.error(`\n❌ PARIDAD FALLÓ para ${p.key} (${p.matricula}):`);
        console.error("--- esperado (aircraft.js) ---");
        console.error(
          JSON.stringify(canon(sinClaves(objOriginal, IGNORAR_EN_PARIDAD)), null, 2)
        );
        console.error("--- obtenido (BD -> filaAObjetoAircraft) ---");
        console.error(
          JSON.stringify(canon(sinClaves(objDesdeDB, IGNORAR_EN_PARIDAD)), null, 2)
        );
      } else {
        console.log(`✅ paridad OK: ${p.key} (${p.matricula})`);
      }
    }

    if (fallos > 0) {
      throw new Error(
        `Paridad falló en ${fallos} de ${procesados.length} aeronaves. Se hace ROLLBACK.`
      );
    }

    console.log(
      `\n✅ paridad OK ${procesados.length}/${Object.keys(KEY_A_MATRICULA).length}`
    );
    await client.query("COMMIT");
    console.log("COMMIT ejecutado. wb_plantilla re-sembrado desde aircraft.js.");
  } catch (err) {
    console.error("❌ Error, se hace ROLLBACK:", err.message);
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("❌ Además falló el ROLLBACK:", rollbackErr.message);
    }
    client.release();
    await pool.end();
    process.exit(1);
    return;
  }

  client.release();
  await pool.end();
  process.exit(0);
})();
