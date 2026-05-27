// CAAA · Emisión de eventos Realtime desde Edge Functions.
//
// Supabase Realtime expone dos modos:
//   1. postgres_changes — el cliente se suscribe a cambios en tablas (INSERT/UPDATE/DELETE).
//      Útil para "vuelo_estado_changed", "cuenta_alumno_movimiento" — no requiere broadcast
//      desde el server, la mutación de la tabla dispara el evento naturalmente.
//
//   2. broadcast — el server publica mensajes ad-hoc a un canal. Útil para eventos que NO
//      son cambios en tabla (p.ej. "bloque_iniciado", "nuevo_ticker").
//
// Esta utility cubre el modo (2): broadcast vía API HTTP de Realtime.
//
// Setup: en Supabase Dashboard → API → URL y Service Role Key.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export async function broadcast(
  channel: string,
  event: string,
  payload: unknown,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn("[realtime] SUPABASE_URL o SERVICE_KEY no configurados; broadcast omitido.");
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ topic: channel, event, payload, private: true }],
      }),
    });
    if (!res.ok) {
      console.warn("[realtime] broadcast falló:", res.status, await res.text());
    }
  } catch (e) {
    console.warn("[realtime] broadcast error:", e);
  }
}
