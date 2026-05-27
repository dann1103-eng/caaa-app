// CAAA · Registro de auditoría compatible con utils/auditoria.js del backend Node.
//
// Inserta en public.auditoria_evento con la misma firma de columnas. Usar
// dentro de una transacción cuando aplique para que ROLLBACK borre el log
// si falla la operación principal.

import type { Sql } from "https://deno.land/x/postgresjs@v3.4.4/types/index.d.ts";

export interface AuditPayload {
  accion: string;
  entidad: string;
  id_entidad?: number | null;
  id_semana?: number | null;
  actor?: { id_usuario?: number | null; rol?: string | null } | null;
  req?: { headers?: Headers; ip?: string | null } | null;
  descripcion?: string | null;
  metadata?: Record<string, unknown>;
  before_data?: unknown;
  after_data?: unknown;
  origen?: string;
}

export async function logAuditoria(
  client: Sql<any>,
  p: AuditPayload,
): Promise<void> {
  const actor_id_usuario = p.actor?.id_usuario ?? null;
  const actor_rol = (p.actor?.rol ?? "SYSTEM").toUpperCase();
  const ip = p.req?.ip ?? null;
  const user_agent = p.req?.headers?.get("user-agent") ?? null;

  await client`
    INSERT INTO public.auditoria_evento
      (accion, entidad, id_entidad, id_semana, actor_id_usuario, actor_rol, ip, user_agent, origen,
       descripcion, metadata, before_data, after_data)
    VALUES
      (${p.accion}, ${p.entidad}, ${p.id_entidad ?? null}, ${p.id_semana ?? null},
       ${actor_id_usuario}, ${actor_rol}, ${ip}, ${user_agent}, ${p.origen ?? "EDGE"},
       ${p.descripcion ?? null},
       ${JSON.stringify(p.metadata ?? {})}::jsonb,
       ${p.before_data ? JSON.stringify(p.before_data) : null}::jsonb,
       ${p.after_data ? JSON.stringify(p.after_data) : null}::jsonb)
  `;
}

/** Extrae IP del request — Edge Functions de Supabase ponen `x-forwarded-for`. */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}
