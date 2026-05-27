import fs from "node:fs";

// Tablas catálogo: idempotentes. Agregamos ON CONFLICT DO NOTHING para que las migraciones se puedan re-correr.
// IMPORTANTE: el orden importa cuando hay FK entre catálogos. Las tablas se insertan
// en el orden en que aparecen en el dump, pero usamos SET session_replication_role = replica
// para bypasear FK checks durante la carga (re-habilitadas al final).
//
// `horas_vuelo_aeronave` se EXCLUYE de catálogo: tiene FK a vuelo (que es operativo).
// `aeronave` se INCLUYE en catálogo: es reference data estática y otros catálogos la referencian.
const CATALOG = new Set([
  "aeronave",                        // padre de tarifas, licencia_aeronave, mantenimiento
  "unidad_teorica",
  "documento_requerido_catalogo",
  "medico_autorizado",
  "curso",
  "curso_componente_practico",
  "aeronave_tarifa",
  "instructor_tarifa",
  "bloque_horario",
  "condiciones_cancelacion",
  "wb_plantilla",
  "licencia",
  "licencia_aeronave",
  "webhook_endpoint"
]);

// Tablas que NO deben ser parte de la migración inicial (logs/auditoría/colas — se llenan al usar la app)
const SKIP = new Set([
  "auditoria_evento",
  "notificacion_outbox",
  "webhook_evento"
]);

const src = fs.readFileSync("data_all.sql", "utf8");
const lines = src.split("\n");

const headerCatalog = [
  "-- ============================================================================",
  "-- CAAA · Seeds de catálogo (idempotente)",
  "--",
  "-- Bypasea FK checks durante la carga (session_replication_role = replica)",
  "-- para evitar errores de orden entre tablas con relaciones cruzadas. Las FK",
  "-- siguen siendo validadas en runtime para todas las queries normales.",
  "-- ============================================================================",
  "",
  "BEGIN;",
  "SET session_replication_role = 'replica';",
  ""
];
const footerCatalog = [
  "",
  "SET session_replication_role = 'origin';",
  "COMMIT;",
  ""
];
const headerOps = [
  "-- ============================================================================",
  "-- CAAA · Datos operativos (NO idempotente). Solo para clonar staging.",
  "-- En producción, NO correr este archivo: deja la app llenar las tablas.",
  "-- ============================================================================",
  ""
];

let catalogOut = [];
let opsOut = [];
let buffer = [];
let bufferTable = null;

function flushBuffer() {
  if (!bufferTable || buffer.length === 0) { buffer = []; bufferTable = null; return; }
  if (SKIP.has(bufferTable)) { buffer = []; bufferTable = null; return; }
  if (CATALOG.has(bufferTable)) {
    catalogOut.push(`-- ── ${bufferTable} ────────────────────────────────────`);
    // Para seeds, sustituimos `INSERT INTO public.x VALUES (...);` por la versión ON CONFLICT
    for (const ln of buffer) {
      if (ln.trim().startsWith("INSERT INTO ")) {
        // Agregar ON CONFLICT DO NOTHING al final si no existe
        if (!ln.includes("ON CONFLICT")) {
          catalogOut.push(ln.replace(/;\s*$/, " ON CONFLICT DO NOTHING;"));
        } else {
          catalogOut.push(ln);
        }
      } else {
        catalogOut.push(ln);
      }
    }
    catalogOut.push("");
  } else {
    opsOut.push(`-- ── ${bufferTable} ────────────────────────────────────`);
    for (const ln of buffer) opsOut.push(ln);
    opsOut.push("");
  }
  buffer = []; bufferTable = null;
}

for (const line of lines) {
  // Saltarse cabeceras / SETs
  if (line.startsWith("\\restrict") || line.startsWith("\\unrestrict")) continue;
  if (line.startsWith("-- Dumped") || line.startsWith("-- PostgreSQL database") || line.startsWith("-- TOC entry")) continue;
  if (/^SET (statement_timeout|lock_timeout|idle_in_transaction|transaction_timeout|client_encoding|standard_conforming|check_function_bodies|xmloption|client_min_messages|row_security)/.test(line)) continue;
  if (line.startsWith("SELECT pg_catalog.set_config")) continue;
  if (line.startsWith("-- Disabling triggers") || line.startsWith("-- Enabling triggers")) continue;
  if (line.includes("DISABLE TRIGGER ALL") || line.includes("ENABLE TRIGGER ALL")) continue;

  // Detectar inicio de bloque "Data for Name: <tabla>"
  const m = line.match(/^-- Data for Name: (\w+);/);
  if (m) {
    flushBuffer();
    bufferTable = m[1];
    continue;
  }

  // Detectar inicio de setval (secuencias) → siempre va a operativo
  if (line.startsWith("SELECT pg_catalog.setval")) {
    flushBuffer();
    opsOut.push(line);
    continue;
  }

  buffer.push(line);
}
flushBuffer();

fs.writeFileSync("data_catalog.sql", headerCatalog.concat(catalogOut).concat(footerCatalog).join("\n"));
fs.writeFileSync("data_operational.sql", headerOps.concat(opsOut).join("\n"));

console.log("Catalog lines:", catalogOut.length);
console.log("Operational lines:", opsOut.length);
