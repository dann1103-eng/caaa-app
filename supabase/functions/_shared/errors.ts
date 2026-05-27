// CAAA · Helpers de respuesta de error.

import { corsHeaders } from "./cors.ts";

/** Lanza un error con shape { status, body } — usado por handlers. */
export function errJson(status: number, message: string, extras?: Record<string, unknown>) {
  const e = new Error(message) as Error & { status: number; body: unknown };
  e.status = status;
  e.body = { message, ...(extras ?? {}) };
  return e;
}

/** Wrapper para convertir errores no controlados en respuestas JSON consistentes. */
export function jsonError(err: unknown, req?: Request): Response {
  const cors = corsHeaders(req?.headers.get("origin") ?? null);
  if (err && typeof err === "object" && "status" in err && "body" in err) {
    const e = err as { status: number; body: unknown };
    return new Response(JSON.stringify(e.body), {
      status: e.status,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
  console.error("[unhandled]", err);
  const msg = err instanceof Error ? err.message : "Error interno";
  return new Response(JSON.stringify({ message: msg }), {
    status: 500,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
