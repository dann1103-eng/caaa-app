// CAAA · Cliente PostgreSQL para Edge Functions.
//
// Usamos `postgres` de deno.land/x (driver nativo, sin pg-pool). Cada invocación
// abre y cierra una conexión. Para producción con tráfico significativo, conviene
// usar Supavisor (pgBouncer de Supabase): pasar el host pooler en DB_HOST.
//
// Para transacciones se exporta `withTransaction(fn)` que abre BEGIN, pasa el
// cliente a la callback, COMMIT al éxito o ROLLBACK al error.

import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const url = Deno.env.get("DATABASE_URL");
if (!url) {
  console.warn("[db] DATABASE_URL no está seteado. Las queries fallarán.");
}

/** Conexión persistente entre invocaciones de la misma instancia. */
export const sql = postgres(url ?? "", {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false, // Edge Functions corren muchos cold-starts; sin prepared statements
});

/** Ejecuta una callback dentro de una transacción explícita. */
export async function withTransaction<T>(
  fn: (tx: typeof sql) => Promise<T>,
): Promise<T> {
  return await sql.begin(async (tx) => fn(tx as unknown as typeof sql));
}

/**
 * Wrapper utilitario para queries parametrizadas estilo Express pg.
 * No es la mejor manera idiomática (postgres.js usa tagged templates),
 * pero facilita la migración de código existente.
 *
 * USO RECOMENDADO en código nuevo: tagged template.
 *   await sql`SELECT * FROM curso WHERE id = ${id}`
 *
 * USO LEGACY (para acelerar port):
 *   await query("SELECT * FROM curso WHERE id = $1", [id])
 */
export async function query<T = unknown>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[] }> {
  const rows = await sql.unsafe(text, params as any[]);
  return { rows: rows as T[] };
}
