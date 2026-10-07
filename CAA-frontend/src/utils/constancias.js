// Constancias de una solicitud de cancelación, del lado del cliente: qué
// archivos se aceptan y cómo se muestran.
//
// Los límites son los mismos que exige el servidor
// (legacy/CAA-backend/utils/constancias.js). Acá se validan para avisar ANTES de
// subir —un archivo de 9 MB por datos móviles tarda, y recién al final fallaba—;
// quien manda es el servidor. Si se cambia uno, se cambia el otro.

export const MAX_CONSTANCIAS = 5;
export const MAX_BYTES_CONSTANCIA = 8 * 1024 * 1024;

const TIPOS_OK = ["image/jpeg", "image/png", "application/pdf"];
export const ACCEPT_CONSTANCIAS = TIPOS_OK.join(",");

const megas = (bytes) => (bytes / 1024 / 1024).toFixed(1);

/** "821 KB" / "3.3 MB"; vacío si no hay dato. */
export const pesoLegible = (bytes) =>
  !bytes ? "" : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${megas(bytes)} MB`;

export const iconoDeConstancia = (tipo) =>
  String(tipo || "").startsWith("image/") ? "bi-file-earmark-image" : "bi-file-earmark-pdf";

/**
 * El primer problema de una lista de archivos (`File`: name, type, size), o ""
 * si se puede enviar entera. `yaHay` = constancias que la solicitud ya tiene.
 */
export function problemaDeConstancias(archivos, { yaHay = 0 } = {}) {
  const lista = archivos || [];
  if (yaHay + lista.length > MAX_CONSTANCIAS) {
    return `Máximo ${MAX_CONSTANCIAS} constancias por solicitud${yaHay > 0 ? ` (ya tenés ${yaHay})` : ""}.`;
  }
  const malo = lista.find((a) => !TIPOS_OK.includes(a.type));
  if (malo) return `"${malo.name}" no es un tipo permitido. Se aceptan imágenes JPG o PNG y archivos PDF.`;
  const pesado = lista.find((a) => a.size > MAX_BYTES_CONSTANCIA);
  if (pesado) return `"${pesado.name}" pesa ${megas(pesado.size)} MB y el máximo es 8 MB. Probá con una foto más liviana o un PDF más chico.`;
  return "";
}

/**
 * Abre en otra pestaña un archivo cuya URL hay que pedir primero (las
 * constancias viven en un bucket privado y se abren con una URL firmada).
 *
 * La pestaña se abre EN EL MISMO gesto del toque y la URL se le pone después:
 * Safari en el iPhone bloquea un `window.open` que llega recién tras un await, y
 * el archivo simplemente no abría. Si aun así el navegador no deja abrir la
 * pestaña, se navega en la actual. Si pedir la URL falla, relanza el error.
 */
export async function abrirConUrlFirmada(pedirUrl) {
  const pestana = window.open("", "_blank");
  if (pestana) pestana.opener = null;
  try {
    const url = await pedirUrl();
    if (pestana) pestana.location.replace(url);
    else window.location.assign(url);
  } catch (e) {
    pestana?.close();
    throw e;
  }
}

/**
 * Cuánto antes del vuelo se pidió la cancelación, para leer de un vistazo:
 * "24 min", "23 h", "4 días". Recibe horas; vacío si no hay dato.
 *
 * Siempre hacia ABAJO: este texto va al lado del badge de emergencia, que
 * significa "menos de 24 h". Redondeando, una solicitud pedida 23 h 50 min
 * antes decía "pedida 24 h antes del vuelo" justo al lado de EMERGENCIA.
 */
export function textoAnticipacion(horas) {
  if (horas == null || !(horas >= 0)) return "";
  if (horas < 1) return `${Math.max(1, Math.floor(horas * 60))} min`;
  if (horas < 48) return `${Math.floor(horas)} h`;
  return `${Math.floor(horas / 24)} días`;
}
