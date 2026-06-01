const path = require("path");
const db = require("../../config/db");
const { subirArchivo, urlFirmada, storageDisponible, BUCKETS } = require("../../utils/storage");

exports.catalogo = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT * FROM documento_requerido_catalogo
      WHERE activo = TRUE
      ORDER BY autoridad, nombre
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.documentosAlumno = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const r = await db.query(`
      SELECT d.*, c.codigo, c.nombre, c.autoridad, c.aplica_a_menores, c.aplica_a_extranjeros
      FROM documento_requerido_catalogo c
      LEFT JOIN documento_alumno d ON d.id_documento_requerido = c.id AND d.id_alumno = $1
      WHERE c.activo = TRUE
      ORDER BY c.autoridad, c.nombre
    `, [id_alumno]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.subirDocumento = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const { id_documento_requerido, fecha_entrega, fecha_vencimiento } = req.body;

    // El archivo se guarda en Supabase Storage (persistente). archivo_path guarda
    // la ruta del objeto dentro del bucket DOCUMENTOS.
    let archivo_path = null;
    if (req.file) {
      if (!storageDisponible()) {
        return res.status(503).json({ ok: false, message: "Almacenamiento de archivos no configurado (SUPABASE_SERVICE_KEY)." });
      }
      const ext = path.extname(req.file.originalname) || "";
      const ruta = `alumno_${id_alumno}/${Date.now()}_doc${id_documento_requerido || "x"}${ext}`;
      await subirArchivo(BUCKETS.DOCUMENTOS, ruta, req.file.buffer, req.file.mimetype);
      archivo_path = ruta;
    }
    const r = await db.query(`
      INSERT INTO documento_alumno
        (id_alumno, id_documento_requerido, fecha_entrega, fecha_vencimiento, archivo_path, estado, revisado_por)
      VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, 'ENTREGADO', $6) RETURNING *
    `, [id_alumno, id_documento_requerido, fecha_entrega || null, fecha_vencimiento || null,
        archivo_path, req.user?.id_usuario || null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.revisar = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, observaciones } = req.body;
    if (!['ENTREGADO','VENCIDO','RECHAZADO','PENDIENTE'].includes(estado)) {
      return res.status(400).json({ ok: false, message: "Estado inválido" });
    }
    const r = await db.query(`
      UPDATE documento_alumno SET estado = $2, observaciones = $3, revisado_por = $4, actualizado_en = NOW()
      WHERE id = $1 RETURNING *
    `, [id, estado, observaciones || null, req.user?.id_usuario || null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Devuelve una URL temporal para ver/descargar el archivo de un documento.
 * Si es un archivo legacy en disco (/uploads/...), devuelve esa ruta pública.
 */
exports.archivoUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query("SELECT archivo_path FROM documento_alumno WHERE id = $1", [id]);
    if (r.rows.length === 0 || !r.rows[0].archivo_path) {
      return res.status(404).json({ ok: false, message: "Documento sin archivo" });
    }
    const ruta = r.rows[0].archivo_path;
    if (ruta.startsWith("/uploads/")) {
      return res.json({ ok: true, url: ruta, legacy: true });
    }
    const url = await urlFirmada(BUCKETS.DOCUMENTOS, ruta, 3600);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.alertasVencimiento = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT d.id, d.fecha_vencimiento, d.estado,
             u.username AS alumno_username, a.id_alumno,
             c.nombre AS documento_nombre, c.autoridad,
             (d.fecha_vencimiento - CURRENT_DATE) AS dias_restantes
      FROM documento_alumno d
      JOIN documento_requerido_catalogo c ON c.id = d.id_documento_requerido
      JOIN alumno a ON a.id_alumno = d.id_alumno
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      WHERE d.fecha_vencimiento IS NOT NULL
        AND d.fecha_vencimiento <= CURRENT_DATE + INTERVAL '60 days'
        AND d.estado IN ('ENTREGADO','VENCIDO')
      ORDER BY d.fecha_vencimiento ASC
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
