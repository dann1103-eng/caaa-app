// Constancias adjuntas a una solicitud de cancelación (imágenes o PDF que el
// alumno sube para respaldar su motivo), una vez que la solicitud ya existe:
// agregar más, verlas y quitarlas.
//
// Las que acompañan el envío entran con la solicitud, en el mismo pedido (ver
// alumnoCancelacionController.solicitarCancelacion). En una cancelación de
// EMERGENCIA —pedida con menos de 24 h para la salida— son requisito, y por eso
// acá no se deja quitar la última.
//
// Se reusa el bucket `documentos-alumno`, que ya existe y acepta pdf/jpeg/png;
// los objetos van bajo el prefijo cancelaciones/<id_solicitud>/.

const db = require("../config/db");
const catchAsync = require("../utils/catchAsync");
const { logAuditoria } = require("../utils/auditoria");
const { urlFirmada, borrarArchivo, storageDisponible, BUCKETS } = require("../utils/storage");
const { problemaDeConstancias } = require("../utils/constancias");
const {
  esEmergenciaSQL, subirConstancias, registrarConstancias, borrarDeStorage,
} = require("../services/cancelacionService");

/** El id_alumno del usuario autenticado, o null si no tiene ficha. */
async function idAlumnoDe(conn, id_usuario) {
  const r = await conn.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [id_usuario]);
  return r.rows[0]?.id_alumno ?? null;
}

/**
 * Carga la solicitud y verifica que sea del alumno autenticado (IDOR: mismo
 * criterio que quitarSolicitudCancelacion). Devuelve null y ya respondió si no.
 */
async function solicitudPropia(req, res, id_solicitud_cancelacion) {
  const r = await db.query(
    `SELECT id_solicitud_cancelacion, id_alumno, estado
       FROM solicitud_cancelacion WHERE id_solicitud_cancelacion = $1`,
    [id_solicitud_cancelacion]
  );
  if (r.rows.length === 0) { res.status(404).json({ message: "Solicitud no encontrada" }); return null; }
  const propio = await idAlumnoDe(db, req.user.id_usuario);
  if (!propio || r.rows[0].id_alumno !== propio) {
    res.status(403).json({ message: "No tenés acceso a esta solicitud" });
    return null;
  }
  return r.rows[0];
}

// ── POST /alumno/solicitudes-cancelacion/:id/adjuntos ───────────────────────
exports.subirAdjuntos = catchAsync(async (req, res) => {
  const { id_solicitud_cancelacion } = req.params;
  const sol = await solicitudPropia(req, res, id_solicitud_cancelacion);
  if (!sol) return;
  if (sol.estado !== "PENDIENTE") {
    return res.status(400).json({ message: "La solicitud ya fue resuelta: no se le pueden agregar constancias." });
  }
  const archivos = req.files || [];
  if (archivos.length === 0) return res.status(400).json({ message: "No llegó ningún archivo." });
  if (!storageDisponible()) {
    return res.status(503).json({ message: "En este momento no se pueden recibir constancias. Probá más tarde o avisá a Programación." });
  }

  const cuantasHay = async (conn) => (await conn.query(
    `SELECT COUNT(*)::int AS n FROM solicitud_cancelacion_adjunto WHERE id_solicitud_cancelacion = $1`,
    [id_solicitud_cancelacion]
  )).rows[0].n;
  const problema = problemaDeConstancias(archivos, { yaHay: await cuantasHay(db) });
  if (problema) return res.status(400).json({ message: problema });

  // 1) Subir, SIN transacción abierta: puede tardar, y mientras tanto no tiene
  //    que retener una conexión del pool ni un bloqueo sobre la solicitud.
  const intentadas = [];
  const { subidas, fallo } = await subirConstancias({ id_solicitud: id_solicitud_cancelacion, archivos, intentadas });
  if (fallo) console.error("[cancelacion] no subió una constancia:", fallo.message);
  if (subidas.length === 0) {
    return res.status(502).json({ message: "No se pudieron subir las constancias. Revisá tu conexión y probá de nuevo." });
  }

  // 2) Registrar lo subido en una transacción corta: o quedan todas las filas o
  //    ninguna. Antes los INSERT iban uno por uno en autocommit; si el segundo
  //    fallaba, el primero ya estaba guardado y la limpieza le borraba el archivo.
  //    La solicitud se bloquea para que lo que se validó arriba siga valiendo:
  //    mientras se subía pudo resolverse, o pudo entrar otro agregado.
  const client = await db.connect();
  let guardadas;
  try {
    await client.query("BEGIN");
    const ahora = await client.query(
      `SELECT estado FROM solicitud_cancelacion WHERE id_solicitud_cancelacion = $1 FOR UPDATE`,
      [id_solicitud_cancelacion]
    );
    const rechazo =
      ahora.rows.length === 0 ? [404, "Solicitud no encontrada"]
      : ahora.rows[0].estado !== "PENDIENTE" ? [400, "La solicitud ya fue resuelta: no se le pueden agregar constancias."]
      : null;
    const yaNoCaben = rechazo ? null : problemaDeConstancias(subidas.map((s) => s.archivo), { yaHay: await cuantasHay(client) });
    if (rechazo || yaNoCaben) {
      await client.query("ROLLBACK");
      borrarDeStorage([...intentadas]);
      return res.status(rechazo ? rechazo[0] : 400).json({ message: rechazo ? rechazo[1] : yaNoCaben });
    }
    guardadas = await registrarConstancias(client, {
      id_solicitud: id_solicitud_cancelacion, subidas, id_usuario: req.user.id_usuario,
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    // Ninguna fila quedó confirmada, así que todo lo subido sobra.
    borrarDeStorage([...intentadas]);
    throw e;
  } finally {
    client.release();
  }

  await logAuditoria(db, {
    accion: "OTRO", entidad: "solicitud_cancelacion", id_entidad: Number(id_solicitud_cancelacion),
    actor: req.user, req, descripcion: `Alumno adjuntó ${guardadas.length} constancia(s) a su solicitud de cancelación`,
  }).catch(() => {});

  res.json({
    message: `${guardadas.length} constancia(s) adjuntada(s)`,
    adjuntos: guardadas,
    aviso_adjuntos: fallo ? `Se guardaron ${guardadas.length} de ${archivos.length}; el resto no se pudo subir.` : null,
  });
});

// ── GET /alumno/solicitudes-cancelacion/:id/adjuntos ────────────────────────
exports.listarMisAdjuntos = catchAsync(async (req, res) => {
  const { id_solicitud_cancelacion } = req.params;
  const sol = await solicitudPropia(req, res, id_solicitud_cancelacion);
  if (!sol) return;
  const r = await db.query(
    `SELECT id_adjunto, nombre_archivo, content_type, tamano_bytes,
            to_char(subido_en, 'YYYY-MM-DD HH24:MI') AS subido_en
       FROM solicitud_cancelacion_adjunto
      WHERE id_solicitud_cancelacion = $1 ORDER BY id_adjunto`,
    [id_solicitud_cancelacion]
  );
  res.json(r.rows);
});

// ── DELETE /alumno/adjuntos-cancelacion/:id_adjunto ─────────────────────────
exports.borrarMiAdjunto = catchAsync(async (req, res) => {
  const { id_adjunto } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // FOR UPDATE OF s: la SOLICITUD queda bloqueada mientras se cuenta y se
    // borra. Sin eso, dos borrados simultáneos sobre una emergencia con dos
    // constancias verían "quedan 2" los dos y la dejarían sin ninguna.
    const r = await client.query(
      `SELECT a.id_adjunto, a.archivo_path, s.id_solicitud_cancelacion, s.id_alumno, s.estado,
              ${esEmergenciaSQL("s", "v", "b")} AS es_emergencia
         FROM solicitud_cancelacion_adjunto a
         JOIN solicitud_cancelacion s ON s.id_solicitud_cancelacion = a.id_solicitud_cancelacion
         JOIN vuelo v ON v.id_vuelo = s.id_vuelo
         JOIN bloque_horario b ON b.id_bloque = v.id_bloque
        WHERE a.id_adjunto = $1
          FOR UPDATE OF s`,
      [id_adjunto]
    );
    const rechazar = async (status, message) => { await client.query("ROLLBACK"); return res.status(status).json({ message }); };
    if (r.rows.length === 0) return await rechazar(404, "Constancia no encontrada");
    const fila = r.rows[0];
    const propio = await idAlumnoDe(client, req.user.id_usuario);
    if (!propio || fila.id_alumno !== propio) return await rechazar(403, "No tenés acceso a esta constancia");
    if (fila.estado !== "PENDIENTE") return await rechazar(400, "La solicitud ya fue resuelta: la constancia queda como respaldo.");

    if (fila.es_emergencia) {
      const cuantas = await client.query(
        `SELECT COUNT(*)::int AS n FROM solicitud_cancelacion_adjunto WHERE id_solicitud_cancelacion = $1`,
        [fila.id_solicitud_cancelacion]
      );
      if (cuantas.rows[0].n <= 1) {
        return await rechazar(400, "Una cancelación de emergencia necesita al menos una constancia. Agregá la nueva antes de quitar esta.");
      }
    }

    await client.query(`DELETE FROM solicitud_cancelacion_adjunto WHERE id_adjunto = $1`, [id_adjunto]);
    await client.query("COMMIT");
    await borrarArchivo(BUCKETS.DOCUMENTOS, fila.archivo_path); // best-effort
    res.json({ message: "Constancia eliminada" });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});

// ── GET .../adjuntos-cancelacion/:id_adjunto/url ────────────────────────────
// Sirve al alumno dueño y a quien resuelve las solicitudes. `soloPropio`
// distingue: en la ruta del alumno se exige pertenencia; en la de staff no, y
// el permiso lo pone el middleware de la ruta (el MISMO adminAccess que ya
// gobierna /solicitudes-cancelacion, así que no se abre audiencia nueva).
const urlDeAdjunto = (soloPropio) => catchAsync(async (req, res) => {
  const { id_adjunto } = req.params;
  const r = await db.query(
    `SELECT a.archivo_path, a.nombre_archivo, a.content_type, s.id_alumno
       FROM solicitud_cancelacion_adjunto a
       JOIN solicitud_cancelacion s ON s.id_solicitud_cancelacion = a.id_solicitud_cancelacion
      WHERE a.id_adjunto = $1`,
    [id_adjunto]
  );
  if (r.rows.length === 0) return res.status(404).json({ message: "Constancia no encontrada" });
  if (soloPropio) {
    const propio = await idAlumnoDe(db, req.user.id_usuario);
    if (!propio || r.rows[0].id_alumno !== propio) return res.status(403).json({ message: "No tenés acceso a esta constancia" });
  }
  const url = await urlFirmada(BUCKETS.DOCUMENTOS, r.rows[0].archivo_path, 3600);
  res.json({ url, nombre_archivo: r.rows[0].nombre_archivo, content_type: r.rows[0].content_type });
});

exports.urlMiAdjunto = urlDeAdjunto(true);
exports.urlAdjuntoStaff = urlDeAdjunto(false);
