// Helper de Supabase Storage para archivos persistentes (documentos de alumno,
// contratos, material de aula). Reemplaza el almacenamiento en disco de Railway,
// que se borra en cada redeploy.
//
// Requiere en el entorno:
//   SUPABASE_URL          (ej. https://<ref>.supabase.co)
//   SUPABASE_SERVICE_KEY  (service_role key — bypassa RLS para subir/leer)
//
// Si faltan las variables, las funciones lanzan un error claro y el caller debe
// manejarlo (los uploads fallan con mensaje entendible en vez de 500 críptico).

const { createClient } = require("@supabase/supabase-js");

let _client = null;
function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("Storage no configurado: faltan SUPABASE_URL o SUPABASE_SERVICE_KEY");
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/** ¿Está configurado el storage? (para decidir fallback a disco) */
function storageDisponible() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

/**
 * Sube un buffer a un bucket. Devuelve la ruta del objeto (lo que se guarda en
 * la columna archivo_path).
 */
async function subirArchivo(bucket, ruta, buffer, contentType) {
  const { error } = await getClient()
    .storage.from(bucket)
    .upload(ruta, buffer, { contentType: contentType || "application/octet-stream", upsert: true });
  if (error) throw new Error(`Error subiendo a storage: ${error.message}`);
  return ruta;
}

/**
 * Genera una URL firmada temporal para leer/descargar un objeto privado.
 * @param {number} segundos validez (default 1h)
 */
async function urlFirmada(bucket, ruta, segundos = 3600) {
  const { data, error } = await getClient()
    .storage.from(bucket)
    .createSignedUrl(ruta, segundos);
  if (error) throw new Error(`Error generando URL firmada: ${error.message}`);
  return data.signedUrl;
}

/** Borra un objeto (best-effort). */
async function borrarArchivo(bucket, ruta) {
  try {
    await getClient().storage.from(bucket).remove([ruta]);
  } catch (e) {
    console.warn("[storage] no se pudo borrar", bucket, ruta, e.message);
  }
}

const BUCKETS = {
  DOCUMENTOS: "documentos-alumno",
  ARCHIVOS: "caaa-archivos",
};

module.exports = { getClient, storageDisponible, subirArchivo, urlFirmada, borrarArchivo, BUCKETS };
