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

// Notifica a TODO el staff (usuarios activos que no son ALUMNO). Best-effort.
async function notificarStaff(payloadObj, { excluirUid = null } = {}) {
  if (!habilitado) return;
  try {
    const params = [];
    let extra = "";
    if (excluirUid) { params.push(excluirUid); extra = `AND ps.id_usuario <> $1`; }
    const r = await db.query(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscription ps
         JOIN usuario u ON u.id_usuario = ps.id_usuario
        WHERE u.rol <> 'ALUMNO' AND u.activo = true ${extra}`,
      params
    );
    await enviarA(r.rows, payloadObj);
  } catch (e) {
    console.error("[webpush] notificarStaff:", e.message);
  }
}

module.exports = { guardarSuscripcion, eliminarSuscripcion, notificarStaff, vapidPublicKey: PUB, habilitado };
