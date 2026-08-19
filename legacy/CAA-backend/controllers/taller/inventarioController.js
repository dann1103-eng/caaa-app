/**
 * Inventario del Taller — catálogo de ítems y kardex.
 *
 * Los movimientos NO se registran acá: pasan siempre por un documento
 * (documentoInventarioController). Este archivo solo lee el catálogo, lo edita
 * como ficha, y sirve el kardex.
 *
 * Spec: docs/superpowers/specs/2026-08-17-inventario-taller-design.md
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const {
  UNIDADES,
  siguienteCodigoItem,
  normalizarUnidad,
  normalizarClasificacion,
  documentoCuentaSQL,
} = require("../../utils/inventarioHelpers");
const { generarEntregaAceitesPDF } = require("../../utils/pdfTaller");

// ── Catálogo ────────────────────────────────────────────────────────────────

// Filtros: q · categoria · ubicacion · y los cuatro atajos que en el Excel no
// existían (bajo mínimo, en negativo, sin movimiento, sin costo).
/**
 * El mecánico ve CANTIDADES, no plata.
 *
 * Regla de Daniel: del inventario le interesa saber si hay o no hay, no cuánto
 * cuesta. Los precios son dato de bodega y de Contabilidad. Se recorta en el
 * servidor y no escondiendo columnas en la pantalla, porque esconder en el
 * front deja el dato viajando igual en la respuesta.
 */
const sinPrecios = (user) => user?.rol === "TECNICO";

const recortarPrecios = (fila) => ({
  ...fila,
  costo_unitario: null, importe: null, costo_final: null, valor: null,
});

exports.listItems = catchAsync(async (req, res) => {
  const {
    q, categoria, ubicacion,
    bajo_minimo, negativos, sin_movimiento, sin_costo, incluir_inactivos,
  } = req.query;

  const cond = [];
  const params = [];
  // Devuelve el placeholder ($1, $2, …) del valor recién agregado.
  const p = (val) => `$${params.push(val)}`;

  if (incluir_inactivos !== "true") cond.push("r.activo = true");
  if (q) {
    const ph = p(`%${q}%`);
    cond.push(`(r.codigo ILIKE ${ph} OR r.descripcion ILIKE ${ph} OR r.parte_no ILIKE ${ph} OR r.serie_no ILIKE ${ph})`);
  }
  if (categoria) cond.push(`r.categoria = ${p(categoria)}`);
  if (ubicacion) cond.push(`r.ubicacion = ${p(ubicacion)}`);
  // "Bajo mínimo" solo aplica si de verdad hay un mínimo definido: si no, TODO
  // ítem en cero se marcaría bajo mínimo y la alerta no dice nada.
  if (bajo_minimo === "true") cond.push("r.stock_minimo > 0 AND r.stock_actual <= r.stock_minimo");
  if (negativos === "true") cond.push("r.stock_actual < 0");
  if (sin_movimiento === "true") cond.push("r.ultimo_movimiento_en IS NULL");
  if (sin_costo === "true") cond.push("COALESCE(r.costo_unitario, 0) = 0");

  const r = await db.query(
    `SELECT r.*,
            (r.stock_minimo > 0 AND r.stock_actual <= r.stock_minimo) AS stock_bajo,
            (r.stock_actual < 0)                      AS en_negativo,
            (COALESCE(r.costo_unitario, 0) = 0)       AS sin_costo,
            ROUND(r.stock_actual * COALESCE(r.costo_unitario, 0), 2) AS importe
       FROM taller_repuesto r
      ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""}
      ORDER BY r.codigo NULLS LAST, r.descripcion`,
    params
  );

  // El "importe inventario" del Excel sumaba los negativos y por eso mentía: el
  // aceite con −17 a $218.71 se comía $3,718 del total. Acá el valor es solo de
  // las existencias positivas, y lo que las negativas distorsionan se informa
  // aparte en vez de esconderse dentro del número.
  const totales = r.rows.reduce(
    (acc, x) => {
      acc.items += 1;
      const imp = Number(x.importe || 0);
      if (imp > 0) acc.valor += imp;
      else if (imp < 0) acc.valor_negativo += imp;
      if (x.en_negativo) acc.negativos += 1;
      if (x.sin_costo) acc.sin_costo += 1;
      if (x.stock_bajo) acc.bajo_minimo += 1;
      return acc;
    },
    { items: 0, valor: 0, valor_negativo: 0, negativos: 0, sin_costo: 0, bajo_minimo: 0 }
  );
  totales.valor = Math.round(totales.valor * 100) / 100;
  totales.valor_negativo = Math.round(totales.valor_negativo * 100) / 100;

  if (sinPrecios(req.user)) {
    return res.json({
      items: r.rows.map(recortarPrecios),
      // Los contadores de cantidad sí le sirven (qué falta, qué está en rojo);
      // los de plata no se mandan.
      totales: {
        items: totales.items, negativos: totales.negativos,
        bajo_minimo: totales.bajo_minimo, valor: null, valor_negativo: null, sin_costo: null,
      },
    });
  }
  res.json({ items: r.rows, totales });
});

// Valores existentes para poblar filtros y selects sin inventarlos en el front.
exports.catalogos = catchAsync(async (_req, res) => {
  const [cat, ubi] = await Promise.all([
    db.query(`SELECT DISTINCT categoria FROM taller_repuesto WHERE categoria IS NOT NULL ORDER BY 1`),
    db.query(`SELECT DISTINCT ubicacion FROM taller_repuesto WHERE ubicacion IS NOT NULL ORDER BY 1`),
  ]);
  res.json({
    categorias: cat.rows.map((x) => x.categoria),
    ubicaciones: ubi.rows.map((x) => x.ubicacion),
    unidades: UNIDADES,
  });
});

exports.crearItem = catchAsync(async (req, res) => {
  const {
    descripcion, parte_no, categoria, ubicacion, unidad,
    stock_minimo, costo_unitario, serie_no, codigo,
  } = req.body;
  if (!descripcion || !String(descripcion).trim()) {
    return res.status(400).json({ message: "La descripción es obligatoria" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // El código lo genera el sistema salvo que se pase uno explícito (lo usa
    // el cargador del Excel, que trae los códigos históricos).
    const cod = codigo ? String(codigo).trim() : await siguienteCodigoItem(client);

    const r = await client.query(
      `INSERT INTO taller_repuesto
         (codigo, parte_no, descripcion, categoria, ubicacion, unidad,
          stock_actual, stock_minimo, costo_unitario, serie_no, es_serializado)
       -- Los dos COALESCE van casteados: con el literal 0 sin castear, Postgres
       -- infiere integer para el parámetro y un costo como 8.009 revienta.
       VALUES ($1,$2,$3,$4,$5,$6, 0, COALESCE($7::numeric,0), COALESCE($8::numeric,0), $9, $10)
       RETURNING *`,
      [
        cod,
        parte_no || null,
        String(descripcion).trim(),
        normalizarClasificacion(categoria),
        ubicacion || null,
        normalizarUnidad(unidad),
        stock_minimo,
        costo_unitario,
        serie_no || null,
        !!serie_no,
      ]
    );
    await client.query("COMMIT");
    // El stock arranca en 0 a propósito: solo se mueve con documentos.
    res.json(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {
      return res.status(409).json({ message: "Ya existe un ítem con ese código" });
    }
    throw e;
  } finally {
    client.release();
  }
});

exports.editarItem = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    descripcion, parte_no, categoria, ubicacion, unidad,
    stock_minimo, costo_unitario, serie_no, activo,
  } = req.body;

  const r = await db.query(
    `UPDATE taller_repuesto SET
        descripcion    = COALESCE($2, descripcion),
        parte_no       = $3,
        categoria      = $4,
        ubicacion      = $5,
        unidad         = COALESCE($6, unidad),
        stock_minimo   = COALESCE($7, stock_minimo),
        costo_unitario = COALESCE($8, costo_unitario),
        serie_no       = $9,
        es_serializado = ($9 IS NOT NULL),
        activo         = COALESCE($10, activo)
      WHERE id_repuesto = $1
      RETURNING *`,
    [
      id,
      descripcion ? String(descripcion).trim() : null,
      parte_no || null,
      normalizarClasificacion(categoria),
      ubicacion || null,
      unidad ? normalizarUnidad(unidad) : null,
      stock_minimo,
      costo_unitario,
      serie_no || null,
      activo,
    ]
  );
  if (!r.rows.length) return res.status(404).json({ message: "Ítem no encontrado" });
  // El stock no se toca acá: se mueve con documentos (entrada/salida/ajuste).
  res.json(r.rows[0]);
});

// ── Kardex ──────────────────────────────────────────────────────────────────

/**
 * Kardex de un ítem, con saldo corrido.
 *
 * Dos decisiones que separan esto de una lista de movimientos:
 *
 *  1. El saldo se calcula AL LEER con una suma acumulada, nunca se guarda. Es
 *     la lección de la cuenta corriente (§26.A): con el saldo congelado por
 *     fila, un movimiento con fecha anterior deja mintiendo a todo lo de abajo.
 *  2. Con filtro de fechas, se devuelve además el SALDO INICIAL (todo lo
 *     anterior al rango). Sin él, un kardex filtrado arranca en cero y no cuadra
 *     con la existencia — el error clásico de estos reportes.
 *
 * Los documentos anulados solo aparecen si se piden, y en ese caso NO suman al
 * saldo (contribuyen 0 a la ventana).
 */
exports.kardex = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { desde, hasta, incluir_anulados } = req.query;

  const item = await db.query(
    `SELECT r.*,
            (r.stock_minimo > 0 AND r.stock_actual <= r.stock_minimo) AS stock_bajo,
            ROUND(r.stock_actual * COALESCE(r.costo_unitario, 0), 2) AS importe
       FROM taller_repuesto r WHERE r.id_repuesto = $1`,
    [id]
  );
  if (!item.rows.length) return res.status(404).json({ message: "Ítem no encontrado" });

  const k = await kardexDeItem(db, id, { desde, hasta, verAnulados: incluir_anulados === "true" });
  if (sinPrecios(req.user)) {
    return res.json({
      item: recortarPrecios(item.rows[0]),
      ...k,
      movimientos: (k.movimientos || []).map(recortarPrecios),
    });
  }
  res.json({ item: item.rows[0], ...k });
});

/**
 * El kardex de un ítem: movimientos con saldo corrido, y el saldo inicial
 * cuando hay filtro de fechas.
 *
 * Compartido por la pantalla de kardex y por la hoja de entrega de aceites,
 * que es el mismo cálculo con otro formato — por eso vive en una sola función
 * y no copiado en dos consultas.
 */
async function kardexDeItem(conn, idRepuesto, { desde, hasta, verAnulados } = {}) {
  const r = await conn.query(
    `WITH base AS (
       SELECT m.id_mov, m.cantidad, m.costo_unitario, m.nota,
              m.forzado, m.motivo_forzado,
              d.id_documento, d.correlativo, d.tipo, d.fecha, d.estado,
              d.proveedor, d.factura_no, d.motivo,
              -- entregado_a alimenta la columna "Nombre" de la hoja de aceites.
              d.entregado_a, d.orden_trabajo_no,
              a.codigo AS aeronave_codigo,
              tp.nombre AS tarea_nombre,
              ma.tipo   AS mantenimiento_tipo,
              TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')) AS registrado_por_nombre
         FROM taller_movimiento_inventario m
         JOIN taller_documento_inventario  d  ON d.id_documento = m.id_documento
         LEFT JOIN aeronave                a  ON a.id_aeronave = d.id_aeronave
         LEFT JOIN taller_cumplimiento     tc ON tc.id_cumplimiento = d.id_cumplimiento
         LEFT JOIN taller_tarea_programada tp ON tp.id_tarea = tc.id_tarea
         LEFT JOIN mantenimiento_aeronave  ma ON ma.id_mantenimiento = d.id_mantenimiento
         LEFT JOIN usuario                 u  ON u.id_usuario = d.registrado_por
        WHERE m.id_repuesto = $1
          -- La requisición es un borrador: sus renglones viven en esta misma
          -- tabla pero no son movimiento de bodega.
          AND d.tipo <> 'REQUISICION'
     ),
     ini AS (
       SELECT COALESCE(SUM(cantidad), 0) AS saldo
         FROM base
        WHERE estado = 'VIGENTE'
          AND $2::date IS NOT NULL AND fecha < $2::date
     )
     SELECT b.*,
            (SELECT saldo FROM ini)
              + SUM(CASE WHEN b.estado = 'VIGENTE' THEN b.cantidad ELSE 0 END)
                OVER (ORDER BY b.fecha, b.id_mov ROWS UNBOUNDED PRECEDING) AS saldo_corrido,
            (SELECT saldo FROM ini) AS saldo_inicial
       FROM base b
      WHERE ($2::date IS NULL OR b.fecha >= $2::date)
        AND ($3::date IS NULL OR b.fecha <= $3::date)
        AND ($4::boolean OR b.estado = 'VIGENTE')
      ORDER BY b.fecha, b.id_mov`,
    [idRepuesto, desde || null, hasta || null, !!verAnulados]
  );
  return {
    saldo_inicial: Number(r.rows[0]?.saldo_inicial ?? 0),
    movimientos: r.rows,
  };
}

/**
 * Hoja de "CONTROL DE ENTREGA DE ACEITES POR DÍA".
 *
 * No es una tabla nueva: es el kardex de los aceites. Las columnas del cuaderno
 * (existencia → entregado → existencia actual) son exactamente el saldo corrido
 * que el kardex ya calcula, así que acá solo se elige el rango y los ítems.
 *
 * A diferencia del papel, se muestran también las entradas: el cuaderno solo
 * anota salidas y por eso su saldo se despega del real en cuanto llega una compra.
 */
async function construirEntregaAceites({ desde, hasta, ids }) {
  const seleccion = String(ids || "").split(",").map(Number).filter(Boolean);
  const items = await db.query(
    seleccion.length
      ? `SELECT * FROM taller_repuesto WHERE id_repuesto = ANY($1::int[]) ORDER BY codigo`
      : `SELECT * FROM taller_repuesto WHERE categoria = 'ACEITE' AND activo = true ORDER BY codigo`,
    seleccion.length ? [seleccion] : []
  );
  const hojas = [];
  for (const it of items.rows) {
    hojas.push({ item: it, ...(await kardexDeItem(db, it.id_repuesto, { desde, hasta })) });
  }
  return { desde: desde || null, hasta: hasta || null, hojas };
}

exports.entregaAceites = catchAsync(async (req, res) => {
  res.json(await construirEntregaAceites(req.query));
});

/** La misma hoja, en PDF apaisado y con las columnas de firma en blanco. */
exports.imprimirEntregaAceites = catchAsync(async (req, res) => {
  const { desde, hasta } = req.query;
  const datos = await construirEntregaAceites(req.query);
  const f = await db.query("SELECT * FROM taller_formulario WHERE clave = 'ACEITES'");
  const pdf = generarEntregaAceitesPDF({ ...datos, desde, hasta, formulario: f.rows[0] || null });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="entrega-aceites.pdf"');
  pdf.pipe(res);
});

/**
 * Posibles duplicados: un mismo n° de parte repartido entre varios códigos.
 *
 * Salió del cotejo con los formatos en papel: `CH48110-1` existe como 000350
 * (+10) y 000685 (−7), que es el mismo filtro con el saldo partido en dos. NO
 * se fusionan solos — fusionar mueve saldos y es decisión del mecánico.
 */
exports.duplicadosPorParte = catchAsync(async (_req, res) => {
  const r = await db.query(
    `SELECT UPPER(TRIM(parte_no)) AS parte_no,
            COUNT(*)::int AS codigos,
            SUM(stock_actual) AS neto,
            JSON_AGG(JSON_BUILD_OBJECT(
              'id_repuesto', id_repuesto, 'codigo', codigo,
              'descripcion', descripcion, 'stock', stock_actual,
              'ultimo_movimiento_en', ultimo_movimiento_en
            ) ORDER BY codigo) AS items
       FROM taller_repuesto
      WHERE parte_no IS NOT NULL AND TRIM(parte_no) <> ''
        -- 'UNK' es el marcador de "no se sabe el n° de parte": agrupa 13 ítems
        -- que no tienen nada que ver entre sí.
        AND UPPER(TRIM(parte_no)) <> 'UNK'
        AND activo = true
      GROUP BY UPPER(TRIM(parte_no))
     HAVING COUNT(*) > 1
      ORDER BY BOOL_OR(stock_actual < 0) DESC, COUNT(*) DESC, 1`
  );
  res.json(r.rows);
});

// ── Cola de trabajo de Taller + Contabilidad ───────────────────────────────

/**
 * Ítems sin costo y entradas sin costear. Es la pantalla donde Taller y
 * Contabilidad hacen juntos la ingesta que el Excel nunca tuvo: allá 500 de
 * 662 ítems no tenían costo unitario.
 */
exports.pendientesCosto = catchAsync(async (_req, res) => {
  const [items, docs] = await Promise.all([
    db.query(
      `SELECT id_repuesto, codigo, descripcion, parte_no, unidad, stock_actual
         FROM taller_repuesto
        WHERE activo = true AND COALESCE(costo_unitario, 0) = 0
        ORDER BY stock_actual DESC, codigo`
    ),
    db.query(
      `SELECT d.id_documento, d.correlativo, d.fecha, d.proveedor, d.factura_no,
              COUNT(m.id_mov)::int AS renglones,
              COUNT(*) FILTER (WHERE COALESCE(m.costo_unitario, 0) = 0)::int AS renglones_sin_costo
         FROM taller_documento_inventario d
         JOIN taller_movimiento_inventario m ON m.id_documento = d.id_documento
        WHERE d.tipo = 'ENTRADA' AND d.estado = 'VIGENTE' AND d.id_egreso IS NULL
        GROUP BY d.id_documento
       HAVING COUNT(*) FILTER (WHERE COALESCE(m.costo_unitario, 0) = 0) > 0
        ORDER BY d.fecha DESC`
    ),
  ]);
  res.json({ items: items.rows, documentos: docs.rows });
});
