// Utilidad de solo-lectura: ejecuta un SELECT y muestra las filas en JSON.
// Lee credenciales del .env (sin secretos en el archivo).
// Uso: node query.js "SELECT ... "
require("dotenv").config();
const { Pool } = require("pg");

const sql = process.argv[2];
if (!sql) { console.error('Uso: node query.js "SELECT ..."'); process.exit(1); }

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

(async () => {
  try {
    const r = await pool.query(sql);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
