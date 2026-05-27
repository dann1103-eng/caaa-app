import fs from "node:fs";

let s = fs.readFileSync("schema.sql", "utf8");

// Quitar líneas psql-only (\restrict / \unrestrict son de pg_dump 18 y rompen en Supabase)
s = s.split("\n").filter(line => {
  if (line.startsWith("\\restrict")) return false;
  if (line.startsWith("\\unrestrict")) return false;
  if (line.startsWith("-- Dumped")) return false;
  if (line.startsWith("-- PostgreSQL database")) return false;
  if (line.startsWith("-- TOC entry")) return false;
  if (/^SET (statement_timeout|lock_timeout|idle_in_transaction|transaction_timeout|client_encoding|standard_conforming|check_function_bodies|xmloption|client_min_messages|row_security)/.test(line)) return false;
  if (line.startsWith("SELECT pg_catalog.set_config")) return false;
  return true;
}).join("\n");

// Colapsar múltiples saltos de línea
s = s.replace(/\n{3,}/g, "\n\n");

fs.writeFileSync("schema_clean.sql", s);
console.log("Cleaned. Lines:", s.split("\n").length);
