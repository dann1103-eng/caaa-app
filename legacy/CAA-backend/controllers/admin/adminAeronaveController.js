const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");

exports.getAeronavesActivas = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT id_aeronave, codigo, modelo, tipo
    FROM aeronave
    WHERE activa = true
    ORDER BY codigo
  `);
  res.json(result.rows);
});

exports.getVuelosFuturosAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const r = await db.query(`
    SELECT COUNT(*)::int AS total
    FROM vuelo
    WHERE id_aeronave = $1
      AND estado IN ('PUBLICADO', 'SOLICITADO', 'AJUSTADO')
      AND fecha_vuelo >= CURRENT_DATE
  `, [id]);
  res.json({ total: r.rows[0].total });
});

exports.registrarHorasManuales = catchAsync(async (req, res) => {
  const { id_aeronave, horas, descripcion: desc } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const aeronaveRes = await client.query(`SELECT horas_acumuladas, codigo FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`, [id_aeronave]);
    if (aeronaveRes.rows.length === 0) throw new Error("Aeronave no encontrada");

    const horasAntes = parseFloat(aeronaveRes.rows[0].horas_acumuladas);
    const nuevasHoras = horasAntes + parseFloat(horas);

    await client.query(`UPDATE aeronave SET horas_acumuladas = $1 WHERE id_aeronave = $2`, [nuevasHoras, id_aeronave]);
    
    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "aeronave",
      id_entidad: Number(id_aeronave),
      actor: req.user,
      req,
      descripcion: desc || `Registro manual de horas: +${horas}h`,
      metadata: { before: horasAntes, after: nuevasHoras }
    });

    await client.query("COMMIT");
    res.json({ message: "Horas registradas correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.setFotoAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { foto_url } = req.body;
  const r = await db.query(`UPDATE aeronave SET foto_url = $1 WHERE id_aeronave = $2 RETURNING id_aeronave, codigo, foto_url`, [foto_url || null, id]);
  if (r.rows.length === 0) return res.status(404).json({ message: "Aeronave no encontrada" });
  res.json(r.rows[0]);
});

// ===========================================================================
// Registro de aeronaves (módulo "Aeronaves")
//
// Hasta ahora las aeronaves solo se creaban por SQL: no existía ningún
// INSERT/UPDATE/DELETE de aeronave en todo el backend. Lo único que se escribía
// era horas_acumuladas, foto_url y estado. Esto es el CRUD que le da UI a eso.
//
// Campos deliberadamente NO editables acá, porque los maneja otro dueño y este
// endpoint los pisaría:
//   - estado                → lo deriva sincronizarEstadoFlota() según si hay un
//                             mantenimiento cubriendo la fecha de hoy (job diario).
//   - horas_acumuladas      → las mueve el cierre de vuelo (actualizarHorasAeronave)
//                             o el endpoint auditado de horas manuales.
//   - horas_*_revision      → cache que sincroniza el módulo Taller.
//   - id_wb_plantilla       → lo maneja el editor de peso y balance.
//
// Sobre la auditoría: accion va con 'OTRO' a propósito. auditoria_evento.accion
// es el ENUM public.audit_action, que NO tiene valores de CRUD genérico
// (CREAR/EDITAR/ELIMINAR no existen ahí); meter uno lanzaría "invalid input value
// for enum audit_action" y haría ROLLBACK del alta/edición completa. El qué pasó
// va en 'descripcion' + before/after en metadata. Es el mismo patrón que usa
// registrarHorasManuales. Si algún día se quiere un verbo propio, hay que
// agregarlo al enum con una migración (ALTER TYPE ... ADD VALUE) primero.
//
// Ojo también con public.audit_actor_rol: solo admite ALUMNO/PROGRAMACION/ADMIN/
// SYSTEM/TURNO/INSTRUCTOR. No incluye TALLER ni ADMINISTRACION, así que estos
// endpoints de escritura se dejan en ADMIN (un actor TALLER rompería el log).
// ===========================================================================

const TIPOS_VALIDOS = ["AVION", "SIMULADOR"];

// Lista completa para el módulo (incluye inactivas, a diferencia de
// getAeronavesActivas, que alimenta los selectores de agendado).
exports.listarAeronaves = catchAsync(async (req, res) => {
  const r = await db.query(`
    SELECT a.*,
           (SELECT COUNT(*) FROM vuelo v WHERE v.id_aeronave = a.id_aeronave)::int AS total_vuelos,
           (a.id_wb_plantilla IS NOT NULL) AS tiene_wb
    FROM aeronave a
    ORDER BY a.activa DESC, a.codigo
  `);
  res.json(r.rows);
});

exports.getAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const r = await db.query(`
    SELECT a.*,
           (SELECT COUNT(*) FROM vuelo v WHERE v.id_aeronave = a.id_aeronave)::int AS total_vuelos
    FROM aeronave a
    WHERE a.id_aeronave = $1
  `, [id]);
  if (r.rows.length === 0) return res.status(404).json({ message: "Aeronave no encontrada" });

  const licencias = await db.query(`
    SELECT l.id_licencia, l.nombre
    FROM licencia_aeronave la
    JOIN licencia l ON l.id_licencia = la.id_licencia
    WHERE la.id_aeronave = $1
    ORDER BY l.id_licencia
  `, [id]);

  res.json({ ...r.rows[0], licencias: licencias.rows });
});

function normalizarFrecuencias(freqs) {
  if (freqs == null) return null;
  if (!Array.isArray(freqs)) throw Object.assign(new Error("frecuencias_default debe ser un arreglo"), { status: 400 });
  return JSON.stringify(freqs);
}

exports.crearAeronave = catchAsync(async (req, res) => {
  const { codigo, modelo, tipo, color, frecuencias_default } = req.body;

  if (!codigo || !String(codigo).trim()) return res.status(400).json({ message: "La matrícula es obligatoria" });
  if (!modelo || !String(modelo).trim()) return res.status(400).json({ message: "El modelo es obligatorio" });
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ message: `Tipo inválido. Debe ser ${TIPOS_VALIDOS.join(" o ")}.` });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Los seeds originales insertaron ids explícitos, así que el sequence puede
    // haber quedado atrás y un INSERT por DEFAULT chocaría con una fila existente.
    await client.query(
      `SELECT setval('aeronave_id_aeronave_seq', (SELECT COALESCE(MAX(id_aeronave), 1) FROM aeronave), true)`
    );

    const r = await client.query(`
      INSERT INTO aeronave (codigo, modelo, tipo, activa, color, frecuencias_default, horas_acumuladas, estado)
      VALUES ($1, $2, $3, true, $4, COALESCE($5::jsonb, '[]'::jsonb), 0, 'ACTIVO')
      RETURNING *
    `, [
      String(codigo).trim().toUpperCase(),
      String(modelo).trim(),
      tipo,
      color ? String(color).trim() : null,
      normalizarFrecuencias(frecuencias_default),
    ]);

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "aeronave",
      id_entidad: r.rows[0].id_aeronave,
      actor: req.user,
      req,
      descripcion: `Alta de aeronave ${r.rows[0].codigo}`,
      metadata: { after: r.rows[0] },
    });

    await client.query("COMMIT");
    res.status(201).json(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {
      return res.status(409).json({ message: `Ya existe una aeronave con la matrícula ${codigo}.` });
    }
    if (e.status === 400) return res.status(400).json({ message: e.message });
    throw e;
  } finally {
    client.release();
  }
});

exports.actualizarAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { codigo, modelo, tipo, color, frecuencias_default } = req.body;

  if (tipo !== undefined && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ message: `Tipo inválido. Debe ser ${TIPOS_VALIDOS.join(" o ")}.` });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const prev = await client.query(`SELECT * FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`, [id]);
    if (prev.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Aeronave no encontrada" });
    }

    const r = await client.query(`
      UPDATE aeronave SET
        codigo              = COALESCE($2, codigo),
        modelo              = COALESCE($3, modelo),
        tipo                = COALESCE($4, tipo),
        color               = $5,
        frecuencias_default = COALESCE($6::jsonb, frecuencias_default)
      WHERE id_aeronave = $1
      RETURNING *
    `, [
      id,
      codigo ? String(codigo).trim().toUpperCase() : null,
      modelo ? String(modelo).trim() : null,
      tipo || null,
      color !== undefined ? (color ? String(color).trim() : null) : prev.rows[0].color,
      normalizarFrecuencias(frecuencias_default),
    ]);

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "aeronave",
      id_entidad: Number(id),
      actor: req.user,
      req,
      descripcion: `Edición de aeronave ${r.rows[0].codigo}`,
      metadata: { before: prev.rows[0], after: r.rows[0] },
    });

    await client.query("COMMIT");
    res.json(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {
      return res.status(409).json({ message: `Ya existe una aeronave con la matrícula ${codigo}.` });
    }
    if (e.status === 400) return res.status(400).json({ message: e.message });
    throw e;
  } finally {
    client.release();
  }
});

// "Eliminar" = dar de baja (activa = false). NUNCA un DELETE físico: vuelo,
// horas_vuelo_aeronave, mantenimiento_aeronave, licencia_aeronave, reserva_aeronave
// y las tablas del Taller tienen FK contra aeronave, así que un borrado real
// fallaría o se llevaría puesto el historial de vuelos y horas.
exports.darDeBajaAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const forzar = String(req.query.forzar || "") === "true";

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const prev = await client.query(`SELECT * FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`, [id]);
    if (prev.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Aeronave no encontrada" });
    }

    // Si tiene vuelos agendados a futuro, no la damos de baja en silencio:
    // esos vuelos quedarían con un avión inactivo.
    const futuros = await client.query(`
      SELECT COUNT(*)::int AS total
      FROM vuelo
      WHERE id_aeronave = $1
        AND estado IN ('PUBLICADO', 'SOLICITADO', 'AJUSTADO')
        AND fecha_vuelo >= CURRENT_DATE
    `, [id]);
    const totalFuturos = futuros.rows[0].total;
    if (totalFuturos > 0 && !forzar) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: `${prev.rows[0].codigo} tiene ${totalFuturos} vuelo(s) agendado(s) a futuro. Reasignálos o confirmá para darla de baja igual.`,
        vuelos_futuros: totalFuturos,
      });
    }

    const r = await client.query(
      `UPDATE aeronave SET activa = false WHERE id_aeronave = $1 RETURNING *`,
      [id]
    );

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "aeronave",
      id_entidad: Number(id),
      actor: req.user,
      req,
      descripcion: `Baja de aeronave ${r.rows[0].codigo}${totalFuturos > 0 ? ` (forzada, con ${totalFuturos} vuelo(s) futuro(s))` : ""}`,
      metadata: { before: prev.rows[0], after: r.rows[0], vuelos_futuros: totalFuturos },
    });

    await client.query("COMMIT");
    res.json({ ...r.rows[0], vuelos_futuros: totalFuturos });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.reactivarAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE aeronave SET activa = true WHERE id_aeronave = $1 RETURNING *`,
      [id]
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Aeronave no encontrada" });
    }
    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "aeronave",
      id_entidad: Number(id),
      actor: req.user,
      req,
      descripcion: `Reactivación de aeronave ${r.rows[0].codigo}`,
      metadata: { after: r.rows[0] },
    });
    await client.query("COMMIT");
    res.json(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// Alimenta la pestaña "Loadsheets & Vuelos" de la ficha: últimos vuelos del avión
// y si cada uno tiene loadsheet (y en qué estado).
exports.getVuelosAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const limite = Math.min(Number(req.query.limite) || 50, 200);
  const r = await db.query(`
    SELECT v.id_vuelo, v.fecha_vuelo, v.estado, v.tipo_vuelo,
           b.hora_inicio,
           au.nombre AS alumno_nombre, au.apellido AS alumno_apellido,
           iu.nombre AS instructor_nombre, iu.apellido AS instructor_apellido,
           ls.estado AS loadsheet_estado
    FROM vuelo v
    LEFT JOIN bloque_horario b  ON b.id_bloque = v.id_bloque
    LEFT JOIN alumno al         ON al.id_alumno = v.id_alumno
    LEFT JOIN usuario au        ON au.id_usuario = al.id_usuario
    LEFT JOIN instructor i      ON i.id_instructor = v.id_instructor
    LEFT JOIN usuario iu        ON iu.id_usuario = i.id_usuario
    LEFT JOIN loadsheet ls      ON ls.id_vuelo = v.id_vuelo
    WHERE v.id_aeronave = $1
    ORDER BY v.fecha_vuelo DESC, b.hora_inicio DESC
    LIMIT $2
  `, [id, limite]);
  res.json(r.rows);
});
