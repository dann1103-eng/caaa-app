const webpush = require("web-push");
const db = require("../config/db");

// Web Push (VAPID). Si no hay llaves configuradas, queda deshabilitado y las
// llamadas no hacen nada (no rompen). Las llaves se generan una vez con
// web-push.generateVAPIDKeys() y se ponen en variables de entorno; la privada
// es secreta (Railway env), la pública se sirve al frontend.
const PUB = process.env.VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@caaa.local";
const habilitado = !!(PUB && PRIV);
if (habilitado) {
  try { webpush.setVapidDetails(SUBJECT, PUB, PRIV); }
  catch (e) { console.error("VAPID inválido:", e.message); }
} else {
  console.warn("[webpush] VAPID no configurado — push deshabilitado.");
}

async function guardarSuscripcion(id_usuario, sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error("Suscripción inválida");
  await db.query(
    `INSERT INTO push_subscription (id_usuario, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET id_usuario = $1, p256dh = $3, auth = $4`,
    [id_usuario, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
}

async function eliminarSuscripcion(endpoint) {
  if (!endpoint) return;
  await db.query(`DELETE FROM push_subscription WHERE endpoint = $1`, [endpoint]);
}

// Envía a un conjunto de filas de push_subscription. Limpia las muertas (404/410).
async function enviarA(rows, payloadObj) {
  if (!habilitado || rows.length === 0) return;
  const payload = JSON.stringify(payloadObj);
  await Promise.all(rows.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.query(`DELETE FROM push_subscription WHERE endpoint = $1`, [s.endpoint]).catch(() => {});
      } else {
        console.error("[webpush] error", e.statusCode, e.body || e.message);
      }
    }
  }));
}

// Roles que pueden recibir push (todos salvo ALUMNO, que no tiene el toggle
// en el Header). Fuente única — la usa también adminPushConfigController.
const ROLES_STAFF = ["ADMIN", "ADMINISTRACION", "PROGRAMACION", "TURNO", "INSTRUCTOR", "TALLER", "DUENO"];

// Tipos de evento que disparan push, con etiqueta para la UI de Administración.
// Fuente única — nuevo call-site de notificarStaff debe sumar su tipo acá.
const TIPOS_PUSH = [
  { tipo: "CICLO_TURNO",   label: "Ciclo del turno (abrir/pausa/cambio/cierre)" },
  { tipo: "VUELO_ESTADO",  label: "Salida/regreso de hangar, vuelo completado" },
  { tipo: "TICKER",        label: "Aviso publicado en el ticker de Turno" },
  { tipo: "OPERACIONES",   label: "Abrir/cerrar operaciones (suspensión clima/NOTAM)" },
  { tipo: "TRIPULACION",   label: "Turno cambia la tripulación de un vuelo" },
  { tipo: "MANTENIMIENTO", label: "Aeronave entra/sale de mantenimiento imprevisto" },
];

// Notifica al staff filtrando por rol según la config de `tipo` (Administración
// → Notificaciones push). Si `tipo` no viene, o no tiene ninguna fila
// configurada todavía, cae al comportamiento anterior (todo no-ALUMNO) — así
// un tipo nuevo que alguien agregue sin sembrar su config no se queda mudo.
async function notificarStaff(payloadObj, { excluirUid = null, tipo = null } = {}) {
  if (!habilitado) return;
  try {
    const params = [];
    let rolFilter = `u.rol <> 'ALUMNO'`;
    if (tipo) {
      const cfg = await db.query(
        `SELECT rol FROM push_notificacion_config WHERE tipo = $1 AND habilitado = true`,
        [tipo]
      );
      if (cfg.rows.length > 0) {
        params.push(cfg.rows.map((r) => r.rol));
        rolFilter = `u.rol = ANY($${params.length}::text[])`;
      }
    }
    let extra = "";
    if (excluirUid) { params.push(excluirUid); extra = `AND ps.id_usuario <> $${params.length}`; }
    const r = await db.query(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscription ps
         JOIN usuario u ON u.id_usuario = ps.id_usuario
        WHERE ${rolFilter} AND u.activo = true ${extra}`,
      params
    );
    await enviarA(r.rows, payloadObj);
  } catch (e) {
    console.error("[webpush] notificarStaff:", e.message);
  }
}

// Aviso puntual compuesto a mano (Administración → Avisos), dirigido a los
// roles que el que lo compone elige EN ESE MOMENTO — a diferencia de
// notificarStaff (rutea eventos automáticos según la matriz configurada), acá
// no hay matriz: `roles=null` es "a todos" (incluido ALUMNO, si ya tiene el
// toggle activado), un array es "solo a esos roles".
async function notificarPorRol(payloadObj, roles = null, { excluirUid = null } = {}) {
  if (!habilitado) return;
  try {
    const params = [];
    let rolFilter = "";
    if (Array.isArray(roles) && roles.length > 0) {
      params.push(roles);
      rolFilter = `AND u.rol = ANY($${params.length}::text[])`;
    }
    let extra = "";
    if (excluirUid) { params.push(excluirUid); extra = `AND ps.id_usuario <> $${params.length}`; }
    const r = await db.query(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscription ps
         JOIN usuario u ON u.id_usuario = ps.id_usuario
        WHERE u.activo = true ${rolFilter} ${extra}`,
      params
    );
    await enviarA(r.rows, payloadObj);
  } catch (e) {
    console.error("[webpush] notificarPorRol:", e.message);
  }
}

module.exports = {
  guardarSuscripcion, eliminarSuscripcion, notificarStaff, notificarPorRol,
  vapidPublicKey: PUB, habilitado, ROLES_STAFF, TIPOS_PUSH,
};
