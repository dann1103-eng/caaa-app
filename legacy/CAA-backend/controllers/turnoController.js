const db = require("../config/db");
const { logAuditoria } = require("../utils/auditoria");
const transporter = require("../utils/mailer");

// Flujo unificado TURNO + INSTRUCTOR
const NEXT_ESTADO = {
  PUBLICADO:      "SALIDA_HANGAR",
  PROGRAMADO:     "SALIDA_HANGAR",
  SALIDA_HANGAR:  "EN_PROGRESO",
  EN_PROGRESO:    "REGRESO_HANGAR",
  REGRESO_HANGAR: "FINALIZANDO",
  FINALIZANDO:    "COMPLETADO",
};

async function registrarHorasVuelo(client, id_vuelo, id_aeronave, username) {
  // NOTA: Las horas de la aeronave y mantenimiento ya no se actualizan aquí por minutos de reloj,
  // sino en el reporte de vuelo mediante el Tacómetro (TAC).
  // Esto evita duplicidad y asegura que el mantenimiento se base en el uso real del motor.
}

exports.getVuelosHoy = async (req, res) => {
  try {
    const semanaRes = await db.query(
      `SELECT id_semana FROM semana_vuelo
       WHERE (NOW() AT TIME ZONE 'America/El_Salvador')::date BETWEEN fecha_inicio AND fecha_fin
         AND publicada = true
       LIMIT 1`
    );

    if (semanaRes.rows.length === 0) return res.json([]);

    const { id_semana } = semanaRes.rows[0];

    const vuelosRes = await db.query(
      `SELECT
         v.id_vuelo,
         v.id_bloque,
         v.dia_semana,
         v.estado,
         v.id_aeronave,
         v.id_alumno,
         v.id_instructor,
         v.duracion_estimada_min,
         bh.hora_inicio,
         bh.hora_fin,
         a.codigo  AS aeronave_codigo,
         a.tipo    AS aeronave_tipo,
         ua.nombre    AS alumno_nombre,
         ua.apellido  AS alumno_apellido,
         ui.nombre    AS instructor_nombre,
         ui.apellido  AS instructor_apellido,
         (pv.tiempo_ruta IS NOT NULL) AS tiene_plan_vuelo,
         vet.registrado_en AS estado_desde,
         rv.es_inasistencia
       FROM vuelo v
       JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
       JOIN aeronave a ON a.id_aeronave = v.id_aeronave
       JOIN alumno al ON al.id_alumno = v.id_alumno
       JOIN usuario ua ON ua.id_usuario = al.id_usuario
       JOIN instructor ins ON ins.id_instructor = v.id_instructor
       JOIN usuario ui ON ui.id_usuario = ins.id_usuario
       LEFT JOIN plan_vuelo pv ON pv.id_vuelo = v.id_vuelo
       LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
       LEFT JOIN LATERAL (
         SELECT registrado_en
         FROM vuelo_estado_tiempo
         WHERE id_vuelo = v.id_vuelo AND estado = v.estado
         ORDER BY registrado_en DESC
         LIMIT 1
       ) vet ON true
       WHERE v.id_semana = $1
         AND v.dia_semana = EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'America/El_Salvador'))::int
         AND v.estado NOT IN ('CANCELADO', 'COMPLETADO')
       ORDER BY bh.hora_inicio, a.codigo`,
      [id_semana]
    );

    res.json(vuelosRes.rows);
  } catch (e) {
    console.error("getVuelosHoy:", e);
    res.status(500).json({ message: "Error al obtener vuelos del día" });
  }
};

exports.avanzarEstadoVuelo = async (req, res) => {
  const { id_vuelo } = req.params;
  const { duracion_estimada_min: duracionBody, tiempo_vuelo_min } = req.body;
  const user = req.user;
  const io = req.app.get("io");

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const vueloRes = await client.query(
      `SELECT v.id_vuelo, v.estado, v.id_aeronave, rv.es_inasistencia 
       FROM vuelo v 
       LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
       WHERE v.id_vuelo = $1 FOR UPDATE OF v`,
      [Number(id_vuelo)]
    );

    if (vueloRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Vuelo no encontrado" });
    }

    const vuelo = vueloRes.rows[0];
    const aeroRes = await client.query("SELECT tipo FROM aeronave WHERE id_aeronave = $1", [vuelo.id_aeronave]);
    const esSimulador = aeroRes.rows[0]?.tipo === 'SIMULADOR';

    if (esSimulador) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Los simuladores no permiten cambios de estado" });
    }

    // RESTRICCIÓN: No permitir SALIDA_HANGAR antes de la hora programada
    if (vuelo.estado === "PUBLICADO" || vuelo.estado === "PROGRAMADO") {
      const timeCheck = await client.query(
        `SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::time < bh.hora_inicio AS es_temprano
         FROM vuelo v
         JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
         WHERE v.id_vuelo = $1`,
        [id_vuelo]
      );
      if (timeCheck.rows.length > 0 && timeCheck.rows[0].es_temprano) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No se puede iniciar el vuelo antes de la hora programada" });
      }
    }

    let nuevoEstado = NEXT_ESTADO[vuelo.estado];

    if (!nuevoEstado) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El vuelo no puede avanzar de estado" });
    }

    let duracionMin = null;

    if (nuevoEstado === "EN_PROGRESO") {
      const parsed = parseInt(duracionBody, 10);
      
      if (!parsed || parsed <= 0) {
        // FLEXIBILIDAD: Si no viene duración, calcularla hasta el fin del bloque
        const bloqueRes = await client.query(
          `SELECT bh.hora_fin 
           FROM vuelo v 
           JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque 
           WHERE v.id_vuelo = $1`,
          [id_vuelo]
        );
        
        if (bloqueRes.rows.length > 0) {
          const horaFinStr = bloqueRes.rows[0].hora_fin; // "HH:mm:ss"
          const now = new Date();
          const [h, m, s] = horaFinStr.split(":").map(Number);
          const end = new Date(now);
          end.setHours(h, m, s, 0);
          
          const diffMs = end - now;
          duracionMin = Math.max(15, Math.round(diffMs / 60000)); // Mínimo 15 min por defecto
        } else {
          duracionMin = 60; // Fallback absoluto
        }
      } else {
        duracionMin = parsed;
      }

      // Si después de todo sigue siendo null o <= 0, default 60
      if (!duracionMin || duracionMin <= 0) duracionMin = 60;

      await client.query(
        "UPDATE vuelo SET estado = $1, duracion_estimada_min = $2 WHERE id_vuelo = $3",
        [nuevoEstado, duracionMin, id_vuelo]
      );
    } else if (nuevoEstado === "COMPLETADO") {
      const minutos = tiempo_vuelo_min ? parseFloat(tiempo_vuelo_min) : 0;
      const esInasistencia = vuelo.es_inasistencia === true;

      if (!esInasistencia && (isNaN(minutos) || minutos <= 0)) {
        // Si no es inasistencia, requerimos minutos > 0
        await client.query("UPDATE vuelo SET estado = $1 WHERE id_vuelo = $2", [nuevoEstado, id_vuelo]);
      } else {
        await client.query(
          "UPDATE vuelo SET estado = $1, tiempo_vuelo_min = $2 WHERE id_vuelo = $3",
          [nuevoEstado, minutos, id_vuelo]
        );
      }
    } else {
      await client.query(
        "UPDATE vuelo SET estado = $1 WHERE id_vuelo = $2",
        [nuevoEstado, id_vuelo]
      );
    }

    const tiempoRes = await client.query(
      `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
       VALUES ($1, $2, $3)
       RETURNING registrado_en`,
      [id_vuelo, nuevoEstado, user?.id_usuario ?? null]
    );

    const registrado_en = tiempoRes.rows[0].registrado_en;

    if (nuevoEstado === "COMPLETADO") {
      await registrarHorasVuelo(client, Number(id_vuelo), vuelo.id_aeronave, user?.username);
    }

    await logAuditoria(client, {
      accion:      "OTRO",
      entidad:     "vuelo",
      id_entidad:  Number(id_vuelo),
      actor:       user,
      descripcion: `Avance de estado vuelo #${id_vuelo}: ${vuelo.estado} → ${nuevoEstado}`,
    });

    await client.query("COMMIT");

    if (io) {
      io.emit("vuelo_estado_changed", {
        id_vuelo: Number(id_vuelo),
        estado: nuevoEstado,
        registrado_en,
        duracion_estimada_min: duracionMin,
      });
      io.emit("estado_operaciones_changed");
    }

    res.json({ id_vuelo: Number(id_vuelo), estado: nuevoEstado, registrado_en, duracion_estimada_min: duracionMin });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("avanzarEstadoVuelo:", e);
    res.status(500).json({ message: "Error al avanzar estado" });
  } finally {
    client.release();
  }
};

exports.registrarInasistencia = async (req, res) => {
  const { id_vuelo } = req.params;
  const user = req.user;
  const io = req.app.get("io");

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // 1. Marcar el vuelo como COMPLETADO y 0 min
    const upd = await client.query(
      `UPDATE vuelo SET estado = 'COMPLETADO', tiempo_vuelo_min = 0 
       WHERE id_vuelo = $1 RETURNING id_vuelo, id_aeronave`,
      [id_vuelo]
    );

    if (upd.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Vuelo no encontrado" });
    }

    // 2. Crear/Actualizar el reporte de vuelo como inasistencia
    await client.query(
      `INSERT INTO reporte_vuelo (id_vuelo, es_inasistencia, observaciones)
       VALUES ($1, true, 'Inasistencia registrada por sistema')
       ON CONFLICT (id_vuelo) DO UPDATE SET es_inasistencia = true`,
      [id_vuelo]
    );

    // 3. Registrar el tiempo de estado
    const ts = await client.query(
      `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
       VALUES ($1, 'COMPLETADO', $2) RETURNING registrado_en`,
      [id_vuelo, user?.id_usuario ?? null]
    );

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "vuelo",
      id_entidad: Number(id_vuelo),
      actor: user,
      descripcion: `Inasistencia registrada para el vuelo #${id_vuelo}`,
    });

    await client.query("COMMIT");

    if (io) {
      io.emit("vuelo_estado_changed", { 
        id_vuelo: Number(id_vuelo), 
        estado: 'COMPLETADO', 
        registrado_en: ts.rows[0].registrado_en 
      });
    }

    res.json({ message: "Inasistencia registrada correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("registrarInasistencia:", e);
    res.status(500).json({ message: "Error al registrar inasistencia" });
  } finally {
    client.release();
  }
};

exports.getTicker = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id_mensaje, contenido, creado_en FROM mensaje_turno
       WHERE activo = true AND tipo = 'TURNO'
         AND (expira_en IS NULL OR expira_en > (NOW() AT TIME ZONE 'America/El_Salvador'))
       ORDER BY creado_en ASC`
    );
    res.json(r.rows);
  } catch (e) {
    console.error("getTicker:", e);
    res.status(500).json({ message: "Error al obtener ticker" });
  }
};

exports.publicarTicker = async (req, res) => {
  const { mensaje } = req.body;
  const user = req.user;
  const io = req.app.get("io");

  if (!mensaje || !mensaje.trim()) {
    return res.status(400).json({ message: "El mensaje no puede estar vacío" });
  }

  try {
    const bloqueRes = await db.query(`
      SELECT hora_fin FROM bloque_horario 
      WHERE hora_inicio <= (NOW() AT TIME ZONE 'America/El_Salvador')::time 
        AND hora_fin > (NOW() AT TIME ZONE 'America/El_Salvador')::time
      ORDER BY hora_inicio DESC LIMIT 1
    `);

    let expiraExp = "NOW() + INTERVAL '2 hours'";
    if (bloqueRes.rows.length > 0) {
      const horaFin = bloqueRes.rows[0].hora_fin;
      expiraExp = `((NOW() AT TIME ZONE 'America/El_Salvador')::date + '${horaFin}'::time) AT TIME ZONE 'America/El_Salvador'`;
    }

    const result = await db.query(
      `INSERT INTO mensaje_turno (contenido, tipo, para_rol, id_usuario_origen, activo, expira_en)
       VALUES ($1, 'TURNO', null, $2, true, ${expiraExp}) RETURNING id_mensaje, contenido, creado_en, expira_en`,
      [mensaje.trim().toUpperCase(), user?.id_usuario ?? null]
    );
    const row = result.rows[0];
    if (io) io.emit("nuevo_ticker", row);
    res.json(row);
  } catch (e) {
    console.error("publicarTicker:", e);
    res.status(500).json({ message: "Error al publicar aviso" });
  }
};

exports.limpiarTicker = async (req, res) => {
  const io = req.app.get("io");
  try {
    await db.query("UPDATE mensaje_turno SET activo = false WHERE tipo = 'TURNO' AND activo = true");
    if (io) io.emit("nuevo_ticker", { action: 'clear_all' });
    res.json({ ok: true });
  } catch (e) {
    console.error("limpiarTicker:", e);
    res.status(500).json({ message: "Error al limpiar avisos" });
  }
};

exports.limpiarUnicoTicker = async (req, res) => {
  const { id } = req.params;
  const io = req.app.get("io");
  try {
    await db.query("UPDATE mensaje_turno SET activo = false WHERE id_mensaje = $1", [id]);
    if (io) io.emit("nuevo_ticker", { action: 'clear_one', id_mensaje: id });
    res.json({ ok: true });
  } catch (e) {
    console.error("limpiarUnicoTicker:", e);
    res.status(500).json({ message: "Error al limpiar aviso" });
  }
};

exports.getEstadoOperaciones = async (req, res) => {
  try {
    const r = await db.query(
      "SELECT estado_general, motivo_inactivo, temperatura, explicacion_detallada, bloques_suspendidos FROM estado_operaciones LIMIT 1"
    );
    if (r.rows.length === 0) {
      return res.json({ estado_general: "ACTIVO", motivo_inactivo: null });
    }
    res.json(r.rows[0]);
  } catch (e) {
    console.error("getEstadoOperaciones:", e);
    res.status(500).json({ message: "Error al obtener estado de operaciones" });
  }
};

exports.setEstadoOperaciones = async (req, res) => {
  const { 
    estado_general, 
    motivo_inactivo, 
    bloques, 
    temperatura, 
    explicacion_detallada 
  } = req.body; // bloques es array de id_bloque
  const io = req.app.get("io");
  const user = req.user;

  const client = await db.connect();

  try {
    await client.query("BEGIN");
    
    // 1. Actualizar estado general
    const existing = await client.query("SELECT 1 FROM estado_operaciones LIMIT 1");
    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE estado_operaciones SET 
          estado_general = $1, 
          motivo_inactivo = $2, 
          bloques_suspendidos = $3,
          temperatura = $4,
          explicacion_detallada = $5`,
        [
          estado_general, 
          motivo_inactivo ?? null, 
          JSON.stringify(bloques || []),
          temperatura ?? null,
          explicacion_detallada ?? null
        ]
      );
    } else {
      await client.query(
        "INSERT INTO estado_operaciones (estado_general, motivo_inactivo, bloques_suspendidos, temperatura, explicacion_detallada) VALUES ($1, $2, $3, $4, $5)",
        [
          estado_general, 
          motivo_inactivo ?? null, 
          JSON.stringify(bloques || []),
          temperatura ?? null,
          explicacion_detallada ?? null
        ]
      );
    }

    // 2. Si se suspende (INACTIVO), cancelar vuelos de los bloques seleccionados
    let vuelosCanceladosCount = 0;
    if (estado_general === "INACTIVO" && Array.isArray(bloques) && bloques.length > 0) {
      const ids = bloques.map(b => Number(b)).filter(b => !isNaN(b));
      
      if (ids.length > 0) {
        const cancelRes = await client.query(`
          UPDATE vuelo
          SET estado = 'CANCELADO', justificacion_cancelacion = $1, tipo_cancelacion = 'NORMAL', fecha_cancelacion = NOW()
          WHERE id_semana = (
              SELECT id_semana FROM semana_vuelo
              WHERE (NOW() AT TIME ZONE 'America/El_Salvador')::date BETWEEN fecha_inicio AND fecha_fin
                AND publicada = true
              LIMIT 1
            )
            AND dia_semana = EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'America/El_Salvador'))::int
            AND id_bloque = ANY($2)
            AND estado IN ('PUBLICADO', 'SOLICITADO', 'AJUSTADO', 'PROGRAMADO')
            AND EXISTS (SELECT 1 FROM aeronave a WHERE a.id_aeronave = vuelo.id_aeronave AND a.tipo != 'SIMULADOR')
          RETURNING id_vuelo, fecha_vuelo, id_alumno
        `, [`Suspensión por ${motivo_inactivo}`, ids]);

        vuelosCanceladosCount = cancelRes.rows.length;
        const horaCancelacion = new Date().toISOString();

        for (const row of cancelRes.rows) {
          await client.query(
            `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
             VALUES ($1, 'CANCELADO', $2)`,
            [row.id_vuelo, user?.id_usuario ?? null]
          );

          // Notificar alumno
          const alumnoRes = await client.query(
            `SELECT u.nombre, u.correo FROM alumno al JOIN usuario u ON u.id_usuario = al.id_usuario WHERE al.id_alumno = $1`,
            [row.id_alumno]
          );
          if (alumnoRes.rows.length > 0 && alumnoRes.rows[0].correo) {
            transporter.sendMail({
              from: process.env.MAIL_FROM_ADDRESS,
              to: alumnoRes.rows[0].correo,
              subject: "Vuelo cancelado — Operaciones suspendidas",
              text: `Hola ${alumnoRes.rows[0].nombre},\n\nTu vuelo para hoy ha sido cancelado debido a que las operaciones han sido suspendidas por el siguiente motivo: ${motivo_inactivo}.`
            }).catch(e => console.error("Error envío mail:", e));
          }

          if (io) {
            io.emit("vuelo_estado_changed", {
              id_vuelo: row.id_vuelo,
              estado: 'CANCELADO',
              registrado_en: horaCancelacion
            });
          }
        }
      }
    }

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "operaciones",
      actor: user,
      req,
      descripcion: `Estado de operaciones cambiado a ${estado_general} (${motivo_inactivo || 'N/A'}). ${vuelosCanceladosCount} vuelos cancelados.`,
    });

    await client.query("COMMIT");

    // Ticker messages for operations
    if (estado_general === "INACTIVO") {
      const detailStr = explicacion_detallada ? `: ${explicacion_detallada}` : "";
      const tickerContent = `OPERACIONES SUSPENDIDAS POR ${motivo_inactivo}${detailStr}`;

      const result = await db.query(
        `INSERT INTO mensaje_turno (contenido, tipo, para_rol, id_usuario_origen, activo, expira_en)
         VALUES ($1, 'TURNO', null, $2, true, NULL) RETURNING id_mensaje, contenido, creado_en`,
        [tickerContent.toUpperCase(), user?.id_usuario ?? null]
      );
      if (io) io.emit("nuevo_ticker", result.rows[0]);
    } else if (estado_general === "ACTIVO") {
      // Limpieza silenciosa: solo desactivar mensajes de suspensión previos
      try {
        await db.query("UPDATE mensaje_turno SET activo = false WHERE tipo = 'TURNO' AND contenido LIKE 'OPERACIONES SUSPENDIDAS%'");
        if (io) io.emit("nuevo_ticker", { action: 'clear_all' });
      } catch(e) { 
        console.error("Error al limpiar ticker de suspensión:", e); 
      }
    }

    const payload = { 
      estado_general, 
      motivo_inactivo: motivo_inactivo ?? null, 
      bloques_suspendidos: bloques || [],
      temperatura: temperatura ?? null,
      explicacion_detallada: explicacion_detallada ?? null
    };

    if (io) io.emit("estado_operaciones_changed", payload);

    res.json(payload);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("setEstadoOperaciones:", e);
    res.status(500).json({ message: "Error al actualizar estado de operaciones" });
  } finally {
    client.release();
  }
};

exports.agregarBloquesSuspension = async (req, res) => {
  const { bloques } = req.body; // Array de nuevos id_bloque
  const io = req.app.get("io");
  const user = req.user;
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    
    const opsRes = await client.query("SELECT estado_general, motivo_inactivo, bloques_suspendidos FROM estado_operaciones LIMIT 1");
    if (opsRes.rows.length === 0 || opsRes.rows[0].estado_general !== "INACTIVO") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Las operaciones no están suspendidas" });
    }

    const { motivo_inactivo } = opsRes.rows[0];
    const actuales = opsRes.rows[0].bloques_suspendidos || [];
    const nuevos = bloques.filter(id => !actuales.includes(id));
    
    if (nuevos.length === 0) {
      await client.query("ROLLBACK");
      return res.json(opsRes.rows[0]);
    }

    const totalBloques = [...actuales, ...nuevos];

    await client.query(
      "UPDATE estado_operaciones SET bloques_suspendidos = $1",
      [JSON.stringify(totalBloques)]
    );

    const cancelRes = await client.query(`
      UPDATE vuelo
      SET estado = 'CANCELADO', justificacion_cancelacion = $1, tipo_cancelacion = 'NORMAL', fecha_cancelacion = NOW()
      WHERE id_semana = (
          SELECT id_semana FROM semana_vuelo
          WHERE (NOW() AT TIME ZONE 'America/El_Salvador')::date BETWEEN fecha_inicio AND fecha_fin
            AND publicada = true
          LIMIT 1
        )
        AND dia_semana = EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'America/El_Salvador'))::int
        AND id_bloque = ANY($2)
        AND estado IN ('PUBLICADO', 'SOLICITADO', 'AJUSTADO', 'PROGRAMADO')
        AND EXISTS (SELECT 1 FROM aeronave a WHERE a.id_aeronave = vuelo.id_aeronave AND a.tipo != 'SIMULADOR')
      RETURNING id_vuelo, id_alumno
    `, [`Suspensión extendida por ${motivo_inactivo}`, nuevos]);

    const horaCancelacion = new Date().toISOString();
    for (const row of cancelRes.rows) {
      await client.query(
        `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
         VALUES ($1, 'CANCELADO', $2)`,
        [row.id_vuelo, user?.id_usuario ?? null]
      );

      const alumnoRes = await client.query(
        `SELECT u.nombre, u.correo FROM alumno al JOIN usuario u ON u.id_usuario = al.id_usuario WHERE al.id_alumno = $1`,
        [row.id_alumno]
      );
      if (alumnoRes.rows.length > 0 && alumnoRes.rows[0].correo) {
        transporter.sendMail({
          from: process.env.MAIL_FROM_ADDRESS,
          to: alumnoRes.rows[0].correo,
          subject: "Vuelo cancelado — Suspensión de operaciones extendida",
          text: `Hola ${alumnoRes.rows[0].nombre},\n\nTu vuelo para hoy ha sido cancelado debido a que la suspensión de operaciones se ha extendido.`
        }).catch(e => console.error("Error envío mail:", e));
      }

      if (io) {
        io.emit("vuelo_estado_changed", {
          id_vuelo: row.id_vuelo,
          estado: 'CANCELADO',
          registrado_en: horaCancelacion
        });
      }
    }

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "operaciones",
      actor: user,
      req,
      descripcion: `Suspensión extendida. ${nuevos.length} nuevos bloques, ${cancelRes.rows.length} vuelos cancelados.`,
    });

    await client.query("COMMIT");

    const payload = { 
      estado_general: "INACTIVO", 
      motivo_inactivo, 
      bloques_suspendidos: totalBloques 
    };

    if (io) io.emit("estado_operaciones_changed", payload);

    res.json(payload);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("agregarBloquesSuspension:", e);
    res.status(500).json({ message: "Error al agregar bloques" });
  } finally {
    client.release();
  }
};

