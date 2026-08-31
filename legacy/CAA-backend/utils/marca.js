/**
 * Identidad de la escuela, del lado del backend.
 *
 * Fuente única: marca.json en la raíz del repo. El frontend lee el MISMO archivo
 * (generado en su prebuild). Para clonar el sistema a otra escuela se cambia ese
 * archivo y se reemplazan las imágenes; no se toca código.
 *
 * Antes de esto el nombre estaba escrito en 148 lugares, 57 de ellos en
 * pdfGenerator.js. Con el demo siendo un fork del repo, eso significaba que cada
 * `git merge` desde CAAA iba a chocar en 148 puntos.
 */
const fs = require("fs");
const path = require("path");

const RUTA = path.join(__dirname, "..", "..", "..", "marca.json");

// Valores de emergencia. Si el archivo falta o está roto, el sistema arranca
// igual con la identidad de CAAA en vez de caerse: un backend caído es peor que
// un logo equivocado, y el error queda en el log para que se vea.
const RESPALDO = {
  nombre: "CAAA",
  nombre_legal: "CAAA, S.A. de C.V.",
  nombre_completo: "Centro de Adiestramiento Aéreo Académico",
  lema: "Profesionales en aviación",
  subtitulo: "Sistema de gestión académica y de operaciones",
  acento_h: 25, acento_c: 0.205,
  logo: "logo-caaa.png", logo_mark: "logo-caaa-mark.png",
  iso_navy: "iso-caaa-navy.png", iso_blanco: "iso-caaa-white.png",
  favicon: "favicon-caaa.png", login_bg: "login-bg.jpg",
  aeropuerto_base: "MSSS",
  direccion: "Aeropuerto Internacional de Ilopango, Hangar 38B",
  codigo_oma: "CO-OMA-CAAA-014",
};

function cargar() {
  try {
    const j = JSON.parse(fs.readFileSync(RUTA, "utf8"));
    const m = j.marcas?.[j.activa];
    if (!m) throw new Error(`marca.json: no existe la marca "${j.activa}"`);
    return { ...RESPALDO, ...m };
  } catch (e) {
    console.error(`[MARCA] No pude leer ${RUTA}: ${e.message}. Uso los valores de respaldo.`);
    return RESPALDO;
  }
}

const marca = cargar();

/** Ruta absoluta a una imagen de la marca dentro de assets/ del backend. */
const imagen = (clave) => path.join(__dirname, "..", "assets", marca[clave] || RESPALDO[clave]);

module.exports = { marca, imagen };
