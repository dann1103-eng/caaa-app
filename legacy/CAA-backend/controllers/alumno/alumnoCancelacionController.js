const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const { puedeAccederVuelo } = require("../../utils/ownership");
const {
  getEstadoCancelaciones, AHORA_SV, salidaVueloSQL, seriaEmergenciaSQL, esEmergenciaSQL,
  comoInstanteSQL, adjuntosJSONSQL, guardarConstancias, borrarDeStorage,
} = require("../../services/cancelacionService");
const { problemaDeConstancias } = require("../../utils/constancias");
const { storageDisponible } = require("../../utils/storage");
const { notificarUsuario } = require("../../utils/notificaciones");
const { notificarUsuarios } = require("../../utils/webpush");

// Los estados en los que la pantalla del alumno ofrece cancelar
// (MiHorarioList.jsx). Acá se exigen, no solo se muestran.
const ESTADOS_CANCELABLES = ["PUBLICADO", "AJUSTADO", "PROGRAMADO", "EN_ESPERA_TRAMO"];

// Candado de aviso por alumno (4711 es el de la firma de la vouchera). Impide
// dos envíos simultáneos del mismo alumno —dos pestañas, doble toque—: sin él
// los dos pasan el límite de 1 por semana, y la subida de archivos alarga esa
// ventana de milisegundos a segundos. Es de aviso porque no hay una fila que
// bloquear: la solicitud todavía no existe.
//
// Se PRUEBA, no se espera (pg_try_...): el que lo tiene puede estar subiendo
// archivos hasta 45 s con la transacción abierta, y cada envío que se quedara
// esperándolo retendría una conexión del pool (son 10 para toda la app). El
// segundo recibe un 409 enseguida.
const CANDADO_SOLICITUD = 4712;

// La solicitud y sus constancias entran en UN solo pedido y una sola
// transacción.
//
// Con margen (24 h o más para la salida) la constancia es opcional y una falla
// de Storage nunca tumba la cancelación: se crea igual y la respuesta lo avisa.
//
// Con menos de 24 h es una cancelación de EMERGENCIA y la constancia es
// requisito (condición 2 de las que acepta el alumno; decisión de Daniel del
// 2026-10-06): sin al menos una constancia guardada no se crea nada. Por eso ya
// no son dos pedidos —crear y después subir—: así una emergencia podía quedar
// creada y sin respaldo.
exports.solicitarCancelacion = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;

  const motivo = String(req.body?.motivo ?? "").trim();
  if (!motivo) return res.status(400).json({ message: "Escribí el motivo de la cancelación." });
  const archivos = req.files || [];
  const problema = problemaDeConstancias(archivos);
  if (problema) return res.status(400).json({ message: problema });

  const client = await db.connect();
  // Rutas que se intentó subir a Storage: lo que hay que limpiar si no hay COMMIT.
  const intentadas = [];
  const rechazar = async (status, cuerpo) => {
    await client.query("ROLLBACK");
    return res.status(status).json(cuerpo);
  };
  try {
    await client.query("BEGIN");

    // Si es emergencia se decide ACÁ ADENTRO: NOW() es constante dentro de la
    // transacción, así que esta validación y el `creado_en` que se guarda más
    // abajo usan el mismo instante. Con la validación afuera, una solicitud
    // enviada justo al cruzar las 24 h pasaba como "con margen" y quedaba
    // guardada como emergencia sin constancia.
    const alumnoRes = await client.query(`
      SELECT a.id_alumno, u.nombre, u.apellido,
             v.estado AS vuelo_estado, ae.codigo AS aeronave_codigo,
             to_char(${salidaVueloSQL("v", "b")}, 'DD/MM HH24:MI') AS salida_txt,
             (${salidaVueloSQL("v", "b")} <= ${AHORA_SV}) AS ya_salio,
             ${seriaEmergenciaSQL("v", "b")} AS es_emergencia
      FROM alumno a
      JOIN usuario u ON u.id_usuario = a.id_usuario
      JOIN vuelo v ON v.id_vuelo = $2
      JOIN bloque_horario b ON b.id_bloque = v.id_bloque
      JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
      WHERE a.id_usuario = $1
    `, [req.user.id_usuario, id_vuelo]);
    if (alumnoRes.rows.length === 0) {
      return await rechazar(404, { message: "No se encontró tu ficha de alumno." });
    }
    const al = alumnoRes.rows[0];
    const idAlumno = al.id_alumno;
    const esEmergencia = al.es_emergencia === true;

    const candado = await client.query(`SELECT pg_try_advisory_xact_lock(${CANDADO_SOLICITUD}, $1::int) AS libre`, [idAlumno]);
    if (!candado.rows[0].libre) {
      return await rechazar(409, { message: "Ya se está enviando otra solicitud de cancelación tuya. Esperá un momento y revisá \"Mis cancelaciones\"." });
    }

    if (!ESTADOS_CANCELABLES.includes(al.vuelo_estado)) {
      return await rechazar(400, { message: "Este vuelo ya no se puede cancelar desde la app. Si necesitás ayuda, avisá a Programación o a Turno." });
    }
    if (al.ya_salio) {
      return await rechazar(400, { message: "La hora de salida de este vuelo ya pasó: no se puede pedir la cancelación desde la app. Avisá a Turno." });
    }
    if (esEmergencia && archivos.length === 0) {
      return await rechazar(400, {
        codigo: "CONSTANCIA_REQUERIDA",
        message: "Faltan menos de 24 horas para el vuelo: es una cancelación de emergencia y necesita al menos una constancia (foto o PDF). Si no ves dónde adjuntarla, recargá la página.",
      });
    }
    if (esEmergencia && !storageDisponible()) {
      return await rechazar(503, { message: "En este momento no se pueden recibir constancias, y una cancelación de emergencia la necesita. Avisá a Programación o a Turno por otro medio." });
    }

    // Límite duro: solo 1 cancelación por semana. Si ya hay una vigente
    // (PENDIENTE/ACEPTADA) para un vuelo de la MISMA semana → 409.
    const semRes = await client.query(`
      SELECT 1
        FROM solicitud_cancelacion sc
        JOIN vuelo v  ON v.id_vuelo = sc.id_vuelo
        JOIN vuelo vt ON vt.id_vuelo = $2
       WHERE sc.id_alumno = $1
         AND sc.estado IN ('PENDIENTE','ACEPTADA')
         AND v.id_semana = vt.id_semana
       LIMIT 1
    `, [idAlumno, id_vuelo]);
    if (semRes.rows.length > 0) {
      return await rechazar(409, { message: "Ya tenés una cancelación esta semana. Solo se permite 1 por semana." });
    }

    // Estado de cancelaciones ANTES de insertar → decide multa (mensual/racha).
    const estado = await getEstadoCancelaciones(idAlumno, id_vuelo, client);
    const tieneMulta = estado.proxima_tiene_multa;
    const montoMulta = estado.monto;

    // `creado_en` explícito y con la zona fijada: es la mitad de la cuenta de la
    // emergencia, y el DEFAULT now() lo dejaba a merced de la zona de la sesión.
    const insRes = await client.query(`
      INSERT INTO solicitud_cancelacion (id_vuelo, id_alumno, motivo, estado, tiene_multa, monto_multa, creado_en)
      VALUES ($1, $2, $3, 'PENDIENTE', $4, $5, ${AHORA_SV})
      RETURNING id_solicitud_cancelacion
    `, [id_vuelo, idAlumno, motivo, tieneMulta, montoMulta]);
    const idSolicitudCancelacion = insRes.rows[0].id_solicitud_cancelacion;

    let adjuntos = [];
    let avisoAdjuntos = null;
    if (archivos.length > 0) {
      if (!storageDisponible()) {
        // Solo se llega acá con margen: la emergencia sin Storage ya se rechazó.
        avisoAdjuntos = "No se pudieron guardar las constancias: el almacenamiento de archivos no está disponible.";
      } else {
        const r = await guardarConstancias(client, {
          id_solicitud: idSolicitudCancelacion, archivos, id_usuario: req.user.id_usuario, intentadas,
        });
        adjuntos = r.guardadas;
        if (r.fallo) {
          console.error("[cancelacion] no subió una constancia:", r.fallo.message);
          // La regla es "al menos una": si alguna quedó guardada, la emergencia
          // está respaldada y se envía avisando de la que faltó.
          if (esEmergencia && adjuntos.length === 0) {
            const e = new Error("Ninguna constancia de la emergencia se pudo guardar");
            e.esFallaDeConstancia = true;
            throw e;
          }
          avisoAdjuntos = adjuntos.length > 0
            ? `Se guardaron ${adjuntos.length} de ${archivos.length} constancias; el resto no se pudo subir. Podés agregarlas desde "Mis cancelaciones".`
            : `No se pudieron subir las constancias. Podés agregarlas desde "Mis cancelaciones".`;
        }
      }
    }

    await logAuditoria(client, {
      accion: "SOLICITAR_CANCELACION", entidad: "vuelo", id_entidad: id_vuelo, actor: req.user, req,
      descripcion: `Alumno solicitó cancelación${esEmergencia ? " de EMERGENCIA" : ""}${tieneMulta ? ` (multa ${estado.motivo})` : ""}${adjuntos.length ? ` con ${adjuntos.length} constancia(s)` : ""}`,
    });
    await client.query("COMMIT");
    // Ya confirmadas: un error de acá en adelante no debe borrar de Storage
    // archivos que la base ya tiene registrados.
    intentadas.length = 0;

    // Avisar a quien resuelve estas solicitudes: en vivo (socket, badge del
    // sidebar de ADMIN y auto-refresh de la pantalla de Cancelaciones) +
    // in-app/push a los "jefes de pilotos" (instructor con puede_programar,
    // que antes no se enteraban de nada). Best-effort: nunca debe tumbar la
    // solicitud ya guardada.
    (async () => {
      try {
        const io = req.app.get("io");
        if (io) io.emit("nueva_solicitud_cancelacion", { id_vuelo: Number(id_vuelo), es_emergencia: esEmergencia });

        const nombreAlumno = `${al.nombre || ""} ${al.apellido || ""}`.trim() || "Un alumno";
        const mensaje = `${esEmergencia ? "EMERGENCIA: " : ""}${nombreAlumno} pidió cancelar su vuelo del ${al.salida_txt || ""} (${al.aeronave_codigo || ""})`.trim();

        const jefes = await db.query(`
          SELECT ins.id_usuario
          FROM instructor ins
          JOIN usuario u ON u.id_usuario = ins.id_usuario
          WHERE ins.puede_programar = true AND ins.activo = true AND u.activo = true
        `);
        const idsJefes = jefes.rows.map((r) => r.id_usuario);
        for (const id_usuario of idsJefes) {
          notificarUsuario(null, id_usuario, { tipo: "CANCELACION", mensaje, enlace: "/programacion/cancelaciones" }).catch(() => {});
        }
        notificarUsuarios(idsJefes, {
          title: esEmergencia ? "🚨 Cancelación de EMERGENCIA" : "🚫 Nueva solicitud de cancelación",
          body: mensaje,
          url: "/programacion/cancelaciones",
          tag: "cancelacion",
        }).catch(() => {});
      } catch (e) {
        console.error("[cancelacion] notificar jefes de pilotos:", e.message);
      }
    })();

    res.json({
      message: "Solicitud enviada correctamente",
      id_solicitud_cancelacion: idSolicitudCancelacion,
      es_emergencia: esEmergencia,
      adjuntos,
      aviso_adjuntos: avisoAdjuntos,
      tiene_multa: tieneMulta, monto_multa: montoMulta, motivo: estado.motivo,
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    // Lo que se llegó a subir se borra por su ruta exacta. No se espera: es
    // best-effort y no tiene que demorar la respuesta.
    borrarDeStorage([...intentadas]);
    if (e.esFallaDeConstancia) {
      return res.status(502).json({ message: "No se pudo guardar la constancia y una cancelación de emergencia la necesita: tu solicitud NO se envió. Revisá tu conexión y probá de nuevo; si sigue fallando, avisá a Programación o a Turno." });
    }
    throw e;
  } finally {
    client.release();
  }
});

exports.getMisSolicitudesCancelacion = catchAsync(async (req, res) => {
  // Columnas explícitas (antes sc.*): las horas van como instantes reales y la
  // del vuelo no venía, así que la pantalla mostraba "Invalid Date".
  const result = await db.query(`
    SELECT sc.id_solicitud_cancelacion, sc.id_vuelo, sc.motivo, sc.estado,
           sc.tiene_multa, sc.monto_multa,
           ${comoInstanteSQL("sc.creado_en")} AS creado_en,
           ${comoInstanteSQL(salidaVueloSQL("v", "b"))} AS fecha_hora_vuelo,
           ${esEmergenciaSQL("sc", "v", "b")} AS es_emergencia,
           ${adjuntosJSONSQL("sc")} AS adjuntos,
           v.dia_semana, a.codigo AS aeronave_codigo
    FROM solicitud_cancelacion sc
    JOIN vuelo v ON v.id_vuelo = sc.id_vuelo
    JOIN bloque_horario b ON b.id_bloque = v.id_bloque
    JOIN aeronave a ON a.id_aeronave = v.id_aeronave
    JOIN alumno al ON al.id_alumno = sc.id_alumno
    WHERE al.id_usuario = $1
    ORDER BY sc.creado_en DESC
  `, [req.user.id_usuario]);
  res.json(result.rows);
});

exports.quitarSolicitudCancelacion = catchAsync(async (req, res) => {
  const { id_solicitud_cancelacion } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const reqRes = await client.query(`SELECT id_alumno, estado FROM solicitud_cancelacion WHERE id_solicitud_cancelacion = $1 FOR UPDATE`, [id_solicitud_cancelacion]);
    if (reqRes.rows.length === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Solicitud no encontrada" }); }

    // IDOR: la solicitud debe pertenecer al alumno autenticado.
    const propRes = await client.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [req.user.id_usuario]);
    const idAlumnoPropio = propRes.rows[0]?.id_alumno;
    if (!idAlumnoPropio || reqRes.rows[0].id_alumno !== idAlumnoPropio) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No tenés acceso a esta solicitud" });
    }

    if (reqRes.rows[0].estado !== 'PENDIENTE') { await client.query("ROLLBACK"); return res.status(400).json({ message: "Solo podés quitar solicitudes PENDIENTES" }); }

    // El DELETE arrastra las filas de sus constancias (ON DELETE CASCADE), pero
    // los archivos quedaban huérfanos en Storage — y son constancias médicas.
    // Se juntan las rutas antes y se borran después del COMMIT.
    const rutasRes = await client.query(`SELECT archivo_path FROM solicitud_cancelacion_adjunto WHERE id_solicitud_cancelacion = $1`, [id_solicitud_cancelacion]);
    const rutas = rutasRes.rows.map((r) => r.archivo_path);

    await client.query(`DELETE FROM solicitud_cancelacion WHERE id_solicitud_cancelacion = $1`, [id_solicitud_cancelacion]);
    await logAuditoria(client, { accion: "QUITAR_SOLICITUD_CANCELACION", entidad: "solicitud_cancelacion", id_entidad: id_solicitud_cancelacion, actor: req.user, req, descripcion: "Alumno quitó solicitud" });
    await client.query("COMMIT");

    borrarDeStorage(rutas); // best-effort, por ruta exacta
    res.json({ message: "Solicitud eliminada correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
