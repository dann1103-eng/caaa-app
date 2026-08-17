/**
 * Helpers del inventario del Taller (bodega OMA).
 *
 * Todo lo que mueve existencia pasa por un documento
 * (taller_documento_inventario) con sus renglones (taller_movimiento_inventario).
 * `cantidad` es SIGNADA: + entra, − sale, ± ajusta.
 *
 * Spec: docs/superpowers/specs/2026-08-17-inventario-taller-design.md
 */

// Clave del advisory lock que serializa la generación de correlativos.
// Arbitraria y propia de este módulo (la del cierre de vuelo es 4711).
const LOCK_CORRELATIVO = 4712;

// La serie la define el PREFIJO, no el tipo: los 243 documentos históricos son
// tipo SALIDA con prefijo REQ, porque en el Excel la requisición y la salida
// eran el mismo papel. Por eso REQUISICION continúa esa numeración (desde 245
// en 2026) y las solicitudes estrenan la suya.
const PREFIJO = { ENTRADA: "FA", SALIDA: "SOL", AJUSTE: "AJ", REQUISICION: "REQ", RETORNO: "RET" };
const DIGITOS = { ENTRADA: 5, SALIDA: 3, AJUSTE: 3, REQUISICION: 3, RETORNO: 3 };

// Los tipos que tocan la existencia. La requisición es un borrador y no mueve
// nada: por eso además es el único documento editable.
const MUEVE_STOCK = new Set(["ENTRADA", "SALIDA", "AJUSTE", "RETORNO"]);

/**
 * Condición que decide si un documento cuenta para la existencia.
 *
 * Los renglones de una REQUISICION viven en la misma tabla que los demás, pero
 * son un borrador: si no se filtraran, pedir material movería el stock sin que
 * nadie lo haya despachado. Va como fragmento compartido y no copiado en cada
 * consulta — la lección de las horas facturables (§27), donde el mismo criterio
 * repartido en seis lugares se desincronizó.
 *
 * @param {string} alias  alias de taller_documento_inventario en la consulta
 */
const documentoCuentaSQL = (alias = "d") =>
  `${alias}.estado = 'VIGENTE' AND ${alias}.tipo <> 'REQUISICION'`;

const UNIDADES = ["UN", "QT", "GAL", "FT", "KIT", "JGO", "LB"];

/**
 * Siguiente correlativo del tipo dentro del año, formateado como en el Excel
 * ('FA-00038-2026', 'REQ-245-2026', 'AJ-001-2026').
 *
 * Va con pg_advisory_xact_lock y no con un simple MAX+1 porque dos entradas
 * simultáneas se llevarían el mismo número. El advisory lock además NO entra en
 * el grafo de locks de fila, así que no puede invertir orden con el FOR UPDATE
 * de los repuestos ni con el de aeronave/vuelo de mantenimiento (§27).
 */
async function siguienteCorrelativo(client, tipo, anio) {
  const prefijo = PREFIJO[tipo];
  await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2)::int)", [
    LOCK_CORRELATIVO,
    `${prefijo}-${anio}`,
  ]);
  // El MAX se busca por PREFIJO y no por tipo, para que la serie REQ arranque
  // después de los históricos (que son tipo SALIDA con correlativo REQ-###) y
  // no existan nunca dos papeles rotulados igual.
  const r = await client.query(
    `SELECT COALESCE(MAX(numero), 0) + 1 AS n
       FROM taller_documento_inventario
      WHERE anio = $1 AND correlativo LIKE $2`,
    [anio, `${prefijo}-%`]
  );
  const numero = Number(r.rows[0].n);
  const correlativo = `${prefijo}-${String(numero).padStart(DIGITOS[tipo], "0")}-${anio}`;
  return { numero, correlativo };
}

/**
 * Bloquea los repuestos de un documento y devuelve su estado actual.
 *
 * El ORDER BY id_repuesto es lo que evita el deadlock: dos requisiciones
 * simultáneas que compartan ítems los toman siempre en el mismo orden. Sin
 * esto, la que pide {A,B} y la que pide {B,A} se traban mutuamente.
 */
async function bloquearRepuestos(client, ids, { lock = true } = {}) {
  const unicos = [...new Set(ids.map(Number))].sort((a, b) => a - b);
  if (!unicos.length) return new Map();
  // Sin lock cuando el documento no mueve existencia (la requisición es un
  // borrador): ahí solo hace falta validar que los ítems existan y estén activos.
  const r = await client.query(
    `SELECT id_repuesto, codigo, descripcion, unidad, stock_actual, costo_unitario, activo
       FROM taller_repuesto
      WHERE id_repuesto = ANY($1::int[])
      ORDER BY id_repuesto
      ${lock ? "FOR UPDATE" : ""}`,
    [unicos]
  );
  return new Map(r.rows.map((x) => [x.id_repuesto, x]));
}

/**
 * Aplica los deltas de un documento sobre el catálogo.
 *
 * `stock_actual` es un cache de la suma de movimientos; se mueve por delta y no
 * se recalcula entero para no leer todo el kardex en cada guardado. Como es una
 * suma con signo, el resultado no depende del orden en que entraron los
 * movimientos (a diferencia del saldo POR FILA, que por eso se calcula al leer).
 */
async function aplicarDeltas(client, deltas, { fecha, esEntrada }) {
  for (const [idRepuesto, d] of deltas) {
    await client.query(
      `UPDATE taller_repuesto
          SET stock_actual         = stock_actual + $2::numeric,
              costo_unitario       = COALESCE($3::numeric, costo_unitario),
              ultimo_movimiento_en = GREATEST(COALESCE(ultimo_movimiento_en, $4::date), $4::date),
              ultima_entrada_en    = CASE WHEN $5::boolean
                                          THEN GREATEST(COALESCE(ultima_entrada_en, $4::date), $4::date)
                                          ELSE ultima_entrada_en END
        WHERE id_repuesto = $1`,
      [idRepuesto, d.cantidad, d.costo ?? null, fecha, !!esEntrada]
    );
  }
}

/**
 * Recalcula desde cero el stock de unos ítems a partir de sus movimientos
 * vigentes. Se usa al anular un documento, donde revertir por delta dejaría el
 * cache a merced de que la reversión sea exactamente simétrica.
 */
async function recalcularStock(client, ids) {
  const unicos = [...new Set(ids.map(Number))];
  if (!unicos.length) return;
  // Subconsultas correlacionadas y no un JOIN agrupado: un ítem cuyos
  // movimientos quedaran TODOS anulados no produce filas en el agregado, así
  // que con un JOIN se quedaría con el stock viejo. Acá cae a 0, que es lo
  // correcto.
  await client.query(
    `UPDATE taller_repuesto r SET
        stock_actual = COALESCE((
          SELECT SUM(m.cantidad)
            FROM taller_movimiento_inventario m
            JOIN taller_documento_inventario  d ON d.id_documento = m.id_documento
           WHERE m.id_repuesto = r.id_repuesto AND ${documentoCuentaSQL("d")}), 0),
        ultimo_movimiento_en = (
          SELECT MAX(d.fecha)
            FROM taller_movimiento_inventario m
            JOIN taller_documento_inventario  d ON d.id_documento = m.id_documento
           WHERE m.id_repuesto = r.id_repuesto AND ${documentoCuentaSQL("d")}),
        ultima_entrada_en = (
          SELECT MAX(d.fecha)
            FROM taller_movimiento_inventario m
            JOIN taller_documento_inventario  d ON d.id_documento = m.id_documento
           WHERE m.id_repuesto = r.id_repuesto AND ${documentoCuentaSQL("d")}
             AND d.tipo = 'ENTRADA')
      WHERE r.id_repuesto = ANY($1::int[])`,
    [unicos]
  );
}

/** Siguiente código de ítem libre, con el formato de 6 dígitos del Excel. */
async function siguienteCodigoItem(client) {
  await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2)::int)", [
    LOCK_CORRELATIVO,
    "codigo-item",
  ]);
  const r = await client.query(
    `SELECT COALESCE(MAX(codigo::int), 0) + 1 AS n
       FROM taller_repuesto
      WHERE codigo ~ '^[0-9]+$'`
  );
  return String(r.rows[0].n).padStart(6, "0");
}

/** Normaliza una unidad del Excel a la lista cerrada del sistema. */
function normalizarUnidad(u) {
  const v = String(u || "").trim().toUpperCase();
  if (["QT", "QTO", "QTS", "QUART"].includes(v)) return "QT";
  if (["FT", "PIE", "PIES", "FEET"].includes(v)) return "FT";
  if (["GAL", "GALON", "GALLON"].includes(v)) return "GAL";
  if (v === "KIT") return "KIT";
  if (["JGO", "JUEGO", "SET"].includes(v)) return "JGO";
  if (["LB", "LBS", "LIBRA"].includes(v)) return "LB";
  return "UN";
}

/**
 * Normaliza una clasificación del Excel. Allá había 29 valores para ~15
 * categorías reales, casi todos por espacios de más, plurales y typos.
 */
function normalizarClasificacion(c) {
  const v = String(c || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!v) return null;
  if (/^\d+$/.test(v)) return null;               // un código que se coló de clasificación
  const mapa = {
    ACEITES: "ACEITE",
    "INSTUMENTOS": "INSTRUMENTOS",
    INSTRUMENTO: "INSTRUMENTOS",
    ROTABLE: "ROTABLES",
    TOOL: "HERRAMIENTA",
    ELECTRONICO: "ELECTRICA",
  };
  return mapa[v] || v;
}

/**
 * Separa el S/N que en el Excel venía embebido en la descripción
 * ("VOR S/N 2253" → { descripcion: "VOR", serie: "2253" }).
 */
function extraerSerie(descripcion) {
  const d = String(descripcion || "").trim();
  const m = d.match(/^(.*?)\s*S\/N\s*([^\s]+)\s*(.*)$/i);
  if (!m) return { descripcion: d, serie: null };
  const limpia = `${m[1].trim()} ${m[3].trim()}`.trim().replace(/\s+/g, " ");
  return { descripcion: limpia || d, serie: m[2] };
}

module.exports = {
  UNIDADES,
  PREFIJO,
  MUEVE_STOCK,
  documentoCuentaSQL,
  siguienteCorrelativo,
  siguienteCodigoItem,
  bloquearRepuestos,
  aplicarDeltas,
  recalcularStock,
  normalizarUnidad,
  normalizarClasificacion,
  extraerSerie,
};
