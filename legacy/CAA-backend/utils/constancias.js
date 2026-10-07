// Constancias de una solicitud de cancelación: qué archivos se aceptan y cómo
// se le explica al alumno cuando uno no pasa. Funciones puras, sin base ni
// Storage, para que las reglas se puedan probar solas.
//
// Los mismos límites están del lado del cliente en
// CAA-frontend/src/utils/constancias.js. Si se cambia uno, se cambia el otro: el
// cliente valida para avisar antes de subir, el servidor es quien manda.

const MAX_ARCHIVOS = 5;
const MAX_BYTES = 8 * 1024 * 1024;

// Los tipos que admite el bucket `documentos-alumno`. Se validan acá para dar un
// 400 con mensaje claro en vez de un error opaco de Storage.
const TIPOS_OK = new Set(["image/jpeg", "image/png", "application/pdf"]);
const EXTENSIONES_OK = [".pdf", ".jpg", ".jpeg", ".png"];
const TIPOS_LEGIBLES = "imágenes JPG o PNG y archivos PDF";

const extensionDe = (nombre) => {
  const m = String(nombre || "").match(/\.([A-Za-z0-9]{1,8})$/);
  return m ? `.${m[1].toLowerCase()}` : "";
};

/**
 * El nombre del archivo tal como lo escribió el alumno. multer (busboy) lee el
 * nombre de la parte como latin1 y los navegadores lo mandan en UTF-8, así que
 * "Constancia médica.pdf" llegaba como "Constancia mÃ©dica.pdf". Se rehace la
 * lectura; si el resultado no es UTF-8 válido, el nombre no venía así y se deja.
 */
const nombreLegible = (originalname) => {
  const crudo = String(originalname || "");
  const utf8 = Buffer.from(crudo, "latin1").toString("utf8");
  return utf8.includes("�") ? crudo : utf8;
};

const mensajeDeTipo = (nombre) => `"${nombre}" no es un tipo permitido. Se aceptan ${TIPOS_LEGIBLES}.`;

/** El error con que el filtro de multer rechaza un archivo por su tipo. */
function errorDeTipo(nombre) {
  const e = new Error(mensajeDeTipo(nombre));
  e.esTipoNoPermitido = true;
  return e;
}

/**
 * El primer problema de una lista de archivos (como los entrega multer:
 * `originalname`, `mimetype`, `size`), o null si se puede subir entera.
 * `yaHay` = constancias que la solicitud ya tiene guardadas.
 */
function problemaDeConstancias(archivos, { yaHay = 0 } = {}) {
  const lista = archivos || [];
  if (yaHay + lista.length > MAX_ARCHIVOS) {
    return `Máximo ${MAX_ARCHIVOS} constancias por solicitud${yaHay > 0 ? ` (ya tenés ${yaHay})` : ""}.`;
  }
  const malo = lista.find((a) => !TIPOS_OK.has(a.mimetype));
  if (malo) return mensajeDeTipo(malo.originalname);
  const pesado = lista.find((a) => a.size > MAX_BYTES);
  if (pesado) return `"${pesado.originalname}" pesa más de 8 MB. Probá con una foto más liviana o un PDF más chico.`;
  return null;
}

/**
 * Mensaje para el alumno cuando multer corta la subida. Nunca devuelve el texto
 * en inglés de la librería: lo que no conocemos sale como un genérico.
 */
function mensajeDeSubida(err) {
  if (err?.esTipoNoPermitido) return err.message;
  switch (err?.code) {
    case "LIMIT_FILE_SIZE":
      return "Cada archivo puede pesar hasta 8 MB. Probá con una foto más liviana o un PDF más chico.";
    case "LIMIT_FILE_COUNT":
    case "LIMIT_UNEXPECTED_FILE":
      return `Máximo ${MAX_ARCHIVOS} archivos por solicitud.`;
    default:
      return "No se pudo recibir el archivo. Revisá tu conexión y probá de nuevo.";
  }
}

module.exports = {
  MAX_ARCHIVOS, MAX_BYTES, TIPOS_OK, EXTENSIONES_OK,
  extensionDe, nombreLegible, errorDeTipo, problemaDeConstancias, mensajeDeSubida,
};
