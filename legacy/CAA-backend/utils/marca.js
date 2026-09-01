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
 *
 * ── POR QUÉ ESTO ES UN PROXY Y NO UN OBJETO ─────────────────────────────────
 * La marca depende de QUIÉN pregunta: la cuenta de demostraciones ve "TU
 * ESCUELA" y todos los demás ven CAAA, en el mismo despliegue y al mismo tiempo.
 * Un objeto cargado una vez al arrancar no puede hacer eso, y uno mutable sería
 * peor: dos peticiones concurrentes de esquemas distintos se pisarían la marca
 * la una a la otra, y el prospecto vería una vouchera con el logo de CAAA.
 *
 * El Proxy resuelve CADA lectura contra el esquema de la petición en curso
 * (db.esDemo(), que sale del AsyncLocalStorage). Los 18 lugares que ya escribían
 * `marca.nombre` siguen igual y quedan correctos sin enterarse.
 *
 * ⚠️ Por lo mismo, NO guardar `marca.nombre` en una constante de módulo: eso
 * congela el valor de quien haya arrancado primero. Leerlo dentro de la función.
 */
const fs = require("fs");
const path = require("path");
const db = require("../config/db");

// 🚨 El archivo vive DENTRO de legacy/CAA-backend, y no en la raíz del repo.
//
// Railway despliega este servicio con Root Directory = legacy/CAA-backend, así
// que lo que esté más arriba NO llega al servidor. Estuvo en la raíz y el
// backend en producción cayó todo el tiempo a los valores de respaldo —que son
// los de CAAA— sin fallar ni loguear nada visible: los PDF de la cuenta de
// demostraciones salían con el logo y el código de OMA de CAAA.
//
// Se conserva la ruta vieja como segunda opción por si alguien tiene el archivo
// en la raíz de una copia anterior.
const CANDIDATAS = [
  path.join(__dirname, "..", "marca.json"),
  path.join(__dirname, "..", "..", "..", "marca.json"),
];
const RUTA = CANDIDATAS.find((r) => fs.existsSync(r)) || CANDIDATAS[0];

// Valores de emergencia. Si el archivo falta o está roto, el sistema arranca
// igual con la identidad de CAAA en vez de caerse: un backend caído es peor que
// un logo equivocado, y el error queda en el log para que se vea.
const RESPALDO = {
  nombre: "CAAA",
  sigla: "CAAA",
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
    const arma = (clave) => {
      const m = j.marcas?.[clave];
      if (!m) throw new Error(`marca.json: no existe la marca "${clave}"`);
      return { ...RESPALDO, ...m };
    };
    return {
      origen: RUTA,
      produccion: arma(j.activa),
      // Si no se declaró marca para el demo, usa la de producción. Un demo con
      // la marca de CAAA es feo, pero arrancar es más importante.
      demo: j.marca_demo ? arma(j.marca_demo) : arma(j.activa),
    };
  } catch (e) {
    console.error(`[MARCA] No pude leer ${RUTA}: ${e.message}. Uso los valores de respaldo.`);
    return { produccion: RESPALDO, demo: RESPALDO, origen: "respaldo", error: e.message };
  }
}

const MARCAS = cargar();

/** La marca que le toca a la petición en curso. */
function actual() {
  // db.esDemo() consulta el AsyncLocalStorage que arma authMiddleware con el
  // esquema FIRMADO en el token. Fuera de una petición (arranque, jobs de cron)
  // no hay contexto y devuelve false, que es lo correcto: esos corren para CAAA.
  return db.esDemo() ? MARCAS.demo : MARCAS.produccion;
}

/**
 * Se lee como un objeto normal (`marca.nombre`) pero cada lectura resuelve
 * contra el esquema de quien está pidiendo. Ver el comentario de arriba.
 */
const marca = new Proxy({}, {
  get: (_, prop) => actual()[prop],
  has: (_, prop) => prop in actual(),
  ownKeys: () => Reflect.ownKeys(actual()),
  getOwnPropertyDescriptor: (_, prop) => ({
    value: actual()[prop], enumerable: true, configurable: true,
  }),
});

/**
 * Ruta absoluta a una imagen de la marca dentro de assets/ del backend.
 * ⚠️ Llamarla DENTRO de la función que dibuja, no en una constante de módulo:
 * en el módulo se resolvería una sola vez y el demo saldría con el logo de CAAA.
 */
const imagen = (clave) => path.join(__dirname, "..", "assets", actual()[clave] || RESPALDO[clave]);

module.exports = { marca, imagen, MARCAS };
