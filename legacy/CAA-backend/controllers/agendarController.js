const db = require("../config/db");
const catchAsync = require("../utils/catchAsync");
const { DateTime } = require("luxon");
const { verificarSaldoSuficiente } = require("../utils/saldoHelper");

/**
 * Un alumno queda habilitado para vuelos extracurriculares solo cuando ya
 * completó las horas que su licencia le exige (su curso activo no tiene horas
 * pendientes). El staff (PROGRAMACION/ADMIN) puede crear extracurriculares sin
 * esta restricción.
 */
async function alumnoCompletoHorasLicencia(conn, id_alumno) {
  const r = await conn.query(`
    SELECT COALESCE(SUM(ica.horas_requeridas), 0) AS req,
           COALESCE(SUM(ica.horas_acumuladas), 0) AS acc
    FROM inscripcion_curso ic
    JOIN inscripcion_curso_avance ica ON ica.id_inscripcion = ic.id
    WHERE ic.id_alumno = $1 AND ic.estado = 'ACTIVO'
  `, [id_alumno]);
  const req = Number(r.rows[0].req);
  const acc = Number(r.rows[0].acc);
  return req > 0 && acc >= req;
}
exports.alumnoCompletoHorasLicencia = alumnoCompletoHorasLicencia;

/**
 * Info para habilitar el modo extracurricular en la UI del alumno:
 * si está habilitado (completó horas de licencia) y la lista de TODAS las
 * aeronaves activas (un extracurricular puede usar cualquier avión/simulador,
 * no solo los de su licencia).
 */
exports.getExtracurricularInfo = catchAsync(async (req, res) => {
  const a = await db.query("SELECT id_alumno FROM alumno WHERE id_usuario = $1", [req.user.id_usuario]);
  if (a.rows.length === 0) return res.status(404).json({ message: "Alumno no encontrado" });
  const habilitado = await alumnoCompletoHorasLicencia(db, a.rows[0].id_alumno);
  const aeronaves = await db.query(
    "SELECT id_aeronave, codigo, modelo, tipo FROM aeronave WHERE activa = true ORDER BY codigo"
  );
  res.json({ habilitado, aeronaves: aeronaves.rows });
});

exports.getAeronavesPermitidas = catchAsync(async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Usuario no autenticado" });
  }

  const licenciaRes = await db.query(
    `
    SELECT id_licencia
    FROM alumno
    WHERE id_usuario = $1
    `,
    [user.id_usuario]
  );

  if (licenciaRes.rows.length === 0) {
    return res.status(404).json({ message: "Alumno no encontrado" });
  }

  const idLicencia = licenciaRes.rows[0].id_licencia;

  const aeronavesRes = await db.query(
    `
    SELECT
      a.id_aeronave,
      a.codigo,
      a.modelo,
      a.tipo
    FROM licencia_aeronave la
    JOIN aeronave a ON a.id_aeronave = la.id_aeronave
    WHERE la.id_licencia = $1
      AND a.activa = true
    ORDER BY a.codigo
    `,
    [idLicencia]
  );

  res.json(aeronavesRes.rows);
});

exports.getMisSolicitudes = async (req, res) => {
  try {
    const user = req.user;
    const { week } = req.query;

    if (week !== "next") {
      return res.status(400).json({ message: "Solo se permite la semana siguiente" });
    }

    const alumnoRes = await db.query(
      "SELECT id_alumno, limite_vuelos_avion, limite_vuelos_simulador FROM alumno WHERE id_usuario = $1",
      [user.id_usuario]
    );
    if (alumnoRes.rows.length === 0) return res.json(null);

    const defLimAvion = alumnoRes.rows[0].limite_vuelos_avion ?? 3;
    const defLimSim = alumnoRes.rows[0].limite_vuelos_simulador ?? 3;
    const idAlumno = alumnoRes.rows[0].id_alumno;

    const semanaRes = await db.query(`
      SELECT id_semana
      FROM semana_vuelo
      WHERE fecha_inicio > CURRENT_DATE
      ORDER BY fecha_inicio
      LIMIT 1
    `);
    if (semanaRes.rows.length === 0) return res.json(null);

    const idSemana = semanaRes.rows[0].id_semana;

    const solicitudRes = await db.query(
      `
      SELECT id_solicitud, estado, 
             COALESCE(limite_vuelos_avion, $1) AS limite_vuelos_avion,
             COALESCE(limite_vuelos_simulador, $2) AS limite_vuelos_simulador
      FROM solicitud_semana
      WHERE id_alumno = $3 AND id_semana = $4
      `,
      [defLimAvion, defLimSim, idAlumno, idSemana]
    );

    if (solicitudRes.rows.length === 0) {
      return res.json({ 
        estado: "BORRADOR", 
        limite_vuelos_avion: defLimAvion, 
        limite_vuelos_simulador: defLimSim, 
        vuelos: [] 
      });
    }

    const { id_solicitud, estado, limite_vuelos_avion, limite_vuelos_simulador } = solicitudRes.rows[0];

    const vuelosRes = await db.query(
      `
      SELECT dia_semana, id_bloque, id_aeronave, estado, tipo_vuelo, id_bloque_fin, es_extracurricular
      FROM solicitud_vuelo
      WHERE id_solicitud = $1 AND (estado IS NULL OR estado != 'RECHAZADA')
      `,
      [id_solicitud]
    );

    res.json({ estado, limite_vuelos_avion, limite_vuelos_simulador, vuelos: vuelosRes.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error obtener solicitudes" });
  }
};

exports.guardarSolicitud = async (req, res) => {
  const client = await db.connect();
  try {
    const user = req.user;
    const { vuelos } = req.body;
    const { week } = req.query;

    console.log("guardarSolicitud Payload Vuelos:", vuelos);

    if (week !== "next") {
      return res.status(400).json({ message: "Solo se permite la semana siguiente" });
    }

    if (!Array.isArray(vuelos)) {
      return res.status(400).json({ message: "Formato de vuelos inválido" });
    }

    const alumnoRes = await client.query(
      `SELECT a.id_alumno, a.id_licencia, l.dia_apertura_agenda, a.limite_vuelos_avion, a.limite_vuelos_simulador
       FROM alumno a
       LEFT JOIN licencia l ON l.id_licencia = a.id_licencia
       WHERE a.id_usuario = $1`,
      [user.id_usuario]
    );
    if (alumnoRes.rows.length === 0) {
      return res.status(403).json({ message: "No es alumno" });
    }

    const { id_alumno, id_licencia, dia_apertura_agenda } = alumnoRes.rows[0];
    const defLimAvion = alumnoRes.rows[0].limite_vuelos_avion ?? 3;
    const defLimSim = alumnoRes.rows[0].limite_vuelos_simulador ?? 3;

    // --- Validación de Saldo (Módulo Administración) ---
    // Si el módulo de Administración está activo, bloqueamos solicitudes
    // cuyo costo estimado supere el saldo prepagado del alumno.
    try {
      const chk = await verificarSaldoSuficiente(id_alumno, vuelos);
      if (!chk.ok) {
        return res.status(403).json({
          message: chk.mensaje,
          saldo_insuficiente: true,
          saldo: chk.saldo,
          costo_estimado: chk.costo_estimado
        });
      }
    } catch (e) {
      // No abortar agendamiento por error en verificación de saldo
      console.warn("[saldo] verificación falló:", e.message);
    }

    // --- Validación de Apertura ---
    if (dia_apertura_agenda) {
      const nowSV = DateTime.now().setZone("America/El_Salvador");
      const diaSemanaActual = nowSV.weekday; 
      if (diaSemanaActual < dia_apertura_agenda) {
        const diasNombres = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
        const nombreDiaAbre = diasNombres[dia_apertura_agenda] || "el día correspondiente";
        return res.status(403).json({ message: `La agenda para tu nivel de licencia abre el ${nombreDiaAbre}` });
      }
    }

    const semanaRes = await client.query(`
      SELECT id_semana, publicada
      FROM semana_vuelo
      WHERE fecha_inicio > CURRENT_DATE
      ORDER BY fecha_inicio
      LIMIT 1
    `);

    if (semanaRes.rows.length === 0) {
      return res.status(400).json({ message: "Semana no encontrada" });
    }

    const { id_semana, publicada } = semanaRes.rows[0];
    if (publicada) {
      return res.status(403).json({ message: "Semana ya publicada" });
    }

    await client.query("BEGIN");

    const solicitudRes = await client.query(
      `
      INSERT INTO solicitud_semana (id_semana, id_alumno, estado)
      VALUES ($1,$2,'BORRADOR')
      ON CONFLICT (id_semana, id_alumno)
      DO UPDATE SET fecha_actualizacion = now()
      RETURNING id_solicitud, estado, 
                COALESCE(limite_vuelos_avion, $3) AS lim_avion,
                COALESCE(limite_vuelos_simulador, $4) AS lim_sim
      `,
      [id_semana, id_alumno, defLimAvion, defLimSim]
    );

    const { id_solicitud, estado, lim_avion, lim_sim } = solicitudRes.rows[0];

    if (estado !== "BORRADOR" && estado !== "RECHAZADA") {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Solicitud en revisión o publicada" });
    }

    // Si estaba rechazada, al guardar vuelve a ser "BORRADOR" (o "ENVIADA" si el flujo lo requiere, 
    // pero usualmente guardar es para edición, y "Enviar" es otro paso o el mismo).
    // Aquí el sistema parece que 'guardar' es el paso final del alumno.
    await client.query("UPDATE solicitud_semana SET estado = 'BORRADOR', fecha_actualizacion = now() WHERE id_solicitud = $1", [id_solicitud]);

    // --- Gate de extracurricular ---
    // Un alumno solo puede solicitar vuelos extracurriculares si ya completó
    // las horas que su licencia le exige.
    if (vuelos.some(v => v.es_extracurricular)) {
      const habilitado = await alumnoCompletoHorasLicencia(client, id_alumno);
      if (!habilitado) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          message: "Los vuelos extracurriculares se habilitan solo cuando completas las horas de tu licencia."
        });
      }
    }

    // --- Validación de Límites ---
    const aeroIds = [...new Set(vuelos.map(v => Number(v.id_aeronave)))];
    const tiposRes = await client.query(
      `SELECT id_aeronave, tipo FROM aeronave WHERE id_aeronave = ANY($1::int[])`,
      [aeroIds]
    );
    const tipoMap = {};
    for (const row of tiposRes.rows) tipoMap[row.id_aeronave] = row.tipo;

    let countAvion = 0;
    let countSim = 0;
    const avionesPorDia = {};

    for (const v of vuelos) {
      // Los extracurriculares no cuentan al límite semanal ni a la regla 1/día.
      if (v.es_extracurricular) continue;
      if (tipoMap[v.id_aeronave] === 'SIMULADOR') {
        countSim++;
      } else {
        countAvion++;
        avionesPorDia[v.dia_semana] = (avionesPorDia[v.dia_semana] || 0) + 1;
      }
    }

    if (countAvion > lim_avion) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Límite de aviones excedido: tu límite es ${lim_avion} y seleccionaste ${countAvion}.` });
    }
    if (countSim > lim_sim) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Límite de simuladores excedido: tu límite es ${lim_sim} y seleccionaste ${countSim}.` });
    }

    const conflictoDia = Object.entries(avionesPorDia).find(([, c]) => c > 1);
    if (conflictoDia) {
      await client.query("ROLLBACK");
      const dNombres = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      return res.status(400).json({
        message: `Solo puedes agendar 1 avión por día. El ${dNombres[Number(conflictoDia[0])]} tienes ${conflictoDia[1]} aviones seleccionados.`
      });
    }

    await client.query("DELETE FROM solicitud_vuelo WHERE id_solicitud = $1", [id_solicitud]);

    for (const v of vuelos) {
      // Los extracurriculares pueden usar cualquier aeronave activa (no se exige
      // que esté en la licencia del alumno).
      if (!v.es_extracurricular) {
        const permitida = await client.query(
          `SELECT 1 FROM licencia_aeronave WHERE id_licencia = $1 AND id_aeronave = $2`,
          [id_licencia, v.id_aeronave]
        );
        if (permitida.rows.length === 0) throw new Error("Aeronave no permitida");
      }

      await client.query(
        `INSERT INTO solicitud_vuelo (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, es_extracurricular) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id_solicitud, id_semana, v.dia_semana, v.id_bloque, v.id_aeronave, v.tipo_vuelo || 'LOCAL', v.id_bloque_fin || v.id_bloque, v.es_extracurricular === true]
      );
    }

    await client.query("COMMIT");
    res.json({ message: "Solicitud guardada correctamente" });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("guardarSolicitud:", e);
    // Mensajes específicos en vez del genérico 500, para que el alumno sepa
    // qué corregir.
    if (e.message === "Aeronave no permitida") {
      return res.status(400).json({
        message: "Una de las aeronaves seleccionadas no está habilitada para tu licencia.",
      });
    }
    // 23505 = violación de índice único. Hoy dispara por uq_slot cuando dos
    // alumnos piden la misma aeronave en el mismo día+bloque. Si se quita
    // uq_slot (para permitir solicitudes encimadas que programación resuelve),
    // esta rama queda como defensa ante cualquier otra unicidad.
    if (e.code === "23505") {
      return res.status(409).json({
        message: "Ese bloque con esa aeronave ya fue solicitado. Elegí otro horario u otra aeronave.",
      });
    }
    res.status(500).json({ message: "Error al guardar solicitud" });
  } finally {
    client.release();
  }
};

exports.getBloquesHorario = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        id_bloque,
        hora_inicio,
        hora_fin,
        es_almuerzo
      FROM bloque_horario
      ORDER BY hora_inicio
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error bloques horario:", error);
    res.status(500).json({ message: "Error obtener bloques" });
  }
};

exports.getBloquesOcupados = async (req, res) => {
  try {
    const user = req.user;

    const semanaRes = await db.query(`
      SELECT id_semana
      FROM semana_vuelo
      WHERE fecha_inicio > CURRENT_DATE
      ORDER BY fecha_inicio
      LIMIT 1
    `);

    if (semanaRes.rows.length === 0) return res.json([]);

    const idSemana = semanaRes.rows[0].id_semana;

    // ALUMNO: solo ve sus propios bloques reservados → agenda libre para el resto
    if (user?.rol === 'ALUMNO') {
      const alumnoRes = await db.query(
        'SELECT id_alumno FROM alumno WHERE id_usuario = $1',
        [user.id_usuario]
      );
      if (alumnoRes.rows.length === 0) return res.json([]);
      const idAlumno = alumnoRes.rows[0].id_alumno;

      const result = await db.query(
        `SELECT sv.dia_semana, sv.id_bloque, sv.id_aeronave, sv.tipo_vuelo, sv.id_bloque_fin
         FROM solicitud_vuelo sv
         JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
         WHERE sv.id_semana = $1 AND ss.id_alumno = $2`,
        [idSemana, idAlumno]
      );
      return res.json(result.rows);
    }

    // ADMIN / PROGRAMACION: todos los bloques con info de alumno e instructor para detección de conflictos
    const result = await db.query(
      `SELECT sv.dia_semana, sv.id_bloque, sv.id_aeronave, sv.tipo_vuelo, sv.id_bloque_fin,
              u.nombre AS alumno_nombre, u.apellido AS alumno_apellido,
              ss.id_alumno, ss.id_solicitud, ss.estado AS estado_solicitud,
              al.id_instructor,
              ui.nombre AS instructor_nombre, ui.apellido AS instructor_apellido
       FROM solicitud_vuelo sv
       JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
       JOIN alumno al            ON al.id_alumno   = ss.id_alumno
       JOIN usuario u            ON u.id_usuario   = al.id_usuario
       LEFT JOIN instructor ins  ON ins.id_instructor = al.id_instructor
       LEFT JOIN usuario ui      ON ui.id_usuario = ins.id_usuario
       WHERE sv.id_semana = $1
       ORDER BY ss.creado_en ASC, sv.id_bloque, sv.dia_semana`,
      [idSemana]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error bloques ocupados" });
  }
};

exports.getBloquesBloqueados = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id_bloque, dia_semana, motivo
      FROM bloque_bloqueado_dia
      ORDER BY dia_semana, id_bloque
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error bloques bloqueados:", error);
    res.status(500).json({ message: "Error obtener bloqueos" });
  }
};
