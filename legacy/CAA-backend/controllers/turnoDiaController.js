// Ciclo operativo del día de TURNO: apertura / pausa de almuerzo / cambio de
// turno (mañana→tarde) / cierre. Todo con timestamps reales (turno_evento es
// la bitácora auditable) y asistencia de los instructores en turno
// (turno_asistencia: entrada/salida por instructor y por turno M/T).
// Independiente de estado_operaciones (suspensión extraordinaria por clima):
// abrir/cerrar el turno NO cancela vuelos ni toca esa maquinaria.
const db = require("../config/db");
const catchAsync = require("../utils/catchAsync");
const { logAuditoria } = require("../utils/auditoria");
const { notificarStaff } = require("../utils/webpush");

function pushCicloTurno(user, title, body) {
  notificarStaff({ title, body, url: "/turno", tag: "turno-dia" }, { excluirUid: user?.id_usuario, tipo: "CICLO_TURNO" })
    .catch((e) => console.error("push turno-dia:", e.message));
}

const HOY_SV = `(NOW() AT TIME ZONE 'America/El_Salvador')::date`;

async function getEstadoDia(conn = db) {
  const diaRes = await conn.query(
    `SELECT id_turno_dia, fecha, estado, apertura_en, cierre_en,
            ua.nombre || ' ' || ua.apellido AS abierto_por_nombre,
            uc.nombre || ' ' || uc.apellido AS cerrado_por_nombre
     FROM turno_dia td
     LEFT JOIN usuario ua ON ua.id_usuario = td.abierto_por
     LEFT JOIN usuario uc ON uc.id_usuario = td.cerrado_por
     WHERE td.fecha = ${HOY_SV}`
  );
  const dia = diaRes.rows[0] || null;

  const asisRes = await conn.query(
    `SELECT ta.id_asistencia, ta.turno, ta.id_instructor, ta.entrada_en, ta.salida_en,
            u.nombre, u.apellido, u.nombre || ' ' || u.apellido AS nombre_completo
     FROM turno_asistencia ta
     JOIN instructor i ON i.id_instructor = ta.id_instructor
     JOIN usuario u ON u.id_usuario = i.id_usuario
     WHERE ta.fecha = ${HOY_SV}
     ORDER BY ta.turno, ta.entrada_en`
  );

  const evRes = await conn.query(
    `SELECT te.tipo, te.detalle, te.registrado_en,
            u.nombre || ' ' || u.apellido AS registrado_por_nombre
     FROM turno_evento te
     LEFT JOIN usuario u ON u.id_usuario = te.registrado_por
     WHERE te.fecha = ${HOY_SV}
     ORDER BY te.registrado_en`
  );

  return { dia, asistencias: asisRes.rows, eventos: evRes.rows };
}

async function registrarEvento(client, tipo, user, detalle = null) {
  await client.query(
    `INSERT INTO turno_evento (fecha, tipo, detalle, registrado_por)
     VALUES (${HOY_SV}, $1, $2, $3)`,
    [tipo, detalle, user?.id_usuario ?? null]
  );
}

function emitirCambio(req) {
  const io = req.app.get("io");
  if (io) {
    io.emit("turno_dia_changed");
    // Sin payload: los widgets de estado de operaciones re-consultan y así
    // reflejan la pausa de almuerzo / cierre del turno (estado_efectivo).
    io.emit("estado_operaciones_changed", null);
  }
}

// ── GET /turno/dia — estado del día (Proyección entra con la llave) ─────────
exports.getTurnoDia = catchAsync(async (req, res) => {
  res.json(await getEstadoDia());
});

// ── GET /turno/instructores — lista para elegir a los de turno ──────────────
// El turno del día (asistencia/hangar) lo cubren TODOS los instructores
// activos, den vuelo o teoría — no es exclusivo de instructores de vuelo.
exports.getInstructoresParaTurno = catchAsync(async (req, res) => {
  const r = await db.query(`
    SELECT i.id_instructor, u.nombre, u.apellido, u.nombre || ' ' || u.apellido AS nombre_completo
    FROM instructor i JOIN usuario u ON u.id_usuario = i.id_usuario
    WHERE i.activo = true
    ORDER BY u.apellido, u.nombre
  `);
  res.json(r.rows);
});

// ── POST /turno/dia/abrir { instructores: [id_instructor] } ─────────────────
exports.abrirTurno = catchAsync(async (req, res) => {
  const user = req.user;
  const instructores = (Array.isArray(req.body.instructores) ? req.body.instructores : [])
    .map(Number).filter((n) => !isNaN(n));
  if (instructores.length === 0) {
    return res.status(400).json({ message: "Seleccioná al menos un instructor de turno." });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const exRes = await client.query(`SELECT id_turno_dia, estado FROM turno_dia WHERE fecha = ${HOY_SV} FOR UPDATE`);
    if (exRes.rows.length === 0) {
      await client.query(
        `INSERT INTO turno_dia (fecha, estado, abierto_por) VALUES (${HOY_SV}, 'ABIERTO', $1)`,
        [user?.id_usuario ?? null]
      );
      await registrarEvento(client, "APERTURA", user);
    } else if (exRes.rows[0].estado === "CERRADO") {
      // Reapertura (cierre por error o jornada extendida): nuevo evento, se
      // conserva la hora de apertura original y se limpia el cierre.
      await client.query(
        `UPDATE turno_dia SET estado = 'ABIERTO', cierre_en = NULL, cerrado_por = NULL WHERE fecha = ${HOY_SV}`
      );
      await registrarEvento(client, "APERTURA", user, "Reapertura del turno");
    } else {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El turno de hoy ya está abierto." });
    }

    // Entrada de los instructores de la MAÑANA (si es reapertura y ya habían
    // entrado, el ON CONFLICT conserva su timestamp de entrada original).
    for (const idIns of instructores) {
      await client.query(
        `INSERT INTO turno_asistencia (fecha, turno, id_instructor, registrado_por)
         VALUES (${HOY_SV}, 'MANANA', $1, $2)
         ON CONFLICT (fecha, turno, id_instructor) DO UPDATE SET salida_en = NULL`,
        [idIns, user?.id_usuario ?? null]
      );
    }

    await logAuditoria(client, {
      accion: "OTRO", entidad: "operaciones", actor: user, req,
      descripcion: `Apertura de turno con ${instructores.length} instructor(es)`,
    });

    await client.query("COMMIT");
    emitirCambio(req);
    pushCicloTurno(user, "🟢 Turno abierto", `Operaciones abiertas con ${instructores.length} instructor(es).`);
    res.json(await getEstadoDia());
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── POST /turno/dia/pausa — pausa de almuerzo (el turno NO finaliza) ─────────
exports.pausarTurno = catchAsync(async (req, res) => {
  const user = req.user;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE turno_dia SET estado = 'EN_PAUSA' WHERE fecha = ${HOY_SV} AND estado = 'ABIERTO' RETURNING id_turno_dia`
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El turno no está abierto (no se puede pausar)." });
    }
    await registrarEvento(client, "PAUSA", user, req.body?.detalle || "Pausa de almuerzo");
    await client.query("COMMIT");
    emitirCambio(req);
    pushCicloTurno(user, "⏸️ Turno en pausa", req.body?.detalle || "Pausa de almuerzo.");
    res.json(await getEstadoDia());
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── POST /turno/dia/reanudar ─────────────────────────────────────────────────
exports.reanudarTurno = catchAsync(async (req, res) => {
  const user = req.user;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE turno_dia SET estado = 'ABIERTO' WHERE fecha = ${HOY_SV} AND estado = 'EN_PAUSA' RETURNING id_turno_dia`
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El turno no está en pausa." });
    }
    await registrarEvento(client, "REANUDACION", user);
    await client.query("COMMIT");
    emitirCambio(req);
    pushCicloTurno(user, "▶️ Turno reanudado", "Operaciones reanudadas tras la pausa.");
    res.json(await getEstadoDia());
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── POST /turno/dia/cambio { instructores: [id_instructor] } ─────────────────
// Cambio de turno: salida de los de la MAÑANA que sigan presentes y entrada
// de los instructores de la TARDE.
exports.cambioTurno = catchAsync(async (req, res) => {
  const user = req.user;
  const instructores = (Array.isArray(req.body.instructores) ? req.body.instructores : [])
    .map(Number).filter((n) => !isNaN(n));
  if (instructores.length === 0) {
    return res.status(400).json({ message: "Seleccioná al menos un instructor para el turno de la tarde." });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const diaRes = await client.query(
      `SELECT estado FROM turno_dia WHERE fecha = ${HOY_SV} FOR UPDATE`
    );
    if (diaRes.rows.length === 0 || diaRes.rows[0].estado === "CERRADO") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El turno de hoy no está abierto." });
    }

    // Salida de los de la mañana que aún no la tengan marcada.
    await client.query(
      `UPDATE turno_asistencia SET salida_en = NOW()
       WHERE fecha = ${HOY_SV} AND turno = 'MANANA' AND salida_en IS NULL`
    );

    for (const idIns of instructores) {
      await client.query(
        `INSERT INTO turno_asistencia (fecha, turno, id_instructor, registrado_por)
         VALUES (${HOY_SV}, 'TARDE', $1, $2)
         ON CONFLICT (fecha, turno, id_instructor) DO UPDATE SET salida_en = NULL`,
        [idIns, user?.id_usuario ?? null]
      );
    }

    // Si el cambio se hace durante la pausa de almuerzo, el turno reabre.
    await client.query(
      `UPDATE turno_dia SET estado = 'ABIERTO' WHERE fecha = ${HOY_SV} AND estado = 'EN_PAUSA'`
    );

    await registrarEvento(client, "CAMBIO_TURNO", user, `Entra turno tarde (${instructores.length} instructor(es))`);
    await logAuditoria(client, {
      accion: "OTRO", entidad: "operaciones", actor: user, req,
      descripcion: `Cambio de turno: entra la tarde con ${instructores.length} instructor(es)`,
    });

    await client.query("COMMIT");
    emitirCambio(req);
    pushCicloTurno(user, "🔄 Cambio de turno", `Entra el turno de la tarde (${instructores.length} instructor(es)).`);
    res.json(await getEstadoDia());
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── POST /turno/dia/cerrar — cierre de operaciones del día ──────────────────
exports.cerrarTurno = catchAsync(async (req, res) => {
  const user = req.user;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE turno_dia SET estado = 'CERRADO', cierre_en = NOW(), cerrado_por = $1
       WHERE fecha = ${HOY_SV} AND estado <> 'CERRADO' RETURNING id_turno_dia`,
      [user?.id_usuario ?? null]
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "No hay un turno abierto que cerrar." });
    }

    // Salida de todo instructor que siga presente (mañana o tarde).
    await client.query(
      `UPDATE turno_asistencia SET salida_en = NOW()
       WHERE fecha = ${HOY_SV} AND salida_en IS NULL`
    );

    await registrarEvento(client, "CIERRE", user);
    await logAuditoria(client, {
      accion: "OTRO", entidad: "operaciones", actor: user, req,
      descripcion: "Cierre de turno del día",
    });

    await client.query("COMMIT");
    emitirCambio(req);
    pushCicloTurno(user, "🔴 Turno cerrado", "Operaciones del día cerradas.");
    res.json(await getEstadoDia());
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── POST /turno/dia/asistencia { instructores: [id_instructor] } ────────────
// Agrega instructor(es) al turno YA abierto (llegó tarde, refuerzo de último
// momento) sin forzar un "cambio de turno" completo. Se suman al grupo
// actualmente activo (MANANA, o TARDE si ya hubo cambio de turno hoy).
exports.agregarInstructorTurno = catchAsync(async (req, res) => {
  const user = req.user;
  const instructores = (Array.isArray(req.body.instructores) ? req.body.instructores : [])
    .map(Number).filter((n) => !isNaN(n));
  if (instructores.length === 0) {
    return res.status(400).json({ message: "Seleccioná al menos un instructor para agregar." });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const diaRes = await client.query(`SELECT estado FROM turno_dia WHERE fecha = ${HOY_SV} FOR UPDATE`);
    if (diaRes.rows.length === 0 || diaRes.rows[0].estado === "CERRADO") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El turno de hoy no está abierto." });
    }

    const tardeRes = await client.query(
      `SELECT 1 FROM turno_asistencia WHERE fecha = ${HOY_SV} AND turno = 'TARDE' LIMIT 1`
    );
    const turnoActivo = tardeRes.rows.length > 0 ? "TARDE" : "MANANA";

    for (const idIns of instructores) {
      await client.query(
        `INSERT INTO turno_asistencia (fecha, turno, id_instructor, registrado_por)
         VALUES (${HOY_SV}, $1, $2, $3)
         ON CONFLICT (fecha, turno, id_instructor) DO UPDATE SET salida_en = NULL`,
        [turnoActivo, idIns, user?.id_usuario ?? null]
      );
    }

    await registrarEvento(client, "AJUSTE_ASISTENCIA", user, `Se agregaron ${instructores.length} instructor(es) al turno (${turnoActivo === "MANANA" ? "mañana" : "tarde"})`);
    await logAuditoria(client, {
      accion: "OTRO", entidad: "operaciones", actor: user, req,
      descripcion: `Turno: se agregaron ${instructores.length} instructor(es) al turno en curso`,
    });

    await client.query("COMMIT");
    emitirCambio(req);
    pushCicloTurno(user, "➕ Instructor agregado al turno", `Se sumaron ${instructores.length} instructor(es) al turno en curso.`);
    res.json(await getEstadoDia());
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── POST /turno/dia/asistencia/:id_asistencia/salida ─────────────────────────
// Marca la salida de un instructor puntual (se retiró antes, o se lo
// reemplaza) sin afectar al resto del turno ni su estado.
exports.marcarSalidaInstructor = catchAsync(async (req, res) => {
  const user = req.user;
  const { id_asistencia } = req.params;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const diaRes = await client.query(`SELECT estado FROM turno_dia WHERE fecha = ${HOY_SV} FOR UPDATE`);
    if (diaRes.rows.length === 0 || diaRes.rows[0].estado === "CERRADO") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El turno de hoy no está abierto." });
    }

    const r = await client.query(
      `UPDATE turno_asistencia SET salida_en = NOW()
       WHERE id_asistencia = $1 AND fecha = ${HOY_SV} AND salida_en IS NULL
       RETURNING id_asistencia, turno,
         (SELECT u.nombre || ' ' || u.apellido FROM instructor i JOIN usuario u ON u.id_usuario = i.id_usuario WHERE i.id_instructor = turno_asistencia.id_instructor) AS nombre`,
      [Number(id_asistencia)]
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Esa asistencia no existe, es de otro día, o ya tiene salida registrada." });
    }

    const { turno, nombre } = r.rows[0];
    await registrarEvento(client, "AJUSTE_ASISTENCIA", user, `Salida puntual de ${nombre} (turno ${turno === "MANANA" ? "mañana" : "tarde"})`);
    await logAuditoria(client, {
      accion: "OTRO", entidad: "operaciones", actor: user, req,
      descripcion: `Turno: salida puntual de ${nombre}`,
    });

    await client.query("COMMIT");
    emitirCambio(req);
    res.json(await getEstadoDia());
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
