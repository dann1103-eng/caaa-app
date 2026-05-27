// CAAA · CORS headers compartidos entre todas las Edge Functions.

const ENV_ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Defaults razonables si la env no está seteada (dev local + Vercel preview)
const DEFAULT_ALLOWED = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
];

const ALLOWED = ENV_ALLOWED.length > 0 ? ENV_ALLOWED : DEFAULT_ALLOWED;

export function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && (ALLOWED.includes(origin) || ALLOWED.includes("*"))
    ? origin
    : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, x-client-info, x-proyeccion-key",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Maneja OPTIONS preflight; retorna Response o null. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}
