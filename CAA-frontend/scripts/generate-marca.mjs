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

let marca = RESPALDO;
try {
  const j = JSON.parse(readFileSync(join(RAIZ, "marca.json"), "utf8"));
  const m = j.marcas?.[j.activa];
  if (!m) throw new Error(`no existe la marca "${j.activa}"`);
  marca = { ...RESPALDO, ...m };
} catch (e) {
  console.warn(`[generate-marca] No pude leer marca.json (${e.message}). Uso los valores de respaldo.`);
}

// Los PDF de pdfmake (plan de vuelo, vouchera) necesitan el logo EMBEBIDO en
// base64: no pueden cargar un archivo. Antes vivía escrito a mano en
// src/assets/logoCaaa.js, 27 KB de base64 que había que regenerar a mano para
// cada escuela. Ahora sale del PNG de la marca en cada build.
const pngMark = join(AQUI, "..", "public", marca.logo_mark);
let dataUrl = "";
if (existsSync(pngMark)) {
  dataUrl = "data:image/png;base64," + readFileSync(pngMark).toString("base64");
} else {
  console.warn(`[generate-marca] No encontré ${pngMark}; los PDF de pdfmake saldrán sin logo.`);
}

const contenido = `// GENERADO por scripts/generate-marca.mjs a partir de marca.json.
// NO editar a mano: el prebuild lo reescribe en cada build.
export const MARCA = ${JSON.stringify(marca, null, 2)};

// Rutas listas para usar en <img src>. Las imágenes viven en public/.
export const IMG = {
  logo: "/" + MARCA.logo,
  logoMark: "/" + MARCA.logo_mark,
  isoNavy: "/" + MARCA.iso_navy,
  isoBlanco: "/" + MARCA.iso_blanco,
  favicon: "/" + MARCA.favicon,
  loginBg: "/" + MARCA.login_bg,
};

// Logo embebido para los PDF de pdfmake, generado desde public/${marca.logo_mark}.
export const LOGO_DATAURL = ${JSON.stringify(dataUrl)};

export default MARCA;
`;

mkdirSync(dirname(DESTINO), { recursive: true });
writeFileSync(DESTINO, contenido, "utf-8");
console.log(`[generate-marca] Escrito src/marca.js — marca: ${marca.nombre}`);
