const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");

// ── Listar componentes (opcionalmente por aeronave) ───────────────────────
// Calcula las horas actuales de cada componente a partir de las horas de la
// célula (aeronave.horas_acumuladas) más los offsets de instalación.
exports.list = catchAsync(async (req, res) => {
  const { id_aeronave } = req.query;
  const params = [];
  const where = ["c.activo = true"];
  if (id_aeronave) { params.push(id_aeronave); where.push(`c.id_aeronave = $${params.length}`); }

  const r = await db.query(`
    SELECT c.*,
           a.codigo  AS aeronave_codigo,
           a.modelo  AS aeronave_modelo,
           COALESCE(a.horas_acumuladas, 0) AS aeronave_horas,
           ROUND(COALESCE(a.horas_acumuladas, 0)
                 - c.horas_aeronave_instalacion
                 + c.horas_componente_instalacion, 2) AS horas_componente
    FROM taller_componente c
    JOIN aeronave a ON a.id_aeronave = c.id_aeronave
    WHERE ${where.join(" AND ")}
    ORDER BY a.codigo, c.tipo
  `, params);
  res.json(r.rows);
});

// ── Crear componente ───────────────────────────────────────────────────────
exports.create = catchAsync(async (req, res) => {
  const {
    id_aeronave, tipo, nombre, parte_no, serie_no, posicion,
    fecha_instalacion, horas_aeronave_instalacion,
    horas_componente_instalacion, ciclos_instalacion,
  } = req.body;

  if (!id_aeronave || !tipo || !nombre) {
    return res.status(400).json({ message: "Aeronave, tipo y nombre son obligatorios" });
  }

  const r = await db.query(`
    INSERT INTO taller_componente
      (id_aeronave, tipo, nombre, parte_no, serie_no, posicion, fecha_instalacion,
       horas_aeronave_instalacion, horas_componente_instalacion, ciclos_instalacion)
    VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8,0), COALESCE($9,0), COALESCE($10,0))
    RETURNING *
  `, [
    id_aeronave, tipo, nombre, parte_no || null, serie_no || null, posicion || null,
    fecha_instalacion || null, horas_aeronave_instalacion, horas_componente_instalacion,
    ciclos_instalacion,
  ]);

  await logAuditoria(db, { accion: "OTRO", entidad: "taller_componente", id_entidad: r.rows[0].id_componente, actor: req.user, req, descripcion: `Alta de componente ${tipo} "${nombre}"` }).catch(() => {});
  res.json(r.rows[0]);
});

// ── Editar componente ──────────────────────────────────────────────────────
exports.update = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    tipo, nombre, parte_no, serie_no, posicion, fecha_instalacion,
    horas_aeronave_instalacion, horas_componente_instalacion, ciclos_instalacion, activo,
  } = req.body;

  const r = await db.query(`
    UPDATE taller_componente SET
      tipo = COALESCE($2, tipo),
      nombre = COALESCE($3, nombre),
      parte_no = $4,
      serie_no = $5,
      posicion = $6,
      fecha_instalacion = $7,
      horas_aeronave_instalacion   = COALESCE($8, horas_aeronave_instalacion),
      horas_componente_instalacion = COALESCE($9, horas_componente_instalacion),
      ciclos_instalacion           = COALESCE($10, ciclos_instalacion),
      activo = COALESCE($11, activo)
    WHERE id_componente = $1
    RETURNING *
  `, [
    id, tipo, nombre, parte_no || null, serie_no || null, posicion || null,
    fecha_instalacion || null, horas_aeronave_instalacion, horas_componente_instalacion,
    ciclos_instalacion, activo,
  ]);
  if (!r.rows.length) return res.status(404).json({ message: "Componente no encontrado" });
  res.json(r.rows[0]);
});
