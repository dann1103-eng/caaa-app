const db = require("../config/db");
const catchAsync = require("../utils/catchAsync");
const { filaAObjetoAircraft } = require("../utils/wbPlantilla");

// Endpoints de soporte para el modo PRÁCTICA del loadsheet (sandbox sin vuelo
// real): sirven la plantilla de peso&balance de cualquier aeronave y el
// listado de aeronaves con plantilla disponible. Accesibles a cualquier
// usuario autenticado (alumno/instructor/staff) — sin restricción de rol.

/**
 * GET /api/loadsheet/plantilla?id_aeronave=1  (o ?matricula=YS-334-PE)
 * Resuelve la aeronave por id o matrícula y devuelve su plantilla W&B
 * mapeada a la forma AIRCRAFT (o { plantilla: null } si aún no tiene).
 */
const getPlantilla = catchAsync(async (req, res) => {
  const { id_aeronave, matricula } = req.query;

  // id_aeronave llega como string desde el querystring; si no es numérico
  // (ej. "abc"), castear directo a $1::int en Postgres revienta con 22P02
  // (invalid input syntax for type integer). Coercionamos a entero-o-null
  // en JS antes del query: un valor no numérico cae a null, igual que si
  // no se hubiera mandado id_aeronave.
  const nId = parseInt(id_aeronave, 10);
  const idParam = Number.isInteger(nId) ? nId : null;

  const aRes = await db.query(
    `SELECT id_aeronave, codigo, id_wb_plantilla
       FROM aeronave
      WHERE ($1::int IS NOT NULL AND id_aeronave = $1)
         OR ($2::text IS NOT NULL AND codigo = $2)
      LIMIT 1`,
    [idParam, matricula || null]
  );

  const aeronave = aRes.rows[0];
  if (!aeronave) {
    return res.status(404).json({ message: "Aeronave no encontrada" });
  }

  if (!aeronave.id_wb_plantilla) {
    return res.json({ plantilla: null });
  }

  const pRes = await db.query(
    "SELECT * FROM wb_plantilla WHERE id_wb_plantilla = $1",
    [aeronave.id_wb_plantilla]
  );

  const fila = pRes.rows[0];
  const plantilla = fila
    ? filaAObjetoAircraft(fila, { codigo: aeronave.codigo })
    : null;

  res.json({ plantilla });
});

/**
 * GET /api/loadsheet/aeronaves
 * Lista los aviones para el selector de PRÁCTICA con un flag de si tienen
 * plantilla W&B. Excluye simuladores y aeronaves DADAS DE BAJA, pero SÍ
 * incluye las que están en mantenimiento hoy: practicar el peso&balance de un
 * avión en mantenimiento es inofensivo (no se agenda ni vuela). `activa` es
 * "disponible HOY" (la recalcula sincronizarEstadoFlota), no "retirada" — por
 * eso NO se filtra por activa=true (eso escondía el YS-270-PE cuando está en
 * taller). Baja lógica = activa=false Y estado='ACTIVO' (mismo patrón que el
 * picker de agenda del alumno).
 */
const listAeronaves = catchAsync(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id_aeronave, codigo AS matricula, modelo,
            (id_wb_plantilla IS NOT NULL) AS tiene_plantilla
       FROM aeronave
      WHERE tipo <> 'SIMULADOR'
        AND es_externa = false
        AND NOT (COALESCE(activa, true) = false AND estado = 'ACTIVO')
      ORDER BY codigo`
  );

  res.json(rows);
});

module.exports = { getPlantilla, listAeronaves };
