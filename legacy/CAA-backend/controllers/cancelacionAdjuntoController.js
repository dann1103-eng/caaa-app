// Constancias adjuntas a una solicitud de cancelación (imágenes o PDF que el
// alumno sube para respaldar su motivo).
//
// DECISIÓN DE DISEÑO: adjuntar es OPCIONAL y va en un request APARTE del que
// crea la solicitud. Si fueran el mismo multipart, una falla de Storage
// (variables sin configurar, red, cuota) tumbaría la cancelación entera — y el
// pedido explícito fue que adjuntar nunca sea requisito para cancelar. Así la
// solicitud queda creada siempre y el adjunto es un extra que puede reintentarse.
//
// Se reusa el bucket `documentos-alumno`, que ya existe y acepta pdf/jpeg/png;
// los objetos van bajo el prefijo cancelaciones/<id_solicitud>/.

const db = require("../config/db");
const catchAsync = require("../utils/catchAsync");
const { logAuditoria } = require("../utils/auditoria");
const { subirArchivo, urlFirmada, borrarArchivo, storageDisponible, BUCKETS } = require("../utils/storage");

const MAX_ARCHIVOS = 5;
// Tipos que el bucket documentos-alumno admite. Se valida también acá para dar
// un 400 con mensaje claro en vez de un error opaco de Storage.
const TIPOS_OK = new Set(["image/jpeg", "image/png", "application/pdf"]);

const extensionDe = (nombre) => {
  const m = String(nombre || "").match(/\.([A-Za-z0-9]{1,8})$/);
  return m ? `.${m[1].toLowerCase()}` : "";
};

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
    return res.status(503).json({ message: "El almacenamiento de archivos no está configurado. Tu solicitud de cancelación ya quedó enviada; avisá a Administración para mandar la constancia por otro medio." });
  }

  const yaHay = await db.query(
    `SELECT COUNT(*)::int AS n FROM solicitud_cancelacion_adjunto WHERE id_solicitud_cancelacion = $1`,
    [id_solicitud_cancelacion]
  );
  if (yaHay.rows[0].n + archivos.length > MAX_ARCHIVOS) {
    return res.status(400).json({ message: `Máximo ${MAX_ARCHIVOS} constancias por solicitud (ya tenés ${yaHay.rows[0].n}).` });
  }
  const malo = archivos.find((a) => !TIPOS_OK.has(a.mimetype));
  if (malo) {
    return res.status(400).json({ message: `"${malo.originalname}" no es un tipo permitido. Se aceptan imágenes JPG o PNG y archivos PDF.` });
  }

  const creados = [];
  for (const a of archivos) {
    const ruta = `cancelaciones/${id_solicitud_cancelacion}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extensionDe(a.originalname)}`;
    await subirArchivo(BUCKETS.DOCUMENTOS, ruta, a.buffer, a.mimetype);
    const ins = await db.query(
      `INSERT INTO solicitud_cancelacion_adjunto
         (id_solicitud_cancelacion, nombre_archivo, archivo_path, content_type, tamano_bytes, subido_por)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id_adjunto, nombre_archivo, content_type, tamano_bytes,
                 to_char(subido_en, 'YYYY-MM-DD HH24:MI') AS subido_en`,
      [id_solicitud_cancelacion, a.originalname, ruta, a.mimetype, a.size, req.user.id_usuario]
    );
    creados.push(ins.rows[0]);
  }

  await logAuditoria(db, {
    accion: "OTRO", entidad: "solicitud_cancelacion", id_entidad: Number(id_solicitud_cancelacion),
    actor: req.user, req, descripcion: `Alumno adjuntó ${creados.length} constancia(s) a su solicitud de cancelación`,
  }).catch(() => {});

  res.json({ message: `${creados.length} constancia(s) adjuntada(s)`, adjuntos: creados });
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
  const r = await db.query(
    `SELECT a.id_adjunto, a.archivo_path, a.id_solicitud_cancelacion, s.id_alumno, s.estado
       FROM solicitud_cancelacion_adjunto a
       JOIN solicitud_cancelacion s ON s.id_solicitud_cancelacion = a.id_solicitud_cancelacion
      WHERE a.id_adjunto = $1`,
    [id_adjunto]
  );
  if (r.rows.length === 0) return res.status(404).json({ message: "Constancia no encontrada" });
  const propio = await idAlumnoDe(db, req.user.id_usuario);
  if (!propio || r.rows[0].id_alumno !== propio) return res.status(403).json({ message: "No tenés acceso a esta constancia" });
  if (r.rows[0].estado !== "PENDIENTE") return res.status(400).json({ message: "La solicitud ya fue resuelta: la constancia queda como respaldo." });

  await db.query(`DELETE FROM solicitud_cancelacion_adjunto WHERE id_adjunto = $1`, [id_adjunto]);
  await borrarArchivo(BUCKETS.DOCUMENTOS, r.rows[0].archivo_path); // best-effort
  res.json({ message: "Constancia eliminada" });
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
