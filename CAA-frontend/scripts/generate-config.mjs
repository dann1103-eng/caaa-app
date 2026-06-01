// Genera public/config.js en tiempo de build con las URLs reales.
// Se ejecuta como `prebuild` antes de `vite build`.
// Variables de entorno requeridas en Vercel:
//   VITE_API_URL        → URL del backend (Railway / producción)
//   VITE_LOADSHEET_URL  → URL del módulo loadsheet (puede ser igual que API)
import { writeFileSync } from "fs";

// Limpia BOM, comillas accidentales y espacios/saltos que a veces se cuelan
// al definir variables de entorno (p. ej. desde PowerShell).
const clean = (v, fallback) => {
  if (v == null) return fallback;
  const t = String(v).replace(/[﻿​]/g, "").trim().replace(/^["']|["']$/g, "");
  return t || fallback;
};

const apiUrl = clean(process.env.VITE_API_URL, "http://localhost:5000");
const loadsheetUrl = clean(process.env.VITE_LOADSHEET_URL, "http://localhost:5174");

const content = `window.__APP_CONFIG__ = { API_URL: "${apiUrl}", LOADSHEET_URL: "${loadsheetUrl}" };\n`;

writeFileSync("./public/config.js", content, "utf-8");
console.log("[generate-config] Escrito public/config.js:");
console.log("  API_URL       :", apiUrl);
console.log("  LOADSHEET_URL :", loadsheetUrl);
