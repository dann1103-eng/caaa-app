const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");

// ── Listar repuestos (con bandera de stock bajo) ──────────────────────────
exports.listRepuestos = catchAsync(async (req, res) => {
  const { solo_bajos } = req.query;
  const r = await db.query(`
    SELECT *, (stock_actual <= stock_minimo) AS stock_bajo
    FROM taller_repuesto
    WHERE activo = true
    ${solo_bajos === "true" ? "AND stock_actual <= stock_minimo" : ""}
    ORDER BY descripcion
  `);
  res.json(r.rows);
});

// ── Crear repuesto ─────────────────────────────────────────────────────────
exports.crearRepuesto = catchAsync(async (req, res) => {
  const {
    parte_no, descripcion, categoria, ubicacion, unidad,
    stock_actual, stock_minimo, costo_unitario, serie_no,
  } = req.body;
  if (!descripcion) return res.status(400).json({ message: "La descripción es obligatoria" });

  const r = await db.query(`
    INSERT INTO taller_repuesto
      (parte_no, descripcion, categoria, ubicacion, unidad,
       stock_actual, stock_minimo, costo_unitario, serie_no)
    VALUES ($1,$2,$3,$4,COALESCE($5,'UNIDAD'),COALESCE($6,0),COALESCE($7,0),COALESCE($8,0),$9)
    RETURNING *
  `, [
    parte_no || null, descripcion, categoria || null, ubicacion || null, unidad,
    stock_actual, stock_minimo, costo_unitario, serie_no || null,
  ]);
  res.json(r.rows[0]);
});

// ── Editar repuesto (datos de catálogo; el stock se mueve vía movimientos) ─
exports.editarRepuesto = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    parte_no, descripcion, categoria, ubicacion, unidad,
    stock_minimo, costo_unitario, serie_no, activo,
  } = req.body;
  const r = await db.query(`
    UPDATE taller_repuesto SET
      parte_no = $2,
      descripcion = COALESCE($3, descripcion),
      categoria = $4,
      ubicacion = $5,
      unidad = COALESCE($6, unidad),
      stock_minimo = COALESCE($7, stock_minimo),
      costo_unitario = COALESCE($8, costo_unitario),
      serie_no = $9,
      activo = COALESCE($10, activo)
    WHERE id_repuesto = $1
    RETURNING *
  `, [
    id, parte_no || null, descripcion, categoria || null, ubicacion || null, unidad,
    stock_minimo, costo_unitario, serie_no || null, activo,
  ]);
  if (!r.rows.length) return res.status(404).json({ message: "Repuesto no encontrado" });
  res.json(r.rows[0]);
});

// ── Registrar movimiento de inventario (ENTRADA / SALIDA / AJUSTE) ─────────
// Una SALIDA hacia una aeronave puede registrar un egreso (categoría REPUESTOS),
// enlazado por id_egreso, para que se refleje en Contabilidad.
exports.registrarMovimiento = catchAsync(async (req, res) => {
  const { id } = req.params; // id_repuesto
  const {
    tipo, cantidad, costo_unitario, fecha, id_aeronave, nota,
    crear_egreso, proveedor,
  } = req.body;

  if (!["ENTRADA", "SALIDA", "AJUSTE"].includes(tipo)) {
    return res.status(400).json({ message: "Tipo de movimiento inválido" });
  }
  const cant = parseFloat(cantidad);
  if (isNaN(cant) || cant <= 0) return res.status(400).json({ message: "Cantidad inválida" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const rep = await client.query(`SELECT * FROM taller_repuesto WHERE id_repuesto = $1 FOR UPDATE`, [id]);
    if (!rep.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Repuesto no encontrado" }); }
    const repuesto = rep.rows[0];

    // Delta sobre el stock: ENTRADA suma, SALIDA resta, AJUSTE fija al valor dado.
    let nuevoStock;
    if (tipo === "AJUSTE") nuevoStock = cant;
    else if (tipo === "ENTRADA") nuevoStock = parseFloat(repuesto.stock_actual) + cant;
    else nuevoStock = parseFloat(repuesto.stock_actual) - cant;
    if (nuevoStock < 0) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Stock insuficiente para la salida" }); }

    const costo = costo_unitario != null ? costo_unitario : repuesto.costo_unitario;

    // Egreso opcional (solo en SALIDA con consumo hacia aeronave).
    let id_egreso = null;
    if (crear_egreso && tipo === "SALIDA") {
      const monto = Math.round(cant * parseFloat(costo) * 100) / 100;
      if (monto > 0) {
        const conceptoEgr = `Consumo repuesto: ${repuesto.descripcion} x${cant}`;
        const egr = await client.query(`
          INSERT INTO egreso (categoria, proveedor, concepto, monto_usd, fecha, registrado_por)
          VALUES ('REPUESTOS', $1, $2, $3, COALESCE($4, CURRENT_DATE), $5)
          RETURNING id
        `, [proveedor || null, conceptoEgr, monto, fecha || null, req.user?.id_usuario || null]);
        id_egreso = egr.rows[0].id;
      }
    }

    const mov = await client.query(`
      INSERT INTO taller_movimiento_inventario
        (id_repuesto, tipo, cantidad, costo_unitario, fecha, id_aeronave, id_egreso, nota, registrado_por)
      VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8,$9)
      RETURNING *
    `, [id, tipo, cant, costo, fecha || null, id_aeronave || null, id_egreso, nota || null, req.user?.id_usuario || null]);

    // Si vino costo nuevo en una ENTRADA, actualiza el costo de referencia del catálogo.
    const updRep = await client.query(`
      UPDATE taller_repuesto
      SET stock_actual = $2,
          costo_unitario = CASE WHEN $3 = 'ENTRADA' AND $4 IS NOT NULL THEN $4 ELSE costo_unitario END
      WHERE id_repuesto = $1
      RETURNING *, (stock_actual <= stock_minimo) AS stock_bajo
    `, [id, nuevoStock, tipo, costo_unitario ?? null]);

    await client.query("COMMIT");
    res.json({ movimiento: mov.rows[0], repuesto: updRep.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── Kardex de un repuesto ──────────────────────────────────────────────────
exports.movimientos = catchAsync(async (req, res) => {
  const { id } = req.params;
  const r = await db.query(`
    SELECT m.*, a.codigo AS aeronave_codigo
    FROM taller_movimiento_inventario m
    LEFT JOIN aeronave a ON a.id_aeronave = m.id_aeronave
    WHERE m.id_repuesto = $1
    ORDER BY m.fecha DESC, m.id_mov DESC
  `, [id]);
  res.json(r.rows);
});
