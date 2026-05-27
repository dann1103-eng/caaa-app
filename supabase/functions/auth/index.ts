// CAAA · Edge Function /auth
//
// Endpoints:
//   POST /auth/login    — usuario+password → { token, user }
//   GET  /auth/refresh  — Authorization: Bearer <old token> → { token }
//   POST /auth/logout   — invalida sesión actual (nullea current_session_id)
//
// Port directo de controllers/authController.js del backend Node:
//   - bcrypt para hashing con fallback plaintext (migración legacy)
//   - control de sesión única (current_session_id)
//   - rate limiting básico in-memory (cuenta intentos por IP)
//   - locked_until con backoff tras 5 intentos fallidos

import { Hono } from "hono";
import * as bcrypt from "bcrypt";
import { sql, withTransaction } from "../_shared/db.ts";
import { signJwt, verifyJwt, bearer } from "../_shared/jwt.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { clientIp, logAuditoria } from "../_shared/audit.ts";
import { authRequired, getClaims } from "../_shared/auth.ts";

const app = new Hono();

// Rate limit muy simple in-memory (no persistente entre deploys, ok para abuse fugaz).
const RATE_BUCKET = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 10;
function rateAllow(ip: string): boolean {
  const now = Date.now();
  const cur = RATE_BUCKET.get(ip);
  if (!cur || now - cur.firstAt > WINDOW_MS) {
    RATE_BUCKET.set(ip, { count: 1, firstAt: now });
    return true;
  }
  cur.count++;
  return cur.count <= LIMIT;
}

interface UsuarioRow {
  id_usuario: number;
  username: string;
  password_hash: string;
  rol: string;
  correo: string | null;
  must_change_password: boolean;
  must_complete_profile?: boolean;
  locked_until: Date | null;
  intentos_fallidos?: number;
}

// ── POST /auth/login ──────────────────────────────────────────────────
app.post("/login", async (c) => {
  const ip = clientIp(c.req.raw) ?? "unknown";
  if (!rateAllow(ip)) {
    return c.json({ message: "Demasiados intentos. Esperá 15 minutos." }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const { username, password } = body as { username?: string; password?: string };
  if (!username || !password) {
    return c.json({ message: "Credenciales requeridas" }, 400);
  }

  try {
    const result = await withTransaction(async (tx) => {
      // FOR UPDATE para evitar race en intentos paralelos
      const rows = (await tx`
        SELECT id_usuario, username, password_hash, rol, correo, must_change_password, locked_until
        FROM public.usuario
        WHERE username = ${username}
        FOR UPDATE
      `) as unknown as UsuarioRow[];

      const u = rows[0];
      if (!u) {
        await logAuditoria(tx, {
          accion: "LOGIN_FAIL",
          entidad: "usuario",
          actor: { id_usuario: null, rol: "ANON" },
          req: { headers: c.req.raw.headers, ip },
          descripcion: `Login fallido (usuario inexistente): ${username}`,
        });
        return { ok: false as const, status: 401, body: { message: "Credenciales incorrectas" } };
      }

      if (u.locked_until && new Date(u.locked_until) > new Date()) {
        return {
          ok: false as const,
          status: 423,
          body: { message: `Usuario bloqueado temporalmente. Esperá hasta ${u.locked_until}.` },
        };
      }

      // Verificación: bcrypt si parece hash, sino plaintext (migración legacy)
      let valid = false;
      if (u.password_hash?.startsWith("$2")) {
        valid = await bcrypt.compare(password, u.password_hash);
      } else {
        valid = password === u.password_hash;
        // Si pasa con plaintext, actualizar a bcrypt
        if (valid) {
          const newHash = await bcrypt.hash(password);
          await tx`UPDATE public.usuario SET password_hash = ${newHash} WHERE id_usuario = ${u.id_usuario}`;
        }
      }

      if (!valid) {
        // Incrementar intentos_fallidos si la columna existe; ignorar si no
        try {
          await tx`
            UPDATE public.usuario
            SET intentos_fallidos = COALESCE(intentos_fallidos, 0) + 1,
                locked_until = CASE
                  WHEN COALESCE(intentos_fallidos, 0) + 1 >= 5
                  THEN NOW() + INTERVAL '3 minutes'
                  ELSE locked_until
                END
            WHERE id_usuario = ${u.id_usuario}
          `;
        } catch (_) {}
        await logAuditoria(tx, {
          accion: "LOGIN_FAIL",
          entidad: "usuario",
          id_entidad: u.id_usuario,
          actor: { id_usuario: u.id_usuario, rol: u.rol },
          req: { headers: c.req.raw.headers, ip },
          descripcion: `Login fallido (password inválido) para ${u.username}`,
        });
        return { ok: false as const, status: 401, body: { message: "Credenciales incorrectas" } };
      }

      // Sesión única: generar session_id y persistir
      const session_id = crypto.randomUUID();
      await tx`
        UPDATE public.usuario
        SET current_session_id = ${session_id},
            intentos_fallidos = 0,
            locked_until = NULL
        WHERE id_usuario = ${u.id_usuario}
      `;

      const must_complete_profile = u.must_change_password || !u.correo;
      const claims = {
        id_usuario: u.id_usuario,
        username: u.username,
        rol: u.rol,
        must_change_password: u.must_change_password,
        must_complete_profile,
        session_id,
      };
      const token = await signJwt(claims);

      await logAuditoria(tx, {
        accion: "LOGIN_OK",
        entidad: "usuario",
        id_entidad: u.id_usuario,
        actor: { id_usuario: u.id_usuario, rol: u.rol },
        req: { headers: c.req.raw.headers, ip },
        descripcion: `Login exitoso ${u.username}`,
      });

      return {
        ok: true as const,
        body: {
          token,
          user: {
            id_usuario: u.id_usuario,
            username: u.username,
            rol: u.rol,
            correo: u.correo,
            must_change_password: u.must_change_password,
            must_set_email: !u.correo,
          },
        },
      };
    });

    if (!result.ok) return c.json(result.body, result.status);
    return c.json(result.body);
  } catch (e) {
    console.error("[auth/login]", e);
    return c.json({ message: "Error en el servidor" }, 500);
  }
});

// ── GET /auth/refresh ─────────────────────────────────────────────────
app.get("/refresh", authRequired(), async (c) => {
  const claims = getClaims(c);
  // Generar token nuevo con el mismo session_id (no rota la sesión)
  const newClaims = { ...claims };
  delete (newClaims as { iat?: number }).iat;
  delete (newClaims as { exp?: number }).exp;
  const token = await signJwt(newClaims);
  return c.json({ token });
});

// ── POST /auth/logout ─────────────────────────────────────────────────
app.post("/logout", authRequired(), async (c) => {
  const claims = getClaims(c);
  await sql`
    UPDATE public.usuario
    SET current_session_id = NULL
    WHERE id_usuario = ${claims.id_usuario}
  `;
  return c.json({ ok: true });
});

// ── Server entry ──────────────────────────────────────────────────────
Deno.serve((req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  return app.fetch(req).then((res) => {
    const newHeaders = new Headers(res.headers);
    Object.entries(corsHeaders(req.headers.get("origin"))).forEach(([k, v]) =>
      newHeaders.set(k, v as string)
    );
    return new Response(res.body, { status: res.status, headers: newHeaders });
  });
});
