const db = require("../config/db");
const { logAuditoria } = require("../utils/auditoria");
const transporter = require("../utils/mailer");
const { notificarStaff } = require("../utils/webpush");
const { notificarUsuario } = require("../utils/notificaciones");

// Flujo unificado TURNO + INSTRUCTOR
const NEXT_ESTADO = {
  PUBLICADO:      "SALIDA_HANGAR",
  PROGRAMADO:     "SALIDA_HANGAR",
  SALIDA_HANGAR:  "EN_PROGRESO",
  EN_PROGRESO:    "REGRESO_HANGAR",
  REGRESO_HANGAR: "FINALIZANDO",
  FINALIZANDO:    "COMPLETADO",
};

// Los simuladores no salen/regresan de un hangar físico: la sesión pasa
// directo de programada a en curso, y de en curso a completada (donde el
// instructor llena la vouchera de simulador). Se saltan SALIDA_HANGAR /
// REGRESO_HANGAR / FINALIZANDO, que no aplican.
const NEXT_ESTADO_SIM = {
  PUBLICADO:   "EN_PROGRESO",
  PROGRAMADO:  "EN_PROGRESO",
  EN_PROGRESO: "COMPLETADO",
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
         v.id_bloque_fin,
         v.dia_semana,
         v.estado,
         v.id_aeronave,
         v.id_alumno,
         v.id_instructor,
         v.duracion_estimada_min,
         v.almas_a_bordo,
         v.pasajeros_extra,
         v.salida_anticipada,
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
  const { duracion_estimada_min: duracionBody, tiempo_vuelo_min, salida_anticipada } = req.body;
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

    let nuevoEstado = (esSimulador ? NEXT_ESTADO_SIM : NEXT_ESTADO)[vuelo.estado];

    if (!nuevoEstado) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El vuelo no puede avanzar de estado" });
    }

    // GUARDIA DE AVIÓN/SIMULADOR OCUPADO (reemplaza el viejo candado de "hora
    // programada"). Ahora Turno/instructor pueden ADELANTAR vuelos en cualquier
    // momento; la única restricción al dar "salida a hangar" (aeronave real) o
    // "iniciar sesión" (simulador) es que no esté ya físicamente en uso en otro
    // vuelo. Marcar la inasistencia del vuelo que la ocupa (lo deja COMPLETADO)
    // la libera y habilita usarla con el adelantado.
    const esEventoSalida = nuevoEstado === "SALIDA_HANGAR" || (esSimulador && nuevoEstado === "EN_PROGRESO");

    if (esEventoSalida) {
      const ocup = await client.query(
        `SELECT TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')) AS quien
           FROM vuelo v2
           LEFT JOIN alumno al ON al.id_alumno = v2.id_alumno
           LEFT JOIN usuario u ON u.id_usuario = al.id_usuario
          WHERE v2.id_aeronave = $1
            AND v2.id_vuelo <> $2
            AND v2.estado IN ('SALIDA_HANGAR','EN_PROGRESO','REGRESO_HANGAR')
          LIMIT 1`,
        [vuelo.id_aeronave, Number(id_vuelo)]
      );
      if (ocup.rows.length > 0) {
        await client.query("ROLLBACK");
        const q = ocup.rows[0].quien;
        const msg = esSimulador
          ? `El simulador aún está en sesión${q ? ` con ${q}` : ""} — no se puede iniciar hasta que finalice.`
          : `Esta aeronave aún está en vuelo${q ? ` con ${q}` : ""} — no se puede sacar hasta que regrese al hangar.`;
        return res.status(409).json({ message: msg });
      }
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

    // Marca informativa: esta salida (a hangar / inicio de sesión) se pidió
    // explícitamente como anticipada — no cambia bloque ni aeronave, solo
    // queda registrado para reportes/trazabilidad.
    if (esEventoSalida && salida_anticipada === true) {
      await client.query("UPDATE vuelo SET salida_anticipada = true WHERE id_vuelo = $1", [id_vuelo]);
    }

    const tiempoRes = await client.query(
      `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
       VALUES ($1, $2, $3)
       RETURNING (registrado_en AT TIME ZONE 'America/El_Salvador') AS registrado_en`,
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
        salida_anticipada: esEventoSalida && salida_anticipada === true ? true : undefined,
      });
      io.emit("estado_operaciones_changed");
    }

    // Push a todo el staff: salidas/entradas al hangar.
    if (nuevoEstado === "SALIDA_HANGAR" || nuevoEstado === "REGRESO_HANGAR") {
      (async () => {
        try {
          const info = await db.query(
            `SELECT ae.codigo AS aeronave, u.nombre || ' ' || u.apellido AS alumno
               FROM vuelo v
               JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
               LEFT JOIN alumno al ON al.id_alumno = v.id_alumno
               LEFT JOIN usuario u ON u.id_usuario = al.id_usuario
              WHERE v.id_vuelo = $1`, [id_vuelo]
          );
          const x = info.rows[0] || {};
          const esSalida = nuevoEstado === "SALIDA_HANGAR";
          await notificarStaff({
            title: esSalida ? "🛫 Salida de hangar" : "🛬 Regreso a hangar",
            body: `${x.aeronave || "Aeronave"}${x.alumno ? " · " + x.alumno : ""}`,
            url: "/turno", tag: "hangar",
          }, { excluirUid: user?.id_usuario });
        } catch (e) { console.error("push hangar:", e.message); }
      })();
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
       VALUES ($1, 'COMPLETADO', $2) RETURNING (registrado_en AT TIME ZONE 'America/El_Salvador') AS registrado_en`,
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
    // Expira al final del ÚLTIMO bloque horario del día (fin de operaciones),
    // no del bloque que esté activo justo ahora. Antes usaba el bloque
    // activo: un aviso publicado cerca del fin de su propio bloque quedaba
    // con expira_en a segundos de distancia y nunca llegaba a mostrarse en
    // el tablero de Proyección (a diferencia del mensaje de "operaciones
    // suspendidas", que se inserta con expira_en=NULL y por eso sí persiste).
    const bloqueRes = await db.query(`
      SELECT hora_fin FROM bloque_horario ORDER BY hora_fin DESC LIMIT 1
    `);

    let expiraExp = "NOW() + INTERVAL '2 hours'";
    if (bloqueRes.rows.length > 0) {
      const horaFin = bloqueRes.rows[0].hora_fin;
      // GREATEST contra "ahora + 2h" evita que, si se publica fuera de
      // horario operativo (la hora de fin de hoy ya pasó), el aviso quede
      // guardado con una fecha de expiración ya vencida.
      expiraExp = `GREATEST(
        ((NOW() AT TIME ZONE 'America/El_Salvador')::date + '${horaFin}'::time) AT TIME ZONE 'America/El_Salvador',
        NOW() + INTERVAL '2 hours'
      )`;
    }

    const result = await db.query(
      `INSERT INTO mensaje_turno (contenido, tipo, para_rol, id_usuario_origen, activo, expira_en)
       VALUES ($1, 'TURNO', null, $2, true, ${expiraExp}) RETURNING id_mensaje, contenido, creado_en, expira_en`,
      [mensaje.trim().toUpperCase(), user?.id_usuario ?? null]
    );
    const row = result.rows[0];
    if (io) io.emit("nuevo_ticker", row);

    // Push a todo el staff: aviso del ticker.
    notificarStaff(
      { title: "📢 Aviso de Turno", body: mensaje.trim(), url: "/turno", tag: "ticker" },
      { excluirUid: user?.id_usuario }
    );

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
    const ops = r.rows[0] || { estado_general: "ACTIVO", motivo_inactivo: null };

    // Estado del ciclo del turno (apertura/pausa almuerzo/cierre) para que las
    // tarjetas de estado lo reflejen. Prioridad del estado EFECTIVO:
    // SUSPENDIDO (clima/NOTAM, cancela vuelos) > PAUSA_TURNO (almuerzo) >
    // CERRADO_TURNO (cierre del día, o turno aún no abierto) > ACTIVO.
    // Es solo presentación: NO toca la maquinaria de suspensión.
    let turno_estado = null;
    try {
      const t = await db.query(
        `SELECT estado FROM turno_dia WHERE fecha = (NOW() AT TIME ZONE 'America/El_Salvador')::date`
      );
      turno_estado = t.rows[0]?.estado ?? null;
    } catch (e) {
      // La tabla puede no existir aún (migración pendiente): degradar sin turno.
      console.error("getEstadoOperaciones/turno_dia:", e.message);
    }

    const estado_efectivo =
      ops.estado_general === "INACTIVO" ? "SUSPENDIDO"
      : turno_estado === "EN_PAUSA" ? "PAUSA_TURNO"
      : turno_estado === "CERRADO" || turno_estado === null ? "CERRADO_TURNO"
      : "ACTIVO";

    res.json({ ...ops, turno_estado, estado_efectivo });
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

    // Push a todo el staff (no alumnos): abrir/cerrar operaciones.
    notificarStaff(
      estado_general === "INACTIVO"
        ? { title: "⛔ Operaciones suspendidas", body: `Motivo: ${motivo_inactivo || "—"}${explicacion_detallada ? " · " + explicacion_detallada : ""}`, url: "/turno", tag: "ops" }
        : { title: "✅ Operaciones activas", body: "Las operaciones fueron reactivadas.", url: "/turno", tag: "ops" },
      { excluirUid: user?.id_usuario }
    );

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


// ── Reporte "VUELOS POR AVIÓN" del día (cierre de ventas del turno) ─────────
// PDF con todos los vuelos COMPLETADOS de la fecha, agrupados por aeronave:
// tacómetro/hobbs inicial-final-horas, monto devengado (cargo a cuenta corriente)
// e instructor. Replica el formato del sistema anterior (rptcaVuelos).
exports.getReporteVuelosDia = async (req, res) => {
  try {
    const { generarReporteVuelosDiaPDF } = require("../utils/pdfGenerator");

    // Fecha del reporte: ?fecha=YYYY-MM-DD, por defecto hoy (El Salvador).
    let fecha = String(req.query.fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const hoy = await db.query(`SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::date AS d`);
      fecha = hoy.rows[0].d.toISOString().slice(0, 10);
    }

    const r = await db.query(`
      SELECT v.id_vuelo,
             a.codigo AS avion_codigo, a.modelo AS avion_modelo,
             TRIM(ua.nombre || ' ' || COALESCE(ua.apellido, '')) AS alumno,
             TRIM(ui.nombre || ' ' || COALESCE(ui.apellido, '')) AS instructor,
             rv.tacometro_salida  AS tac_ini,
             rv.tacometro_llegada AS tac_fin,
             rv.horas_cobradas    AS horas_cobradas,
             rv.hobbs_salida      AS hobbs_ini,
             rv.hobbs_llegada     AS hobbs_fin,
             COALESCE(mc.monto, 0) AS monto,
             -- Hora real de salida/regreso de hangar (timestamp del botón, no el
             -- bloque programado) — mismo patrón que getCalendarioPublico.
             (vet_salida.registrado_en  AT TIME ZONE 'America/El_Salvador') AS salida_real,
             (vet_llegada.registrado_en AT TIME ZONE 'America/El_Salvador') AS llegada_real
      FROM vuelo v
      JOIN aeronave a   ON a.id_aeronave = v.id_aeronave
      JOIN alumno  al   ON al.id_alumno = v.id_alumno
      JOIN usuario ua   ON ua.id_usuario = al.id_usuario
      LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
      LEFT JOIN usuario ui   ON ui.id_usuario = i.id_usuario
      LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      LEFT JOIN LATERAL (
        SELECT ABS(m.monto_usd) AS monto
        FROM movimiento_cuenta m
        WHERE m.id_vuelo = v.id_vuelo
          AND m.tipo = 'CARGO_VUELO'
          AND COALESCE(m.anulado, false) = false
        ORDER BY m.id DESC
        LIMIT 1
      ) mc ON true
      LEFT JOIN LATERAL (
        SELECT registrado_en
        FROM vuelo_estado_tiempo
        WHERE id_vuelo = v.id_vuelo AND estado = 'SALIDA_HANGAR'
        ORDER BY registrado_en DESC
        LIMIT 1
      ) vet_salida ON true
      LEFT JOIN LATERAL (
        SELECT registrado_en
        FROM vuelo_estado_tiempo
        WHERE id_vuelo = v.id_vuelo AND estado = 'REGRESO_HANGAR'
        ORDER BY registrado_en DESC
        LIMIT 1
      ) vet_llegada ON true
      WHERE v.fecha_vuelo = $1::date
        AND v.estado = 'COMPLETADO'
        AND COALESCE(rv.es_inasistencia, false) = false
      ORDER BY a.codigo, rv.tacometro_salida NULLS LAST, v.id_vuelo
    `, [fecha]);

    // Apertura/cierre de operaciones del día + instructores en turno (entrada/
    // salida) — mismas tablas que usa el widget "Turno del día".
    const [turnoDiaRes, asistenciasRes] = await Promise.all([
      db.query(`
        SELECT (apertura_en AT TIME ZONE 'America/El_Salvador') AS apertura_en,
               (cierre_en   AT TIME ZONE 'America/El_Salvador') AS cierre_en,
               estado
        FROM turno_dia
        WHERE fecha = $1::date
      `, [fecha]),
      db.query(`
        SELECT ta.turno, ta.id_instructor,
               (ta.entrada_en AT TIME ZONE 'America/El_Salvador') AS entrada_en,
               (ta.salida_en  AT TIME ZONE 'America/El_Salvador') AS salida_en,
               TRIM(u.nombre || ' ' || COALESCE(u.apellido, '')) AS nombre_completo
        FROM turno_asistencia ta
        JOIN instructor i ON i.id_instructor = ta.id_instructor
        JOIN usuario u    ON u.id_usuario = i.id_usuario
        WHERE ta.fecha = $1::date
        ORDER BY ta.turno, ta.entrada_en
      `, [fecha]),
    ]);

    const doc = generarReporteVuelosDiaPDF({
      fecha, vuelos: r.rows,
      turnoDia: turnoDiaRes.rows[0] || null,
      asistencias: asistenciasRes.rows,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="vuelos-por-avion-${fecha}.pdf"`);
    doc.pipe(res);
  } catch (e) {
    console.error("getReporteVuelosDia:", e);
    res.status(500).json({ message: "Error al generar el reporte de vuelos" });
  }
};

// ── Reporte "OPERACIONES DEL DÍA" (sin montos, para Turno) ─────────────────
// Mismo alcance que getReporteVuelosDia (vuelos COMPLETADOS de la fecha,
// agrupados por aeronave) pero SIN tocar movimiento_cuenta: no hay monto que
// filtrar. Incluye horas_cobradas para el fallback de horas del simulador
// (que no tiene tacómetro, ver generarReporteOperacionesDiaPDF).
exports.getReporteOperacionesDia = async (req, res) => {
  try {
    const { generarReporteOperacionesDiaPDF } = require("../utils/pdfGenerator");

    let fecha = String(req.query.fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const hoy = await db.query(`SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::date AS d`);
      fecha = hoy.rows[0].d.toISOString().slice(0, 10);
    }

    const r = await db.query(`
      SELECT v.id_vuelo,
             a.codigo AS avion_codigo, a.modelo AS avion_modelo,
             TRIM(ua.nombre || ' ' || COALESCE(ua.apellido, '')) AS alumno,
             TRIM(ui.nombre || ' ' || COALESCE(ui.apellido, '')) AS instructor,
             rv.tacometro_salida  AS tac_ini,
             rv.tacometro_llegada AS tac_fin,
             rv.horas_cobradas    AS horas_cobradas,
             -- Hora real de salida/regreso de hangar (timestamp del botón, no el
             -- bloque programado) — mismo patrón que getCalendarioPublico.
             (vet_salida.registrado_en  AT TIME ZONE 'America/El_Salvador') AS salida_real,
             (vet_llegada.registrado_en AT TIME ZONE 'America/El_Salvador') AS llegada_real
      FROM vuelo v
      JOIN aeronave a   ON a.id_aeronave = v.id_aeronave
      JOIN alumno  al   ON al.id_alumno = v.id_alumno
      JOIN usuario ua   ON ua.id_usuario = al.id_usuario
      LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
      LEFT JOIN usuario ui   ON ui.id_usuario = i.id_usuario
      LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      LEFT JOIN LATERAL (
        SELECT registrado_en
        FROM vuelo_estado_tiempo
        WHERE id_vuelo = v.id_vuelo AND estado = 'SALIDA_HANGAR'
        ORDER BY registrado_en DESC
        LIMIT 1
      ) vet_salida ON true
      LEFT JOIN LATERAL (
        SELECT registrado_en
        FROM vuelo_estado_tiempo
        WHERE id_vuelo = v.id_vuelo AND estado = 'REGRESO_HANGAR'
        ORDER BY registrado_en DESC
        LIMIT 1
      ) vet_llegada ON true
      WHERE v.fecha_vuelo = $1::date
        AND v.estado = 'COMPLETADO'
        AND COALESCE(rv.es_inasistencia, false) = false
      ORDER BY a.codigo, rv.tacometro_salida NULLS LAST, v.id_vuelo
    `, [fecha]);

    // Apertura/cierre de operaciones del día + instructores en turno (entrada/
    // salida) — mismas tablas que usa el widget "Turno del día".
    const [turnoDiaRes, asistenciasRes] = await Promise.all([
      db.query(`
        SELECT (apertura_en AT TIME ZONE 'America/El_Salvador') AS apertura_en,
               (cierre_en   AT TIME ZONE 'America/El_Salvador') AS cierre_en,
               estado
        FROM turno_dia
        WHERE fecha = $1::date
      `, [fecha]),
      db.query(`
        SELECT ta.turno, ta.id_instructor,
               (ta.entrada_en AT TIME ZONE 'America/El_Salvador') AS entrada_en,
               (ta.salida_en  AT TIME ZONE 'America/El_Salvador') AS salida_en,
               TRIM(u.nombre || ' ' || COALESCE(u.apellido, '')) AS nombre_completo
        FROM turno_asistencia ta
        JOIN instructor i ON i.id_instructor = ta.id_instructor
        JOIN usuario u    ON u.id_usuario = i.id_usuario
        WHERE ta.fecha = $1::date
        ORDER BY ta.turno, ta.entrada_en
      `, [fecha]),
    ]);

    const doc = generarReporteOperacionesDiaPDF({
      fecha, vuelos: r.rows,
      turnoDia: turnoDiaRes.rows[0] || null,
      asistencias: asistenciasRes.rows,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="operaciones-${fecha}.pdf"`);
    doc.pipe(res);
  } catch (e) {
    console.error("getReporteOperacionesDia:", e);
    res.status(500).json({ message: "Error al generar el reporte de operaciones" });
  }
};

// ── Editar tripulación de un vuelo (Turno) ──────────────────────────────────
// En el aeropuerto no siempre hay alguien de programación disponible para
// resolver un cambio de última hora: Turno puede reasignar alumno/instructor/
// aeronave de un vuelo de la semana publicada, y anotar "almas a bordo" +
// notas de pasajeros extra (vuelos demo con gente que no está en el sistema).
exports.editarTripulacion = async (req, res) => {
  const { id_vuelo } = req.params;
  const {
    id_alumno, id_instructor, id_aeronave, almas_a_bordo, pasajeros_extra,
    dia_semana, id_bloque, id_bloque_fin,
  } = req.body;
  const user = req.user;
  const io = req.app.get("io");

  if (!id_alumno || !id_instructor || !id_aeronave || !dia_semana || !id_bloque) {
    return res.status(400).json({ message: "Faltan datos (alumno, instructor, aeronave, día, bloque)" });
  }
  if (Number(dia_semana) < 1 || Number(dia_semana) > 6) {
    return res.status(400).json({ message: "Día inválido (Lunes a Sábado)" });
  }
  if (id_bloque_fin != null && Number(id_bloque_fin) < Number(id_bloque)) {
    return res.status(400).json({ message: "El bloque final no puede ser anterior al de inicio" });
  }

  let almas = null;
  if (almas_a_bordo !== "" && almas_a_bordo != null) {
    almas = parseInt(almas_a_bordo, 10);
    if (isNaN(almas) || almas < 0 || almas > 10) {
      return res.status(400).json({ message: "Almas a bordo debe ser un número entre 0 y 10" });
    }
  }
  const pasajeros = pasajeros_extra ? String(pasajeros_extra).trim().slice(0, 500) || null : null;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const vueloRes = await client.query(
      `SELECT v.id_vuelo, v.id_semana, v.dia_semana, v.id_bloque, v.id_bloque_fin, v.estado,
              v.id_alumno, v.id_instructor, v.id_aeronave, v.es_extracurricular, sw.publicada, sw.fecha_inicio
         FROM vuelo v
         JOIN semana_vuelo sw ON sw.id_semana = v.id_semana
        WHERE v.id_vuelo = $1 FOR UPDATE OF v`,
      [Number(id_vuelo)]
    );
    if (vueloRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Vuelo no encontrado" });
    }
    const vuelo = vueloRes.rows[0];

    if (!vuelo.publicada) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "La semana de este vuelo aún no está publicada" });
    }
    if (["CANCELADO", "COMPLETADO"].includes(vuelo.estado)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `No se puede editar un vuelo ${vuelo.estado.toLowerCase()}` });
    }

    const finActual = vuelo.id_bloque_fin || vuelo.id_bloque;
    const nuevoAlumno = Number(id_alumno);
    const nuevoInstructor = Number(id_instructor);
    const nuevaAeronave = Number(id_aeronave);
    const nuevoDia = Number(dia_semana);
    const nuevoBloque = Number(id_bloque);
    const nuevoFin = Number(id_bloque_fin || id_bloque);
    const alumnoCambio = nuevoAlumno !== vuelo.id_alumno;
    const instructorCambio = nuevoInstructor !== vuelo.id_instructor;
    const aeronaveCambio = nuevaAeronave !== vuelo.id_aeronave;
    const slotCambio = nuevoDia !== vuelo.dia_semana || nuevoBloque !== vuelo.id_bloque || nuevoFin !== finActual;

    if (slotCambio) {
      const bloquesRes = await client.query(
        `SELECT id_bloque FROM bloque_horario WHERE id_bloque = ANY($1::int[])`,
        [[...new Set([nuevoBloque, nuevoFin])]]
      );
      if (bloquesRes.rows.length !== new Set([nuevoBloque, nuevoFin]).size) {
        throw Object.assign(new Error("Bloque horario inválido"), { code: "VALIDATION" });
      }
    }

    // Conflictos contra otros vuelos reales (mismo patrón que agendarVueloDirecto),
    // evaluados contra el bloque NUEVO. Se disparan también si solo cambió el
    // horario (aunque la tripulación se mantenga) para no mover un vuelo a un
    // slot donde esa aeronave/instructor/alumno ya está ocupado.
    const conflicto = async (columna, valor, label, code) => {
      const r = await client.query(
        `SELECT 1 FROM vuelo
          WHERE id_semana=$1 AND dia_semana=$2 AND ${columna}=$3 AND estado <> 'CANCELADO' AND id_vuelo <> $6
            AND NOT ($5 < id_bloque OR $4 > COALESCE(id_bloque_fin, id_bloque)) LIMIT 1`,
        [vuelo.id_semana, nuevoDia, valor, nuevoBloque, nuevoFin, vuelo.id_vuelo]
      );
      if (r.rows.length) throw Object.assign(new Error(label), { code });
    };

    if (aeronaveCambio || slotCambio) {
      await conflicto("id_aeronave", nuevaAeronave, "Ese bloque y aeronave ya está ocupado", "23505");
      const reservaOcup = await client.query(
        `SELECT 1 FROM reserva_aeronave
          WHERE id_aeronave = $1 AND fecha = $2::date + ($3::int - 1)
            AND NOT ($5 < id_bloque OR $4 > COALESCE(id_bloque_fin, id_bloque)) LIMIT 1`,
        [nuevaAeronave, vuelo.fecha_inicio, nuevoDia, nuevoBloque, nuevoFin]
      );
      if (reservaOcup.rows.length) throw Object.assign(new Error("Ese avión está reservado (uso especial) en ese horario"), { code: "23505" });
    }
    if (instructorCambio || slotCambio) await conflicto("id_instructor", nuevoInstructor, "El instructor ya tiene un vuelo en ese horario", "23507");
    if (alumnoCambio || slotCambio) await conflicto("id_alumno", nuevoAlumno, "El alumno ya tiene un vuelo en ese horario", "23506");

    if ((alumnoCambio || aeronaveCambio) && !vuelo.es_extracurricular) {
      const alRes = await client.query(`SELECT id_licencia FROM alumno WHERE id_alumno=$1`, [nuevoAlumno]);
      if (alRes.rows.length === 0) throw Object.assign(new Error("Alumno no encontrado"), { code: "VALIDATION" });
      const permitida = await client.query(
        `SELECT 1 FROM licencia_aeronave WHERE id_licencia=$1 AND id_aeronave=$2`,
        [alRes.rows[0].id_licencia, nuevaAeronave]
      );
      if (permitida.rows.length === 0) {
        throw Object.assign(new Error("Esa aeronave no está permitida para la licencia del alumno"), { code: "VALIDATION" });
      }
    }

    await client.query(
      `UPDATE vuelo SET id_alumno=$1, id_instructor=$2, id_aeronave=$3, almas_a_bordo=$4, pasajeros_extra=$5,
              dia_semana=$6, id_bloque=$7, id_bloque_fin=$8, fecha_vuelo=$9::date + ($6 - 1)
        WHERE id_vuelo=$10`,
      [nuevoAlumno, nuevoInstructor, nuevaAeronave, almas, pasajeros, nuevoDia, nuevoBloque, nuevoFin, vuelo.fecha_inicio, vuelo.id_vuelo]
    );

    await logAuditoria(client, {
      accion: instructorCambio && !alumnoCambio && !aeronaveCambio ? "CAMBIAR_INSTRUCTOR_VUELO" : "OTRO",
      entidad: "vuelo",
      id_entidad: vuelo.id_vuelo,
      id_semana: vuelo.id_semana,
      actor: user,
      req,
      descripcion: `Turno editó tripulación${slotCambio ? "/horario" : ""} del vuelo #${vuelo.id_vuelo}`,
      before_data: { id_alumno: vuelo.id_alumno, id_instructor: vuelo.id_instructor, id_aeronave: vuelo.id_aeronave, dia_semana: vuelo.dia_semana, id_bloque: vuelo.id_bloque, id_bloque_fin: finActual },
      after_data: { id_alumno: nuevoAlumno, id_instructor: nuevoInstructor, id_aeronave: nuevaAeronave, almas_a_bordo: almas, pasajeros_extra: pasajeros, dia_semana: nuevoDia, id_bloque: nuevoBloque, id_bloque_fin: nuevoFin },
    });

    // Avisar in-app a quienes quedan asignados Y a quienes fueron removidos.
    const uidsAvisar = new Map();
    if (alumnoCambio || instructorCambio || aeronaveCambio || slotCambio) {
      const [nuevos, viejos] = await Promise.all([
        client.query(
          `SELECT a.id_usuario AS alumno_uid, i.id_usuario AS instructor_uid, ae.codigo AS aeronave
             FROM alumno a, instructor i, aeronave ae
            WHERE a.id_alumno=$1 AND i.id_instructor=$2 AND ae.id_aeronave=$3`,
          [nuevoAlumno, nuevoInstructor, nuevaAeronave]
        ),
        client.query(
          `SELECT a.id_usuario AS alumno_uid, i.id_usuario AS instructor_uid
             FROM alumno a, instructor i WHERE a.id_alumno=$1 AND i.id_instructor=$2`,
          [vuelo.id_alumno, vuelo.id_instructor]
        ),
      ]);
      const info = nuevos.rows[0] || {};
      const old = viejos.rows[0] || {};
      const msgNuevo = slotCambio
        ? `Turno cambió el horario de tu vuelo (aeronave ${info.aeronave || ""}).`
        : `Turno actualizó la tripulación de tu vuelo (aeronave ${info.aeronave || ""}).`;
      const msgViejo = `Ya no formás parte de un vuelo que tenías asignado — Turno reasignó la tripulación.`;
      if (info.alumno_uid) uidsAvisar.set(info.alumno_uid, msgNuevo);
      if (info.instructor_uid) uidsAvisar.set(info.instructor_uid, msgNuevo);
      if (alumnoCambio && old.alumno_uid && !uidsAvisar.has(old.alumno_uid)) uidsAvisar.set(old.alumno_uid, msgViejo);
      if (instructorCambio && old.instructor_uid && !uidsAvisar.has(old.instructor_uid)) uidsAvisar.set(old.instructor_uid, msgViejo);
      for (const [uid, mensaje] of uidsAvisar) {
        await notificarUsuario(client, uid, { tipo: "VUELO", mensaje, enlace: "/perfil" });
      }
    }

    await client.query("COMMIT");

    if (io) io.emit("vuelo_estado_changed", { id_vuelo: vuelo.id_vuelo });

    notificarStaff({
      title: "Tripulación actualizada",
      body: `Vuelo #${vuelo.id_vuelo} — cambio hecho por Turno`,
      url: "/turno", tag: "tripulacion",
    }, { excluirUid: user?.id_usuario }).catch(() => {});

    res.json({ message: "Tripulación actualizada", id_vuelo: vuelo.id_vuelo });
  } catch (e) {
    await client.query("ROLLBACK");
    if (["23505", "23506", "23507", "VALIDATION"].includes(e.code)) {
      return res.status(e.code === "VALIDATION" ? 400 : 409).json({ message: e.message });
    }
    console.error("editarTripulacion:", e);
    res.status(500).json({ message: "Error al editar tripulación" });
  } finally {
    client.release();
  }
};
