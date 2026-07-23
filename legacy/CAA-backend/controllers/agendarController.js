const db = require("../config/db");
const catchAsync = require("../utils/catchAsync");
const { DateTime } = require("luxon");
const { verificarSaldoSuficiente, getSaldoAlumno, estimarCostoVuelos } = require("../utils/saldoHelper");
const { mantenimientoCubreFechaSQL, soloFecha } = require("../utils/mantenimientoUtils");

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
 * aeronaves (un extracurricular puede usar cualquier avión/simulador, no solo
 * los de su licencia).
 *
 * Antes filtraba `WHERE activa = true` — `activa` es "disponible HOY", no
 * "no dada de baja", así que un avión en mantenimiento desaparecía por
 * completo de este selector (bloqueo real, por omisión) mientras que el modo
 * normal (getAeronavesPermitidas) ya lo mostraba con advertencia desde
 * b23434f. Mismo criterio acá: solo se excluyen los dados de baja.
 */
exports.getExtracurricularInfo = catchAsync(async (req, res) => {
  const a = await db.query("SELECT id_alumno FROM alumno WHERE id_usuario = $1", [req.user.id_usuario]);
  if (a.rows.length === 0) return res.status(404).json({ message: "Alumno no encontrado" });
  const habilitado = await alumnoCompletoHorasLicencia(db, a.rows[0].id_alumno);
  const aeronaves = await db.query(`
    WITH sem AS (
      SELECT fecha_inicio
        FROM semana_vuelo
       WHERE fecha_inicio > CURRENT_DATE
       ORDER BY fecha_inicio
       LIMIT 1
    )
    SELECT
      a.id_aeronave, a.codigo, a.modelo, a.tipo,
      mact.id_mantenimiento IS NOT NULL AS en_mantenimiento,
      mact.fecha_fin::date              AS mantenimiento_hasta,
      COALESCE((
        SELECT array_agg(d ORDER BY d)
          FROM generate_series(1, 6) AS d
         WHERE EXISTS (
           SELECT 1 FROM mantenimiento_aeronave m
            WHERE m.id_aeronave = a.id_aeronave
              AND ${mantenimientoCubreFechaSQL("((SELECT fecha_inicio FROM sem) + (d - 1))")}
         )
      ), '{}') AS dias_bloqueados
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

  // Se devuelven TODAS las aeronaves de su licencia, incluidas las que hoy están en
  // el taller, con el detalle de su mantenimiento. Antes se filtraba por
  // `a.activa = true`, y eso mezclaba dos cosas distintas: `activa` significa
  // "disponible HOY", pero el alumno pide horas para la SEMANA QUE VIENE. Un avión
  // que vuelve el lunes desaparecía de su lista por completo, sin explicación — y
  // el alumno ni sabía que su licencia lo habilitaba.
  //
  // Ahora la lista es informativa (qué aviones te corresponden y cuáles están fuera
  // y hasta cuándo) y el freno real vive en guardarSolicitud, que valida contra la
  // FECHA pedida. Los aviones dados de baja (activa=false con estado='ACTIVO') sí
  // se excluyen: esos no vuelven.
  // `dias_bloqueados` sale calculado del backend a propósito: es exactamente el
  // mismo criterio (mantenimientoCubreFechaSQL) y la misma semana que va a usar
  // guardarSolicitud para aceptar o rechazar. Si el front hiciera esa matemática de
  // fechas por su cuenta, tarde o temprano se desincronizaría del gate real y le
  // ofrecería al alumno un día que después le rebota.
  const aeronavesRes = await db.query(
    `
    WITH sem AS (
      SELECT fecha_inicio
        FROM semana_vuelo
       WHERE fecha_inicio > CURRENT_DATE
       ORDER BY fecha_inicio
       LIMIT 1
    )
    SELECT
      a.id_aeronave,
      a.codigo,
      a.modelo,
      a.tipo,
      mact.id_mantenimiento IS NOT NULL                        AS en_mantenimiento,
      COALESCE(mact.fecha_inicio::date, mact.fecha_programada) AS mantenimiento_desde,
      mact.fecha_fin::date                                     AS mantenimiento_hasta,
      mact.tipo                                                AS mantenimiento_tipo,
      COALESCE((
        SELECT array_agg(d ORDER BY d)
          FROM generate_series(1, 6) AS d
         WHERE EXISTS (
           -- El alias TIENE que ser 'm': mantenimientoCubreFechaSQL lo hardcodea
           -- (devuelve texto con "m.completado", "m.fecha_fin", etc.). Por eso el
           -- LATERAL de acá abajo se llama 'mact' y no 'm'.
           SELECT 1 FROM mantenimiento_aeronave m
            WHERE m.id_aeronave = a.id_aeronave
              AND ${mantenimientoCubreFechaSQL("((SELECT fecha_inicio FROM sem) + (d - 1))")}
         )
      ), '{}') AS dias_bloqueados
    FROM licencia_aeronave la
    JOIN aeronave a ON a.id_aeronave = la.id_aeronave
    LEFT JOIN LATERAL (
      SELECT m2.id_mantenimiento, m2.fecha_inicio, m2.fecha_programada, m2.fecha_fin, m2.tipo
        FROM mantenimiento_aeronave m2
       WHERE m2.id_aeronave = a.id_aeronave
         AND m2.completado = false
         AND COALESCE(m2.estado, '') <> 'CANCELADO'
       ORDER BY m2.fecha_fin IS NULL DESC, m2.fecha_fin DESC
       LIMIT 1
    ) mact ON true
    WHERE la.id_licencia = $1
      AND NOT (a.activa = false AND a.estado = 'ACTIVO')
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
      "SELECT id_alumno, limite_vuelos_avion, limite_vuelos_simulador, limite_vuelos_dia FROM alumno WHERE id_usuario = $1",
      [user.id_usuario]
    );
    if (alumnoRes.rows.length === 0) return res.json(null);

    const defLimAvion = alumnoRes.rows[0].limite_vuelos_avion ?? 3;
    const defLimSim = alumnoRes.rows[0].limite_vuelos_simulador ?? 3;
    // Sin override por semana: el tope por día es siempre el del alumno.
    const limDia = alumnoRes.rows[0].limite_vuelos_dia ?? 1;
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
      SELECT id_solicitud, estado, comentario_alumno,
             COALESCE(limite_vuelos_avion, $1) AS limite_vuelos_avion,
             COALESCE(limite_vuelos_simulador, $2) AS limite_vuelos_simulador
      FROM solicitud_semana
      WHERE id_alumno = $3 AND id_semana = $4
      `,
      [defLimAvion, defLimSim, idAlumno, idSemana]
    );

    // Saldo del alumno + costo estimado de lo que tiene pedido, para que la
    // página de Agendar muestre la advertencia de saldo bajo (no bloquea).
    let saldo = null;
    try { saldo = await getSaldoAlumno(idAlumno); } catch (_) {}

    if (solicitudRes.rows.length === 0) {
      return res.json({
        estado: "BORRADOR",
        limite_vuelos_avion: defLimAvion,
        limite_vuelos_simulador: defLimSim,
        limite_vuelos_dia: limDia,
        comentario_alumno: "",
        vuelos: [],
        saldo,
        costo_estimado: 0
      });
    }

    const { id_solicitud, estado, comentario_alumno, limite_vuelos_avion, limite_vuelos_simulador } = solicitudRes.rows[0];

    const vuelosRes = await db.query(
      `
      SELECT dia_semana, id_bloque, id_aeronave, estado, tipo_vuelo, id_bloque_fin, es_extracurricular
      FROM solicitud_vuelo
      WHERE id_solicitud = $1 AND (estado IS NULL OR estado != 'RECHAZADA')
      `,
      [id_solicitud]
    );

    let costo_estimado = 0;
    try { costo_estimado = await estimarCostoVuelos(vuelosRes.rows, new Date(), db, idAlumno); } catch (_) {}

    res.json({ estado, limite_vuelos_avion, limite_vuelos_simulador, limite_vuelos_dia: limDia, comentario_alumno: comentario_alumno || "", vuelos: vuelosRes.rows, saldo, costo_estimado });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error obtener solicitudes" });
  }
};

exports.guardarSolicitud = async (req, res) => {
  const client = await db.connect();
  try {
    const user = req.user;
    const { vuelos, comentario, forzar_saldo } = req.body;
    const { week } = req.query;
    // Comentario del alumno para su instructor (opcional, se recorta a 500).
    const comentarioNorm = (comentario == null) ? null : String(comentario).trim().slice(0, 500) || null;

    console.log("guardarSolicitud Payload Vuelos:", vuelos);

    if (week !== "next") {
      return res.status(400).json({ message: "Solo se permite la semana siguiente" });
    }

    if (!Array.isArray(vuelos)) {
      return res.status(400).json({ message: "Formato de vuelos inválido" });
    }

    const alumnoRes = await client.query(
      `SELECT a.id_alumno, a.id_licencia, l.dia_apertura_agenda, a.limite_vuelos_avion, a.limite_vuelos_simulador,
              a.limite_vuelos_dia
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
    // Tope de aviones por día. Era la constante 1; ahora es por alumno.
    const limDia = alumnoRes.rows[0].limite_vuelos_dia ?? 1;

    // --- Validación de Saldo (Módulo Administración) ---
    // Si el costo estimado supera el saldo prepagado, se responde 403 con
    // saldo_insuficiente para que el frontend muestre la ADVERTENCIA — pero el
    // alumno puede FORZAR el agendado reintentando con forzar_saldo=true
    // (decisión de Daniel: cubre el caso "deposito el fin de semana pero
    // necesito los vuelos de la próxima"). No es un bloqueo duro.
    try {
      const chk = await verificarSaldoSuficiente(id_alumno, vuelos);
      if (!chk.ok && !forzar_saldo) {
        return res.status(403).json({
          message: chk.mensaje,
          saldo_insuficiente: true,
          forzable: true,
          saldo: chk.saldo,
          costo_estimado: chk.costo_estimado
        });
      }
      if (!chk.ok && forzar_saldo) {
        console.log(`[saldo] alumno ${id_alumno} forzó agendado con saldo bajo (saldo $${chk.saldo}, costo est. $${chk.costo_estimado})`);
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
      SELECT id_semana, publicada, fecha_inicio
      FROM semana_vuelo
      WHERE fecha_inicio > CURRENT_DATE
      ORDER BY fecha_inicio
      LIMIT 1
    `);

    if (semanaRes.rows.length === 0) {
      return res.status(400).json({ message: "Semana no encontrada" });
    }

    const { id_semana, publicada, fecha_inicio: fechaInicioSemana } = semanaRes.rows[0];
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
    await client.query(
      "UPDATE solicitud_semana SET estado = 'BORRADOR', comentario_alumno = $2, fecha_actualizacion = now() WHERE id_solicitud = $1",
      [id_solicitud, comentarioNorm]
    );

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
      // Los extracurriculares no cuentan al límite semanal ni al tope por día.
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

    const conflictoDia = Object.entries(avionesPorDia).find(([, c]) => c > limDia);
    if (conflictoDia) {
      await client.query("ROLLBACK");
      const dNombres = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const plural = limDia === 1 ? "1 avión" : `${limDia} aviones`;
      return res.status(400).json({
        message: `Solo puedes agendar ${plural} por día. El ${dNombres[Number(conflictoDia[0])]} tienes ${conflictoDia[1]} aviones seleccionados.`
      });
    }

    await client.query("DELETE FROM solicitud_vuelo WHERE id_solicitud = $1", [id_solicitud]);

    // Mantenimiento ya NO bloquea el guardado (pedido explícito): cada choque
    // se acumula acá como advertencia y viaja en la respuesta de éxito.
    const advertencias = [];

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

      // Mantenimiento, validado contra la FECHA PEDIDA (no contra hoy). Antes acá
      // no había ningún chequeo de mantenimiento: el único freno era que el picker
      // escondiera los aviones con activa=false, lo que bloqueaba de más (un avión
      // que vuelve el lunes no se podía pedir para el martes) y a la vez de menos
      // (nada impedía guardar un avión que estará en el taller justo ese día).
      // Este es ahora el freno real, y es el mismo criterio date-aware que ya usa
      // programacionController para el staff.
      const mantRes = await client.query(
        `SELECT a.codigo, ($1::date + ($2::int - 1)) AS fecha_slot,
                (SELECT MIN(m.fecha_fin::date) FROM mantenimiento_aeronave m
                  WHERE m.id_aeronave = a.id_aeronave
                    AND ${mantenimientoCubreFechaSQL("($1::date + ($2::int - 1))")}) AS hasta
           FROM aeronave a
          WHERE a.id_aeronave = $3
            AND EXISTS (SELECT 1 FROM mantenimiento_aeronave m
                         WHERE m.id_aeronave = a.id_aeronave
                           AND ${mantenimientoCubreFechaSQL("($1::date + ($2::int - 1))")})`,
        [fechaInicioSemana, v.dia_semana, v.id_aeronave]
      );
      if (mantRes.rows.length > 0) {
        const { codigo, fecha_slot, hasta } = mantRes.rows[0];
        advertencias.push(
          `${codigo} está en mantenimiento el ${soloFecha(fecha_slot)}` +
          (hasta ? ` (vuelve el ${soloFecha(hasta)}).` : " (sin fecha de regreso todavía).")
        );
      }

      await client.query(
        `INSERT INTO solicitud_vuelo (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, es_extracurricular) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id_solicitud, id_semana, v.dia_semana, v.id_bloque, v.id_aeronave, v.tipo_vuelo || 'LOCAL', v.id_bloque_fin || v.id_bloque, v.es_extracurricular === true]
      );
    }

    await client.query("COMMIT");
    res.json({
      message: "Solicitud guardada correctamente",
      advertencias: advertencias.length > 0 ? advertencias : undefined,
    });

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
