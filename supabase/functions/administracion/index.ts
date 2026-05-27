// CAAA · Edge Function /administracion
//
// Plantilla del módulo de Administración / Contabilidad. Incluye una rebanada
// completa (cuenta corriente) que demuestra el patrón end-to-end. Los demás
// dominios (tarifas, cursos, recibos, facturas, egresos, nómina, documentación,
// médicos, aula virtual, reportes) se portan replicando este mismo patrón.
//
// Ver supabase/docs/PORTING_PLAN.md para la guía detallada.

import { Hono } from "hono";
import { sql, withTransaction } from "../_shared/db.ts";
import { authRequired, requireRole, getClaims } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { logAuditoria, clientIp } from "../_shared/audit.ts";
import { broadcast } from "../_shared/realtime.ts";

const app = new Hono();

// Roles según matriz definida en PORTING_PLAN.md
const READ_ROLES = ["ADMINISTRACION", "ADMIN"];
const WRITE_ROLES = ["ADMINISTRACION"];

app.use("*", authRequired());

// ─── Cuenta corriente ─────────────────────────────────────────────────

// GET /administracion/cuentas — lista alumnos con saldo
app.get("/cuentas", requireRole(READ_ROLES), async (c) => {
  const rows = await sql`
    SELECT a.id_alumno,
           u.username,
           u.correo,
           COALESCE(c.saldo_actual_usd, 0) AS saldo_actual_usd,
           c.ultimo_movimiento_en,
           a.numero_licencia
    FROM public.alumno a
    LEFT JOIN public.usuario u ON u.id_usuario = a.id_usuario
    LEFT JOIN public.cuenta_corriente_alumno c ON c.id_alumno = a.id_alumno
    ORDER BY u.username
  `;
  return c.json({ ok: true, data: rows });
});

// GET /administracion/cuenta/:id_alumno
app.get("/cuenta/:id_alumno", requireRole(READ_ROLES), async (c) => {
  const id_alumno = Number(c.req.param("id_alumno"));
  const rows = await sql`
    SELECT c.id_alumno, COALESCE(c.saldo_actual_usd, 0) AS saldo_actual_usd,
           c.ultimo_movimiento_en, u.username, u.correo
    FROM public.alumno a
    LEFT JOIN public.usuario u ON u.id_usuario = a.id_usuario
    LEFT JOIN public.cuenta_corriente_alumno c ON c.id_alumno = a.id_alumno
    WHERE a.id_alumno = ${id_alumno}
  `;
  if (rows.length === 0) return c.json({ ok: false, message: "Alumno no encontrado" }, 404);
  return c.json({ ok: true, data: rows[0] });
});

// GET /administracion/cuenta/:id_alumno/extracto?desde=&hasta=
app.get("/cuenta/:id_alumno/extracto", requireRole(READ_ROLES), async (c) => {
  const id_alumno = Number(c.req.param("id_alumno"));
  const desde = c.req.query("desde");
  const hasta = c.req.query("hasta");
  const rows = await sql`
    SELECT m.*,
           f.numero_correlativo AS factura_correlativo,
           r.numero_correlativo AS recibo_correlativo,
           u.username AS registrado_por_username,
           ue.username AS editado_por_username
    FROM public.movimiento_cuenta m
    LEFT JOIN public.factura f ON f.id = m.id_factura
    LEFT JOIN public.recibo_pago r ON r.id = m.id_recibo
    LEFT JOIN public.usuario u ON u.id_usuario = m.registrado_por
    LEFT JOIN public.usuario ue ON ue.id_usuario = m.editado_por
    WHERE m.id_alumno = ${id_alumno}
      ${desde ? sql`AND m.fecha >= ${desde}` : sql``}
      ${hasta ? sql`AND m.fecha <= ${hasta}` : sql``}
    ORDER BY m.fecha ASC, m.id ASC
    LIMIT 500
  `;
  return c.json({ ok: true, data: rows });
});

// POST /administracion/cuenta/:id_alumno/cargo-manual
//
// Patrón clave: transacción + FOR UPDATE + auditoría + broadcast realtime.
app.post("/cuenta/:id_alumno/cargo-manual", requireRole(WRITE_ROLES), async (c) => {
  const id_alumno = Number(c.req.param("id_alumno"));
  const body = await c.req.json().catch(() => ({}));
  const { fecha, instructor, factura_no, avion, h_v, h_t, debe, haber, descripcion } = body;
  const claims = getClaims(c);

  const debeNum = Number(debe || 0);
  const haberNum = Number(haber || 0);
  if (debeNum <= 0 && haberNum <= 0) {
    return c.json({ ok: false, message: "Indica un monto en DEBE o HABER" }, 400);
  }
  if (debeNum > 0 && haberNum > 0) {
    return c.json({ ok: false, message: "Un movimiento no puede tener DEBE y HABER" }, 400);
  }

  const esCargo = debeNum > 0;
  const monto = esCargo ? -debeNum : haberNum;
  const tipo = esCargo ? "CARGO_OTRO" : "DEPOSITO";

  try {
    const result = await withTransaction(async (tx) => {
      // Asegurar fila de cuenta + lock
      let cur = await tx`
        SELECT * FROM public.cuenta_corriente_alumno
        WHERE id_alumno = ${id_alumno} FOR UPDATE
      `;
      if (cur.length === 0) {
        await tx`
          INSERT INTO public.cuenta_corriente_alumno (id_alumno, saldo_actual_usd)
          VALUES (${id_alumno}, 0)
        `;
        cur = await tx`
          SELECT * FROM public.cuenta_corriente_alumno
          WHERE id_alumno = ${id_alumno} FOR UPDATE
        `;
      }
      const nuevo_saldo = Number(cur[0].saldo_actual_usd) + monto;

      await tx`
        UPDATE public.cuenta_corriente_alumno
        SET saldo_actual_usd = ${nuevo_saldo}, ultimo_movimiento_en = NOW()
        WHERE id_alumno = ${id_alumno}
      `;

      const descripcionFinal = descripcion ||
        (esCargo
          ? `Cargo manual${avion ? " " + avion : ""}${h_v ? " " + h_v + "h" : ""}${instructor ? " - " + instructor : ""}`
          : `Depósito manual`);

      const mov = await tx`
        INSERT INTO public.movimiento_cuenta
          (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
           instructor_nombre, avion_codigo, horas_vuelo, horas_totales,
           generado_automatico, registrado_por)
        VALUES (${id_alumno}, ${tipo}, ${fecha || new Date()},
                ${descripcionFinal}, ${monto}, ${nuevo_saldo},
                ${instructor || null}, ${avion || null},
                ${h_v != null && h_v !== "" ? Number(h_v) : null},
                ${h_t != null && h_t !== "" ? Number(h_t) : null},
                FALSE, ${claims.id_usuario})
        RETURNING *
      `;

      if (factura_no) {
        const f = await tx`
          SELECT id FROM public.factura WHERE numero_correlativo = ${factura_no} LIMIT 1
        `;
        if (f.length > 0) {
          await tx`UPDATE public.movimiento_cuenta SET id_factura = ${f[0].id} WHERE id = ${mov[0].id}`;
        }
      }

      await logAuditoria(tx, {
        accion: esCargo ? "OTRO" : "OTRO",
        entidad: "movimiento_cuenta",
        id_entidad: mov[0].id,
        actor: { id_usuario: claims.id_usuario, rol: claims.rol },
        req: { headers: c.req.raw.headers, ip: clientIp(c.req.raw) },
        descripcion: `Cargo manual: ${descripcionFinal}`,
        after_data: mov[0],
      });

      return { mov: mov[0], saldo: nuevo_saldo };
    });

    // Broadcast realtime (canal por alumno)
    await broadcast(`cuenta:${id_alumno}`, "movimiento", {
      id_alumno,
      saldo: result.saldo,
    });

    return c.json({ ok: true, data: result.mov, saldo: result.saldo });
  } catch (e) {
    console.error("[cargo-manual]", e);
    return c.json({ ok: false, message: (e as Error).message }, 500);
  }
});

// PATCH /administracion/movimientos/:id — editar con motivo de auditoría
app.patch("/movimientos/:id", requireRole(WRITE_ROLES), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const { fecha, instructor, avion, h_v, h_t, debe, haber, descripcion, motivo_edicion } = body;
  const claims = getClaims(c);

  if (!motivo_edicion || String(motivo_edicion).trim().length < 3) {
    return c.json({ ok: false, message: "Motivo de edición obligatorio (mínimo 3 caracteres)" }, 400);
  }

  try {
    await withTransaction(async (tx) => {
      const cur = await tx`SELECT * FROM public.movimiento_cuenta WHERE id = ${id} FOR UPDATE`;
      if (cur.length === 0) throw new Error("Movimiento no encontrado");
      const mov = cur[0] as Record<string, unknown>;

      const debeNum = debe != null && debe !== "" ? Number(debe) : null;
      const haberNum = haber != null && haber !== "" ? Number(haber) : null;
      let nuevoMonto = Number(mov.monto_usd);
      if (debeNum != null && debeNum > 0) nuevoMonto = -debeNum;
      else if (haberNum != null && haberNum > 0) nuevoMonto = haberNum;

      const diff = nuevoMonto - Number(mov.monto_usd);

      await tx`
        UPDATE public.movimiento_cuenta SET
          fecha             = COALESCE(${fecha || null}, fecha),
          descripcion       = COALESCE(${descripcion || null}, descripcion),
          monto_usd         = ${nuevoMonto},
          instructor_nombre = COALESCE(${instructor || null}, instructor_nombre),
          avion_codigo      = COALESCE(${avion || null}, avion_codigo),
          horas_vuelo       = COALESCE(${h_v != null && h_v !== "" ? Number(h_v) : null}, horas_vuelo),
          horas_totales     = COALESCE(${h_t != null && h_t !== "" ? Number(h_t) : null}, horas_totales),
          editado_en        = NOW(),
          editado_por       = ${claims.id_usuario},
          motivo_edicion    = ${motivo_edicion}
        WHERE id = ${id}
      `;

      if (diff !== 0) {
        await tx`SELECT * FROM public.cuenta_corriente_alumno WHERE id_alumno = ${mov.id_alumno} FOR UPDATE`;
        await tx`
          UPDATE public.movimiento_cuenta
          SET saldo_resultante_usd = saldo_resultante_usd + ${diff}
          WHERE id_alumno = ${mov.id_alumno}
            AND (fecha > ${mov.fecha} OR (fecha = ${mov.fecha} AND id >= ${mov.id}))
        `;
        await tx`
          UPDATE public.cuenta_corriente_alumno c
          SET saldo_actual_usd = (SELECT COALESCE(SUM(monto_usd), 0) FROM public.movimiento_cuenta WHERE id_alumno = ${mov.id_alumno}),
              ultimo_movimiento_en = NOW()
          WHERE c.id_alumno = ${mov.id_alumno}
        `;
      }

      await logAuditoria(tx, {
        accion: "OTRO",
        entidad: "movimiento_cuenta",
        id_entidad: id,
        actor: { id_usuario: claims.id_usuario, rol: claims.rol },
        req: { headers: c.req.raw.headers, ip: clientIp(c.req.raw) },
        descripcion: `Edición movimiento #${id}: ${motivo_edicion}`,
        before_data: mov,
      });
    });

    return c.json({ ok: true });
  } catch (e) {
    console.error("[mov/edit]", e);
    return c.json({ ok: false, message: (e as Error).message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Endpoints PENDIENTES (mismo patrón):
//   - GET/POST/PATCH tarifas/aeronaves
//   - GET/POST/PATCH tarifas/instructores
//   - GET/POST/PATCH cursos + inscripciones
//   - GET/POST/PATCH recibos
//   - GET/POST/PATCH facturas (incluye emisión auto al firmar reporte)
//   - GET/POST/PATCH egresos
//   - GET/POST nomina (calcular dual, aprobar, pagar, detalles)
//   - GET/POST/PATCH documentos (catalogo, alumno, alertas)
//   - GET/POST/PATCH medicos
//   - GET aula/unidades, progreso, evaluaciones
//   - GET reportes (kpis-dashboard, ingresos, egresos, pyl, morosos)
//
// Cada uno sigue el patrón:
//   1. app.<method>("/path", requireRole([...]), async (c) => { ... });
//   2. Para escrituras críticas: withTransaction + FOR UPDATE + logAuditoria + broadcast
//   3. Para lecturas: sql tagged template directo
// ─────────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  return app.fetch(req).then((res) => {
    const h = new Headers(res.headers);
    Object.entries(corsHeaders(req.headers.get("origin"))).forEach(([k, v]) =>
      h.set(k, v as string)
    );
    return new Response(res.body, { status: res.status, headers: h });
  });
});
