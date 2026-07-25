const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const { filaAObjetoAircraft, objetoAircraftAFila } = require("../../utils/wbPlantilla");

exports.getAeronavesActivas = catchAsync(async (req, res) => {
  // Mismo criterio que programacionController.getAeronavesActivas: se devuelven
  // TODAS las aeronaves no dadas de baja, incluidas las que hoy están en el
  // taller (con en_mantenimiento/mantenimiento_hasta para que el modal avise,
  // no las esconda). "activa" es "disponible HOY", no "dada de baja" — este
  // endpoint alimenta el "Agendar vuelo" de Turno/Admin/Programación y
  // EditarTripulacionModal, que agendan/reasignan para cualquier día.
  const result = await db.query(`
    SELECT
      a.id_aeronave, a.codigo, a.modelo, a.tipo,
      mact.id_mantenimiento IS NOT NULL AS en_mantenimiento,
      mact.fecha_fin::date AS mantenimiento_hasta
    FROM aeronave a
    LEFT JOIN LATERAL (
      SELECT m2.id_mantenimiento, m2.fecha_fin
        FROM mantenimiento_aeronave m2
       WHERE m2.id_aeronave = a.id_aeronave
         AND m2.completado = false
         AND COALESCE(m2.estado, '') <> 'CANCELADO'
       ORDER BY m2.fecha_fin IS NULL DESC, m2.fecha_fin DESC
       LIMIT 1
    ) mact ON true
    WHERE NOT (a.activa = false AND a.estado = 'ACTIVO')
    ORDER BY a.codigo
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

    // La convención de "dada de baja" es activa=false CON estado='ACTIVO', y no es
    // arbitraria: sincronizarEstadoFlota solo reactiva aviones cuyo estado sea
    // 'MANTENIMIENTO' (rama `WHEN a.estado='MANTENIMIENTO' THEN true`), y todo lo
    // demás lo preserva con `ELSE a.activa`. Si la baja dejara estado en
    // 'MANTENIMIENTO', al cerrarse ese mantenimiento el job pondría activa=true y
    // la baja se desharía sola. Por eso se normaliza el estado acá.
    const r = await client.query(
      `UPDATE aeronave SET activa = false, estado = 'ACTIVO' WHERE id_aeronave = $1 RETURNING *`,
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

/**
 * Reemplaza qué licencias pueden volar esta aeronave (tabla licencia_aeronave).
 *
 * Esta tabla es la ÚNICA fuente de verdad de "quién puede pedir qué avión": la
 * consultan igual el alumno (agendarController.getAeronavesPermitidas) y el staff
 * (adminUsuarioController.getAeronavesPermitidasAlumno), con el mismo JOIN. El
 * único filtro extra en ambos lados es aeronave.activa = true. Hasta ahora solo se
 * tocaba por SQL, y por eso un alumno al que le faltaba un avión terminaba
 * "arreglándose" cambiándole la licencia — lo que le ensucia las horas, porque
 * id_licencia también manda en el avance hacia su licencia.
 *
 * Se hace DELETE + INSERT del set completo (no un diff) porque la tabla es una
 * relación N:N pelada con PK compuesta: el estado deseado ES la lista que llega.
 */
exports.setLicenciasAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { licencias } = req.body;

  if (!Array.isArray(licencias)) {
    return res.status(400).json({ message: "Se espera un arreglo 'licencias' con los id_licencia." });
  }
  // Se normaliza a enteros únicos: un id repetido reventaría la PK compuesta con
  // un 23505 críptico, y un no-numérico daría un error de tipo en el INSERT.
  const ids = [...new Set(licencias.map(Number).filter((n) => Number.isInteger(n) && n > 0))];

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const ae = await client.query(`SELECT id_aeronave, codigo FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`, [id]);
    if (ae.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Aeronave no encontrada" });
    }

    if (ids.length > 0) {
      const existen = await client.query(`SELECT id_licencia FROM licencia WHERE id_licencia = ANY($1::int[])`, [ids]);
      if (existen.rows.length !== ids.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Hay id_licencia que no existen." });
      }
    }

    const antes = await client.query(
      `SELECT id_licencia FROM licencia_aeronave WHERE id_aeronave = $1 ORDER BY id_licencia`, [id]
    );

    await client.query(`DELETE FROM licencia_aeronave WHERE id_aeronave = $1`, [id]);
    if (ids.length > 0) {
      await client.query(
        `INSERT INTO licencia_aeronave (id_licencia, id_aeronave)
         SELECT x, $1 FROM unnest($2::int[]) AS x`,
        [id, ids]
      );
    }

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "aeronave",
      id_entidad: Number(id),
      actor: req.user,
      req,
      descripcion: `Licencias habilitadas de ${ae.rows[0].codigo}`,
      metadata: { before: antes.rows.map((r) => r.id_licencia), after: ids },
    });

    await client.query("COMMIT");

    const out = await db.query(
      `SELECT l.id_licencia, l.nombre
         FROM licencia_aeronave la
         JOIN licencia l ON l.id_licencia = la.id_licencia
        WHERE la.id_aeronave = $1
        ORDER BY l.id_licencia`, [id]
    );
    res.json(out.rows);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ===========================================================================
// Editor de Peso y Balance (wb_plantilla) por aeronave.
//
// El GET/PUT reusan el mismo mapper que el seed autoritativo
// (utils/wbPlantilla.js): filaAObjetoAircraft para leer, objetoAircraftAFila
// para escribir. El cuerpo del PUT tiene forma "AIRCRAFT" (la misma que
// consume el wizard del loadsheet), no la forma cruda de la tabla.
// ===========================================================================

function toNumWb(v) {
  if (v === null || v === undefined || v === "") return NaN;
  return Number(v);
}

// node-postgres no acepta `undefined` como parámetro (a diferencia de `null`,
// que sí es un valor SQL válido). Todo campo opcional de la forma AIRCRAFT
// que pueda faltar se normaliza acá antes de bindear. Mismo patrón que usa
// supabase/dump/seed_wb_plantilla_desde_aircraft.js.
const nnWb = (v) => (v === undefined ? null : v);
// jsonb: un array/objeto JS crudo como parámetro lo serializa `pg` como literal
// de ARRAY de Postgres, no como JSON. Hay que stringificarlo a mano.
const jnWb = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

/**
 * Valida el cuerpo de PUT .../wb-plantilla (forma AIRCRAFT) ANTES de escribir.
 * @returns {{ok:true}|{ok:false,motivo:string}}
 */
function validarWbPlantilla(body) {
  const b = body || {};

  const nombre = b.nombre || b.sheet || b.model;
  if (!nombre || !String(nombre).trim()) {
    return { ok: false, motivo: "El nombre de la plantilla es obligatorio (nombre, sheet o model)." };
  }

  const emptyWeight = toNumWb(b.empty_weight);
  if (!(emptyWeight > 0)) {
    return { ok: false, motivo: "empty_weight debe ser numérico y mayor que 0." };
  }
  const emptyArm = toNumWb(b.empty_arm);
  if (!(emptyArm > 0)) {
    return { ok: false, motivo: "empty_arm debe ser numérico y mayor que 0." };
  }
  const maxGross = toNumWb(b.max_gross);
  if (!(maxGross > 0)) {
    return { ok: false, motivo: "max_gross debe ser numérico y mayor que 0." };
  }

  const fuelUsable = toNumWb(b.fuel_usable_gal);
  const fuelCap = toNumWb(b.fuel_cap_gal);
  if (!(fuelUsable >= 0) || !(fuelCap >= 0)) {
    return { ok: false, motivo: "fuel_usable_gal y fuel_cap_gal deben ser numéricos." };
  }
  if (fuelUsable > fuelCap) {
    return { ok: false, motivo: "fuel_usable_gal no puede ser mayor que fuel_cap_gal." };
  }

  const maxLanding = toNumWb(b.max_landing);
  if (!(maxLanding >= 0)) {
    return { ok: false, motivo: "max_landing debe ser numérico." };
  }
  if (maxLanding > maxGross) {
    return { ok: false, motivo: "max_landing no puede ser mayor que max_gross." };
  }

  if (!Array.isArray(b.stations) || b.stations.length === 0) {
    return { ok: false, motivo: "stations debe ser un arreglo con al menos una estación." };
  }
  const hayFuel = b.stations.some((s) => s && s.is_fuel === true);
  if (!hayFuel) {
    return { ok: false, motivo: "Debe haber al menos una estación de combustible (is_fuel=true)." };
  }
  for (let i = 0; i < b.stations.length; i++) {
    const s = b.stations[i] || {};
    const arm = toNumWb(s.arm);
    if (!(arm >= 0)) {
      return { ok: false, motivo: `La estación #${i + 1} debe tener 'arm' numérico >= 0.` };
    }
    // max / max_gal son OPCIONALES (p.ej. el C310 tiene estaciones sin ninguno):
    // solo se validan si vienen.
    if (s.max !== undefined && s.max !== null) {
      const max = toNumWb(s.max);
      if (!(max >= 0)) return { ok: false, motivo: `La estación #${i + 1}: 'max' debe ser numérico >= 0 si se especifica.` };
    }
    if (s.max_gal !== undefined && s.max_gal !== null) {
      const maxGal = toNumWb(s.max_gal);
      if (!(maxGal >= 0)) return { ok: false, motivo: `La estación #${i + 1}: 'max_gal' debe ser numérico >= 0 si se especifica.` };
    }
  }

  const validarLimits = (limits, etiqueta) => {
    if (!Array.isArray(limits) || limits.length === 0) {
      return `${etiqueta} debe ser un arreglo no vacío.`;
    }
    let wAnterior = -Infinity;
    for (let i = 0; i < limits.length; i++) {
      const fila = limits[i] || {};
      const w = toNumWb(fila.w);
      const fwd = toNumWb(fila.fwd);
      const aft = toNumWb(fila.aft);
      if (!Number.isFinite(w) || !Number.isFinite(fwd) || !Number.isFinite(aft)) {
        return `${etiqueta}[${i}] debe tener w/fwd/aft numéricos.`;
      }
      if (!(fwd < aft)) {
        return `${etiqueta}[${i}]: fwd debe ser menor que aft.`;
      }
      if (!(w > wAnterior)) {
        return `${etiqueta}: w debe ser estrictamente creciente.`;
      }
      wAnterior = w;
    }
    return null;
  };

  const errNormal = validarLimits(b.limits_normal, "limits_normal");
  if (errNormal) return { ok: false, motivo: errNormal };

  if (Array.isArray(b.limits_utility) && b.limits_utility.length > 0) {
    const errUtility = validarLimits(b.limits_utility, "limits_utility");
    if (errUtility) return { ok: false, motivo: errUtility };
  }

  return { ok: true };
}

// Arma el arreglo de 21 valores (mismo orden/columnas que usa el seed
// autoritativo) a partir de `fila` = objetoAircraftAFila(body).
function valoresWbPlantilla(fila) {
  return [
    fila.nombre,                       // 1
    fila.empty_weight,                 // 2
    fila.empty_weight_arm,             // 3
    fila.empty_weight_moment,          // 4
    fila.max_takeoff_weight,           // 5
    fila.max_landing_weight,           // 6
    nnWb(fila.max_useful_load),        // 7
    fila.fuel_capacity_gal,            // 8
    fila.fuel_usable_gal,              // 9
    nnWb(fila.fuel_burn_gal_hr),       // 10
    nnWb(fila.fuel_lb_gal),            // 11
    nnWb(fila.default_power),          // 12
    nnWb(fila.default_flow_gal),       // 13
    nnWb(fila.moment_div1000),         // 14
    nnWb(fila.fuel_burn_note),         // 15
    nnWb(fila.model),                  // 16
    nnWb(fila.sheet),                  // 17
    jnWb(fila.oil),                    // 18
    jnWb(fila.estaciones),             // 19
    jnWb(fila.limits_normal),          // 20
    jnWb(fila.limits_utility),         // 21
  ];
}

exports.getWbPlantilla = catchAsync(async (req, res) => {
  const { id } = req.params;
  const ae = await db.query(
    `SELECT id_aeronave, codigo, id_wb_plantilla FROM aeronave WHERE id_aeronave = $1`,
    [id]
  );
  if (ae.rows.length === 0) return res.status(404).json({ message: "Aeronave no encontrada" });

  const aeronave = ae.rows[0];
  if (aeronave.id_wb_plantilla == null) {
    return res.json({ plantilla: null, matricula: aeronave.codigo });
  }

  const wb = await db.query(`SELECT * FROM wb_plantilla WHERE id_wb_plantilla = $1`, [aeronave.id_wb_plantilla]);
  if (wb.rows.length === 0) {
    // id_wb_plantilla apunta a una fila que ya no existe (deriva de datos) —
    // se trata igual que "sin plantilla" en vez de tirar un 500.
    return res.json({ plantilla: null, matricula: aeronave.codigo });
  }

  res.json({
    plantilla: filaAObjetoAircraft(wb.rows[0], { codigo: aeronave.codigo }),
    matricula: aeronave.codigo,
  });
});

exports.guardarWbPlantilla = catchAsync(async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};

  const { ok, motivo } = validarWbPlantilla(body);
  if (!ok) return res.status(400).json({ message: motivo });

  const fila = objetoAircraftAFila(body);
  const valores = valoresWbPlantilla(fila);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const ae = await client.query(
      `SELECT id_aeronave, codigo, id_wb_plantilla FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`,
      [id]
    );
    if (ae.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Aeronave no encontrada" });
    }
    const aeronave = ae.rows[0];

    let idWb = aeronave.id_wb_plantilla;

    if (idWb) {
      await client.query(
        `UPDATE wb_plantilla SET
           nombre = $1,
           empty_weight = $2,
           empty_weight_arm = $3,
           empty_weight_moment = $4,
           max_takeoff_weight = $5,
           max_landing_weight = $6,
           max_useful_load = $7,
           fuel_capacity_gal = $8,
           fuel_usable_gal = $9,
           fuel_burn_gal_hr = $10,
           fuel_lb_gal = $11,
           default_power = $12,
           default_flow_gal = $13,
           moment_div1000 = $14,
           fuel_burn_note = $15,
           model = $16,
           sheet = $17,
           oil = $18::jsonb,
           estaciones = $19::jsonb,
           limits_normal = $20::jsonb,
           limits_utility = $21::jsonb
         WHERE id_wb_plantilla = $22`,
        [...valores, idWb]
      );
    } else {
      const insertRes = await client.query(
        `INSERT INTO wb_plantilla
           (nombre, empty_weight, empty_weight_arm, empty_weight_moment,
            max_takeoff_weight, max_landing_weight, max_useful_load,
            fuel_capacity_gal, fuel_usable_gal, fuel_burn_gal_hr, fuel_lb_gal,
            default_power, default_flow_gal, moment_div1000, fuel_burn_note,
            model, sheet, oil, estaciones, limits_normal, limits_utility)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 $18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb)
         RETURNING id_wb_plantilla`,
        valores
      );
      idWb = insertRes.rows[0].id_wb_plantilla;
      await client.query(`UPDATE aeronave SET id_wb_plantilla = $1 WHERE id_aeronave = $2`, [idWb, id]);
    }

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "aeronave",
      id_entidad: Number(id),
      actor: req.user,
      req,
      descripcion: `Peso y balance actualizado de ${aeronave.codigo}`,
      metadata: { id_wb_plantilla: idWb },
    });

    const wbRes = await client.query(`SELECT * FROM wb_plantilla WHERE id_wb_plantilla = $1`, [idWb]);

    await client.query("COMMIT");

    res.json({
      ok: true,
      plantilla: filaAObjetoAircraft(wbRes.rows[0], { codigo: aeronave.codigo }),
    });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23502") {
      return res.status(400).json({ message: `Falta un campo obligatorio: ${e.column || "desconocido"}.` });
    }
    throw e;
  } finally {
    client.release();
  }
});
