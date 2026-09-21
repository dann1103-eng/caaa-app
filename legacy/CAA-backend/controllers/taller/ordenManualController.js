// legacy/CAA-backend/controllers/taller/ordenManualController.js
/**
 * Las páginas de manual de una orden de trabajo: las del paquete de su
 * inspección más las que se le agregan (spec §7 y §9.5).
 *
 * Agregar o quitar: el jefe, o el mecánico DE ESA orden, y solo mientras está
 * ABIERTA. Se bloquea la fila de la orden (FOR UPDATE, igual que firmarOrden)
 * para que nadie agregue una página en el mismo instante en que se firma.
 *
 * Lo que se responde como JSON pasa por sinInternos (sin la ruta en el bucket
 * ni la huella); el PDF sí los usa, pero no los devuelve.
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { TIPOS_PAQUETE, ETIQUETA_TIPO, esJefe, esMecanicoDeOrden } = require("../../utils/manualesReglas");
const { validarRango } = require("../../utils/pdfExtractos");
const {
  contextoOrden, manualesDeOrden, pdfDeExtractos, paqueteDe, sinInternos,
} = require("../../services/manualesService");

// Tope de INTEGER de Postgres: un id más grande daría un 500 en vez de un 400.
const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 2147483647;

/**
 * Corre `fn(client, orden)` en una transacción con la orden bloqueada, si el
 * usuario puede cambiarle las páginas. Si no, responde el error y no corre nada.
 */
async function conOrdenEditable(req, res, fn) {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Orden inválida" });
  const idOrden = Number(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT 1 FROM orden_trabajo WHERE id_orden = $1 FOR UPDATE", [idOrden]);
    const o = await contextoOrden(client, idOrden);
    let rechazo = null;
    if (!o) rechazo = [404, "Orden de trabajo no encontrada"];
    else if (!esJefe(req.user?.rol) && !esMecanicoDeOrden(o, req.user?.id_usuario)) {
      rechazo = [403, "Solo el jefe de taller o quien trabaja esta orden puede cambiarle las páginas de manual."];
    } else if (o.estado !== "ABIERTA") {
      rechazo = [409, `La orden está ${o.estado.toLowerCase()}: sus páginas de manual quedaron fijas.`];
    }
    if (rechazo) {
      await client.query("ROLLBACK");
      return res.status(rechazo[0]).json({ message: rechazo[1] });
    }
    const salida = await fn(client, o);
    if (salida?.error) {
      await client.query("ROLLBACK");
      return res.status(salida.error[0]).json({ message: salida.error[1] });
    }
    await client.query("COMMIT");
    return res.status(salida.status || 200).json(salida.body);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

exports.listar = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Orden inválida" });
  const r = await manualesDeOrden(Number(req.params.id), req.user);
  if (!r) return res.status(404).json({ message: "Orden de trabajo no encontrada" });
  res.json({ ...r, del_paquete: r.del_paquete.map(sinInternos), agregadas: r.agregadas.map(sinInternos) });
});

exports.agregar = catchAsync(async (req, res) => {
  const { id_manual, pagina_desde, pagina_hasta } = req.body;
  const titulo = req.body.titulo ? String(req.body.titulo).trim().slice(0, 200) || null : null;
  await conOrdenEditable(req, res, async (client, o) => {
    const m = await client.query(
      "SELECT id_manual, titulo, paginas FROM taller_manual WHERE id_manual = $1",
      [idValido(id_manual) ? Number(id_manual) : 0]
    );
    if (!m.rows.length) return { error: [404, "Manual no encontrado"] };
    const err = validarRango(pagina_desde, pagina_hasta, m.rows[0].paginas);
    if (err) return { error: [400, err] };
    const r = await client.query(
      `INSERT INTO taller_orden_extracto
         (id_orden, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen, agregado_por)
       VALUES ($1, $2, $3, $4, $5,
               (SELECT COALESCE(MAX(orden), 0) + 1 FROM taller_orden_extracto WHERE id_orden = $1),
               'MANUAL', $6)
       RETURNING *`,
      [o.id_orden, m.rows[0].id_manual, Number(pagina_desde), Number(pagina_hasta), titulo, req.user.id_usuario]
    );
    return { status: 201, body: r.rows[0] };
  });
});

/** "Traer las páginas de un paquete": para órdenes de inspección abiertas sin enlazar el mantenimiento. */
exports.traerPaquete = catchAsync(async (req, res) => {
  const tipo = String(req.body.tipo || "").toUpperCase();
  if (!TIPOS_PAQUETE.includes(tipo)) {
    return res.status(400).json({ message: "Elegí la inspección: 25HR, 50HR, 100HR o ANUAL" });
  }
  await conOrdenEditable(req, res, async (client, o) => {
    // Si la orden ya es de una inspección reconocida, su paquete ya se muestra
    // en vivo: traerlo otra vez lo imprimiría dos veces.
    if (o.inspeccion) {
      return { error: [409, `Esta orden ya trae el paquete de ${ETIQUETA_TIPO[o.inspeccion]}: sus páginas ya están en la lista.`] };
    }
    const p = await paqueteDe(client, o.id_aeronave, tipo);
    if (!p || p.estado !== "CONFIRMADO" || !p.extractos.length) {
      return { error: [404, `${o.aeronave_codigo} no tiene un paquete de ${ETIQUETA_TIPO[tipo]} confirmado.`] };
    }
    // Se copian como MANUAL: quedan editables y la congelación de la firma no los toca.
    const r = await client.query(
      `INSERT INTO taller_orden_extracto
         (id_orden, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen, agregado_por)
       SELECT $1, e.id_manual, e.pagina_desde, e.pagina_hasta, e.titulo,
              (SELECT COALESCE(MAX(orden), 0) FROM taller_orden_extracto WHERE id_orden = $1) + e.orden + 1,
              'MANUAL', $3
         FROM taller_paquete_extracto e
        WHERE e.id_paquete = $2`,
      [o.id_orden, p.id_paquete, req.user.id_usuario]
    );
    return { body: { agregadas: r.rowCount } };
  });
});

exports.quitar = catchAsync(async (req, res) => {
  const idExtracto = Number(req.params.id_extracto);
  await conOrdenEditable(req, res, async (client, o) => {
    const r = await client.query(
      `DELETE FROM taller_orden_extracto
        WHERE id_extracto = $1 AND id_orden = $2 AND origen = 'MANUAL'
       RETURNING id_extracto`,
      [idValido(idExtracto) ? idExtracto : 0, o.id_orden]
    );
    if (!r.rowCount) return { error: [404, "Esa página no está entre las agregadas a esta orden"] };
    return { body: { ok: true } };
  });
});

exports.pdf = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Orden inválida" });
  const r = await manualesDeOrden(Number(req.params.id), req.user);
  if (!r) return res.status(404).json({ message: "Orden de trabajo no encontrada" });
  // Acá SÍ hacen falta sha256 y archivo_path: arman el PDF y no se devuelven.
  const lista = [...r.del_paquete, ...r.agregadas];
  if (!lista.length) return res.status(400).json({ message: "Esta orden todavía no tiene páginas de manual." });
  res.json(await pdfDeExtractos(lista));
});
