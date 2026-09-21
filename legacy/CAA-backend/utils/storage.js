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
 *
 * `upsert` sigue en true por defecto para no cambiarle nada a quien ya la usa.
 * Los manuales la llaman con `upsert: false`: la app NUNCA pisa un manual
 * (spec 2026-09-20 §5). Un "ya existe" sale con `statusCode = 409`.
 */
async function subirArchivo(bucket, ruta, buffer, contentType, { upsert = true } = {}) {
  const { error } = await getClient()
    .storage.from(bucket)
    .upload(ruta, buffer, { contentType: contentType || "application/octet-stream", upsert });
  if (error) {
    const e = new Error(`Error subiendo a storage: ${error.message}`);
    e.statusCode = Number(error.statusCode || error.status) || null;
    throw e;
  }
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

/** Baja un objeto entero a memoria (Buffer). */
async function descargarArchivo(bucket, ruta) {
  const { data, error } = await getClient().storage.from(bucket).download(ruta);
  if (error) throw new Error(`Error bajando de storage: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** ¿Existe el objeto? Cualquier error cuenta como "no". */
async function existeArchivo(bucket, ruta) {
  const { data, error } = await getClient().storage.from(bucket).exists(ruta);
  return !error && !!data;
}

/**
 * Permiso temporal (2 h) para que el NAVEGADOR suba directo a Storage, sin pasar
 * el archivo por el backend. Sin upsert: no puede pisar nada.
 */
async function urlSubidaFirmada(bucket, ruta) {
  const { data, error } = await getClient().storage.from(bucket).createSignedUploadUrl(ruta, { upsert: false });
  if (error) throw new Error(`Error preparando la subida: ${error.message}`);
  return data; // { signedUrl, token, path }
}

const BUCKETS = {
  DOCUMENTOS: "documentos-alumno",
  ARCHIVOS: "caaa-archivos",
  MANUALES: "manuales-taller",
};

module.exports = {
  getClient, storageDisponible, subirArchivo, urlFirmada, borrarArchivo,
  descargarArchivo, existeArchivo, urlSubidaFirmada, BUCKETS,
};
