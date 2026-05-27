// CAAA · Middleware de auth para Edge Functions.
//
// Implementa lo equivalente a authMiddleware + roleMiddleware del backend Node:
//   - Verifica firma + expiración del JWT
//   - Valida control de sesión única contra usuario.current_session_id
//   - Bloquea rutas si must_complete_profile y la ruta no está en allowlist
//   - Verifica rol contra una lista permitida
//
// Uso con Hono:
//   app.use("*", authRequired())
//   app.get("/admin/something", requireRole(["ADMIN","ADMINISTRACION"]), handler)

import { bearer, verifyJwt, type JwtClaims } from "./jwt.ts";
import { sql } from "./db.ts";
import { errJson } from "./errors.ts";
import type { Context, Next } from "https://deno.land/x/hono@v3.12.11/mod.ts";

const PROFILE_EXEMPT_PATHS = new Set<string>([
  "/usuario/perfil",
  "/usuario/cambiar-password",
  "/usuario/cambiar-correo",
  "/usuario/update-info",
  "/usuario/update-perfil-alumno",
  "/auth/refresh",
  "/auth/logout",
]);

/** Extrae claims sin validar sesión — útil cuando solo necesitamos el id_usuario rápidamente. */
export async function readClaimsOrThrow(req: Request): Promise<JwtClaims> {
  const token = bearer(req);
  if (!token) throw errJson(401, "No autorizado");
  try {
    return await verifyJwt(token);
  } catch {
    throw errJson(401, "Token inválido o expirado");
  }
}

/** Middleware Hono: requiere JWT válido + sesión activa + perfil completado (excepto rutas exentas). */
export function authRequired() {
  return async (c: Context, next: Next) => {
    const token = bearer(c.req.raw);
    if (!token) return c.json({ message: "No autorizado" }, 401);

    let claims: JwtClaims;
    try {
      claims = await verifyJwt(token);
    } catch {
      return c.json({ message: "Token inválido o expirado" }, 401);
    }

    // Control de sesión única
    if (claims.session_id) {
      const rows = await sql`
        SELECT current_session_id
        FROM public.usuario
        WHERE id_usuario = ${claims.id_usuario}
      ` as unknown as { current_session_id: string | null }[];
      const dbSid = rows[0]?.current_session_id;
      if (dbSid && dbSid !== claims.session_id) {
        return c.json(
          { message: "Sesión cerrada: se ha iniciado sesión en otro dispositivo.", session_conflict: true },
          401,
        );
      }
    }

    // Profile-must-complete: bloquea todo excepto rutas de actualización
    if (claims.must_complete_profile) {
      const path = new URL(c.req.url).pathname.replace(/\/$/, "");
      const tail = path.replace(/^\/[\w-]+/, ""); // quita el nombre de function
      if (!PROFILE_EXEMPT_PATHS.has(tail)) {
        return c.json(
          { message: "Debe completar la actualización de su perfil (correo/contraseña).", must_complete_profile: true },
          403,
        );
      }
    }

    c.set("claims", claims);
    await next();
  };
}

/** Middleware Hono: requiere que el rol del JWT esté en la lista permitida. */
export function requireRole(allowed: string[]) {
  return async (c: Context, next: Next) => {
    const claims = c.get("claims") as JwtClaims | undefined;
    if (!claims) return c.json({ message: "No autenticado" }, 401);
    if (!allowed.includes(claims.rol)) {
      return c.json({ message: "Acceso denegado" }, 403);
    }
    await next();
  };
}

/** Helper para obtener los claims dentro de un handler. */
export function getClaims(c: Context): JwtClaims {
  return c.get("claims") as JwtClaims;
}
