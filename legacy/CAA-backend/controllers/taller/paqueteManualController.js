// legacy/CAA-backend/controllers/taller/paqueteManualController.js
/**
 * Paquetes de manuales: por avión y por inspección (25/50/100/anual), qué
 * páginas le salen al mecánico. El mecánico solo ve los CONFIRMADOS.
 *
 * Los extractos se responden sin la ruta en el bucket ni la huella del manual
 * (sinInternos): son internos de Storage.
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md §9.4
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { TIPOS_PAQUETE } = require("../../utils/manualesReglas");
const { validarRango } = require("../../utils/pdfExtractos");
const { paqueteDe, manualesPorId, sinInternos } = require("../../services/manualesService");

const ESTADOS = ["BORRADOR", "CONFIRMADO"];
const ORIGENES = ["MANUAL", "SUGERIDO"];
const AHORA = "(NOW() AT TIME ZONE 'America/El_Salvador')";
// Tope de INTEGER de Postgres: un id más grande daría un 500 en vez de un 400.
const idValido = (n) => Number.isInteger(n) && n > 0 && n <= 2147483647;

/** El paquete para responder: sus extractos sin lo interno de Storage. */
const publico = (p) => (p ? { ...p, extractos: p.extractos.map(sinInternos) } : p);

exports.tabla = catchAsync(async (req, res) => {
  // La flota que pasa por el taller: la propia y la externa (la OMA les da
  // mantenimiento). Fuera el simulador y los aviones dados de baja. Ojo: un
  // externo también tiene activa=false y estado ACTIVO, por eso el es_externa.
  const a = await db.query(
    `SELECT id_aeronave, codigo, modelo, es_externa
       FROM aeronave
      WHERE tipo <> 'SIMULADOR'
        AND NOT (activa = false AND estado = 'ACTIVO' AND es_externa = false)
      ORDER BY es_externa, codigo`
  );
  const c = await db.query(
    `SELECT p.id_aeronave, p.tipo_mantenimiento, p.estado,
            COUNT(e.id_extracto)::int AS extractos,
            COALESCE(SUM(e.pagina_hasta - e.pagina_desde + 1), 0)::int AS paginas,
            COUNT(e.id_extracto) FILTER (WHERE m.estado <> 'VIGENTE')::int AS reemplazados
       FROM taller_paquete_manual p
       LEFT JOIN taller_paquete_extracto e ON e.id_paquete = p.id_paquete
       LEFT JOIN taller_manual m ON m.id_manual = e.id_manual
      GROUP BY p.id_paquete`
  );
  res.json({ tipos: TIPOS_PAQUETE, aeronaves: a.rows, celdas: c.rows });
});

/** (avión, tipo) de la URL, validados. Si no sirven, responde y devuelve null. */
function leerClave(req, res) {
  const idAeronave = Number(req.params.id_aeronave);
  const tipo = String(req.params.tipo || "").toUpperCase();
  if (!idValido(idAeronave)) {
    res.status(400).json({ message: "Avión inválido" });
    return null;
  }
  if (!TIPOS_PAQUETE.includes(tipo)) {
    res.status(400).json({ message: "Inspección inválida: tiene que ser 25HR, 50HR, 100HR o ANUAL" });
    return null;
  }
  return { idAeronave, tipo };
}

exports.detalle = catchAsync(async (req, res) => {
  const k = leerClave(req, res);
  if (!k) return;
  const p = await paqueteDe(db, k.idAeronave, k.tipo);
  const { extractos = [], ...paquete } = p || {};
  res.json({
    id_aeronave: k.idAeronave,
    tipo: k.tipo,
    paquete: p ? paquete : null,
    extractos: extractos.map(sinInternos),
  });
});

/**
 * Reemplaza el set completo de rangos (reordenar = mandar el orden nuevo) y fija
 * el estado, que es OBLIGATORIO: nunca cambia por efecto secundario (spec §9.4).
 */
exports.guardar = catchAsync(async (req, res) => {
  const k = leerClave(req, res);
  if (!k) return;
  const estado = String(req.body.estado || "").toUpperCase();
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ message: "Falta el estado del paquete: BORRADOR o CONFIRMADO" });
  }
  const filas = Array.isArray(req.body.extractos) ? req.body.extractos : null;
  if (!filas) return res.status(400).json({ message: "Faltan los rangos del paquete" });
  if (estado === "CONFIRMADO" && !filas.length) {
    return res.status(400).json({ message: "Un paquete confirmado necesita al menos un rango de páginas" });
  }
  if (filas.length > 100) return res.status(400).json({ message: "Demasiados rangos para un paquete" });
  if (filas.some((f) => !f || typeof f !== "object")) {
    return res.status(400).json({ message: "Hay un rango de páginas mal armado" });
  }
  // Un id que no es un número es un pedido mal armado (400), no un manual que
  // se borró (404).
  const malo = filas.findIndex((f) => !idValido(Number(f.id_manual)));
  if (malo >= 0) return res.status(400).json({ message: `Manual inválido (rango ${malo + 1})` });

  const av = await db.query("SELECT 1 FROM aeronave WHERE id_aeronave = $1", [k.idAeronave]);
  if (!av.rows.length) return res.status(404).json({ message: "Avión no encontrado" });

  const manuales = await manualesPorId([...new Set(filas.map((f) => Number(f.id_manual)))]);
  const limpias = [];
  for (const [i, f] of filas.entries()) {
    const m = manuales.get(Number(f.id_manual));
    if (!m) return res.status(404).json({ message: `Rango ${i + 1}: el manual ya no existe` });
    const err = validarRango(f.pagina_desde, f.pagina_hasta, m.paginas);
    if (err) return res.status(400).json({ message: `Rango ${i + 1} (${m.titulo}): ${err}` });
    limpias.push({
      id_manual: m.id_manual,
      desde: Number(f.pagina_desde),
      hasta: Number(f.pagina_hasta),
      titulo: f.titulo ? String(f.titulo).trim().slice(0, 200) || null : null,
      origen: ORIGENES.includes(f.origen) ? f.origen : "MANUAL",
    });
  }

  const uid = req.user.id_usuario;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // confirmado_por/en: se conserva quién lo confirmó la primera vez mientras
    // siga confirmado; se pone ahora si recién se confirma; se borra al volver a borrador.
    const p = await client.query(
      `INSERT INTO taller_paquete_manual
         (id_aeronave, tipo_mantenimiento, estado, actualizado_por, actualizado_en, confirmado_por, confirmado_en)
       VALUES ($1::int, $2::varchar, $3::varchar, $4::int, ${AHORA},
               CASE WHEN $3::varchar = 'CONFIRMADO' THEN $4::int END,
               CASE WHEN $3::varchar = 'CONFIRMADO' THEN ${AHORA} END)
       ON CONFLICT (id_aeronave, tipo_mantenimiento) DO UPDATE SET
         estado          = EXCLUDED.estado,
         actualizado_por = EXCLUDED.actualizado_por,
         actualizado_en  = EXCLUDED.actualizado_en,
         confirmado_por  = CASE WHEN EXCLUDED.estado <> 'CONFIRMADO' THEN NULL
                                WHEN taller_paquete_manual.estado = 'CONFIRMADO' THEN taller_paquete_manual.confirmado_por
                                ELSE EXCLUDED.confirmado_por END,
         confirmado_en   = CASE WHEN EXCLUDED.estado <> 'CONFIRMADO' THEN NULL
                                WHEN taller_paquete_manual.estado = 'CONFIRMADO' THEN taller_paquete_manual.confirmado_en
                                ELSE EXCLUDED.confirmado_en END
       RETURNING id_paquete`,
      [k.idAeronave, k.tipo, estado, uid]
    );
    const idPaquete = p.rows[0].id_paquete;
    await client.query("DELETE FROM taller_paquete_extracto WHERE id_paquete = $1", [idPaquete]);
    for (const [i, f] of limpias.entries()) {
      await client.query(
        `INSERT INTO taller_paquete_extracto
           (id_paquete, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen, agregado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [idPaquete, f.id_manual, f.desde, f.hasta, f.titulo, i, f.origen, f.origen === "SUGERIDO" ? null : uid]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  res.json(publico(await paqueteDe(db, k.idAeronave, k.tipo)));
});
