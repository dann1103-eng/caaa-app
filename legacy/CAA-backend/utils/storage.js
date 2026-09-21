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
 * Status HTTP de un error de storage-js cuando la respuesta no traía JSON
 * (bajadas y HEAD): el Response original queda en `originalError`, y el mensaje
 * del error no dice nada útil (literalmente "{}"). En un corte de red no hay
 * status: null.
 */
const statusDe = (error) => error?.originalError?.status || Number(error?.statusCode) || null;

/**
 * Error legible de Storage, con la causa original en `cause`.
 *
 * El status de Storage va en `storageStatus`, NO en `statusCode`: el middleware
 * de errores usa `statusCode` como status de la respuesta, y un 403 o un 404 de
 * Storage no es lo que la API tiene que contestar (para el cliente es un error
 * nuestro: 500).
 */
function errorDeStorage(mensaje, storageStatus, cause) {
  const e = new Error(mensaje, { cause });
  e.storageStatus = storageStatus;
  return e;
}

/**
 * Sube un buffer a un bucket. Devuelve la ruta del objeto (lo que se guarda en
 * la columna archivo_path).
 *
 * `upsert` sigue en true por defecto para no cambiarle nada a quien ya la usa.
 * Los manuales la llaman con `upsert: false`: la app NUNCA pisa un manual
 * (spec 2026-09-20 §5). Un "ya existe" sale con `storageStatus = 409`.
 */
async function subirArchivo(bucket, ruta, buffer, contentType, { upsert = true } = {}) {
  const { error } = await getClient()
    .storage.from(bucket)
    .upload(ruta, buffer, { contentType: contentType || "application/octet-stream", upsert });
  if (error) {
    // statusCode es el código del cuerpo ("409", pero a veces texto como
    // "EntityTooLarge"); status es el HTTP. Manda el primero que sea número.
    const status = Number(error.statusCode) || Number(error.status) || null;
    throw errorDeStorage(`Error subiendo a storage: ${error.message}`, status, error);
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
  // Fuera del try: "Storage no configurado" tiene que salir tal cual.
  const archivos = getClient().storage.from(bucket);
  let causa;
  try {
    // La transferencia entera va adentro del try: storage-js lee el cuerpo
    // dentro de download(), y un corte a mitad de camino ("TypeError:
    // terminated") no vuelve como `error`: se tira.
    const { data, error } = await archivos.download(ruta);
    if (!error) return Buffer.from(await data.arrayBuffer());
    causa = error;
  } catch (err) {
    causa = err;
  }
  const status = statusDe(causa);
  throw errorDeStorage(
    status ? `Storage respondió ${status} al bajar el archivo` : "No se pudo bajar el archivo de Storage (conexión cortada)",
    status,
    causa
  );
}

/**
 * ¿Existe el objeto? false SOLO cuando Storage contesta que no está: storage-js
 * devuelve eso (400/404) como `error`, sin tirarlo. Un 403, un 5xx o un corte de
 * red NO son "no existe" y se tiran: tragárselos haría que la caché de PDFs
 * armados se reconstruyera en cada pedido sin que nadie se entere.
 */
async function existeArchivo(bucket, ruta) {
  // Fuera del try: "Storage no configurado" tiene que salir tal cual.
  const archivos = getClient().storage.from(bucket);
  let r;
  try {
    r = await archivos.exists(ruta);
  } catch (error) {
    const status = statusDe(error);
    throw errorDeStorage(`Storage respondió ${status || "con un error de red"} al consultar el archivo`, status, error);
  }
  return !r.error && !!r.data;
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
