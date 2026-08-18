/**
 * Documentos de bodega: entradas (FA), salidas (REQ) y ajustes (AJ).
 *
 * Todo lo que mueve existencia pasa por acá. Un documento es una cabecera con N
 * renglones, igual que la FA y la REQ del Excel de la OMA — donde FA-00001-2026
 * llegó a tener 357 renglones.
 *
 * Spec: docs/superpowers/specs/2026-08-17-inventario-taller-design.md
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const {
  siguienteCorrelativo,
  bloquearRepuestos,
  aplicarDeltas,
  recalcularStock,
  MUEVE_STOCK,
} = require("../../utils/inventarioHelpers");
const { generarRequisicionPDF, generarSolicitudPDF } = require("../../utils/pdfTaller");

const TIPOS = ["ENTRADA", "SALIDA", "AJUSTE", "REQUISICION", "RETORNO", "PRESTAMO"];

/**
 * Cuánto queda por devolver de cada ítem de una solicitud.
 *
 * Sale de restar, a lo que salió en la solicitud, lo que ya volvió en retornos
 * vigentes. Los retornos anulados no cuentan, para que anular un retorno
 * equivocado libere el saldo de nuevo.
 */
async function retornablesPorItem(conn, idSolicitud) {
  const r = await conn.query(
    `SELECT s.id_repuesto,
            rp.codigo, rp.descripcion, rp.unidad,
            SUM(ABS(s.cantidad))                    AS salio,
            COALESCE(dev.devuelto, 0)               AS devuelto
       FROM taller_movimiento_inventario s
       JOIN taller_repuesto rp ON rp.id_repuesto = s.id_repuesto
       LEFT JOIN (
         SELECT m.id_repuesto, SUM(ABS(m.cantidad)) AS devuelto
           FROM taller_movimiento_inventario m
           JOIN taller_documento_inventario d ON d.id_documento = m.id_documento
          WHERE d.id_solicitud_origen = $1 AND d.tipo = 'RETORNO' AND d.estado = 'VIGENTE'
          GROUP BY m.id_repuesto
       ) dev ON dev.id_repuesto = s.id_repuesto
      WHERE s.id_documento = $1
      GROUP BY s.id_repuesto, rp.codigo, rp.descripcion, rp.unidad, dev.devuelto`,
    [idSolicitud]
  );
  return r.rows.map((x) => ({
    ...x,
    salio: Number(x.salio),
    devuelto: Number(x.devuelto),
    retornable: Number(x.salio) - Number(x.devuelto),
  }));
}

/**
 * ¿Puede este usuario forzar una salida sin existencia (y anular documentos)?
 *
 * Se lee de la BD y no del token: un token viejo no debe seguir otorgando —ni
 * negando— una capacidad que ya cambió. Mismo criterio que utils/capacidades.js.
 */
async function puedeForzar(conn, user) {
  if (!user) return false;
  if (user.rol === "ADMIN") return true;
  const r = await conn.query(
    "SELECT COALESCE(puede_forzar_inventario, false) AS ok FROM usuario WHERE id_usuario = $1",
    [user.id_usuario]
  );
  return !!r.rows[0]?.ok;
}

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

// ── Listado y detalle ───────────────────────────────────────────────────────

exports.listDocumentos = catchAsync(async (req, res) => {
  const { tipo, tipos, desde, hasta, q, incluir_anulados, sin_despachar } = req.query;
  const cond = ["1=1"];
  const params = [];
  const p = (v) => `$${params.push(v)}`;

  if (tipo && TIPOS.includes(tipo)) cond.push(`d.tipo = ${p(tipo)}`);
  // `tipos` (varios, separados por coma) lo usan las secciones de Entradas y
  // Salidas, que agrupan más de un tipo de documento: lo que suma y lo que resta.
  const lista = String(tipos || "").split(",").filter((t) => TIPOS.includes(t));
  if (lista.length) cond.push(`d.tipo = ANY(${p(lista)}::varchar[])`);
  if (desde) cond.push(`d.fecha >= ${p(desde)}::date`);
  if (hasta) cond.push(`d.fecha <= ${p(hasta)}::date`);
  if (incluir_anulados !== "true") cond.push("d.estado = 'VIGENTE'");
  if (q) {
    const ph = p(`%${q}%`);
    cond.push(`(d.correlativo ILIKE ${ph} OR d.proveedor ILIKE ${ph} OR d.factura_no ILIKE ${ph} OR d.motivo ILIKE ${ph} OR d.orden_trabajo_no ILIKE ${ph} OR d.solicitante ILIKE ${ph} OR d.entregado_a ILIKE ${ph})`);
  }
  // Lo que el técnico pidió y bodega todavía no entregó.
  if (sin_despachar === "true") {
    cond.push(`d.tipo = 'REQUISICION'`);
    cond.push(`NOT EXISTS (SELECT 1 FROM taller_documento_inventario s
                            WHERE s.id_requisicion = d.id_documento AND s.estado = 'VIGENTE')`);
  }

  const r = await db.query(
    `SELECT d.*,
            a.codigo AS aeronave_codigo,
            a.es_externa AS aeronave_externa,
            COUNT(m.id_mov)::int                       AS renglones,
            COALESCE(SUM(ABS(m.cantidad)), 0)          AS unidades,
            ROUND(COALESCE(SUM(ABS(m.cantidad) * COALESCE(m.costo_unitario, 0)), 0), 2) AS total,
            TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')) AS registrado_por_nombre,
            -- Estado DERIVADO, no columna: una requisición está despachada si
            -- existe una solicitud vigente que la referencia.
            (d.tipo = 'REQUISICION' AND EXISTS (
               SELECT 1 FROM taller_documento_inventario s
                WHERE s.id_requisicion = d.id_documento AND s.estado = 'VIGENTE'
             )) AS despachada,
            -- Con qué papel se despachó / de qué pedido salió. En la lista, una
            -- requisición y su solicitud parecen DOS descargas del mismo trabajo;
            -- mostrar el eslabón es lo que aclara que son pedido y entrega.
            (SELECT s.correlativo FROM taller_documento_inventario s
              WHERE s.id_requisicion = d.id_documento AND s.estado = 'VIGENTE'
              ORDER BY s.id_documento LIMIT 1) AS despacho_correlativo,
            (SELECT rq.correlativo FROM taller_documento_inventario rq
              WHERE rq.id_documento = d.id_requisicion) AS pedido_correlativo
       FROM taller_documento_inventario d
       LEFT JOIN taller_movimiento_inventario m ON m.id_documento = d.id_documento
       LEFT JOIN aeronave a ON a.id_aeronave = d.id_aeronave
       LEFT JOIN usuario  u ON u.id_usuario = d.registrado_por
      WHERE ${cond.join(" AND ")}
      GROUP BY d.id_documento, a.codigo, a.es_externa, u.nombre, u.apellido
      ORDER BY d.fecha DESC, d.id_documento DESC
      LIMIT 500`,
    params
  );
  res.json(r.rows);
});

exports.getDocumento = catchAsync(async (req, res) => {
  const { id } = req.params;
  const cab = await db.query(
    `SELECT d.*,
            a.codigo AS aeronave_codigo,
            tp.nombre AS tarea_nombre,
            ma.tipo   AS mantenimiento_tipo,
            ma.descripcion AS mantenimiento_descripcion,
            TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')) AS registrado_por_nombre
       FROM taller_documento_inventario d
       LEFT JOIN aeronave                a  ON a.id_aeronave = d.id_aeronave
       LEFT JOIN taller_cumplimiento     tc ON tc.id_cumplimiento = d.id_cumplimiento
       LEFT JOIN taller_tarea_programada tp ON tp.id_tarea = tc.id_tarea
       LEFT JOIN mantenimiento_aeronave  ma ON ma.id_mantenimiento = d.id_mantenimiento
       LEFT JOIN usuario                 u  ON u.id_usuario = d.registrado_por
      WHERE d.id_documento = $1`,
    [id]
  );
  if (!cab.rows.length) return res.status(404).json({ message: "Documento no encontrado" });

  const det = await db.query(
    `SELECT m.*, r.codigo, r.descripcion, r.parte_no, r.unidad,
            ROUND(ABS(m.cantidad) * COALESCE(m.costo_unitario, 0), 2) AS importe
       FROM taller_movimiento_inventario m
       JOIN taller_repuesto r ON r.id_repuesto = m.id_repuesto
      WHERE m.id_documento = $1
      ORDER BY m.id_mov`,
    [id]
  );

  // Documentos encadenados: la requisición de la que nació, la solicitud que la
  // despachó, y los retornos de sobrantes.
  const doc = cab.rows[0];
  const [origen, despachos, retornos] = await Promise.all([
    doc.id_requisicion
      ? db.query("SELECT id_documento, correlativo, fecha FROM taller_documento_inventario WHERE id_documento = $1", [doc.id_requisicion])
      : { rows: [] },
    doc.tipo === "REQUISICION"
      ? db.query("SELECT id_documento, correlativo, fecha, estado FROM taller_documento_inventario WHERE id_requisicion = $1 ORDER BY id_documento", [id])
      : { rows: [] },
    doc.tipo === "SALIDA"
      ? db.query("SELECT id_documento, correlativo, fecha, estado FROM taller_documento_inventario WHERE id_solicitud_origen = $1 ORDER BY id_documento", [id])
      : { rows: [] },
  ]);

  res.json({
    documento: doc,
    renglones: det.rows,
    requisicion_origen: origen.rows[0] || null,
    despachos: despachos.rows,          // solicitudes nacidas de esta requisición
    retornos: retornos.rows,            // sobrantes devueltos de esta solicitud
  });
});

/**
 * Lo que queda por devolver de una solicitud, renglón por renglón.
 * Alimenta el modal de retorno para que nadie tenga que hacer la resta a mano.
 */
exports.retornablesSolicitud = catchAsync(async (req, res) => {
  const { id } = req.params;
  const d = await db.query(
    "SELECT tipo, estado, correlativo FROM taller_documento_inventario WHERE id_documento = $1",
    [id]
  );
  if (!d.rows.length || d.rows[0].tipo !== "SALIDA") {
    return res.status(404).json({ message: "Solicitud no encontrada" });
  }
  res.json({
    solicitud: d.rows[0],
    items: await retornablesPorItem(db, id),
  });
});

/**
 * Edita una requisición. Es el ÚNICO documento editable, y a propósito: la
 * regla de "no se edita, se anula" existe porque los documentos mueven
 * existencia, y un borrador que no mueve nada puede corregirse. Al despacharse
 * se congela.
 */
exports.editarRequisicion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    fecha, id_aeronave, cliente, solicitante, tacometro,
    motivo, observaciones, nota, renglones,
  } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const d = await client.query(
      "SELECT * FROM taller_documento_inventario WHERE id_documento = $1 FOR UPDATE",
      [id]
    );
    if (!d.rows.length || d.rows[0].tipo !== "REQUISICION") {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Requisición no encontrada" });
    }
    if (d.rows[0].estado !== "VIGENTE") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Esa requisición está anulada" });
    }
    const desp = await client.query(
      "SELECT correlativo FROM taller_documento_inventario WHERE id_requisicion = $1 AND estado = 'VIGENTE' LIMIT 1",
      [id]
    );
    if (desp.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: `Ya se despachó en ${desp.rows[0].correlativo}, así que no se puede editar.`,
      });
    }

    await client.query(
      `UPDATE taller_documento_inventario SET
         fecha         = COALESCE($2::date, fecha),
         id_aeronave   = $3,
         cliente       = $4,
         solicitante   = $5,
         tacometro     = $6::numeric,
         motivo        = $7,
         observaciones = $8,
         nota          = $9
       WHERE id_documento = $1`,
      [id, fecha || null, id_aeronave || null, cliente || null, solicitante || null,
       tacometro ?? null, motivo || null, observaciones || null, nota || null]
    );

    // Los renglones se reemplazan enteros: es un borrador, no hay historia que
    // preservar, y no tocan existencia.
    if (Array.isArray(renglones)) {
      if (!renglones.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "La requisición no puede quedar sin renglones" });
      }
      await client.query("DELETE FROM taller_movimiento_inventario WHERE id_documento = $1", [id]);
      for (const [i, l] of renglones.entries()) {
        const cant = num(l.cantidad);
        if (!Number(l.id_repuesto) || cant === null || isNaN(cant) || cant <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: `Renglón ${i + 1}: ítem o cantidad inválidos` });
        }
        await client.query(
          `INSERT INTO taller_movimiento_inventario (id_documento, id_repuesto, cantidad, costo_unitario, nota)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, Number(l.id_repuesto), cant, num(l.costo_unitario), l.nota || null]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── Alta de documento ───────────────────────────────────────────────────────

/**
 * Crea un documento con sus renglones y mueve el stock, todo en una transacción.
 *
 * Semántica de `cantidad` por tipo (el cliente siempre manda números positivos):
 *   ENTRADA  → suma            (delta = +cantidad)
 *   SALIDA   → resta           (delta = −cantidad)
 *   AJUSTE   → cantidad es la EXISTENCIA CONTADA; el servidor calcula el delta
 *              contra el stock del sistema. Así el usuario teclea "conté 18" y
 *              el kardex igual guarda un delta, que es lo que permite que el
 *              saldo sea una suma acumulada.
 */
exports.crearDocumento = catchAsync(async (req, res) => {
  const {
    tipo, fecha, nota,
    proveedor, factura_no,
    id_aeronave, motivo, id_cumplimiento, id_mantenimiento,
    renglones, forzar, motivo_forzado,
    // Campos del papel (requisición y solicitud CAAA-004-F)
    id_requisicion, id_solicitud_origen, id_orden_trabajo,
    orden_trabajo_no, numero_solicitud, tacometro, cliente,
    solicitante, entregado_por, entregado_a, observaciones,
  } = req.body;

  if (!TIPOS.includes(tipo)) return res.status(400).json({ message: "Tipo de documento inválido" });
  if (!Array.isArray(renglones) || renglones.length === 0) {
    return res.status(400).json({ message: "El documento no tiene renglones" });
  }
  if (tipo === "SALIDA" && !id_aeronave) {
    return res.status(400).json({ message: "La salida necesita una aeronave" });
  }
  if (tipo === "AJUSTE" && !String(motivo || "").trim()) {
    return res.status(400).json({ message: "El ajuste necesita un motivo" });
  }
  if (tipo === "RETORNO" && !id_solicitud_origen) {
    return res.status(400).json({ message: "El retorno tiene que apuntar a la solicitud de la que salió el material" });
  }
  if (id_cumplimiento && id_mantenimiento) {
    return res.status(400).json({ message: "La salida se cuelga de una inspección o de un mantenimiento, no de ambos" });
  }

  // Normalización y validación de renglones ANTES de abrir la transacción.
  const lineas = [];
  for (const [i, l] of renglones.entries()) {
    const idRep = Number(l.id_repuesto);
    const cant = num(l.cantidad);
    if (!idRep) return res.status(400).json({ message: `Renglón ${i + 1}: falta el ítem` });
    if (cant === null || isNaN(cant)) return res.status(400).json({ message: `Renglón ${i + 1}: cantidad inválida` });
    // El ajuste sí admite contar 0 (se acabó); entrada y salida, no.
    if (tipo !== "AJUSTE" && cant <= 0) {
      return res.status(400).json({ message: `Renglón ${i + 1}: la cantidad debe ser mayor que cero` });
    }
    if (cant < 0) return res.status(400).json({ message: `Renglón ${i + 1}: la cantidad no puede ser negativa` });
    lineas.push({ id_repuesto: idRep, cantidad: cant, costo_unitario: num(l.costo_unitario), nota: l.nota || null });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const mueveStock = MUEVE_STOCK.has(tipo);

    // La solicitud puede nacer de una requisición; si viene, se valida y se
    // HEREDA su contexto.
    //
    // Heredar no es cosmético: sin `id_orden_trabajo` la entrega queda huérfana
    // y NO aparece en el papeleo de la orden, que es justo lo que el jefe abre
    // para revisar qué material se consumió. La requisición ya trae ese dato
    // porque el técnico la creó parado en su trabajo; bodega solo despacha y no
    // tiene por qué volver a teclearlo.
    let ctx = {};
    if (id_requisicion) {
      const rq = await client.query(
        `SELECT tipo, estado, id_orden_trabajo, id_aeronave, id_mantenimiento,
                id_cumplimiento, tacometro, orden_trabajo_no, cliente, motivo
           FROM taller_documento_inventario WHERE id_documento = $1`,
        [id_requisicion]
      );
      if (!rq.rows.length || rq.rows[0].tipo !== "REQUISICION") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "La requisición indicada no existe" });
      }
      if (rq.rows[0].estado !== "VIGENTE") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Esa requisición está anulada" });
      }
      ctx = rq.rows[0];
    }
    // Lo que bodega mandó explícitamente gana; lo que no, sale de la requisición.
    const heredar = (valor, clave) => (valor != null && valor !== "" ? valor : (ctx[clave] ?? null));

    // El retorno se valida contra lo que de verdad salió en su solicitud.
    if (tipo === "RETORNO") {
      const sol = await client.query(
        "SELECT tipo, estado, correlativo FROM taller_documento_inventario WHERE id_documento = $1 FOR UPDATE",
        [id_solicitud_origen]
      );
      if (!sol.rows.length || sol.rows[0].tipo !== "SALIDA") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "La solicitud indicada no existe" });
      }
      if (sol.rows[0].estado !== "VIGENTE") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: `La solicitud ${sol.rows[0].correlativo} está anulada` });
      }
      const saldos = new Map((await retornablesPorItem(client, id_solicitud_origen)).map((x) => [x.id_repuesto, x]));
      const excedidos = [];
      const acumulado = new Map();
      for (const l of lineas) {
        const s = saldos.get(l.id_repuesto);
        const ya = acumulado.get(l.id_repuesto) || 0;
        if (!s) {
          excedidos.push({ id_repuesto: l.id_repuesto, retornable: 0, intentado: l.cantidad, descripcion: "(no salió en esa solicitud)" });
        } else if (ya + l.cantidad > s.retornable + 1e-9) {
          excedidos.push({ ...s, intentado: ya + l.cantidad });
        }
        acumulado.set(l.id_repuesto, ya + l.cantidad);
      }
      if (excedidos.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "No se puede devolver más de lo que salió en esa solicitud",
          excedidos,
        });
      }
    }

    const puede = await puedeForzar(client, req.user);
    const mapa = await bloquearRepuestos(
      client, lineas.map((l) => l.id_repuesto), { lock: mueveStock }
    );

    // Resolución de deltas + verificación de existencia.
    const deltas = new Map();
    const faltantes = [];
    for (const l of lineas) {
      const item = mapa.get(l.id_repuesto);
      if (!item) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `El ítem ${l.id_repuesto} no existe` });
      }
      if (!item.activo) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `El ítem ${item.codigo} ${item.descripcion} está inactivo` });
      }

      const stock = Number(item.stock_actual);
      let delta;
      let costo;
      if (tipo === "REQUISICION") {
        // Borrador: se guarda lo pedido con signo positivo, pero NO mueve stock.
        delta = l.cantidad;
        costo = l.costo_unitario;
      } else if (tipo === "ENTRADA") {
        delta = l.cantidad;
        costo = l.costo_unitario;                       // opcional: sin costo, sin egreso
      } else if (tipo === "RETORNO") {
        delta = l.cantidad;                             // el sobrante vuelve al estante
        costo = l.costo_unitario ?? Number(item.costo_unitario);
      } else if (tipo === "SALIDA") {
        delta = -l.cantidad;
        costo = l.costo_unitario ?? Number(item.costo_unitario); // foto del costo vigente
      } else {
        delta = l.cantidad - stock;                     // "conté N" → delta
        costo = null;
      }

      if (delta < 0 && stock + delta < 0) {
        faltantes.push({
          id_repuesto: item.id_repuesto,
          codigo: item.codigo,
          descripcion: item.descripcion,
          unidad: item.unidad,
          disponible: stock,
          solicitado: Math.abs(delta),
          faltan: Math.abs(stock + delta),
        });
      }

      l.delta = delta;
      l.costo_final = costo;
      const acc = deltas.get(l.id_repuesto) || { cantidad: 0, costo: null };
      acc.cantidad += delta;
      // El costo del catálogo solo lo pisa una ENTRADA que traiga costo.
      if (tipo === "ENTRADA" && costo != null) acc.costo = costo;
      deltas.set(l.id_repuesto, acc);
    }

    // El bloqueo por existencia: 409 salvo que quien lo pide tenga la capacidad
    // Y escriba una justificación.
    const forzado = faltantes.length > 0;
    if (forzado) {
      if (!forzar || !puede) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "No hay existencia suficiente para esta salida",
          faltantes,
          forzable: puede,
        });
      }
      if (!String(motivo_forzado || "").trim()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Para forzar la salida hay que escribir el motivo" });
      }
    }

    const anio = Number(String(fecha || "").slice(0, 4)) || new Date().getFullYear();
    const { numero, correlativo } = await siguienteCorrelativo(client, tipo, anio);

    // La aeronave también viaja en la requisición y en el retorno (el papel la
    // pide en los tres), no solo en la salida.
    const llevaAeronave = ["SALIDA", "REQUISICION", "RETORNO"].includes(tipo);
    const cab = await client.query(
      `INSERT INTO taller_documento_inventario
         (tipo, anio, numero, correlativo, fecha, proveedor, factura_no,
          id_aeronave, id_cumplimiento, id_mantenimiento, motivo, nota, registrado_por,
          id_requisicion, id_solicitud_origen, orden_trabajo_no, numero_solicitud,
          tacometro, cliente, solicitante, entregado_por, entregado_a, observaciones,
          id_orden_trabajo)
       VALUES ($1,$2,$3,$4, COALESCE($5::date, CURRENT_DATE), $6,$7,$8,$9,$10,$11,$12,$13,
               $14,$15,$16,$17,$18::numeric,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        tipo, anio, numero, correlativo, fecha || null,
        tipo === "ENTRADA" ? proveedor || null : null,
        tipo === "ENTRADA" ? factura_no || null : null,
        llevaAeronave ? heredar(id_aeronave, "id_aeronave") : null,
        tipo === "SALIDA" ? heredar(id_cumplimiento, "id_cumplimiento") : null,
        tipo === "SALIDA" ? heredar(id_mantenimiento, "id_mantenimiento") : null,
        motivo || null, nota || null,
        req.user?.id_usuario || null,
        tipo === "SALIDA" ? id_requisicion || null : null,
        tipo === "RETORNO" ? id_solicitud_origen || null : null,
        heredar(orden_trabajo_no, "orden_trabajo_no"), numero_solicitud || null,
        heredar(tacometro, "tacometro"), heredar(cliente, "cliente"),
        solicitante || null, entregado_por || null, entregado_a || null,
        observaciones || null,
        // El enlace real con la Orden de Trabajo. `orden_trabajo_no` queda como
        // texto para los documentos históricos, que no tienen OT.
        heredar(id_orden_trabajo, "id_orden_trabajo"),
      ]
    );
    const doc = cab.rows[0];

    const idsForzados = new Set(faltantes.map((f) => f.id_repuesto));
    for (const l of lineas) {
      await client.query(
        `INSERT INTO taller_movimiento_inventario
           (id_documento, id_repuesto, cantidad, costo_unitario, nota, forzado, motivo_forzado)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          doc.id_documento, l.id_repuesto, l.delta, l.costo_final,
          l.nota,
          forzado && idsForzados.has(l.id_repuesto),
          forzado && idsForzados.has(l.id_repuesto) ? String(motivo_forzado).trim() : null,
        ]
      );
    }

    // La requisición es un borrador: queda registrada con sus renglones, pero
    // la existencia no se toca hasta que bodega la despacha.
    if (mueveStock) {
      await aplicarDeltas(client, deltas, { fecha: doc.fecha, esEntrada: tipo === "ENTRADA" });
    }

    // El gasto se contabiliza en la COMPRA, no en el consumo (la salida ya no
    // genera egreso: lo hacía y duplicaba el gasto). Sin costo no hay egreso —
    // el documento queda en la cola de "costos pendientes".
    let egreso = null;
    if (tipo === "ENTRADA") {
      const total = lineas.reduce(
        (s, l) => s + (l.costo_final != null ? l.cantidad * l.costo_final : 0), 0
      );
      if (total > 0) {
        egreso = await crearEgresoDeEntrada(client, doc, total, req.user);
      }
    }

    await client.query("COMMIT");
    res.json({ documento: { ...doc, id_egreso: egreso }, forzado, faltantes });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

/** Egreso de Contabilidad por una compra de repuestos, enlazado a la cabecera. */
async function crearEgresoDeEntrada(client, doc, total, user) {
  const monto = Math.round(total * 100) / 100;
  const concepto = `Compra ${doc.correlativo}${doc.factura_no ? ` (fact. ${doc.factura_no})` : ""}`;
  const egr = await client.query(
    `INSERT INTO egreso (categoria, proveedor, concepto, monto_usd, fecha, registrado_por)
     VALUES ('REPUESTOS', $1, $2, $3, $4, $5) RETURNING id`,
    [doc.proveedor || null, concepto, monto, doc.fecha, user?.id_usuario || null]
  );
  const id = egr.rows[0].id;
  await client.query(
    "UPDATE taller_documento_inventario SET id_egreso = $2 WHERE id_documento = $1",
    [doc.id_documento, id]
  );
  return id;
}

// ── Anulación ───────────────────────────────────────────────────────────────

/**
 * Los documentos no se editan: se anulan y se rehacen.
 *
 * El correlativo NO se reutiliza (la fila queda, marcada ANULADO), así la
 * numeración nunca miente. El stock se RECALCULA desde los movimientos vigentes
 * en vez de revertirse por delta: si algo quedó descuadrado, la anulación lo
 * deja bien en lugar de arrastrar el error.
 */
exports.anularDocumento = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { motivo_anulacion } = req.body;
  if (!String(motivo_anulacion || "").trim()) {
    return res.status(400).json({ message: "Escribí el motivo de la anulación" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    if (!(await puedeForzar(client, req.user))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No tenés permiso para anular documentos de bodega" });
    }

    const d = await client.query(
      "SELECT * FROM taller_documento_inventario WHERE id_documento = $1 FOR UPDATE",
      [id]
    );
    if (!d.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Documento no encontrado" }); }
    const doc = d.rows[0];
    if (doc.estado === "ANULADO") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ese documento ya está anulado" });
    }

    // Una solicitud con sobrantes ya devueltos no se puede anular sola: primero
    // hay que anular los retornos, porque si no la reversión del stock contaría
    // dos veces el mismo material.
    if (doc.tipo === "SALIDA") {
      const ret = await client.query(
        `SELECT correlativo FROM taller_documento_inventario
          WHERE id_solicitud_origen = $1 AND estado = 'VIGENTE' ORDER BY correlativo`,
        [id]
      );
      if (ret.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Esta solicitud tiene retornos vigentes (${ret.rows.map((x) => x.correlativo).join(", ")}). Anulalos primero.`,
          retornos: ret.rows.map((x) => x.correlativo),
        });
      }
    }

    const items = await client.query(
      "SELECT DISTINCT id_repuesto FROM taller_movimiento_inventario WHERE id_documento = $1",
      [id]
    );
    const ids = items.rows.map((x) => x.id_repuesto);
    // Mismo orden de bloqueo que el alta, para no invertir el grafo de locks.
    await bloquearRepuestos(client, ids);

    await client.query(
      `UPDATE taller_documento_inventario
          SET estado = 'ANULADO', anulado_en = NOW(), anulado_por = $2, motivo_anulacion = $3
        WHERE id_documento = $1`,
      [id, req.user?.id_usuario || null, String(motivo_anulacion).trim()]
    );

    // Si la entrada había generado un egreso, se borra: el gasto nunca ocurrió.
    if (doc.id_egreso) {
      await client.query("UPDATE taller_documento_inventario SET id_egreso = NULL WHERE id_documento = $1", [id]);
      await client.query("DELETE FROM egreso WHERE id = $1", [doc.id_egreso]);
    }

    await recalcularStock(client, ids);
    await client.query("COMMIT");
    res.json({ ok: true, id_documento: Number(id) });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── Costos pendientes ───────────────────────────────────────────────────────

/**
 * Completa los costos de una entrada ya registrada y, si queda con monto,
 * genera el egreso que había quedado pendiente.
 *
 * Es la única edición que admite un documento, y a propósito: no cambia
 * cantidades ni stock, solo pone el dato que el Excel nunca tuvo.
 */
exports.completarCostos = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { costos, actualizar_catalogo } = req.body; // costos: [{id_mov, costo_unitario}]
  if (!Array.isArray(costos) || !costos.length) {
    return res.status(400).json({ message: "No mandaste costos" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const d = await client.query(
      "SELECT * FROM taller_documento_inventario WHERE id_documento = $1 FOR UPDATE",
      [id]
    );
    if (!d.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Documento no encontrado" }); }
    const doc = d.rows[0];
    if (doc.tipo !== "ENTRADA") { await client.query("ROLLBACK"); return res.status(400).json({ message: "Solo las entradas se costean" }); }
    if (doc.estado !== "VIGENTE") { await client.query("ROLLBACK"); return res.status(409).json({ message: "El documento está anulado" }); }

    for (const c of costos) {
      const costo = num(c.costo_unitario);
      if (costo === null || isNaN(costo) || costo < 0) continue;
      await client.query(
        "UPDATE taller_movimiento_inventario SET costo_unitario = $2 WHERE id_mov = $1 AND id_documento = $3",
        [c.id_mov, costo, id]
      );
      // Por defecto el costo de la compra pasa a ser el "último costo conocido"
      // del ítem, que es el método de costeo elegido.
      if (actualizar_catalogo !== false) {
        await client.query(
          `UPDATE taller_repuesto SET costo_unitario = $2
             WHERE id_repuesto = (SELECT id_repuesto FROM taller_movimiento_inventario WHERE id_mov = $1)`,
          [c.id_mov, costo]
        );
      }
    }

    const t = await client.query(
      `SELECT COALESCE(SUM(ABS(cantidad) * COALESCE(costo_unitario, 0)), 0) AS total
         FROM taller_movimiento_inventario WHERE id_documento = $1`,
      [id]
    );
    const total = Number(t.rows[0].total);

    let id_egreso = doc.id_egreso;
    if (!id_egreso && total > 0) {
      id_egreso = await crearEgresoDeEntrada(client, doc, total, req.user);
    } else if (id_egreso) {
      await client.query("UPDATE egreso SET monto_usd = $2 WHERE id = $1", [id_egreso, Math.round(total * 100) / 100]);
    }

    await client.query("COMMIT");
    res.json({ ok: true, total, id_egreso });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── Apoyo y reportes ────────────────────────────────────────────────────────

/**
 * Mantenimientos a los que se puede colgar una salida de ESA aeronave:
 * inspecciones cumplidas hace poco y mantenimientos abiertos. Si no hay
 * ninguno, el motivo en texto libre alcanza — como en el Excel.
 */
exports.opcionesMantenimiento = catchAsync(async (req, res) => {
  const { id_aeronave } = req.params;
  const r = await db.query(
    `SELECT 'CUMPLIMIENTO' AS origen, tc.id_cumplimiento AS id, tc.fecha,
            tp.nombre AS etiqueta, tp.tipo AS subtipo
       FROM taller_cumplimiento tc
       JOIN taller_tarea_programada tp ON tp.id_tarea = tc.id_tarea
      WHERE tp.id_aeronave = $1 AND tc.fecha >= CURRENT_DATE - INTERVAL '120 days'
      UNION ALL
     SELECT 'MANTENIMIENTO', m.id_mantenimiento, m.fecha_programada,
            COALESCE(NULLIF(m.descripcion, ''), m.tipo), m.tipo
       FROM mantenimiento_aeronave m
      WHERE m.id_aeronave = $1
        AND (m.completado = false OR m.fecha_programada >= CURRENT_DATE - INTERVAL '120 days')
      ORDER BY fecha DESC
      LIMIT 40`,
    [id_aeronave]
  );
  res.json(r.rows);
});

// ── Impresión ───────────────────────────────────────────────────────────────

/** Código y revisión del formulario, editables sin desplegar. */
async function formularioDe(clave) {
  const r = await db.query("SELECT * FROM taller_formulario WHERE clave = $1", [clave]);
  return r.rows[0] || null;
}

/**
 * Imprime un documento con el formato de su tipo: la requisición interna o la
 * Solicitud de Repuestos CAAA-004-F. La solicitud arrastra sus retornos para
 * llenar sola el apartado "PARTES PARA RETORNAR AL ALMACEN".
 */
exports.imprimirDocumento = catchAsync(async (req, res) => {
  const { id } = req.params;
  const cab = await db.query(
    `SELECT d.*, a.codigo AS aeronave_codigo
       FROM taller_documento_inventario d
       LEFT JOIN aeronave a ON a.id_aeronave = d.id_aeronave
      WHERE d.id_documento = $1`,
    [id]
  );
  if (!cab.rows.length) return res.status(404).json({ message: "Documento no encontrado" });
  const doc = cab.rows[0];
  if (!["REQUISICION", "SALIDA"].includes(doc.tipo)) {
    return res.status(400).json({ message: "Solo se imprimen requisiciones y solicitudes" });
  }

  const renglonesDe = async (idDoc) => (await db.query(
    `SELECT m.*, r.codigo, r.descripcion, r.parte_no, r.unidad
       FROM taller_movimiento_inventario m
       JOIN taller_repuesto r ON r.id_repuesto = m.id_repuesto
      WHERE m.id_documento = $1 ORDER BY m.id_mov`, [idDoc])).rows;

  const renglones = await renglonesDe(id);
  let retornos = [];
  if (doc.tipo === "SALIDA") {
    const rs = await db.query(
      `SELECT id_documento, correlativo, fecha FROM taller_documento_inventario
        WHERE id_solicitud_origen = $1 AND estado = 'VIGENTE' ORDER BY id_documento`, [id]
    );
    retornos = await Promise.all(rs.rows.map(async (r) => ({ ...r, renglones: await renglonesDe(r.id_documento) })));
  }

  const esReq = doc.tipo === "REQUISICION";
  const pdf = esReq
    ? generarRequisicionPDF({ documento: doc, renglones, formulario: await formularioDe("REQUISICION") })
    : generarSolicitudPDF({ documento: doc, renglones, retornos, formulario: await formularioDe("SOLICITUD") });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${doc.correlativo}.pdf"`);
  pdf.pipe(res);
});

/** Los códigos y revisiones de los formatos impresos. */
exports.listFormularios = catchAsync(async (_req, res) => {
  const r = await db.query("SELECT * FROM taller_formulario ORDER BY nombre");
  res.json(r.rows);
});

exports.editarFormulario = catchAsync(async (req, res) => {
  const { clave } = req.params;
  const { codigo, revision } = req.body;
  const r = await db.query(
    `UPDATE taller_formulario
        SET codigo = $2, revision = $3, actualizado_en = NOW(), actualizado_por = $4
      WHERE clave = $1 RETURNING *`,
    [clave, codigo || null, revision || null, req.user?.id_usuario || null]
  );
  if (!r.rows.length) return res.status(404).json({ message: "Formulario no encontrado" });
  res.json(r.rows[0]);
});

/** Aeronaves para el selector de salida: incluye las de terceros (§OMA). */
exports.aeronavesBodega = catchAsync(async (_req, res) => {
  const r = await db.query(
    `SELECT id_aeronave, codigo, modelo, tipo, es_externa
       FROM aeronave
      WHERE NOT (activa = false AND estado = 'ACTIVO' AND es_externa = false)
      ORDER BY es_externa, codigo`
  );
  res.json(r.rows);
});

/** Consumo de material por aeronave (y por mantenimiento al abrir). */
exports.consumoAeronave = catchAsync(async (req, res) => {
  const { desde, hasta } = req.query;
  const r = await db.query(
    `SELECT a.id_aeronave, a.codigo, a.modelo, a.es_externa,
            COUNT(DISTINCT d.id_documento)::int        AS documentos,
            COALESCE(SUM(ABS(m.cantidad)), 0)          AS unidades,
            ROUND(COALESCE(SUM(ABS(m.cantidad) * COALESCE(m.costo_unitario, 0)), 0), 2) AS valor
       FROM taller_documento_inventario d
       JOIN taller_movimiento_inventario m ON m.id_documento = d.id_documento
       JOIN aeronave a ON a.id_aeronave = d.id_aeronave
      WHERE d.tipo = 'SALIDA' AND d.estado = 'VIGENTE'
        AND ($1::date IS NULL OR d.fecha >= $1::date)
        AND ($2::date IS NULL OR d.fecha <= $2::date)
      GROUP BY a.id_aeronave
      ORDER BY valor DESC, a.codigo`,
    [desde || null, hasta || null]
  );
  res.json(r.rows);
});
