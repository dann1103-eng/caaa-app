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
const { marca, imagen } = require("./marca");

const AZUL = "#1B365D";
const LOGO = imagen("iso_navy");

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
/**
 * Pega la firma dibujada (data URL PNG del canvas) dentro de una celda.
 *
 * Best-effort a propósito: si el data URL viniera corrupto, el papel sale igual
 * con el nombre y la licencia. Un PDF que no se genera es peor que uno sin el
 * trazo.
 */
function dibujarFirma(doc, dataUrl, x, y, ancho, alto) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) return;
  try {
    const base64 = dataUrl.split(",")[1];
    doc.image(Buffer.from(base64, "base64"), x, y, { fit: [ancho, alto], align: "center" });
  } catch { /* el papel sale sin el trazo */ }
}

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
  firma(doc, 45, yf + 20, 220, `Entrega${d.entregado_por ? `: ${d.entregado_por}` : ""}`);
  firma(doc, 300, yf + 20, 250, `Recibe${d.entregado_a ? `: ${d.entregado_a}` : ""}`);
  // Los trazos van sobre la línea de cada quien: el papel sale ya firmado.
  dibujarFirma(doc, d.firma_entrega, 60, yf - 6, 190, 24);
  dibujarFirma(doc, d.firma_recibe, 315, yf - 6, 220, 24);
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


// ── 4 · ORDEN DE TRABAJO (CAAA-006-F) ──────────────────────────────────────
//
// Es el documento que certifica el trabajo y que sí audita la AAC. Su cabecera
// no se parece a la de los formatos de bodega: lleva el código del
// procedimiento a la izquierda y el número de orden en un recuadro aparte.
function generarOrdenTrabajoPDF({ orden: o, partes = [], formulario }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 45 });
  const W = doc.page.width - 90;

  if (fs.existsSync(LOGO)) {
    try { doc.image(LOGO, 45, 40, { height: 38 }); } catch { /* sigue sin logo */ }
  }
  // Bloque central: CAAA / OMA + el código del procedimiento.
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000")
    .text(`${marca.nombre} / OMA`, 140, 46, { width: W - 260, align: "center" })
    .fontSize(12)
    .text(txt(formulario?.procedimiento) || marca.codigo_oma, 140, 68, { width: W - 260, align: "center" });

  // Recuadro del número de orden, a la derecha, como en el papel.
  const xN = 45 + W - 190;
  doc.strokeColor("#333").lineWidth(0.7).rect(xN, 38, 190, 56).stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#B03030")
    .text("ORDEN DE", xN, 44, { width: 190, align: "center" })
    .text("TRABAJO N°", xN, 57, { width: 190, align: "center" });
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000")
    .text(txt(o.correlativo), xN, 74, { width: 190, align: "center" });

  let y = 100;

  // Cabecera de 5 campos, en una fila como el original.
  const anchos = [W * 0.16, W * 0.18, W * 0.18, W * 0.22, W * 0.26];
  const datos = [
    ["Matrícula:", o.aeronave_codigo],
    ["Fecha:", fecha(o.fecha)],
    ["Tacómetro", num(o.tacometro, 2)],
    ["Tipo de aeronave", o.designacion || o.modelo],
    ["Piloto/Operador/Mantto.", o.piloto_operador],
  ];
  let x = 45;
  datos.forEach(([et, v], i) => { campo(doc, x, y, anchos[i], et, v, 34); x += anchos[i]; });
  y += 46;

  // Discrepancia
  doc.font("Helvetica").fontSize(7.5).fillColor("#555")
    .text("Discrepancia/ Falla / Trabajo a efectuar", 48, y);
  doc.strokeColor("#333").lineWidth(0.7).rect(45, y - 4, W, 46).stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000")
    .text(txt(o.discrepancia), 50, y + 12, { width: W - 10, height: 26, ellipsis: true });
  y += 52;

  // Acción correctiva: el bloque grande, con la certificación al final.
  const altoAccion = partes.length ? 250 : 300;
  doc.font("Helvetica").fontSize(7.5).fillColor("#555").text("Acción Correctiva:", 48, y);
  doc.strokeColor("#333").lineWidth(0.7).rect(45, y - 4, W, altoAccion).stroke();
  doc.font("Helvetica").fontSize(9).fillColor("#000")
    .text(txt(o.accion_correctiva), 50, y + 12, { width: W - 10, height: altoAccion - 20, align: "justify" });
  y += altoAccion + 6;

  // Bloque de firma: 4 celdas como el papel.
  const fw = [W * 0.34, W * 0.22, W * 0.12, W * 0.32];
  const firmas = [
    ["Firma Mec. / Lic.", [o.mecanico_nombre, o.licencia_tma].filter(Boolean).join("  ")],
    ["Fecha:", fecha(o.fecha_firma)],
    ["R II", o.r_ii],
    ["Certificado Aprendiz", [o.aprendiz_nombre, o.certificado_aprendiz].filter(Boolean).join("  ")],
  ];
  x = 45;
  const xFirmaMec = x;
  firmas.forEach(([et, v], i) => { campo(doc, x, y, fw[i], et, v, 34); x += fw[i]; });

  // La firma dibujada va DENTRO de su celda: es lo que hace que el papel salga
  // impreso ya firmado y no haya que firmarlo a mano después.
  dibujarFirma(doc, o.firma_mecanico, xFirmaMec + 4, y + 4, fw[0] - 8, 22);
  y += 42;

  // La del jefe, cuando la orden ya fue revisada y aprobada.
  if (o.firma_jefe || o.aprobador_nombre) {
    const anchoJefe = W * 0.5;
    campo(doc, 45, y, anchoJefe, "Revisado y aprobado — Jefe de taller",
          [o.aprobador_nombre, o.aprobador_licencia].filter(Boolean).join("  "), 34);
    campo(doc, 45 + anchoJefe, y, W - anchoJefe, "Fecha de aprobación", fecha(o.fecha_aprobacion), 34);
    dibujarFirma(doc, o.firma_jefe, 49, y + 4, anchoJefe - 8, 22);
    y += 42;
  }

  // Parte Reemplazada
  doc.font("Helvetica").fontSize(8).fillColor("#555").text("Parte Reemplazada", 48, y);
  y += 12;
  tabla(doc, 45, y, [
    { titulo: "Cantidad", ancho: W * 0.11, align: "right", valor: (p) => num(p.cantidad) },
    { titulo: "P/N ON", ancho: W * 0.18, valor: (p) => p.pn_on },
    { titulo: "S/N ON", ancho: W * 0.16, valor: (p) => p.sn_on },
    { titulo: "Nombre", ancho: W * 0.21, valor: (p) => p.nombre },
    { titulo: "P/N OFF", ancho: W * 0.18, valor: (p) => p.pn_off },
    { titulo: "S/N OFF", ancho: W * 0.16, valor: (p) => p.sn_off },
  ], partes, { minFilas: Math.max(partes.length + 1, 5), altoFila: 16 });

  pieFormulario(doc, formulario);
  doc.end();
  return doc;
}

// ── 5 · REPORTE DE INSPECCION ──────────────────────────────────────────────
//
// La entrega del avión de Operaciones al Taller: lo firma un piloto y es el
// disparador de todo el circuito.
function generarReporteInspeccionPDF({ reporte: r, formulario }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 45 });
  const W = doc.page.width - 90;
  let y = encabezado(doc, "REPORTE DE INSPECCIÓN");

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000")
    .text(`N° ${txt(r.correlativo)}`, 45, y, { width: W, align: "center" });
  y += 22;

  campo(doc, 45, y, W * 0.40, "Avión matrícula", r.aeronave_codigo);
  campo(doc, 45 + W * 0.40, y, W * 0.30, "Tacómetro", num(r.tacometro, 2));
  campo(doc, 45 + W * 0.70, y, W * 0.30, "Fecha", fecha(r.fecha));
  y += 30;
  campo(doc, 45, y, W * 0.62, "Reporte por (piloto)", r.piloto || r.piloto_nombre);
  campo(doc, 45 + W * 0.62, y, W * 0.38, "Tipo de inspección", r.tipo_inspeccion);
  y += 42;

  for (const [titulo, valor, alto] of [
    ["OBSERVACIONES", r.observaciones, 150],
    ["TRABAJO REALIZADO", r.trabajo_realizado, 210],
  ]) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(AZUL)
      .text(titulo, 45, y, { width: W, align: "center" });
    y += 14;
    doc.strokeColor("#333").lineWidth(0.7).rect(45, y, W, alto).stroke();
    doc.font("Helvetica").fontSize(9).fillColor("#000")
      .text(txt(valor), 50, y + 6, { width: W - 10, height: alto - 12, align: "justify" });
    y += alto + 18;
  }

  const yf = doc.page.height - 110;
  firma(doc, 60, yf, 190, `OPERACIONES ${marca.nombre}`);
  firma(doc, doc.page.width - 250, yf, 190, "MECÁNICO");
  pieFormulario(doc, formulario);
  doc.end();
  return doc;
}


// ═══════════════════════════════════════════════════════════════════════════
// Stickers de constancia para los libros del avión
//
// Se imprimen en papel adhesivo carta y se recortan a mano, así que van uno
// debajo del otro con línea de corte punteada. El recuadro replica el Word que
// usa la OMA: logo, las tres líneas de la organización, la grilla de tres
// columnas, el cuerpo y las dos firmas.
//
// Regla dura del paginador: NUNCA partir un recuadro entre dos páginas. Un
// sticker cortado a la mitad no se puede pegar en el libro.
//
// Spec: docs/superpowers/specs/2026-08-22-stickers-libros-aeronave-design.md
// ═══════════════════════════════════════════════════════════════════════════

const LOGO_STICKER = imagen("logo");

/** Horas con separador de miles y dos decimales, como en el papel. */
const horas = (v) =>
  v === null || v === undefined || v === "" || isNaN(Number(v))
    ? "N/A"
    : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "Ilopango, 30/jul/2026". Mismo cuidado que `fecha()`: node-postgres devuelve
// DATE como objeto Date y los getters van locales, no UTC.
const MESES_STK = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function lugarFecha(lugar, v) {
  const lug = txt(lugar) || "Ilopango";
  if (!v) return lug;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return lug + ", " + String(v).slice(0, 10);
  return lug + ", " + String(d.getDate()).padStart(2, "0") + "/" + MESES_STK[d.getMonth()] + "/" + d.getFullYear();
}

/**
 * "TMA #090". El numero de licencia se guarda como lo escribe Administracion y
 * suele venir ya con el prefijo ("TMA 090"), asi que anteponer "TMA #" a secas
 * imprimia "TMA #TMA 090" en un documento que va pegado en un libro oficial.
 */
function licenciaTma(v) {
  const s = txt(v).trim();
  if (!s) return "TMA #";
  return "TMA #" + s.replace(/^tma/i, "").replace(/^[\s#.:-]+/, "");
}

/** Alto que va a ocupar el recuadro, para poder decidir el salto de página. */
function altoSticker(doc, s, ancho) {
  doc.font("Helvetica").fontSize(8.5);
  const cuerpo = doc.heightOfString(txt(s.texto), { width: ancho - 24, align: "justify" });
  return 48 + 42 + cuerpo + 44;   // cabecera + grilla + cuerpo + firmas
}

function dibujarSticker(doc, s, x, y, ancho) {
  const alto = altoSticker(doc, s, ancho);
  doc.save();
  doc.strokeColor("#111").lineWidth(1).rect(x, y, ancho, alto).stroke();

  // ── Cabecera: logo a la izquierda, la organización centrada ──────────────
  if (fs.existsSync(LOGO_STICKER)) {
    try { doc.image(LOGO_STICKER, x + 8, y + 7, { height: 32 }); } catch { /* sale sin logo */ }
  }
  doc.fillColor("#000").font("Helvetica-Bold").fontSize(9)
    .text("ORGANIZACIÓN DE MANTENIMIENTO AUTORIZADO", x + 46, y + 8, { width: ancho - 60, align: "center" });
  doc.fontSize(8.5)
    .text("C.A.A.A. S.A. de C.V.", x + 46, y + 20, { width: ancho - 60, align: "center" });
  doc.font("Helvetica").fontSize(8)
    .text(txt(s.codigo_formulario) || marca.codigo_oma, x + 46, y + 31, { width: ancho - 60, align: "center" });

  // ── Grilla de tres columnas, tal como el papel ───────────────────────────
  // Col 1: Matrícula / Marca / Modelo · Col 2: TAC / T.T. / TSO
  // Col 3: M/N / S/N / T.C.           · a la derecha, lugar y fecha
  const gy = y + 48;
  const W_FECHA = 104;                       // reservado para "Ilopango, 30/jul/2026"
  const util = ancho - 20 - W_FECHA - 10;
  const w1 = Math.round(util * 0.37);        // Matrícula / Marca / Modelo
  const w2 = Math.round(util * 0.29);        // TAC / T.T / TSO
  const w3 = util - w1 - w2;                 // M/N / S/N / T.C — la de los P/N largos
  const c1 = x + 10, c2 = c1 + w1, c3 = c2 + w2;
  const fila = (i) => gy + i * 12.5;
  const par = (etq, val, cx, i, wEtq, wVal) => {
    doc.font("Helvetica").fontSize(8).fillColor("#333")
      .text(etq, cx, fila(i), { width: wEtq, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000")
      .text(txt(val) || "-", cx + wEtq, fila(i), { width: wVal, lineBreak: false, ellipsis: true, height: 11 });
  };

  par("Matrícula:", s.matricula, c1, 0, 48, w1 - 50);
  par("Marca:", s.marca, c1, 1, 48, w1 - 50);
  par("Modelo:", s.modelo, c1, 2, 48, w1 - 50);
  par("TAC:", horas(s.tac), c2, 0, 30, w2 - 32);
  par("T.T:", horas(s.tt), c2, 1, 30, w2 - 32);
  par("TSO:", horas(s.tso), c2, 2, 30, w2 - 32);
  par("M/N:", s.mn, c3, 0, 30, w3 - 32);
  par("S/N:", s.sn, c3, 1, 30, w3 - 32);
  par("T.C:", s.tc, c3, 2, 30, w3 - 32);

  doc.font("Helvetica").fontSize(7.5).fillColor("#000")
    .text(lugarFecha(s.lugar, s.fecha), x + ancho - 10 - W_FECHA, fila(0),
      { width: W_FECHA, align: "right", lineBreak: false });

  // ── Cuerpo ───────────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(8.5).fillColor("#000")
    .text(txt(s.texto), x + 12, y + 48 + 42, { width: ancho - 24, align: "justify" });

  // ── Firmas ───────────────────────────────────────────────────────────────
  const fy = y + alto - 32;
  const mitad = Math.round((ancho - 24) / 2);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000")
    .text(txt(s.mecanico_nombre), x + 12, fy, { width: mitad, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(8)
    .text("Mecánico " + licenciaTma(s.mecanico_tma), x + 12, fy + 12, { width: mitad, align: "center", lineBreak: false });

  if (s.aprendiz_nombre) {
    doc.font("Helvetica-Bold").fontSize(8.5)
      .text(txt(s.aprendiz_nombre), x + 12 + mitad, fy, { width: mitad, align: "center", lineBreak: false });
    doc.font("Helvetica").fontSize(8)
      .text("Lic. de Aprendiz #" + txt(s.aprendiz_certificado).replace(/^[\s#]+/, ""), x + 12 + mitad, fy + 12,
        { width: mitad, align: "center", lineBreak: false });
  }

  // Un sticker anulado se re-imprime igual (queda en el historial), pero tiene
  // que verse que no vale: si se pega, el libro miente.
  if (s.estado === "ANULADO") {
    doc.font("Helvetica-Bold").fontSize(28).fillColor("#C0392B").opacity(0.3)
      .text("ANULADO", x, y + alto / 2 - 16, { width: ancho, align: "center" });
    doc.opacity(1);
  }

  doc.restore();
  return alto;
}

/** El mini de "Próxima Inspección", que se pega aparte. */
function dibujarMini(doc, matricula, etiqueta, tac, x, y, ancho) {
  doc.save();
  doc.strokeColor("#111").lineWidth(1).rect(x, y, ancho, 46).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000")
    .text(txt(matricula), x, y + 6, { width: ancho, align: "center" });
  doc.font("Helvetica").fontSize(8.5)
    .text("Próxima Inspección de " + etiqueta, x, y + 18, { width: ancho, align: "center" });
  doc.font("Helvetica-Bold").fontSize(9)
    .text("Tac: " + horas(tac), x, y + 30, { width: ancho, align: "center" });
  doc.restore();
  return 46;
}

function lineaCorte(doc, x, y, ancho) {
  doc.save().strokeColor("#999").lineWidth(0.6).dash(3, { space: 3 })
    .moveTo(x, y).lineTo(x + ancho, y).stroke().undash().restore();
}

/**
 * @param {Array} stickers filas de `taller_sticker` — YA CONGELADAS. Se imprime
 *   lo que dicen, nunca se recalcula: el papel viejo no puede cambiar solo.
 */
function generarStickersPDF({ stickers = [], formulario = null }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 36 });
  const x = 36;
  const ancho = doc.page.width - 72;
  const limite = doc.page.height - 50;
  const codigo = formulario?.codigo || marca.codigo_oma;
  let y = 44;

  stickers.forEach((s0, i) => {
    const s = Object.assign({}, s0, { codigo_formulario: codigo });
    const alto = altoSticker(doc, s, ancho);
    // Nunca partir un recuadro: si no entra completo, página nueva.
    if (y + alto > limite) { doc.addPage(); y = 44; }
    dibujarSticker(doc, s, x, y, ancho);
    y += alto;
    if (i < stickers.length - 1) { lineaCorte(doc, x, y + 9, ancho); y += 19; }
  });

  // Los mini de próxima inspección van UNA vez por juego, no uno por libro: los
  // tres stickers de una misma orden comparten el TAC.
  const conProxima = stickers.find((s) => s.proxima_25 || s.proxima_50);
  if (conProxima) {
    if (y + 76 > limite) { doc.addPage(); y = 44; }
    else { lineaCorte(doc, x, y + 9, ancho); y += 22; }
    const w = Math.round((ancho - 16) / 2);
    if (conProxima.proxima_25) dibujarMini(doc, conProxima.matricula, "25 horas", conProxima.proxima_25, x, y, w);
    if (conProxima.proxima_50) dibujarMini(doc, conProxima.matricula, "50 horas", conProxima.proxima_50, x + w + 16, y, w);
  }

  return doc;
}

module.exports = {
  generarRequisicionPDF, generarSolicitudPDF, generarEntregaAceitesPDF,
  generarOrdenTrabajoPDF, generarReporteInspeccionPDF, generarStickersPDF,
};
