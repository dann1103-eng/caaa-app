/**
 * PDFs de los formatos de bodega de la OMA.
 *
 * Réplicas de los formularios en papel, para que lo impreso desde el sistema se
 * pueda firmar y archivar igual que siempre. El código y la revisión del
 * formulario NO van incrustados: llegan desde `taller_formulario`, porque la AAC
 * puede publicar una revisión nueva y eso no debe ser un despliegue.
 *
 * Viven aparte de `pdfGenerator.js` (que ya son 1000 líneas de facturas,
 * planillas y reportes de vuelo) porque son otro dominio y otro formato de hoja.
 *
 * Spec: docs/superpowers/specs/2026-08-17-solicitud-almacen-sobrantes-design.md
 */
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const AZUL = "#1B365D";
const LOGO = path.join(__dirname, "..", "assets", "iso-caaa-navy.png");

const txt = (v) => (v === null || v === undefined ? "" : String(v));
const num = (v, d = 0) => (v === null || v === undefined || isNaN(Number(v)) ? "" : Number(v).toFixed(d));
/**
 * Fecha dd/mm/aaaa. Va con guarda porque node-postgres devuelve las columnas
 * DATE como objeto Date, y un String() directo imprime "Tue Jul 07 2026 …"
 * (el mismo tropiezo del P&L, §16.A). Los getters son locales a propósito: pg
 * parsea DATE a medianoche local, así que los UTC correrían un día.
 */
const fecha = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

/** Encabezado común: logo, razón social y título centrado. */
function encabezado(doc, titulo, subtitulo) {
  if (fs.existsSync(LOGO)) {
    try { doc.image(LOGO, 45, 38, { height: 40 }); } catch { /* sigue sin logo */ }
  }
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(11)
    .text("CENTRO DE ADIESTRAMIENTO AEREO ACADEMICO, S.A. DE C.V.", 95, 42, { width: doc.page.width - 145, align: "center" });
  doc.font("Helvetica").fontSize(8).fillColor("#444")
    .text("Aeropuerto Internacional de Ilopango, Hangar 38-B, San Salvador, El Salvador, C.A.", 95, 56, { width: doc.page.width - 145, align: "center" });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(AZUL)
    .text(titulo, 45, 78, { width: doc.page.width - 90, align: "center" });
  if (subtitulo) {
    doc.font("Helvetica").fontSize(9).fillColor("#444")
      .text(subtitulo, 45, 95, { width: doc.page.width - 90, align: "center" });
  }
  return subtitulo ? 115 : 100;
}

/** Pie con el código y la revisión del formulario, si los tiene configurados. */
function pieFormulario(doc, formulario) {
  if (!formulario?.codigo && !formulario?.revision) return;
  // Una sola línea con lineBreak:false. En dos líneas, la segunda cruzaba el
  // margen inferior y pdfkit agregaba una página en blanco — el mismo bug que
  // ya está documentado en pdfGenerator.drawFooter.
  // -64 y no -48: más abajo, el alto de la línea cruza el margen inferior y
  // pdfkit agrega una página en blanco con el pie solo. Misma altura que usa
  // pdfGenerator.drawFooter, donde ya está documentado el mismo tropiezo.
  const texto = [formulario.codigo, formulario.revision].filter(Boolean).join("   ");
  doc.font("Helvetica").fontSize(7).fillColor("#666")
    .text(texto, doc.page.width - 260, doc.page.height - 64,
      { width: 215, align: "right", lineBreak: false });
}

/** Una celda con etiqueta arriba y valor manuscrito abajo. */
function campo(doc, x, y, ancho, etiqueta, valor, alto = 26) {
  doc.strokeColor("#333").lineWidth(0.7).rect(x, y, ancho, alto).stroke();
  doc.font("Helvetica").fontSize(6.5).fillColor("#555").text(etiqueta, x + 4, y + 3, { width: ancho - 8 });
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000")
    .text(txt(valor), x + 4, y + 12, { width: ancho - 8, ellipsis: true });
}

/** Línea de firma con su etiqueta debajo. */
function firma(doc, x, y, ancho, etiqueta) {
  doc.strokeColor("#333").lineWidth(0.7).moveTo(x, y).lineTo(x + ancho, y).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor("#444").text(etiqueta, x, y + 4, { width: ancho, align: "center" });
}

/**
 * Tabla de renglones. `cols` = [{ titulo, ancho, align, campo }].
 * Dibuja `minFilas` aunque haya menos datos, para que el papel se pueda
 * completar a mano como el original.
 */
function tabla(doc, x, y, cols, filas, { minFilas = 0, altoFila = 18 } = {}) {
  const ancho = cols.reduce((s, c) => s + c.ancho, 0);
  doc.rect(x, y, ancho, altoFila).fillAndStroke("#EEF1F5", "#333");
  let cx = x;
  for (const c of cols) {
    // height + ellipsis y no solo width: sin el alto, pdfkit envuelve el texto
    // a una segunda línea que se monta sobre la fila de abajo.
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(AZUL)
      .text(c.titulo, cx + 3, y + 6, {
        width: c.ancho - 6, align: c.align || "left", height: altoFila - 6, ellipsis: true, lineBreak: false,
      });
    cx += c.ancho;
  }
  let cy = y + altoFila;
  const total = Math.max(filas.length, minFilas);
  for (let i = 0; i < total; i++) {
    const f = filas[i];
    cx = x;
    for (const c of cols) {
      doc.strokeColor("#333").lineWidth(0.5).rect(cx, cy, c.ancho, altoFila).stroke();
      if (f) {
        doc.font("Helvetica").fontSize(8.5).fillColor("#000")
          .text(txt(c.valor(f)), cx + 3, cy + 5, {
            width: c.ancho - 6, align: c.align || "left",
            height: altoFila - 5, ellipsis: true, lineBreak: false,
          });
      }
      cx += c.ancho;
    }
    cy += altoFila;
  }
  return cy;
}

// ── 1 · REQUISICIONES (formato interno) ────────────────────────────────────
function generarRequisicionPDF({ documento: d, renglones, formulario }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 45 });
  let y = encabezado(doc, "REQUISICIONES");

  const W = doc.page.width - 90;
  campo(doc, 45, y, W * 0.62, "Solicitante", d.solicitante);
  campo(doc, 45 + W * 0.62, y, W * 0.38, "N° Documento", d.correlativo);
  y += 26;
  campo(doc, 45, y, W * 0.62, "Cliente", d.cliente);
  campo(doc, 45 + W * 0.62, y, W * 0.38, "Fecha", fecha(d.fecha));
  y += 26;
  campo(doc, 45, y, W * 0.62, "Motivo / trabajo", d.motivo);
  campo(doc, 45 + W * 0.62, y, W * 0.19, "Avión", d.aeronave_codigo);
  campo(doc, 45 + W * 0.81, y, W * 0.19, "TAC", num(d.tacometro, 2));
  y += 38;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(AZUL)
    .text("Observaciones y Correcciones", 45, y);
  y += 12;
  doc.strokeColor("#333").lineWidth(0.7).rect(45, y, W, 54).stroke();
  doc.font("Helvetica").fontSize(9).fillColor("#000")
    .text(txt(d.observaciones), 50, y + 6, { width: W - 10, height: 46 });
  y += 66;

  // La columna que en el papel dice "Costo Unitario" en realidad lleva el
  // código de bodega: acá se rotula por lo que de verdad es.
  tabla(doc, 45, y, [
    { titulo: "CÓDIGO", ancho: W * 0.14, valor: (r) => r.codigo },
    { titulo: "N° DE PARTE", ancho: W * 0.22, valor: (r) => r.parte_no },
    { titulo: "DESCRIPCIÓN", ancho: W * 0.48, valor: (r) => r.descripcion },
    { titulo: "CANTIDAD", ancho: W * 0.16, align: "right", valor: (r) => `${num(Math.abs(r.cantidad))} ${txt(r.unidad)}` },
  ], renglones, { minFilas: 10 });

  const yf = doc.page.height - 130;
  firma(doc, 45, yf, 150, "Mecánico");
  firma(doc, 215, yf, 150, "PA");
  firma(doc, 385, yf, 165, "Autorizado por · Despacho de Bodega");
  pieFormulario(doc, formulario);
  doc.end();
  return doc;
}

// ── 2 · SOLICITUD DE REPUESTOS Y MATERIALES AL ALMACEN (CAAA-004-F) ────────
function generarSolicitudPDF({ documento: d, renglones, retornos = [], formulario }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 45 });
  let y = encabezado(doc, "SOLICITUD DE REPUESTOS Y", "MATERIALES AL ALMACEN");

  const W = doc.page.width - 90;
  campo(doc, 45, y, W * 0.55, "Matrícula aeronave", d.aeronave_codigo);
  campo(doc, 45 + W * 0.55, y, W * 0.45, "Fecha", fecha(d.fecha));
  y += 26;
  campo(doc, 45, y, W * 0.55, "N° orden de trabajo", d.orden_trabajo_no);
  campo(doc, 45 + W * 0.55, y, W * 0.45, "N° solicitud", d.numero_solicitud);
  y += 26;
  campo(doc, 45, y, W * 0.55, "N° tacómetro", num(d.tacometro, 2));
  campo(doc, 45 + W * 0.55, y, W * 0.45, "Solicitante", d.solicitante);
  y += 26;
  campo(doc, 45, y, W, "N° de documento en el sistema · motivo",
    `${d.correlativo}${d.motivo ? ` · ${d.motivo}` : ""}`);
  y += 36;

  const cols = [
    { titulo: "N° PARTE / CÓDIGO", ancho: W * 0.28, valor: (r) => r.parte_no || r.codigo },
    { titulo: "DESCRIPCIÓN", ancho: W * 0.55, valor: (r) => r.descripcion },
    { titulo: "CANTIDAD", ancho: W * 0.17, align: "right", valor: (r) => `${num(Math.abs(r.cantidad))} ${txt(r.unidad)}` },
  ];
  y = tabla(doc, 45, y, cols, renglones, { minFilas: 8 });

  // El apartado de sobrantes se llena SOLO, leyendo los retornos ligados: en el
  // papel había que acordarse de escribirlos y por eso nunca llegaban a bodega.
  y += 14;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(AZUL)
    .text("PARTES PARA RETORNAR AL ALMACEN", 45, y, { width: W, align: "center" });
  y += 14;
  const filasRet = retornos.flatMap((r) =>
    (r.renglones || []).map((x) => ({ ...x, correlativo: r.correlativo, fecha: r.fecha }))
  );
  tabla(doc, 45, y, cols, filasRet, { minFilas: 3 });
  if (filasRet.length) {
    doc.font("Helvetica").fontSize(6.5).fillColor("#666")
      .text(`Devuelto en ${[...new Set(filasRet.map((f) => `${f.correlativo} (${fecha(f.fecha)})`))].join(", ")}`,
        45, doc.y + 4, { width: W });
  }

  const yf = doc.page.height - 120;
  doc.font("Helvetica").fontSize(7.5).fillColor("#444")
    .text("PERSONA QUE ENTREGA REPUESTOS:", 45, yf - 14);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000")
    .text(txt(d.entregado_por), 210, yf - 14, { width: 200 });
  firma(doc, 45, yf + 20, 220, "Firma");
  firma(doc, 300, yf + 20, 250, `Recibe${d.entregado_a ? `: ${d.entregado_a}` : ""}`);
  pieFormulario(doc, formulario);
  doc.end();
  return doc;
}

// ── 3 · CONTROL DE ENTREGA DE ACEITES POR DIA ──────────────────────────────
function generarEntregaAceitesPDF({ hojas, desde, hasta, formulario }) {
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40 });
  const W = doc.page.width - 80;
  let y = encabezado(doc, "CONTROL DE ENTREGA DE ACEITES POR DIA",
    desde || hasta ? `Del ${fecha(desde) || "inicio"} al ${fecha(hasta) || "hoy"}` : null);

  const cols = [
    { titulo: "FECHA", ancho: W * 0.09, valor: (m) => fecha(m.fecha) },
    { titulo: "EXISTENCIA", ancho: W * 0.08, align: "right", valor: (m) => num(Number(m.saldo_corrido) - Number(m.cantidad)) },
    { titulo: "ENTREGADO", ancho: W * 0.08, align: "right", valor: (m) => (Number(m.cantidad) < 0 ? num(-m.cantidad) : `+${num(m.cantidad)}`) },
    { titulo: "EXIST. ACTUAL", ancho: W * 0.09, align: "right", valor: (m) => num(m.saldo_corrido) },
    { titulo: "NOMBRE", ancho: W * 0.15, valor: (m) => m.entregado_a },
    { titulo: "CONCEPTO", ancho: W * 0.29, valor: (m) => [m.aeronave_codigo, m.tarea_nombre || m.motivo].filter(Boolean).join(" · ") || m.proveedor },
    { titulo: "FIRMA ENTREGA", ancho: W * 0.11, valor: () => "" },
    { titulo: "FIRMA RECIBIDO", ancho: W * 0.11, valor: () => "" },
  ];

  for (const h of hojas) {
    if (y > doc.page.height - 140) { doc.addPage({ layout: "landscape", margin: 40 }); y = 50; }
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(AZUL)
      .text(`${h.item.codigo} · ${h.item.descripcion}`, 40, y);
    doc.font("Helvetica").fontSize(8).fillColor("#666")
      .text(`Existencia al cierre: ${num(h.item.stock_actual)} ${txt(h.item.unidad)}${desde ? ` · saldo inicial ${num(h.saldo_inicial)}` : ""}`,
        40, y + 12);
    y += 26;
    // Dos filas en blanco de más: el cuaderno se sigue completando a mano.
    y = tabla(doc, 40, y, cols, h.movimientos, { minFilas: h.movimientos.length ? h.movimientos.length + 2 : 6, altoFila: 16 }) + 18;
  }

  pieFormulario(doc, formulario);
  doc.end();
  return doc;
}

module.exports = { generarRequisicionPDF, generarSolicitudPDF, generarEntregaAceitesPDF };
