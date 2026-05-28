// Utilidad para ejecutar un archivo SQL contra la base de datos configurada en .env
// (usa el session pooler de Supabase por IPv4). NO contiene secretos.
// Uso: node run-sql.js <ruta-al-archivo.sql>
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");

const file = process.argv[2];
if (!file) {
  console.error("Uso: node run-sql.js <ruta-al-archivo.sql>");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error("No existe el archivo:", file);
  process.exit(1);
}

const sql = fs.readFileSync(file, "utf-8");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

(async () => {
  const client = await pool.connect();
  try {
    console.log(`Ejecutando ${file} contra ${process.env.DB_HOST}...`);
    await client.query(sql);
    console.log("✅ SQL ejecutado correctamente.");
  } catch (e) {
    console.error("❌ Error ejecutando SQL:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
