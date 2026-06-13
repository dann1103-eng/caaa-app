// Plantillas de correo HTML para CAAA — Centro de Adiestramiento Aéreo Académico.
//
// Diseño "email-safe": layout 100% en tablas + estilos inline (los clientes de
// correo descartan <style>/CSS externo y flex/grid). Header navy con isotipo
// blanco + línea de acento roja; tarjeta blanca; footer institucional.
//
// Cada función devuelve { subject, html, text }. El `text` es el fallback de
// texto plano (buena práctica anti-spam y para clientes sin HTML).

const BRAND = {
  navy: "#0B2447",
  navyDeep: "#081a33",
  red: "#C8102E",
  ink: "#1f2937",
  muted: "#6b7280",
  line: "#e6e8ec",
  bg: "#eef1f5",
  green: "#0f7a4d",
};

const APP_URL = (process.env.APP_PUBLIC_URL || "https://caaa-app.vercel.app").replace(/\/+$/, "");
const LOGO_URL = `${APP_URL}/iso-caaa-white.png`;
const ESCUELA = "Centro de Adiestramiento Aéreo Académico";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// HH:MM:SS o HH:MM → "06:00"
function hhmm(t) {
  if (!t) return "";
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : String(t);
}

// Envoltura institucional (header + tarjeta + footer).
function baseLayout({ preheader = "", kicker = "", heading = "", introHtml = "", contentHtml = "", ctaText = "", ctaUrl = "" }) {
  const cta = ctaText && ctaUrl ? `
    <tr><td style="padding:8px 0 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="border-radius:8px;background:${BRAND.navy};">
          <a href="${esc(ctaUrl)}" target="_blank"
             style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">
            ${esc(ctaText)} &nbsp;&rarr;
          </a>
        </td>
      </tr></table>
    </td></tr>` : "";

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(heading || ESCUELA)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(11,36,71,.12);">

      <!-- Header -->
      <tr><td style="background:${BRAND.navy};padding:22px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="left" style="vertical-align:middle;">
            <img src="${LOGO_URL}" width="34" height="34" alt="CAAA"
                 style="vertical-align:middle;border:0;display:inline-block;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:3px;vertical-align:middle;padding-left:10px;">C A A A</span>
          </td>
          <td align="right" style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#aebbd0;letter-spacing:.5px;">
            ${esc(ESCUELA)}
          </td>
        </tr></table>
      </td></tr>
      <!-- Línea de acento roja -->
      <tr><td style="height:3px;background:${BRAND.red};line-height:3px;font-size:0;">&nbsp;</td></tr>

      <!-- Cuerpo -->
      <tr><td style="padding:30px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
        ${kicker ? `<div style="font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.red};margin-bottom:8px;">${esc(kicker)}</div>` : ""}
        ${heading ? `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.25;color:${BRAND.ink};">${esc(heading)}</h1>` : ""}
        ${introHtml ? `<div style="font-size:15px;line-height:1.6;color:${BRAND.ink};">${introHtml}</div>` : ""}
      </td></tr>

      <tr><td style="padding:4px 28px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${contentHtml}
          ${cta}
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:22px 28px 26px;border-top:1px solid ${BRAND.line};">
        <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
          ${esc(ESCUELA)} · Aeropuerto de Ilopango, El Salvador
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${BRAND.muted};">
          Este es un correo automático del sistema de gestión CAAA. Por favor no respondas a este mensaje.
          Para gestionar tus vuelos ingresá a <a href="${APP_URL}" style="color:${BRAND.navy};">${APP_URL.replace(/^https?:\/\//, "")}</a>.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// Fila tipo "tarjeta de vuelo" dentro del cuerpo.
function vueloRow({ dia, hora, aeronave, persona, personaLabel }) {
  return `
  <tr><td style="padding:6px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.line};border-radius:10px;">
      <tr>
        <td width="76" style="background:${BRAND.navy};border-radius:10px 0 0 10px;padding:12px 8px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:11px;color:#aebbd0;text-transform:uppercase;letter-spacing:.5px;">${esc(dia)}</div>
          <div style="font-size:18px;font-weight:bold;color:#ffffff;font-family:'Courier New',monospace;">${esc(hora)}</div>
        </td>
        <td style="padding:10px 14px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:15px;font-weight:bold;color:${BRAND.ink};">${esc(aeronave)}</div>
          <div style="font-size:13px;color:${BRAND.muted};margin-top:2px;">${esc(personaLabel)}: ${esc(persona)}</div>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

/** Correo al ALUMNO con su horario semanal publicado. */
function horarioAlumnoEmail({ nombre, semanaLabel, vuelos }) {
  const filas = vuelos.map((v) => vueloRow({
    dia: (v.dia_nombre || "").slice(0, 3),
    hora: hhmm(v.hora_inicio || (v.bloque || "").split(" ")[0]),
    aeronave: v.aeronave || v.aeronave_codigo || "—",
    persona: v.instructor || "—",
    personaLabel: "Instructor",
  })).join("");

  const introHtml = `
    Hola <strong>${esc(nombre)}</strong>, tu horario de vuelos para la semana del
    <strong>${esc(semanaLabel)}</strong> ya está publicado. Estos son tus vuelos programados:`;

  const text = `Hola ${nombre},\n\nTu horario de vuelos de la semana ${semanaLabel} fue publicado:\n` +
    vuelos.map((v) => `• ${v.dia_nombre} ${hhmm(v.hora_inicio)} — ${v.aeronave || v.aeronave_codigo} — Instructor: ${v.instructor}`).join("\n") +
    `\n\nIngresá a ${APP_URL}/alumno/dashboard para ver detalles, llenar tus horas de vuelo o solicitar una cancelación.`;

  return {
    subject: `Tu horario de vuelos — semana ${semanaLabel}`,
    html: baseLayout({
      preheader: `${vuelos.length} vuelo(s) programado(s) esta semana`,
      kicker: "Horario publicado",
      heading: "Tus vuelos de la semana",
      introHtml,
      contentHtml: filas,
      ctaText: "Ver mi horario y registrar vuelos",
      ctaUrl: `${APP_URL}/alumno/dashboard`,
    }),
    text,
  };
}

/** Correo al INSTRUCTOR con sus vuelos asignados de la semana. */
function horarioInstructorEmail({ nombre, semanaLabel, vuelos }) {
  const filas = vuelos.map((v) => vueloRow({
    dia: (v.dia_nombre || "").slice(0, 3),
    hora: hhmm(v.hora_inicio || (v.bloque || "").split(" ")[0]),
    aeronave: v.aeronave || v.aeronave_codigo || "—",
    persona: v.alumno || "—",
    personaLabel: "Alumno",
  })).join("");

  const introHtml = `
    Hola <strong>${esc(nombre)}</strong>, se publicó la programación de la semana del
    <strong>${esc(semanaLabel)}</strong>. Estos son los vuelos que tenés asignados:`;

  const text = `Hola ${nombre},\n\nVuelos asignados para la semana ${semanaLabel}:\n` +
    vuelos.map((v) => `• ${v.dia_nombre} ${hhmm(v.hora_inicio)} — ${v.aeronave || v.aeronave_codigo} — Alumno: ${v.alumno}`).join("\n") +
    `\n\nIngresá a ${APP_URL}/instructor para ver el detalle de cada vuelo.`;

  return {
    subject: `Tus vuelos asignados — semana ${semanaLabel}`,
    html: baseLayout({
      preheader: `${vuelos.length} vuelo(s) asignado(s) esta semana`,
      kicker: "Programación publicada",
      heading: "Tus vuelos asignados",
      introHtml,
      contentHtml: filas,
      ctaText: "Ver mis vuelos asignados",
      ctaUrl: `${APP_URL}/instructor`,
    }),
    text,
  };
}

/** Correo a Administración cuando un alumno aprueba su examen final interno. */
function examenFinalEmail({ alumno, curso, enlace }) {
  const url = `${APP_URL}${enlace || "/administracion/dashboard"}`;
  const introHtml = `
    <strong>${esc(alumno || "Un alumno")}</strong> aprobó el examen final interno de
    <strong>${esc(curso || "su curso")}</strong> y queda <strong style="color:${BRAND.green};">listo para el comité con la AAC</strong>.`;

  const contentHtml = `
    <tr><td style="padding:10px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f7f3;border:1px solid #cfe7da;border-radius:10px;">
        <tr><td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:13px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.5px;">Alumno</div>
          <div style="font-size:16px;font-weight:bold;color:${BRAND.ink};margin-bottom:8px;">${esc(alumno || "—")}</div>
          <div style="font-size:13px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.5px;">Curso</div>
          <div style="font-size:16px;font-weight:bold;color:${BRAND.ink};">${esc(curso || "—")}</div>
        </td></tr>
      </table>
    </td></tr>`;

  const text = `${alumno || "Un alumno"} aprobó el examen final interno de ${curso || "su curso"} y está listo para el comité con la AAC.\n\nVer ficha del alumno: ${url}`;

  return {
    subject: `Examen final aprobado — ${alumno || "alumno"} listo para comité AAC`,
    html: baseLayout({
      preheader: `${alumno || "Un alumno"} está listo para el comité con la AAC`,
      kicker: "Aula virtual",
      heading: "Alumno listo para el comité AAC",
      introHtml,
      contentHtml,
      ctaText: "Ver ficha del alumno",
      ctaUrl: url,
    }),
    text,
  };
}

module.exports = {
  BRAND,
  APP_URL,
  horarioAlumnoEmail,
  horarioInstructorEmail,
  examenFinalEmail,
};
