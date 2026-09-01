const { Pool } = require("pg");
const { AsyncLocalStorage } = require("async_hooks");

/**
 * Acceso a la base, con ruteo por esquema.
 *
 * Casi todo el sistema trabaja contra `public`. El usuario de demostraciones
 * trabaja contra `demo`, que es una copia VACÍA de la misma estructura en la
 * misma base (ver supabase/migrations/20260831000002_esquema_demo.sql).
 *
 * Por qué acá y no con un filtro en cada consulta: son 87 tablas y unas 600
 * consultas. Un solo filtro olvidado le mostraría a un prospecto el saldo real
 * de un alumno. Ruteando el POOL, no hay filtro que olvidar — son objetos
 * distintos, y una consulta sin filtro no puede ver los datos de CAAA.
 *
 * Los 69 archivos del backend ya pasaban por este módulo, así que el ruteo entra
 * en un solo lugar y ninguno de ellos se entera.
 */

const base = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
};

function crearPool(searchPath) {
  const pool = new Pool(searchPath ? { ...base, options: `-c search_path=${searchPath}` } : base);
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
  pool.on("error", (err) => console.error("❌ PG pool error:", err));
  return pool;
}

const poolPublic = crearPool(null);

/**
 * ⚠️ `search_path=demo` A SECAS, sin `,public` de reserva. Es deliberado: con la
 * reserva puesta, una tabla que faltara en `demo` caería EN SILENCIO sobre la de
 * producción — exactamente la fuga que este diseño existe para impedir. Sin
 * ella, falta una tabla y la consulta falla ruidosamente, que es lo que se
 * quiere.
 *
 * Es seguro porque los tipos se resuelven por OID (las tablas clonadas comparten
 * los enums de public) y porque la app no invoca ninguna función de la base: las
 * que existen viven solo en políticas RLS, que esta conexión saltea.
 */
const poolDemo = crearPool("demo");

const contexto = new AsyncLocalStorage();

/** Ejecuta `fn` con todas sus consultas dirigidas a `esquema`. */
const enEsquema = (esquema, fn) => contexto.run({ esquema }, fn);

const esDemo = () => contexto.getStore()?.esquema === "demo";
const actual = () => (esDemo() ? poolDemo : poolPublic);

module.exports = {
  // La interfaz que ya usaban los 69 archivos: solo query y connect.
  query: (...args) => actual().query(...args),
  connect: () => actual().connect(),

  // Ruteo.
  enEsquema,
  esDemo,

  // Acceso explícito, para lo que NUNCA debe rutearse: el login (que corre antes
  // de saber quién es el usuario) y el clonador del esquema demo.
  poolPublic,
  poolDemo,
};
