/**
 * Préstamo de partes entre talleres del aeropuerto.
 *
 * Bidireccional: RECIBIDO es lo que le pedimos prestado a un taller vecino,
 * ENTREGADO lo que le prestamos. Afecta el inventario en tiempo real, con la
 * particularidad de que la entrada no está ligada a una factura y la salida no
 * está ligada a una orden de trabajo.
 *
 * El préstamo NO escribe stock por su cuenta: genera documentos de inventario
 * de tipo PRESTAMO y deja que la maquinaria existente (cantidad con signo,
 * cache de stock, kardex con saldo corrido, anulación con recálculo) haga el
 * resto.
 *
 * Spec: docs/superpowers/specs/2026-08-17-prestamo-de-partes-design.md
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const {
  siguienteCorrelativo, bloquearRepuestos, aplicarDeltas, recalcularStock,
} = require("../../utils/inventarioHelpers");

const LOCK = 4714;
const num = (v) => (v === "" || v == null ? null : Number(v));
const txt = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

/** Días sin fecha comprometida tras los cuales un préstamo se considera vencido. */
const DIAS_SIN_COMPROMISO = 30;

async function siguienteCorrelativoPR(client, anio) {
  await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2)::int)", [LOCK, `PR-${anio}`]);
  const r = await client.query("SELECT COALESCE(MAX(numero),0)+1 AS n FROM taller_prestamo WHERE anio=$1", [anio]);
  const numero = Number(r.rows[0].n);
  return { numero, correlativo: `PR-${String(numero).padStart(3, "0")}-${anio}` };
}

/**
 * El signo del movimiento según dirección y momento.
 *
 *   RECIBIDO  (pedimos prestado): entra al estante al recibirlo, sale al devolverlo
 *   ENTREGADO (prestamos):        sale del estante al entregarlo, vuelve al recibirlo
 */
const signo = (direccion, momento) =>
  (direccion === "RECIBIDO" ? 1 : -1) * (momento === "ENTREGA" ? 1 : -1);

/**
 * Crea el documento de bodega del préstamo. Solo con las líneas que apuntan al
 * catálogo: lo que es texto libre (un libro de horas, un certificado) se
 * registra en el préstamo pero no es stock.
 */
async function moverStock(client, { prestamo, lineas, momento, fecha, user, forzar, motivo_forzado }) {
  const conItem = lineas.filter((l) => l.id_repuesto && Number(l.cantidad) > 0);
  if (!conItem.length) return null;

  const s = signo(prestamo.direccion, momento);
  const mapa = await bloquearRepuestos(client, conItem.map((l) => l.id_repuesto));

  // Prestar algo que no hay dispara el mismo bloqueo que una salida normal.
  const faltantes = [];
  for (const l of conItem) {
    const item = mapa.get(Number(l.id_repuesto));
    if (!item) throw Object.assign(new Error(`El ítem ${l.id_repuesto} no existe`), { status: 400 });
    const delta = s * Number(l.cantidad);
    const stock = Number(item.stock_actual);
    if (delta < 0 && stock + delta < 0) {
      faltantes.push({
        id_repuesto: item.id_repuesto, codigo: item.codigo, descripcion: item.descripcion,
        unidad: item.unidad, disponible: stock, solicitado: Math.abs(delta),
        faltan: Math.abs(stock + delta),
      });
    }
  }
  if (faltantes.length && !forzar) {
    throw Object.assign(new Error("No hay existencia suficiente"), { status: 409, faltantes });
  }

  const anio = Number(String(fecha || "").slice(0, 4)) || new Date().getFullYear();
  const { numero, correlativo } = await siguienteCorrelativo(client, "PRESTAMO", anio);
  const etiqueta = prestamo.direccion === "RECIBIDO" ? "Recibido de" : "Prestado a";
  const cab = await client.query(
    `INSERT INTO taller_documento_inventario
       (tipo, anio, numero, correlativo, fecha, motivo, nota, registrado_por, id_prestamo)
     VALUES ('PRESTAMO',$1,$2,$3, COALESCE($4::date, CURRENT_DATE), $5,$6,$7,$8)
     RETURNING *`,
    [anio, numero, correlativo, fecha || null,
     `${momento === "ENTREGA" ? "Préstamo" : "Devolución"} · ${etiqueta} ${prestamo.contraparte}`,
     prestamo.correlativo, user?.id_usuario || null, prestamo.id_prestamo]
  );
  const doc = cab.rows[0];

  const deltas = new Map();
  for (const l of conItem) {
    const item = mapa.get(Number(l.id_repuesto));
    const delta = s * Number(l.cantidad);
    const forzado = faltantes.some((f) => f.id_repuesto === item.id_repuesto);
    await client.query(
      `INSERT INTO taller_movimiento_inventario
         (id_documento, id_repuesto, cantidad, costo_unitario, nota, forzado, motivo_forzado)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [doc.id_documento, item.id_repuesto, delta, Number(item.costo_unitario),
       l.descripcion || null, forzado, forzado ? txt(motivo_forzado) : null]
    );
    const acc = deltas.get(item.id_repuesto) || { cantidad: 0, costo: null };
    acc.cantidad += delta;
    deltas.set(item.id_repuesto, acc);
  }
  // esEntrada:false — un préstamo recibido no es una compra y no debe pisar la
  // fecha de última entrada del ítem, que es dato de abastecimiento.
  await aplicarDeltas(client, deltas, { fecha: doc.fecha, esEntrada: false });
  return doc.id_documento;
}

const SELECT_PR = `
  SELECT p.*,
         TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')) AS registrado_por_nombre,
         (SELECT COUNT(*) FROM taller_prestamo_linea l WHERE l.id_prestamo = p.id_prestamo)::int AS lineas,
         -- Vencido: comprometido y pasado, o sin fecha y con demasiados días
         -- afuera. En el papel un renglón estuvo dos meses sin que nada avisara.
         (p.estado = 'PENDIENTE' AND (
            (p.fecha_compromiso IS NOT NULL AND p.fecha_compromiso < CURRENT_DATE)
            OR (p.fecha_compromiso IS NULL AND p.fecha_entrega < CURRENT_DATE - ${DIAS_SIN_COMPROMISO})
         )) AS vencido
    FROM taller_prestamo p
    LEFT JOIN usuario u ON u.id_usuario = p.creado_por`;

// ── Consulta ────────────────────────────────────────────────────────────────

exports.listPrestamos = catchAsync(async (req, res) => {
  const { estado, direccion, q, desde, hasta, solo_vencidos } = req.query;
  const cond = ["1=1"];
  const params = [];
  const p = (v) => `$${params.push(v)}`;

  if (estado) cond.push(`p.estado = ${p(estado)}`);
  if (direccion) cond.push(`p.direccion = ${p(direccion)}`);
  if (desde) cond.push(`p.fecha_entrega >= ${p(desde)}::date`);
  if (hasta) cond.push(`p.fecha_entrega <= ${p(hasta)}::date`);
  if (q) {
    const ph = p(`%${q}%`);
    cond.push(`(p.correlativo ILIKE ${ph} OR p.contraparte ILIKE ${ph} OR p.solicitante ILIKE ${ph} OR p.nota ILIKE ${ph})`);
  }

  const r = await db.query(
    `${SELECT_PR} WHERE ${cond.join(" AND ")}
     ${solo_vencidos === "true" ? "AND p.estado = 'PENDIENTE'" : ""}
     ORDER BY p.estado = 'PENDIENTE' DESC, p.fecha_entrega DESC LIMIT 300`,
    params
  );
  const filas = solo_vencidos === "true" ? r.rows.filter((x) => x.vencido) : r.rows;
  res.json(filas);
});

exports.getPrestamo = catchAsync(async (req, res) => {
  const { id } = req.params;
  const p = await db.query(`${SELECT_PR} WHERE p.id_prestamo = $1`, [id]);
  if (!p.rows.length) return res.status(404).json({ message: "Préstamo no encontrado" });
  const [lineas, docs] = await Promise.all([
    db.query(
      `SELECT l.*, r.codigo, r.descripcion AS item_descripcion, r.unidad AS item_unidad, r.stock_actual
         FROM taller_prestamo_linea l
         LEFT JOIN taller_repuesto r ON r.id_repuesto = l.id_repuesto
        WHERE l.id_prestamo = $1 ORDER BY l.orden, l.id_linea`, [id]),
    db.query(
      `SELECT id_documento, correlativo, fecha, motivo, estado
         FROM taller_documento_inventario WHERE id_prestamo = $1 ORDER BY id_documento`, [id]),
  ]);
  res.json({ prestamo: p.rows[0], lineas: lineas.rows, documentos: docs.rows });
});

// ── Alta ────────────────────────────────────────────────────────────────────

exports.crearPrestamo = catchAsync(async (req, res) => {
  const {
    direccion, contraparte, fecha_entrega, solicitante, entregado_por,
    fecha_compromiso, nota, lineas, forzar, motivo_forzado,
  } = req.body;

  if (!["RECIBIDO", "ENTREGADO"].includes(direccion)) {
    return res.status(400).json({ message: "Indicá si el préstamo se recibe o se entrega" });
  }
  if (!txt(contraparte)) return res.status(400).json({ message: "Escribí con qué taller es el préstamo" });
  if (!Array.isArray(lineas) || !lineas.length) {
    return res.status(400).json({ message: "El préstamo no tiene nada prestado" });
  }
  for (const [i, l] of lineas.entries()) {
    if (!txt(l.descripcion) && !l.id_repuesto) {
      return res.status(400).json({ message: `Renglón ${i + 1}: falta el ítem o su descripción` });
    }
    if (!(Number(l.cantidad) > 0)) {
      return res.status(400).json({ message: `Renglón ${i + 1}: la cantidad debe ser mayor que cero` });
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const anio = Number(String(fecha_entrega || "").slice(0, 4)) || new Date().getFullYear();
    const { numero, correlativo } = await siguienteCorrelativoPR(client, anio);

    const cab = await client.query(
      `INSERT INTO taller_prestamo
         (anio, numero, correlativo, direccion, contraparte, fecha_entrega,
          solicitante, entregado_por, fecha_compromiso, nota, creado_por)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6::date, CURRENT_DATE), $7,$8,$9::date,$10,$11)
       RETURNING *`,
      [anio, numero, correlativo, direccion, txt(contraparte), fecha_entrega || null,
       txt(solicitante), txt(entregado_por), fecha_compromiso || null, txt(nota),
       req.user?.id_usuario || null]
    );
    const prestamo = cab.rows[0];

    for (const [i, l] of lineas.entries()) {
      await client.query(
        `INSERT INTO taller_prestamo_linea
           (id_prestamo, id_repuesto, descripcion, parte_no, cantidad, unidad, orden)
         VALUES ($1,$2,$3,$4,$5::numeric,$6,$7)`,
        [prestamo.id_prestamo, l.id_repuesto || null, txt(l.descripcion) || "(sin descripción)",
         txt(l.parte_no), Number(l.cantidad), txt(l.unidad), i + 1]
      );
    }

    await moverStock(client, {
      prestamo, lineas, momento: "ENTREGA", fecha: prestamo.fecha_entrega,
      user: req.user, forzar, motivo_forzado,
    });

    await client.query("COMMIT");
    res.json(prestamo);
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status === 409) return res.status(409).json({ message: e.message, faltantes: e.faltantes, forzable: true });
    if (e.status === 400) return res.status(400).json({ message: e.message });
    throw e;
  } finally {
    client.release();
  }
});

// ── Devolución ──────────────────────────────────────────────────────────────

/**
 * Registra la devolución. Admite parcial: se devuelve lo que volvió y el
 * préstamo sigue pendiente por el resto.
 *
 * `sin_devolucion` cierra el préstamo sin movimiento inverso, para el caso
 * "se pagó" o "se cruzó en cuenta": lo prestado quedó consumido.
 */
exports.devolverPrestamo = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    fecha_devolucion, devuelto_por, recibido_por, lineas, nota,
    sin_devolucion, forzar, motivo_forzado,
  } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query("SELECT * FROM taller_prestamo WHERE id_prestamo = $1 FOR UPDATE", [id]);
    if (!p.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Préstamo no encontrado" }); }
    const prestamo = p.rows[0];
    if (prestamo.estado !== "PENDIENTE") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: `Este préstamo ya está ${prestamo.estado.toLowerCase()}.` });
    }

    if (sin_devolucion) {
      await client.query(
        `UPDATE taller_prestamo SET estado='DEVUELTO', fecha_devolucion=COALESCE($2::date, CURRENT_DATE),
           nota = COALESCE(nota || ' · ', '') || $3 WHERE id_prestamo = $1`,
        [id, fecha_devolucion || null, txt(nota) || "Cerrado sin devolución física"]
      );
      await client.query("COMMIT");
      return res.json({ ok: true, estado: "DEVUELTO", movio_stock: false });
    }

    const actuales = await client.query(
      "SELECT * FROM taller_prestamo_linea WHERE id_prestamo = $1 ORDER BY id_linea", [id]
    );
    const porId = new Map(actuales.rows.map((x) => [x.id_linea, x]));

    // Sin detalle, se devuelve todo lo que falta de cada renglón.
    const aDevolver = Array.isArray(lineas) && lineas.length
      ? lineas.map((x) => ({ id_linea: Number(x.id_linea), cantidad: Number(x.cantidad) }))
      : actuales.rows.map((x) => ({ id_linea: x.id_linea, cantidad: Number(x.cantidad) - Number(x.devuelto) }));

    const excedidos = [];
    for (const x of aDevolver) {
      const l = porId.get(x.id_linea);
      if (!l) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Renglón desconocido" }); }
      const resta = Number(l.cantidad) - Number(l.devuelto);
      if (x.cantidad > resta + 1e-9) excedidos.push({ descripcion: l.descripcion, pendiente: resta, intentado: x.cantidad });
    }
    if (excedidos.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No se puede devolver más de lo que se prestó", excedidos });
    }

    const conCantidad = aDevolver.filter((x) => x.cantidad > 0);
    const paraStock = conCantidad.map((x) => {
      const l = porId.get(x.id_linea);
      return { id_repuesto: l.id_repuesto, cantidad: x.cantidad, descripcion: l.descripcion };
    });

    await moverStock(client, {
      prestamo, lineas: paraStock, momento: "DEVOLUCION",
      fecha: fecha_devolucion || null, user: req.user, forzar, motivo_forzado,
    });

    for (const x of conCantidad) {
      await client.query(
        "UPDATE taller_prestamo_linea SET devuelto = devuelto + $2::numeric WHERE id_linea = $1",
        [x.id_linea, x.cantidad]
      );
    }

    // Solo se cierra si ya volvió todo; si no, sigue pendiente por el resto.
    const resto = await client.query(
      "SELECT COALESCE(SUM(cantidad - devuelto),0) AS falta FROM taller_prestamo_linea WHERE id_prestamo = $1", [id]
    );
    const completo = Number(resto.rows[0].falta) <= 0.0001;
    await client.query(
      `UPDATE taller_prestamo SET
         fecha_devolucion = COALESCE($2::date, CURRENT_DATE),
         devuelto_por = COALESCE($3, devuelto_por),
         recibido_por = COALESCE($4, recibido_por),
         estado = CASE WHEN $5::boolean THEN 'DEVUELTO' ELSE estado END
       WHERE id_prestamo = $1`,
      [id, fecha_devolucion || null, txt(devuelto_por), txt(recibido_por), completo]
    );

    await client.query("COMMIT");
    res.json({ ok: true, estado: completo ? "DEVUELTO" : "PENDIENTE", parcial: !completo });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status === 409) return res.status(409).json({ message: e.message, faltantes: e.faltantes, forzable: true });
    if (e.status === 400) return res.status(400).json({ message: e.message });
    throw e;
  } finally {
    client.release();
  }
});

// ── Anulación ───────────────────────────────────────────────────────────────

exports.anularPrestamo = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { motivo_anulacion } = req.body;
  if (!txt(motivo_anulacion)) return res.status(400).json({ message: "Escribí el motivo de la anulación" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query("SELECT estado FROM taller_prestamo WHERE id_prestamo = $1 FOR UPDATE", [id]);
    if (!p.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Préstamo no encontrado" }); }
    if (p.rows[0].estado === "ANULADO") { await client.query("ROLLBACK"); return res.status(409).json({ message: "Ya está anulado" }); }

    // Se anulan sus documentos de bodega y se recalcula el stock desde cero,
    // igual que la anulación de cualquier documento del inventario.
    const items = await client.query(
      `SELECT DISTINCT m.id_repuesto
         FROM taller_movimiento_inventario m
         JOIN taller_documento_inventario d ON d.id_documento = m.id_documento
        WHERE d.id_prestamo = $1`, [id]
    );
    await client.query(
      `UPDATE taller_documento_inventario
          SET estado='ANULADO', anulado_en=NOW(), anulado_por=$2,
              motivo_anulacion='Préstamo anulado: ' || $3
        WHERE id_prestamo = $1 AND estado='VIGENTE'`,
      [id, req.user?.id_usuario || null, txt(motivo_anulacion)]
    );
    await client.query(
      `UPDATE taller_prestamo SET estado='ANULADO', anulado_en=NOW(), anulado_por=$2, motivo_anulacion=$3
        WHERE id_prestamo = $1`,
      [id, req.user?.id_usuario || null, txt(motivo_anulacion)]
    );
    await recalcularStock(client, items.rows.map((x) => x.id_repuesto));

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
