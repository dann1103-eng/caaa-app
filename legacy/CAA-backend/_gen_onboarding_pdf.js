const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const NAVY = "#1B365D";
const RED = "#C0392B";
const GREEN = "#157347";
const INK = "#1F2937";
const MUTED = "#6B7280";
const LINE = "#E2E8F0";
const SURFACE = "#F8FAFC";

const LOGO_FULL = path.join(__dirname, "assets", "logo-caaa.png");
const LOGO_MARK = path.join(__dirname, "assets", "logo-caaa-mark.png");
// Isotipo blanco: el logo-caaa.png normal lleva texto oscuro y no se lee sobre navy.
const ISO_WHITE = path.join(__dirname, "..", "..", "CAA-frontend", "public", "iso-caaa-white.png");

const PAGE_W = 612; // LETTER
const PAGE_H = 792;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_BOTTOM = 112; // y donde termina el header (linea navy)
const FOOTER_TOP = PAGE_H - 60; // reservamos desde aca para el footer

const doc = new PDFDocument({ size: "LETTER", margin: MARGIN, autoFirstPage: false });
const outPath = path.join(__dirname, "..", "..", "CAAA-Guia-de-Bienvenida.pdf");
doc.pipe(fs.createWriteStream(outPath));

// ── Estado de sección actual (para el header/footer automático de cada página) ──
// Header y footer se dibujan juntos en pageAdded, sin switchToPage (que
// interactúa mal con este listener y termina agregando páginas extra).
let current = { eyebrow: "", title: "" };
let pageNum = 0;

doc.on("pageAdded", () => {
  pageNum += 1;
  if (pageNum === 1) return; // la portada no lleva header/footer de sección
  drawHeader(current.eyebrow, current.title);
  drawFooter(pageNum);
});

function drawHeader(eyebrow, title) {
  doc.image(LOGO_MARK, MARGIN, 40, { height: 26 });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(RED)
    .text(eyebrow.toUpperCase(), MARGIN + 36, 42, { characterSpacing: 0.6, lineBreak: false });
  doc.fontSize(19).font("Helvetica-Bold").fillColor(NAVY)
    .text(title, MARGIN, 66, { width: CONTENT_W, lineBreak: false });
  doc.strokeColor(NAVY).lineWidth(1.5).moveTo(MARGIN, HEADER_BOTTOM).lineTo(PAGE_W - MARGIN, HEADER_BOTTOM).stroke();
  doc.y = HEADER_BOTTOM + 22;
}

function drawFooter(n) {
  const y = FOOTER_TOP;
  doc.strokeColor(LINE).lineWidth(0.75).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
  doc.fontSize(8).font("Helvetica").fillColor(MUTED)
    .text("CAAA — Centro de Adiestramiento Aéreo Académico", MARGIN, y + 8, { width: CONTENT_W / 2, lineBreak: false });
  doc.fontSize(8).font("Helvetica").fillColor(MUTED)
    .text(String(n), MARGIN, y + 8, { width: CONTENT_W, align: "right", lineBreak: false });
}

function section(eyebrow, title) {
  current = { eyebrow, title };
  doc.addPage();
  return doc.y;
}

// Antes de dibujar un bloque de altura conocida, asegura espacio o pasa de página.
function ensureSpace(h) {
  if (doc.y + h > FOOTER_TOP) {
    doc.addPage();
  }
}

// ── Helpers de contenido (todo en modo "flowing": usan doc.y, sin x/y manual) ──

function heading(text, color = NAVY) {
  ensureSpace(28);
  const y = doc.y;
  doc.rect(MARGIN, y + 2, 4, 15).fill(color);
  doc.fontSize(12.5).font("Helvetica-Bold").fillColor(INK).text(text, MARGIN + 12, y, { width: CONTENT_W - 12, lineBreak: false });
  doc.y = y + 26;
}

function paragraph(text, opts = {}) {
  const size = opts.size || 10.5;
  const h = doc.heightOfString(text, { width: CONTENT_W, lineGap: 3 });
  ensureSpace(h + 10);
  doc.fontSize(size).font(opts.bold ? "Helvetica-Bold" : "Helvetica").fillColor(opts.color || INK)
    .text(text, MARGIN, doc.y, { width: CONTENT_W, lineGap: 3 });
  doc.y += 12;
}

// Circulo numerado + titulo + descripcion, en modo flowing.
function step(n, title, desc, opts = {}) {
  const r = 13;
  const tx = MARGIN + r * 2 + 14;
  const tw = CONTENT_W - (r * 2 + 14);
  const titleH = doc.heightOfString(title, { width: tw, fontSize: 11.5 });
  const descH = doc.heightOfString(desc, { width: tw, fontSize: 10, lineGap: 2 });
  const blockH = Math.max(r * 2, titleH + descH + 6) + 16;
  ensureSpace(blockH);

  const y = doc.y;
  doc.circle(MARGIN + r, y + r, r).fill(opts.color || NAVY);
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#fff")
    .text(String(n), MARGIN, y + r - 6, { width: r * 2, align: "center", lineBreak: false });

  doc.fontSize(11.5).font("Helvetica-Bold").fillColor(INK).text(title, tx, y, { width: tw });
  doc.fontSize(10).font("Helvetica").fillColor(MUTED).text(desc, tx, y + titleH + 3, { width: tw, lineGap: 2 });

  doc.y = y + blockH;
}

// Bullet simple (punto rojo + titulo + descripcion), en modo flowing.
function bullet(title, desc) {
  const tw = CONTENT_W - 18;
  const titleH = doc.heightOfString(title, { width: tw, fontSize: 11 });
  const descH = doc.heightOfString(desc, { width: tw, fontSize: 9.5, lineGap: 2 });
  const blockH = titleH + descH + 16;
  ensureSpace(blockH);

  const y = doc.y;
  doc.circle(MARGIN + 4, y + 6, 3.5).fill(RED);
  doc.fontSize(11).font("Helvetica-Bold").fillColor(INK).text(title, MARGIN + 18, y, { width: tw });
  doc.fontSize(9.5).font("Helvetica").fillColor(MUTED).text(desc, MARGIN + 18, y + titleH + 2, { width: tw, lineGap: 2 });
  doc.y = y + blockH;
}

// Caja de aviso con icono vectorial (no usa glifos de fuente para el icono).
function calloutBox(lines, opts = {}) {
  const pad = 12;
  const iconColW = 26;
  let h = pad * 2;
  for (const l of lines) h += doc.heightOfString(l, { width: CONTENT_W - pad * 2 - iconColW, fontSize: 9.5, lineGap: 2 }) + 4;
  ensureSpace(h + 14);

  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_W, h, 6).fill(opts.bg || "#EFF6FF");
  doc.roundedRect(MARGIN, y, 4, h, 2).fill(opts.accent || NAVY);

  const iconCx = MARGIN + pad + 8;
  const iconCy = y + pad + 7;
  drawCalloutIcon(opts.icon || "info", iconCx, iconCy, opts.accent || NAVY);

  let cy = y + pad;
  for (const l of lines) {
    doc.fontSize(9.5).font("Helvetica").fillColor(INK).text(l, MARGIN + pad + iconColW, cy, { width: CONTENT_W - pad * 2 - iconColW, lineGap: 2 });
    cy += doc.heightOfString(l, { width: CONTENT_W - pad * 2 - iconColW, fontSize: 9.5, lineGap: 2 }) + 4;
  }
  doc.y = y + h + 16;
}

// ── Iconos vectoriales (sin depender de glifos de fuente no-ASCII) ─────────
function drawCalloutIcon(type, cx, cy, color) {
  doc.lineWidth(2).strokeColor(color).fillColor(color);
  if (type === "check") {
    doc.circle(cx, cy, 9).lineWidth(1.5).stroke();
    doc.moveTo(cx - 4, cy).lineTo(cx - 1, cy + 3.5).lineTo(cx + 4.5, cy - 4).lineWidth(1.8).stroke();
  } else if (type === "star") {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? 9 : 4;
      pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
    }
    doc.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) doc.lineTo(px, py);
    doc.closePath().fill(color);
  } else if (type === "warn") {
    doc.moveTo(cx, cy - 9).lineTo(cx + 8, cy + 7).lineTo(cx - 8, cy + 7).closePath().lineWidth(1.6).stroke();
    doc.circle(cx, cy + 3.5, 0.9).fill(color);
    doc.moveTo(cx, cy - 3).lineTo(cx, cy + 1.5).lineWidth(1.6).stroke();
  } else { // info
    doc.circle(cx, cy, 9).lineWidth(1.5).stroke();
    doc.circle(cx, cy - 4, 1).fill(color);
    doc.moveTo(cx, cy - 1).lineTo(cx, cy + 5).lineWidth(1.6).stroke();
  }
}

function drawPhoneIcon(x, y, scale = 1) {
  const w = 46 * scale, h = 78 * scale;
  doc.roundedRect(x, y, w, h, 8 * scale).lineWidth(2.5).strokeColor(NAVY).stroke();
  doc.roundedRect(x + 6 * scale, y + 10 * scale, w - 12 * scale, h - 24 * scale, 2).fill(SURFACE);
  doc.circle(x + w / 2, y + h - 8 * scale, 3 * scale).fill(NAVY);
  return { w, h };
}

function drawShareIcon(cx, cy, scale = 1) {
  doc.lineWidth(2 * scale).strokeColor(NAVY);
  doc.moveTo(cx, cy - 12 * scale).lineTo(cx, cy + 6 * scale).stroke();
  doc.moveTo(cx - 7 * scale, cy - 6 * scale).lineTo(cx, cy - 13 * scale).lineTo(cx + 7 * scale, cy - 6 * scale).stroke();
  doc.roundedRect(cx - 12 * scale, cy - 2 * scale, 24 * scale, 20 * scale, 3).lineWidth(2 * scale).strokeColor(NAVY).stroke();
}

function drawDotsMenuIcon(cx, cy, scale = 1) {
  for (let i = -1; i <= 1; i++) doc.circle(cx, cy + i * 7 * scale, 2.2 * scale).fill(NAVY);
}

function drawBellIcon(cx, cy, scale = 1) {
  doc.lineWidth(2 * scale).strokeColor(NAVY);
  doc.moveTo(cx - 8 * scale, cy + 6 * scale)
    .quadraticCurveTo(cx - 8 * scale, cy - 10 * scale, cx, cy - 10 * scale)
    .quadraticCurveTo(cx + 8 * scale, cy - 10 * scale, cx + 8 * scale, cy + 6 * scale)
    .stroke();
  doc.moveTo(cx - 10 * scale, cy + 6 * scale).lineTo(cx + 10 * scale, cy + 6 * scale).stroke();
  doc.circle(cx, cy + 11 * scale, 2.5 * scale).fill(NAVY);
}

// ════════════════════════════════════════════════════════════════════════
// PORTADA (página 1 — sin header/footer automático)
// ════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
doc.rect(0, 0, PAGE_W, 6).fill(RED);

try {
  doc.image(ISO_WHITE, PAGE_W / 2 - 55, 175, { width: 110 });
} catch { /* si falta el logo, seguimos sin el */ }

doc.fontSize(30).font("Helvetica-Bold").fillColor("#fff")
  .text("Guía de Bienvenida", 0, 330, { width: PAGE_W, align: "center", lineBreak: false });
doc.fontSize(14).font("Helvetica").fillColor("#C7D2E8")
  .text("Cómo acceder y usar la plataforma CAAA", 0, 370, { width: PAGE_W, align: "center", lineBreak: false });
doc.fontSize(10).font("Helvetica").fillColor("#8DA3C4")
  .text("caaa-app.vercel.app", 0, 398, { width: PAGE_W, align: "center", lineBreak: false });

doc.moveTo(PAGE_W / 2 - 30, 432).lineTo(PAGE_W / 2 + 30, 432).strokeColor(RED).lineWidth(2).stroke();

doc.fontSize(13).font("Helvetica-Bold").fillColor("#fff")
  .text("CAAA", 0, 470, { width: PAGE_W, align: "center", lineBreak: false });
doc.fontSize(10).font("Helvetica").fillColor("#8DA3C4")
  .text("Centro de Adiestramiento Aéreo Académico", 0, 490, { width: PAGE_W, align: "center", lineBreak: false });

doc.fontSize(9.5).font("Helvetica").fillColor("#8DA3C4")
  .text("Sistema de gestión académica y de operaciones", 0, PAGE_H - 70, { width: PAGE_W, align: "center", lineBreak: false });

// ════════════════════════════════════════════════════════════════════════
// ÍNDICE
// ════════════════════════════════════════════════════════════════════════
section("Contenido", "Qué vas a aprender en esta guía");

const indice = [
  ["1", "Cómo abrir la plataforma", "Desde la computadora y desde el celular, sin instalar nada."],
  ["2", "Instalar la app en tu teléfono", "Recomendado — se abre como una app real, con ícono propio."],
  ["3", "Tu primer inicio de sesión", "Usuario, contraseña inicial y confirmación de tus datos."],
  ["4", "Tu Dashboard", "Qué información ves apenas entrás."],
  ["5", "Agendar tus vuelos", "Cómo pedir horario, avión e instructor."],
  ["6", "El Loadsheet (peso y balance)", "Cuándo se llena y cómo se envía a tu instructor."],
  ["7", "Notificaciones", "Avisos dentro de la app y en tu teléfono."],
  ["8", "Tu Perfil", "Tus datos, documentos, cuenta y ayuda."],
];

for (const [n, title, desc] of indice) {
  ensureSpace(48);
  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_W, 44, 6).fill(SURFACE);
  doc.fontSize(15).font("Helvetica-Bold").fillColor(RED).text(n, MARGIN + 16, y + 12, { width: 24, lineBreak: false });
  doc.fontSize(11.5).font("Helvetica-Bold").fillColor(NAVY).text(title, MARGIN + 48, y + 9, { width: CONTENT_W - 64, lineBreak: false });
  doc.fontSize(9.5).font("Helvetica").fillColor(MUTED).text(desc, MARGIN + 48, y + 25, { width: CONTENT_W - 64, lineBreak: false });
  doc.y = y + 52;
}

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — CÓMO ABRIR LA APP
// ════════════════════════════════════════════════════════════════════════
section("Sección 1", "Cómo abrir la plataforma");

paragraph("CAAA es una aplicación web: no necesitás descargarla de ninguna tienda de aplicaciones. Se usa directamente desde el navegador, tanto en computadora como en el celular.", { size: 11 });

ensureSpace(60);
{
  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_W, 54, 6).fill(NAVY);
  doc.fontSize(10).font("Helvetica").fillColor("#C7D2E8").text("Dirección de la plataforma", MARGIN + 18, y + 12, { lineBreak: false });
  doc.fontSize(16).font("Helvetica-Bold").fillColor("#fff").text("caaa-app.vercel.app", MARGIN + 18, y + 27, { lineBreak: false });
  doc.y = y + 70;
}

heading("Desde una computadora");
step(1, "Abrí tu navegador", "Chrome, Safari, Edge o Firefox — cualquiera funciona.");
step(2, "Escribí la dirección", "caaa-app.vercel.app en la barra de direcciones y presioná Enter.");
step(3, "Guardá el enlace", "Marcalo como favorito (la estrella de la barra de direcciones) para volver rápido la próxima vez.");

heading("Desde tu celular");
step(1, "Abrí Chrome (Android) o Safari (iPhone)", "En iPhone es importante usar Safari para poder instalar la app después (sección 2).");
step(2, "Escribí caaa-app.vercel.app", "Igual que en la computadora, en la barra de direcciones.");

calloutBox([
  "Recomendación: seguí a la sección 2 e instalá la app en tu teléfono. Se va a abrir como una " +
  "aplicación normal, sin la barra del navegador, y con su propio ícono — mucho más cómodo para " +
  "usarla todos los días.",
], { icon: "star", bg: "#FEF3E8", accent: RED });

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — INSTALAR (ANDROID)
// ════════════════════════════════════════════════════════════════════════
section("Sección 2", "Instalar la app en Android");

paragraph("En unos segundos vas a tener el ícono de CAAA en tu pantalla de inicio, como cualquier otra app.", { size: 11 });

ensureSpace(130);
{
  const ix = MARGIN, iy = doc.y;
  const startY = iy;
  const { w } = drawPhoneIcon(ix, iy, 1.15);
  drawDotsMenuIcon(ix + w - 14, iy + 16, 1.1);
  doc.fontSize(8).font("Helvetica").fillColor(MUTED).text("Menú", ix, iy + 96, { width: w + 20, align: "center", lineBreak: false });

  const colX = ix + 90;
  const colW = CONTENT_W - 90;
  doc.y = startY;
  const savedX = MARGIN;
  // dibujamos los pasos en la columna derecha del icono, reutilizando step() con margen temporal
  drawStepsInColumn(colX, colW, startY, [
    ["Abrí caaa-app.vercel.app en Chrome", "Si ya lo tenés abierto, seguí al siguiente paso."],
    ["Tocá el menú de tres puntitos", "Está arriba a la derecha de la pantalla, junto a la barra de direcciones."],
    ["Elegí \"Instalar app\" o \"Agregar a pantalla de inicio\"", "El texto exacto puede variar un poco según la versión de Chrome."],
    ["Confirmá tocando \"Instalar\"", "Listo — el ícono de CAAA ya está en tu pantalla de inicio."],
  ]);
}

calloutBox([
  "A partir de ahora, entrá siempre desde ese ícono — se abre más rápido y a pantalla completa, " +
  "sin la barra del navegador.",
], { icon: "check", bg: "#EAF7EF", accent: GREEN });

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — INSTALAR (iOS)
// ════════════════════════════════════════════════════════════════════════
section("Sección 2", "Instalar la app en iPhone");

paragraph("En iPhone el proceso es un poco distinto porque lo hace Safari, no Chrome. Tiene que ser Safari para que funcione.", { size: 11 });

ensureSpace(130);
{
  const ix = MARGIN, iy = doc.y;
  const startY = iy;
  const { w, h } = drawPhoneIcon(ix, iy, 1.15);
  drawShareIcon(ix + w / 2, iy + h - 22, 0.9);
  doc.fontSize(8).font("Helvetica").fillColor(MUTED).text("Compartir", ix, iy + 96, { width: w + 20, align: "center", lineBreak: false });

  const colX = ix + 90;
  const colW = CONTENT_W - 90;
  doc.y = startY;
  drawStepsInColumn(colX, colW, startY, [
    ["Abrí caaa-app.vercel.app en Safari", "El ícono de Safari es la brújula azul. No funciona desde Chrome en iPhone."],
    ["Tocá el ícono de Compartir", "El cuadrito con la flecha hacia arriba, abajo al centro de la pantalla (o arriba, según el modelo)."],
    ["Buscá \"Agregar a inicio\"", "Deslizá la lista de opciones hacia abajo hasta encontrarla."],
    ["Tocá \"Agregar\" arriba a la derecha", "Listo — el ícono de CAAA ya está en tu pantalla de inicio, con el logo correcto."],
  ]);
}

calloutBox([
  "Las notificaciones de la app (avisos de Turno, etc.) solo funcionan en iPhone si la instalás " +
  "de esta forma. Desde el navegador común, no llegan.",
], { icon: "info", bg: "#EFF6FF", accent: NAVY });

// Helper para dibujar pasos en una columna angosta (junto al ícono del teléfono),
// avanzando doc.y al máximo entre la columna y el ícono al terminar.
function drawStepsInColumn(colX, colW, startY, items) {
  let y = startY;
  const r = 11;
  for (let i = 0; i < items.length; i++) {
    const [title, desc] = items[i];
    const tx = colX + r * 2 + 10;
    const tw = colW - (r * 2 + 10);
    const titleH = doc.heightOfString(title, { width: tw, fontSize: 10.5 });
    const descH = doc.heightOfString(desc, { width: tw, fontSize: 9, lineGap: 2 });
    const blockH = Math.max(r * 2, titleH + descH + 5) + 13;

    doc.circle(colX + r, y + r, r).fill(NAVY);
    doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#fff").text(String(i + 1), colX, y + r - 5.5, { width: r * 2, align: "center", lineBreak: false });
    doc.fontSize(10.5).font("Helvetica-Bold").fillColor(INK).text(title, tx, y, { width: tw });
    doc.fontSize(9).font("Helvetica").fillColor(MUTED).text(desc, tx, y + titleH + 2, { width: tw, lineGap: 2 });
    y += blockH;
  }
  doc.y = Math.max(y, startY + 110) + 8;
}

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — PRIMER LOGIN
// ════════════════════════════════════════════════════════════════════════
section("Sección 3", "Tu primer inicio de sesión");

heading("Tus credenciales");
paragraph("La escuela te entregó un usuario y una contraseña inicial. Normalmente:", { size: 10.5 });

ensureSpace(60);
{
  const y = doc.y;
  const credBoxW = (CONTENT_W - 16) / 2;
  doc.roundedRect(MARGIN, y, credBoxW, 56, 6).fillAndStroke(SURFACE, LINE);
  doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("USUARIO", MARGIN + 14, y + 12, { lineBreak: false });
  doc.fontSize(12.5).font("Helvetica-Bold").fillColor(NAVY).text("nombre.apellido", MARGIN + 14, y + 27, { lineBreak: false });
  doc.fontSize(8.5).font("Helvetica").fillColor(MUTED).text("Sin tildes, todo en minúscula", MARGIN + 14, y + 42, { lineBreak: false });

  doc.roundedRect(MARGIN + credBoxW + 16, y, credBoxW, 56, 6).fillAndStroke(SURFACE, LINE);
  doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("CONTRASEÑA INICIAL", MARGIN + credBoxW + 30, y + 12, { lineBreak: false });
  doc.fontSize(11.5).font("Helvetica-Bold").fillColor(NAVY).text("La que te dio la escuela", MARGIN + credBoxW + 30, y + 27, { width: credBoxW - 16, lineBreak: false });
  doc.fontSize(8.5).font("Helvetica").fillColor(MUTED).text("Vas a tener que cambiarla", MARGIN + credBoxW + 30, y + 42, { lineBreak: false });
  doc.y = y + 74;
}

heading("Qué va a pasar la primera vez que entrás");
step(1, "Iniciás sesión con tu usuario y contraseña inicial", "Igual que cualquier otro login.");
step(2, "Aparece un formulario para confirmar tus datos",
  "Te pide revisar/completar tu nombre, correo, teléfono y datos de identificación. Es obligatorio " +
  "— no podés seguir sin completarlo, pero solo te lo pide una vez.");
step(3, "Elegís una contraseña nueva", "Una que solo conozcas vos. A partir de ahí ya podés usar la plataforma normalmente.");

calloutBox([
  "Si no te acordás tu usuario o tu contraseña inicial, pedíselo a la escuela — no lo puede " +
  "recuperar la plataforma sola.",
], { icon: "warn", bg: "#FDECEC", accent: RED });

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — DASHBOARD
// ════════════════════════════════════════════════════════════════════════
section("Sección 4", "Tu Dashboard");

paragraph("Es lo primero que ves al entrar. Reúne toda la información importante del día en una sola pantalla.", { size: 11 });

const dashItems = [
  ["Tus próximos vuelos", "Los que ya tenés agendados para esta semana y la próxima, con día, hora, avión e instructor."],
  ["Reporte del tiempo (METAR)", "Las condiciones actuales del aeródromo, en versión técnica y en versión fácil de leer, con la hora de la última actualización."],
  ["Estado de operaciones", "Si el aeródromo está operando con normalidad o si hay alguna suspensión (por clima, viento, etc.)."],
  ["Avisos de Turno", "Anuncios importantes publicados por el personal de turno — solo aparece cuando hay algo activo."],
  ["Notificaciones", "La campana en la parte de arriba — ahí llegan avisos sobre tus vuelos, tu cuenta, tus exámenes, etc."],
];
for (const [title, desc] of dashItems) bullet(title, desc);

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — AGENDAR VUELOS
// ════════════════════════════════════════════════════════════════════════
section("Sección 5", "Agendar tus vuelos");

step(1, "Esperá a que se abra la agenda de la semana", "Cada nivel de licencia tiene su propio día de apertura — la plataforma no te deja agendar antes de esa fecha.");
step(2, "Elegí día, horario y avión", "Solo vas a poder elegir aviones que estén habilitados para tu licencia.");
step(3, "Agregá un comentario para tu instructor (obligatorio)", "Contale brevemente qué necesitás practicar o cualquier detalle relevante para ese vuelo.");
step(4, "Guardá tu solicitud", "Tu instructor la revisa y la envía a programación, que confirma el horario final.");

heading("Si necesitás cancelar un vuelo");
paragraph(
  "Podés cancelar desde la misma plataforma, pero hay reglas para evitar cancelaciones de último " +
  "momento sin motivo: solo se permite una cancelación por semana, y cancelar muy seguido puede " +
  "generar una multa. La plataforma te muestra cuántas cancelaciones llevás antes de confirmar.",
  { size: 10.5 });

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 6 — LOADSHEET
// ════════════════════════════════════════════════════════════════════════
section("Sección 6", "El Loadsheet (peso y balance)");

paragraph("Antes de cada vuelo con aeronave (no aplica a simulador) hay que completar el cálculo de peso y balance del avión.", { size: 11 });

step(1, "Entrá al loadsheet desde tu vuelo agendado", "Vas a encontrar el acceso directo en la tarjeta de ese vuelo, en tu dashboard u horario.");
step(2, "Completá los 5 pasos del formulario", "Datos del vuelo, pesos y balance, navegación, combustible/operaciones y el resumen final.");
step(3, "Revisá que el resultado diga \"LISTO\"", "Si el peso o el centro de gravedad quedan fuera de los límites permitidos, te lo va a marcar en rojo.");
step(4, "Tocá \"Guardar y enviar\"",
  "Tu instructor lo ve directamente en la plataforma para revisarlo antes del vuelo — no hace falta " +
  "que se lo mandes por ningún otro medio.");

calloutBox([
  "Podés guardar como borrador y volver más tarde a terminarlo. Solo cuando tocás \"Guardar y " +
  "enviar\" tu instructor puede verlo.",
], { icon: "info", bg: "#EFF6FF", accent: NAVY });

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 7 — NOTIFICACIONES
// ════════════════════════════════════════════════════════════════════════
section("Sección 7", "Notificaciones");

ensureSpace(70);
{
  const y = doc.y;
  doc.circle(MARGIN + 18, y + 18, 26).fill(SURFACE);
  drawBellIcon(MARGIN + 18, y + 18, 1.4);
  const tx = MARGIN + 60;
  doc.fontSize(10.5).font("Helvetica").fillColor(INK)
    .text("Hay dos formas de enterarte de novedades sobre tus vuelos, tu cuenta y avisos generales de la escuela:", tx, y + 8, { width: CONTENT_W - 60 });
  doc.y = y + 56;
}

heading("Dentro de la plataforma");
paragraph("La campana en la parte de arriba de cualquier pantalla. Ahí se acumulan tus avisos aunque no tengas la app abierta en el momento — los ves la próxima vez que entrás.", { size: 10.5 });

heading("Notificaciones en tu teléfono (opcional)");
paragraph("Si instalaste la app siguiendo la sección 2, también podés activar notificaciones del sistema, iguales a las de cualquier otra app — llegan aunque tengas el teléfono bloqueado.", { size: 10.5 });

calloutBox([
  "Por ahora, este tipo de notificación push está pensada para el personal de la escuela " +
  "(instructores, administración, turno). Si en algún momento se habilita para alumnos, te vamos a avisar.",
], { icon: "info", bg: "#EFF6FF", accent: NAVY });

// ════════════════════════════════════════════════════════════════════════
// SECCIÓN 8 — PERFIL
// ════════════════════════════════════════════════════════════════════════
section("Sección 8", "Tu Perfil");

paragraph("Tocá tu nombre o el ícono de persona en el menú para llegar a tu perfil. Ahí vas a encontrar, organizado en pestañas:", { size: 11 });

const perfilItems = [
  ["Cuenta", "Tus datos personales y de contacto — podés editarlos cuando cambien."],
  ["Datos de vuelo", "Tu licencia, certificado médico, seguro, e instructor asignado."],
  ["Documentos", "Los archivos que la escuela tiene guardados sobre vos (contratos, certificados, etc.)."],
  ["Cuenta corriente", "El detalle de tus pagos y cargos, y tu saldo actual."],
  ["Historial", "Tu bitácora de vuelos, cursos y exámenes."],
];
for (const [title, desc] of perfilItems) bullet(title, desc);

ensureSpace(100);
{
  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_W, 90, 6).fill(NAVY);
  doc.fontSize(13).font("Helvetica-Bold").fillColor("#fff").text("¿Tenés dudas?", MARGIN + 20, y + 18, { lineBreak: false });
  doc.fontSize(10).font("Helvetica").fillColor("#C7D2E8")
    .text("Consultá con la escuela — cualquier duda sobre tu usuario, tus vuelos o tu cuenta la resuelve el personal de CAAA.", MARGIN + 20, y + 40, { width: CONTENT_W - 40, lineGap: 3 });
  doc.y = y + 90;
}

doc.end();

console.log("PDF generado en:", outPath, "- páginas:", pageNum);
