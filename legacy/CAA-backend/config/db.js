const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:
    process.env.DB_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
});

pool.on("connect", (client) => {
  // Sin catch, un corte de conexión durante este SET genera un unhandledRejection
  // que tumba el proceso (visto con 57P01 del pooler de Supabase).
  client.query("SET timezone = 'America/El_Salvador'").catch((err) => {
    console.error("❌ PG SET timezone error (ignorado):", err.message);
  });
  // Errores emitidos por el cliente fuera de un query activo (p.ej. el pooler
  // termina la conexión); sin handler, derriban el proceso.
  client.on("error", (err) => {
    console.error("❌ PG client error (ignorado):", err.message);
  });
});

pool.on("error", (err) => {
  console.error("❌ PG pool error:", err);
});

module.exports = pool;
