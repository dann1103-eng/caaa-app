const db = require("../../config/db");
const { logAuditoria } = require("../../utils/auditoria");
const { resolverIdInstructor, getSemanaActual, registrarHorasInstructor } = require("../../utils/instructorHelpers");

const NEXT_ESTADO_INSTRUCTOR = {
  PUBLICADO:      "SALIDA_HANGAR",
  PROGRAMADO:     "SALIDA_HANGAR",
  SALIDA_HANGAR:  "EN_PROGRESO",
  EN_PROGRESO:    "REGRESO_HANGAR",
  REGRESO_HANGAR: "FINALIZANDO",
  FINALIZANDO:    "COMPLETADO",
};

exports.getVuelosHoy = async (req, res) => {
  try {
    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

    const semana = await getSemanaActual();
    if (!semana) return res.json([]);

    const r = await db.query(
      `SELECT
         v.id_vuelo,
         v.id_bloque,
         v.dia_semana,
         v.estado,
         v.duracion_estimada_min,
         v.tiempo_vuelo_min,
         bh.hora_inicio,
         bh.hora_fin,
         a.codigo  AS aeronave_codigo,
         a.tipo    AS aeronave_tipo,
         ua.nombre    AS alumno_nombre,
         ua.apellido  AS alumno_apellido,
         (pv.tiempo_ruta IS NOT NULL) AS tiene_plan_vuelo,
         vet.registrado_en AS estado_desde,
         rv.es_inasistencia,
         (SELECT 1 FROM checklist_postvuelo WHERE id_vuelo = v.id_vuelo LIMIT 1) IS NOT NULL AS checklist_completado
       FROM vuelo v
       JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
       JOIN aeronave a ON a.id_aeronave = v.id_aeronave
       JOIN alumno al ON al.id_alumno = v.id_alumno
       JOIN usuario ua ON ua.id_usuario = al.id_usuario
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
         AND v.id_instructor = $2
         AND v.dia_semana = EXTRACT(ISODOW FROM CURRENT_DATE)::int
         AND v.estado NOT IN ('CANCELADO')
       ORDER BY bh.hora_inicio`,
      [semana.id_semana, id_instructor]
    );

    res.json(r.rows);
  } catch (e) {
    console.error("getVuelosHoy instructor:", e);
    res.status(500).json({ message: "Error al obtener vuelos del día" });
  }
};

exports.getVuelosSemana = async (req, res) => {
  try {
    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

    const { week = "current" } = req.query;

    const semanaQuery =
      week === "next"
        ? `SELECT id_semana, fecha_inicio, fecha_fin FROM semana_vuelo WHERE fecha_inicio > CURRENT_DATE ORDER BY fecha_inicio LIMIT 1`
        : `SELECT id_semana, fecha_inicio, fecha_fin FROM semana_vuelo WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin ORDER BY fecha_inicio DESC LIMIT 1`;

    const semanaRes = await db.query(semanaQuery);
    if (semanaRes.rows.length === 0) return res.json({ semana: null, vuelos: [] });

    const semana = semanaRes.rows[0];

    const r = await db.query(
      `SELECT
         v.id_vuelo,
         v.id_bloque,
         v.dia_semana,
         v.estado,
         v.duracion_estimada_min,
         v.tiempo_vuelo_min,
         bh.hora_inicio,
         bh.hora_fin,
         a.codigo  AS aeronave_codigo,
         a.tipo    AS aeronave_tipo,
         ua.nombre    AS alumno_nombre,
         ua.apellido  AS alumno_apellido,
         vet.registrado_en AS estado_desde,
         rv.es_inasistencia,
         (SELECT 1 FROM checklist_postvuelo WHERE id_vuelo = v.id_vuelo LIMIT 1) IS NOT NULL AS checklist_completado
       FROM vuelo v
       JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
       JOIN aeronave a ON a.id_aeronave = v.id_aeronave
       JOIN alumno al ON al.id_alumno = v.id_alumno
       JOIN usuario ua ON ua.id_usuario = al.id_usuario
       LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
       LEFT JOIN LATERAL (
         SELECT registrado_en
         FROM vuelo_estado_tiempo
         WHERE id_vuelo = v.id_vuelo AND estado = v.estado
         ORDER BY registrado_en DESC
         LIMIT 1
       ) vet ON true
       WHERE v.id_semana = $1
         AND v.id_instructor = $2
         AND v.estado NOT IN ('CANCELADO')
       ORDER BY v.dia_semana, bh.hora_inicio`,
      [semana.id_semana, id_instructor]
    );

    res.json({ semana, vuelos: r.rows });
  } catch (e) {
    console.error("getVuelosSemana instructor:", e);
    res.status(500).json({ message: "Error al obtener vuelos de la semana" });
  }
};

exports.avanzarEstadoVuelo = async (req, res) => {
  const { id_vuelo } = req.params;
  const { duracion_estimada_min: duracionBody, tiempo_vuelo_min } = req.body;
  const user = req.user;
  const io = req.app.get("io");

  const id_instructor = await resolverIdInstructor(user.id_usuario);
  if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const vueloRes = await client.query(
      `SELECT v.id_vuelo, v.estado, v.id_aeronave, v.id_alumno, v.id_instructor,
              a.codigo AS aeronave_codigo, rv.es_inasistencia
       FROM vuelo v
       JOIN aeronave a ON a.id_aeronave = v.id_aeronave
       LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
       WHERE v.id_vuelo = $1 FOR UPDATE OF v`,
      [id_vuelo]
    );

    if (vueloRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Vuelo no encontrado" });
    }

    const vuelo = vueloRes.rows[0];

    if (vuelo.id_instructor !== id_instructor) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No estás asignado a este vuelo" });
    }

    const aeroRes = await client.query("SELECT tipo FROM aeronave WHERE id_aeronave = $1", [vuelo.id_aeronave]);
    const esSimulador = aeroRes.rows[0]?.tipo === 'SIMULADOR';

    if (esSimulador) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Los simuladores no permiten cambios de estado" });
    }

    let nuevoEstado = NEXT_ESTADO_INSTRUCTOR[vuelo.estado];

    if (!nuevoEstado) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El vuelo no puede avanzar de estado" });
    }

    if (nuevoEstado === "COMPLETADO") {
      const minutos = parseFloat(tiempo_vuelo_min || 0);
      const esInasistencia = vuelo.es_inasistencia === true;

      if (esInasistencia) {
        // En inasistencia aceptamos 0 y no exigimos checklist
      } else {
        // Ya no exigimos minutos manuales, se derivarán del TAC en el reporte
      }
    }

    let duracionMin = null;

    if (nuevoEstado === "SALIDA_HANGAR") {
      const planRes = await client.query(
        `SELECT ROUND(EXTRACT(EPOCH FROM tiempo_ruta) / 60)::int AS minutos
         FROM plan_vuelo
         WHERE id_vuelo = $1 AND tiempo_ruta IS NOT NULL`,
        [id_vuelo]
      );

      if (planRes.rows.length > 0) {
        duracionMin = planRes.rows[0].minutos;
      } else {
        const bloqueRes = await client.query(
          `SELECT ROUND(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio)) / 60)::int AS minutos
           FROM vuelo v
           JOIN bloque_horario b ON b.id_bloque = v.id_bloque
           WHERE v.id_vuelo = $1`,
          [id_vuelo]
        );
        duracionMin = bloqueRes.rows[0]?.minutos ?? 60;
      }

      // Si sigue siendo null/0, default 60
      if (!duracionMin || duracionMin <= 0) duracionMin = 60;

      await client.query(
        "UPDATE vuelo SET estado = $1, duracion_estimada_min = $2 WHERE id_vuelo = $3",
        [nuevoEstado, duracionMin, id_vuelo]
      );
    } else if (nuevoEstado === "COMPLETADO") {
      const minutos = parseFloat(tiempo_vuelo_min || 0);
      await client.query(
        "UPDATE vuelo SET estado = $1, tiempo_vuelo_min = $2 WHERE id_vuelo = $3",
        [nuevoEstado, minutos, id_vuelo]
      );
      await registrarHorasInstructor(
        client,
        Number(id_vuelo),
        vuelo.id_aeronave,
        vuelo.id_alumno,
        minutos,
        io,
        user.id_usuario
      );
    } else {
      await client.query(
        "UPDATE vuelo SET estado = $1 WHERE id_vuelo = $2",
        [nuevoEstado, id_vuelo]
      );
    }

    const tiempoRes = await client.query(
      `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
       VALUES ($1, $2, $3) RETURNING registrado_en`,
      [id_vuelo, nuevoEstado, user?.id_usuario ?? null]
    );
    const registrado_en = tiempoRes.rows[0].registrado_en;

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "vuelo",
      id_entidad: Number(id_vuelo),
      actor: user,
      descripcion: `Instructor avanzó estado vuelo #${id_vuelo}: ${vuelo.estado} → ${nuevoEstado}`,
    });

    await client.query("COMMIT");

    const tiempoVueloMinFinal = nuevoEstado === "COMPLETADO" ? parseFloat(tiempo_vuelo_min) : null;

    if (io) {
      io.emit("vuelo_estado_changed", {
        id_vuelo: Number(id_vuelo),
        estado: nuevoEstado,
        registrado_en,
        duracion_estimada_min: duracionMin,
        tiempo_vuelo_min: tiempoVueloMinFinal,
        aeronave_codigo: vuelo.aeronave_codigo,
      });
      io.emit("estado_operaciones_changed");
      if (nuevoEstado === "COMPLETADO") {
        io.emit("vuelo_completado", {
          id_vuelo: Number(id_vuelo),
          id_alumno: vuelo.id_alumno,
        });
      }
    }

    res.json({
      id_vuelo: Number(id_vuelo),
      estado: nuevoEstado,
      registrado_en,
      duracion_estimada_min: duracionMin,
      tiempo_vuelo_min: tiempoVueloMinFinal,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("avanzarEstadoVuelo instructor:", e);
    res.status(500).json({ message: "Error al avanzar estado" });
  } finally {
    client.release();
  }
};

exports.registrarInasistencia = async (req, res) => {
  const { id_vuelo } = req.params;
  const user = req.user;
  const io = req.app.get("io");

  const id_instructor = await resolverIdInstructor(user.id_usuario);
  if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const timeCheck = await client.query(
      `SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::time < bh.hora_inicio AS es_temprano
       FROM vuelo v
       JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
       WHERE v.id_vuelo = $1`,
      [id_vuelo]
    );

    if (timeCheck.rows.length > 0 && timeCheck.rows[0].es_temprano) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No se puede registrar inasistencia antes de la hora programada" });
    }

    const upd = await client.query(
      `UPDATE vuelo SET estado = 'COMPLETADO', tiempo_vuelo_min = 0 
       WHERE id_vuelo = $1 AND id_instructor = $2 RETURNING id_vuelo`,
      [id_vuelo, id_instructor]
    );

    if (upd.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Vuelo no encontrado o no asignado" });
    }

    await client.query(
      `INSERT INTO reporte_vuelo (id_vuelo, es_inasistencia, observaciones)
       VALUES ($1, true, 'Inasistencia registrada por instructor')
       ON CONFLICT (id_vuelo) DO UPDATE SET es_inasistencia = true`,
      [id_vuelo]
    );

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
      descripcion: `Instructor registró inasistencia para el vuelo #${id_vuelo}`,
    });

    await client.query("COMMIT");

    if (io) {
      io.emit("vuelo_estado_changed", { 
        id_vuelo: Number(id_vuelo), 
        estado: 'COMPLETADO', 
        registrado_en: ts.rows[0].registrado_en,
        es_inasistencia: true
      });
    }

    res.json({ message: "Inasistencia registrada" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("registrarInasistencia instructor:", e);
    res.status(500).json({ message: "Error al registrar inasistencia" });
  } finally {
    client.release();
  }
};
