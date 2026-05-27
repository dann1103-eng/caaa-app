// CAAA · JWT sign + verify para Edge Functions con djwt.
//
// Mantenemos el formato de claims idéntico al backend Node:
//   { id_usuario, username, rol, must_change_password?, session_id?, iat, exp }
//
// JWT_SECRET viene de la env del proyecto Supabase. Debe ser el MISMO secreto
// que estaba en CAA-backend/.env, para que los tokens existentes sigan válidos.

import {
  create,
  getNumericDate,
  verify,
  type Payload,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SECRET = Deno.env.get("JWT_SECRET") ?? "";
const EXPIRES_IN = Deno.env.get("JWT_EXPIRES_IN") ?? "8h";

if (!SECRET) {
  console.warn("[jwt] JWT_SECRET no está seteado. Los tokens fallarán.");
}

// Convertimos el secret string a CryptoKey HMAC-SHA256
const enc = new TextEncoder();
const keyPromise: Promise<CryptoKey> = crypto.subtle.importKey(
  "raw",
  enc.encode(SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

function parseExpiresToSeconds(s: string): number {
  // Soporta "8h", "30m", "1d", "120s"
  const m = s.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!m) return 8 * 3600;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    default:
      return 8 * 3600;
  }
}

export interface JwtClaims extends Payload {
  id_usuario: number;
  username: string;
  rol: string;
  must_change_password?: boolean;
  must_complete_profile?: boolean;
  session_id?: string;
}

export async function signJwt(
  claims: Omit<JwtClaims, "iat" | "exp">,
  expiresIn: string = EXPIRES_IN,
): Promise<string> {
  const now = getNumericDate(0);
  const exp = getNumericDate(parseExpiresToSeconds(expiresIn));
  return await create(
    { alg: "HS256", typ: "JWT" },
    { ...claims, iat: now, exp },
    await keyPromise,
  );
}

export async function verifyJwt(token: string): Promise<JwtClaims> {
  const payload = await verify(token, await keyPromise);
  return payload as JwtClaims;
}

/** Extrae el token Bearer del header Authorization. */
export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}
