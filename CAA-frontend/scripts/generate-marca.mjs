// Genera src/marca.js a partir de marca.json (la raíz del repo).
// Se ejecuta como parte del `prebuild`, igual que generate-config.mjs.
//
// Por qué generado y no importado directo: marca.json vive FUERA de la carpeta
// del frontend, y Vite no resuelve imports por encima de su raíz sin tocar su
// configuración de filesystem. Generarlo sigue el patrón que este repo ya usa
// para config.js y no cambia nada del build.
//
// ⚠️ NO editar src/marca.js a mano: cada `npm run build` lo reescribe. Es la
// misma trampa que ya mordió con public/config.js.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const DESTINO = join(AQUI, "..", "src", "marca.js");

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

// Se empaquetan LAS DOS marcas, no solo la activa. El bundle es uno solo y lo
// sirve el mismo Vercel para todos: la cuenta de demostraciones y la gente de
// CAAA entran por la misma URL, así que la marca no puede decidirse acá, en el
// build. Se decide en el navegador según de quién sea la sesión (ver marca.js).
let marca = RESPALDO;        // la de producción
let marcaDemo = RESPALDO;    // la que ve la cuenta de demostraciones
try {
  const j = JSON.parse(readFileSync(join(RAIZ, "marca.json"), "utf8"));
  const arma = (clave) => {
    const m = j.marcas?.[clave];
    if (!m) throw new Error(`no existe la marca "${clave}"`);
    return { ...RESPALDO, ...m };
  };
  marca = arma(j.activa);
  marcaDemo = j.marca_demo ? arma(j.marca_demo) : marca;
} catch (e) {
  console.warn(`[generate-marca] No pude leer marca.json (${e.message}). Uso los valores de respaldo.`);
}

// Los PDF de pdfmake (plan de vuelo, vouchera) necesitan el logo EMBEBIDO en
// base64: no pueden cargar un archivo. Antes vivía escrito a mano en
// src/assets/logoCaaa.js, 27 KB de base64 que había que regenerar a mano para
// cada escuela. Ahora sale del PNG de la marca en cada build.
const aDataUrl = (archivo) => {
  const png = join(AQUI, "..", "public", archivo);
  if (!existsSync(png)) {
    console.warn(`[generate-marca] No encontré ${png}; los PDF de pdfmake saldrán sin logo.`);
    return "";
  }
  return "data:image/png;base64," + readFileSync(png).toString("base64");
};
const dataUrl = aDataUrl(marca.logo_mark);
const dataUrlDemo = aDataUrl(marcaDemo.logo_mark);

const contenido = `// GENERADO por scripts/generate-marca.mjs a partir de marca.json.
// NO editar a mano: el prebuild lo reescribe en cada build.
//
// Van LAS DOS marcas y la decisión se toma en el navegador, no en el build: el
// bundle es uno solo y lo comparten la gente de CAAA y la cuenta de
// demostraciones. Quién ve cuál sale de la sesión, y el esquema de la sesión
// viene FIRMADO por el backend dentro del token, así que no se puede falsear
// desde acá.
const MARCAS = {
  produccion: ${JSON.stringify(marca, null, 2).replace(/\n/g, "\n  ")},
  demo: ${JSON.stringify(marcaDemo, null, 2).replace(/\n/g, "\n  ")},
};

const LOGOS = {
  produccion: ${JSON.stringify(dataUrl)},
  demo: ${JSON.stringify(dataUrlDemo)},
};

/**
 * ¿La sesión guardada es la de demostraciones? Sale de es_demo, que el backend
 * pone en el usuario al hacer login. Se lee de localStorage y no de utils/auth
 * a propósito: este archivo es generado y no debe depender del resto del código.
 */
function esSesionDemo() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null")?.es_demo === true;
  } catch {
    return false;   // localStorage bloqueado o basura guardada: marca normal.
  }
}

// La marca vigente se calcula UNA vez y después se muta en el sitio, en vez de
// resolverse en cada lectura. Así los 19 archivos que hacen \`MARCA.nombre\` no
// pagan nada por render y no hubo que tocar ninguno: como es siempre el MISMO
// objeto, actualizarlo lo ven todos. Quien cambia la sesión llama a
// aplicarMarca() (main.jsx al arrancar, Login al entrar, logout al salir).
function vigente() { return esSesionDemo() ? MARCAS.demo : MARCAS.produccion; }

export const MARCA = { ...vigente() };

// Rutas listas para usar en <img src>. Las imágenes viven en public/.
const rutas = (m) => ({
  logo: "/" + m.logo,
  logoMark: "/" + m.logo_mark,
  isoNavy: "/" + m.iso_navy,
  isoBlanco: "/" + m.iso_blanco,
  favicon: "/" + m.favicon,
  loginBg: "/" + m.login_bg,
});

export const IMG = { ...rutas(vigente()) };

/**
 * Logo embebido para los PDF de pdfmake (no pueden cargar un archivo).
 * Es función y no constante porque una cadena exportada no se puede actualizar
 * cuando cambia la sesión: quedaría congelado el logo de quien abrió la página.
 */
export function logoDataUrl() {
  return esSesionDemo() ? LOGOS.demo : LOGOS.produccion;
}

/**
 * Deja la marca de la sesión actual aplicada: el objeto MARCA, las rutas de
 * imagen, y lo que vive fuera de React (título, favicon, color de acento).
 * Idempotente — llamarla de más no cuesta nada.
 */
export function aplicarMarca() {
  const m = vigente();
  Object.assign(MARCA, m);
  Object.assign(IMG, rutas(m));

  if (typeof document === "undefined") return MARCA;
  document.title = \`\${m.nombre} - \${m.nombre_completo}\`;
  const icono = document.querySelector('link[rel="icon"]');
  if (icono) icono.href = "/" + m.favicon;
  const ios = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (ios) ios.setAttribute("content", m.nombre);
  // tokens.css deriva toda la rampa --c-primary-* de estas dos variables.
  const raiz = document.documentElement.style;
  raiz.setProperty("--academy-accent-h", String(m.acento_h));
  raiz.setProperty("--academy-accent-c", String(m.acento_c));
  return MARCA;
}

export default MARCA;
`;

mkdirSync(dirname(DESTINO), { recursive: true });
writeFileSync(DESTINO, contenido, "utf-8");
console.log(`[generate-marca] Escrito src/marca.js — producción: ${marca.nombre} · demo: ${marcaDemo.nombre}`);
