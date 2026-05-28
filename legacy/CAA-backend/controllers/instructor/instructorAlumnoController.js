const db = require("../../config/db");
const { logAuditoria } = require("../../utils/auditoria");
const { resolverIdInstructor, getSemanaProxima } = require("../../utils/instructorHelpers");

exports.getMisAlumnos = async (req, res) => {
  try {
    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

    const semana = await getSemanaProxima();

    const r = await db.query(
      `SELECT
         a.id_alumno,
         u.nombre,
         u.apellido,
         u.nombre || ' ' || u.apellido AS nombre_completo,
         a.soleado,
         a.numero_licencia,
         COALESCE(ss.limite_vuelos_avion, a.limite_vuelos_avion, 3) AS limite_vuelos_avion,
         COALESCE(ss.limite_vuelos_simulador, a.limite_vuelos_simulador, 3) AS limite_vuelos_simulador,
         ss.id_solicitud
       FROM alumno a
       JOIN usuario u ON u.id_usuario = a.id_usuario
       LEFT JOIN solicitud_semana ss
         ON ss.id_alumno = a.id_alumno
        AND ss.id_semana = $2
       WHERE a.id_instructor = $1
         AND a.activo = true
       ORDER BY u.apellido, u.nombre`,
      [id_instructor, semana?.id_semana ?? null]
    );

    res.json({ semana: semana ?? null, alumnos: r.rows });
  } catch (e) {
    console.error("getMisAlumnos instructor:", e);
    res.status(500).json({ message: "Error al obtener alumnos" });
  }
};

exports.habilitarVueloExtra = async (req, res) => {
  const { id_alumno } = req.params;
  const { id_semana, limite_vuelos_avion, limite_vuelos_simulador } = req.body;

  const client = await db.connect();
  try {
    if (!id_semana) {
      return res.status(400).json({ message: "id_semana es requerido" });
    }

    const limAvion = parseInt(limite_vuelos_avion, 10);
    const limSim = parseInt(limite_vuelos_simulador, 10);

    if (isNaN(limAvion) || limAvion < 0 || limAvion > 6 || isNaN(limSim) || limSim < 0 || limSim > 6) {
      return res.status(400).json({ message: "Los límites deben estar entre 0 y 6" });
    }

    const id_instructor = await resolverIdInstructor(req.user.id_usuario);
    if (!id_instructor) return res.status(403).json({ message: "No sos instructor activo" });

    const perteneceRes = await db.query(
      "SELECT 1 FROM alumno WHERE id_alumno = $1 AND id_instructor = $2",
      [id_alumno, id_instructor]
    );
    if (perteneceRes.rows.length === 0) {
      return res.status(403).json({ message: "Ese alumno no te está asignado" });
    }

    await client.query("BEGIN");

    const ssRes = await client.query(
      `SELECT id_solicitud, limite_vuelos_avion, limite_vuelos_simulador
       FROM solicitud_semana
       WHERE id_alumno = $1 AND id_semana = $2
       FOR UPDATE`,
      [id_alumno, id_semana]
    );

    if (ssRes.rows.length > 0) {
      await client.query(
        `UPDATE solicitud_semana
         SET limite_vuelos_avion = $1, limite_vuelos_simulador = $2, fecha_actualizacion = NOW()
         WHERE id_solicitud = $3`,
        [limAvion, limSim, ssRes.rows[0].id_solicitud]
      );
    } else {
      await client.query(
        `INSERT INTO solicitud_semana (id_alumno, id_semana, limite_vuelos_avion, limite_vuelos_simulador, estado)
         VALUES ($1, $2, $3, $4, 'APROBADO')`,
        [id_alumno, id_semana, limAvion, limSim]
      );
    }

    await logAuditoria(client, {
      actor: req.user,
      accion: "OTRO",
      entidad: "solicitud_semana",
      id_entidad: Number(id_alumno),
      descripcion: `Instructor ajustó límites de vuelos alumno #${id_alumno}: Avion ${limAvion}, Sim ${limSim}`,
      after_data: { limite_vuelos_avion: limAvion, limite_vuelos_simulador: limSim },
    });

    await client.query("COMMIT");

    res.json({ message: "Límites actualizados", limite_vuelos_avion: limAvion, limite_vuelos_simulador: limSim });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("habilitarVueloExtra instructor:", e);
    res.status(500).json({ message: "Error al actualizar límite" });
  } finally {
    client.release();
  }
};
