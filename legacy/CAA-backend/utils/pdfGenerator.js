const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const CAAA_BLUE = "#1B365D";
const CAAA_GREEN = "#157347";
const CAAA_RED = "#C0392B";

const LOGO_PATH = path.join(__dirname, "..", "assets", "iso-caaa-navy.png");

/**
 * Encabezado común CAAA para todos los PDFs.
 */
function drawHeader(doc, titulo, fecha) {
  const hasLogo = fs.existsSync(LOGO_PATH);
  if (hasLogo) {
    try { doc.image(LOGO_PATH, 50, 44, { height: 46 }); } catch { /* sigue sin logo */ }
  }
  const tx = hasLogo ? 108 : 50;

  doc
    .fillColor(CAAA_BLUE)
    .fontSize(18)
    .font("Helvetica-Bold")
    .text("CAAA", tx, 50)
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#444")
    .text("Centro de Adiestramiento Aéreo Académico, S.A. de C.V.", tx, 72)
    .text("Aeropuerto Internacional de Ilopango, San Salvador, El Salvador", tx, 84)
    .text("Tels: (503) 2295-0029 · (503) 2295-7811 · informacion@caaa-sv.com", tx, 96);

  doc
    .fontSize(16)
    .fillColor(CAAA_BLUE)
    .font("Helvetica-Bold")
    .text(titulo, 350, 55, { align: "right", width: 200 })
    .fontSize(9)
    .fillColor("#666")
    .font("Helvetica")
    .text(`Fecha: ${fecha}`, 350, 80, { align: "right", width: 200 });

  doc
    .strokeColor(CAAA_BLUE)
    .lineWidth(2)
    .moveTo(50, 120)
    .lineTo(545, 120)
    .stroke();

  return 140;
}

function drawFooter(doc) {
  const y = doc.page.height - 50;
  doc
    .strokeColor("#ccc")
    .lineWidth(0.5)
    .moveTo(50, y - 10)
    .lineTo(545, y - 10)
    .stroke()
    .fontSize(7)
    .fillColor("#888")
    .font("Helvetica")
    .text(
      "MAS DE 60 AÑOS DE EXPERIENCIA FORMANDO PILOTOS PROFESIONALES",
      50, y, { align: "center", width: 495 }
    );
}

/**
 * Genera un PDF de factura.
 * @param {Object} factura  - registro de la tabla factura
 * @param {Array}  detalle  - registros de factura_detalle
 * @param {Object} alumno   - { username, correo, numero_licencia }
 * @returns {PDFDocument} stream (pipearlo a res)
 */
function generarFacturaPDF({ factura, detalle, alumno }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });

  const fecha = new Date(factura.fecha_emision).toLocaleDateString("es-SV", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });
  let y = drawHeader(doc, "FACTURA", fecha);

  // Datos del cliente
  doc
    .fillColor("#222")
    .fontSize(9)
    .font("Helvetica-Bold").text("FACTURA No.", 50, y)
    .font("Helvetica").fontSize(14).fillColor(CAAA_BLUE)
    .text(`#${factura.numero_correlativo}`, 50, y + 12);

  doc
    .fontSize(9)
    .fillColor("#222")
    .font("Helvetica-Bold").text("CLIENTE / PILOTO ESTUDIANTE", 250, y)
    .font("Helvetica").fontSize(11)
    .text(alumno?.username || `Alumno #${factura.id_alumno}`, 250, y + 14)
    .fontSize(8).fillColor("#666")
    .text(alumno?.correo || "", 250, y + 28)
    .text(alumno?.numero_licencia ? `Licencia: ${alumno.numero_licencia}` : "", 250, y + 38);

  y += 70;

  // Concepto
  doc
    .fillColor("#222")
    .fontSize(9).font("Helvetica-Bold").text("CONCEPTO:", 50, y)
    .fontSize(10).font("Helvetica").fillColor("#444")
    .text(factura.concepto || "", 50, y + 12, { width: 495 });

  y += 38;

  // Tabla de detalle
  doc
    .rect(50, y, 495, 22).fill(CAAA_BLUE)
    .fillColor("white").fontSize(9).font("Helvetica-Bold")
    .text("DESCRIPCIÓN", 55, y + 7, { width: 250 })
    .text("HORAS", 310, y + 7, { width: 50, align: "right" })
    .text("TARIFA/h", 365, y + 7, { width: 70, align: "right" })
    .text("SUBTOTAL", 440, y + 7, { width: 100, align: "right" });

  y += 22;
  doc.fillColor("#222").font("Helvetica").fontSize(9);
  for (let i = 0; i < detalle.length; i++) {
    const d = detalle[i];
    const rowH = 20;
    if (i % 2 === 0) {
      doc.rect(50, y, 495, rowH).fillColor("#f7fbf8").fill();
    }
    doc.fillColor("#222")
      .text(d.descripcion || "", 55, y + 6, { width: 250 })
      .text(Number(d.cantidad_horas).toFixed(1), 310, y + 6, { width: 50, align: "right" })
      .text(`$${Number(d.tarifa_hora_usd).toFixed(2)}`, 365, y + 6, { width: 70, align: "right" })
      .text(`$${Number(d.subtotal_usd).toFixed(2)}`, 440, y + 6, { width: 100, align: "right" });
    y += rowH;
  }

  // Totales
  y += 10;
  doc
    .strokeColor("#ccc").lineWidth(0.5)
    .moveTo(310, y).lineTo(545, y).stroke();

  y += 8;
  doc.fontSize(9).fillColor("#444")
    .font("Helvetica").text("Subtotal:", 365, y, { width: 70, align: "right" })
    .font("Helvetica-Bold").text(`$${Number(factura.subtotal_usd).toFixed(2)}`, 440, y, { width: 100, align: "right" });

  y += 14;
  if (Number(factura.iva_usd) > 0) {
    doc.fontSize(9).fillColor("#444")
      .font("Helvetica").text("IVA:", 365, y, { width: 70, align: "right" })
      .font("Helvetica-Bold").text(`$${Number(factura.iva_usd).toFixed(2)}`, 440, y, { width: 100, align: "right" });
    y += 14;
  }

  y += 6;
  doc.rect(310, y, 235, 26).fillColor(CAAA_GREEN).fill();
  doc.fontSize(11).fillColor("white").font("Helvetica-Bold")
    .text("TOTAL USD", 320, y + 8, { width: 100 })
    .fontSize(14)
    .text(`$${Number(factura.total_usd).toFixed(2)}`, 420, y + 6, { width: 115, align: "right" });

  y += 50;
  if (factura.estado === 'ANULADA') {
    doc.fontSize(40).fillColor(CAAA_RED).opacity(0.4)
      .font("Helvetica-Bold")
      .text("ANULADA", 100, 300, { width: 400, align: "center" });
    doc.opacity(1);
  }

  // Firma / nota
  doc.fillColor("#888").fontSize(8).font("Helvetica")
    .text("Esta factura se generó automáticamente desde el sistema CAAA. Documento interno de control financiero.",
          50, y, { width: 495, align: "center" });

  drawFooter(doc);

  doc.end();
  return doc;
}

/**
 * Genera PDF de recibo de pago.
 */
function generarReciboPDF({ recibo, alumno }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const fecha = new Date(recibo.fecha).toLocaleDateString("es-SV", { day:"2-digit", month:"2-digit", year:"numeric" });
  let y = drawHeader(doc, "RECIBO DE PAGO", fecha);

  doc.fontSize(9).font("Helvetica-Bold").fillColor("#222").text("RECIBO No.", 50, y)
     .font("Helvetica").fontSize(14).fillColor(CAAA_GREEN).text(`#${recibo.numero_correlativo}`, 50, y + 12);

  doc.fontSize(9).fillColor("#222").font("Helvetica-Bold").text("RECIBIDO DE", 250, y)
     .font("Helvetica").fontSize(11).text(alumno?.username || `Alumno #${recibo.id_alumno}`, 250, y + 14);

  y += 70;

  doc.rect(50, y, 495, 80).fillColor("#f0f9f3").fill();
  doc.fillColor("#222").fontSize(10).font("Helvetica-Bold").text("LA CANTIDAD DE:", 65, y + 12);
  doc.fontSize(22).fillColor(CAAA_GREEN).font("Helvetica-Bold")
     .text(`$${Number(recibo.monto_usd).toFixed(2)} USD`, 65, y + 30);
  doc.fontSize(9).fillColor("#5b6b63").font("Helvetica")
     .text(`Método: ${recibo.metodo}${recibo.referencia ? ` · Ref: ${recibo.referencia}` : ''}`, 65, y + 60);

  y += 100;

  doc.fontSize(10).fillColor("#222").font("Helvetica-Bold").text("CONCEPTO:", 50, y)
     .font("Helvetica").fontSize(10).text(recibo.descripcion || "Depósito a cuenta corriente", 50, y + 14, { width: 495 });

  if (recibo.anulado) {
    doc.fontSize(40).fillColor(CAAA_RED).opacity(0.4).font("Helvetica-Bold")
       .text("ANULADO", 100, 300, { width: 400, align: "center" });
    doc.opacity(1);
  }

  drawFooter(doc);
  doc.end();
  return doc;
}

// ──────────────────────────────────────────────────────────────────────
//  PLANILLAS (nómina)
// ──────────────────────────────────────────────────────────────────────
const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const periodoLabel = (p) => p.mes ? `${MESES[p.mes]} ${p.anio}` : `${p.periodo_inicio} a ${p.periodo_fin}`;

function headerCompacto(doc, titulo, sub, ancho) {
  if (fs.existsSync(LOGO_PATH)) { try { doc.image(LOGO_PATH, 40, 36, { height: 40 }); } catch { /* */ } }
  doc.fillColor(CAAA_BLUE).fontSize(16).font("Helvetica-Bold").text("CAAA", 92, 40)
     .fontSize(8).font("Helvetica").fillColor("#444")
     .text("Centro de Adiestramiento Aéreo Académico, S.A. de C.V.", 92, 60);
  doc.fontSize(15).fillColor(CAAA_BLUE).font("Helvetica-Bold").text(titulo, 0, 42, { align: "right", width: ancho + 40 });
  doc.fontSize(10).fillColor("#666").font("Helvetica").text(sub, 0, 62, { align: "right", width: ancho + 40 });
  doc.strokeColor(CAAA_BLUE).lineWidth(2).moveTo(40, 86).lineTo(ancho + 40, 86).stroke();
  return 100;
}

/** PDF de la planilla completa (apaisado). */
function generarPlanillaPDF({ periodo, detalles }) {
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40 });
  const ancho = 752; // 792 - 40
  const esPlanta = periodo.tipo_planilla === "PLANTA";
  let y = headerCompacto(doc, esPlanta ? "PLANILLA — PLANTA" : "PLANILLA — SERVICIOS", periodoLabel(periodo), ancho - 40);

  const cols = esPlanta
    ? [["Empleado / Instructor", 210, "left"], ["Bruto", 80, "right"], ["ISR", 70, "right"],
       ["ISSS", 70, "right"], ["AFP", 70, "right"], ["Bonos", 65, "right"], ["Desc.", 65, "right"], ["NETO", 82, "right"]]
    : [["Instructor / Empleado", 260, "left"], ["Bruto", 100, "right"], ["Retención 10%", 110, "right"],
       ["Bonos", 80, "right"], ["Desc.", 80, "right"], ["NETO", 122, "right"]];

  const drawRow = (cells, opts = {}) => {
    let x = 40;
    doc.fontSize(opts.head ? 8 : 9).font(opts.bold || opts.head ? "Helvetica-Bold" : "Helvetica")
       .fillColor(opts.head ? "#666" : "#222");
    cols.forEach((c, i) => {
      doc.text(String(cells[i] ?? ""), x + 4, y + 4, { width: c[1] - 8, align: c[2] });
      x += c[1];
    });
    y += opts.head ? 20 : 18;
  };

  doc.rect(40, y, ancho, 20).fill("#eef2f7"); doc.fillColor("#666");
  drawRow(cols.map(c => c[0]), { head: true });

  let tBruto = 0, tNeto = 0, tDed = 0, tPat = 0;
  for (const d of detalles) {
    const ded = Number(d.isr) + Number(d.isss) + Number(d.afp) + Number(d.retencion);
    tBruto += Number(d.bruto); tNeto += Number(d.total); tDed += ded; tPat += Number(d.costo_patronal || 0);
    const nombre = d.instructor_username + (d.empleado_cargo ? ` (${d.empleado_cargo})` : "");
    const cells = esPlanta
      ? [nombre, money(d.bruto), money(d.isr), money(d.isss), money(d.afp), money(d.bonos), money(d.descuentos), money(d.total)]
      : [nombre, money(d.bruto), money(d.retencion), money(d.bonos), money(d.descuentos), money(d.total)];
    if (y > 520) { doc.addPage({ size: "LETTER", layout: "landscape", margin: 40 }); y = 50; }
    drawRow(cells);
    doc.strokeColor("#e5e7eb").lineWidth(0.5).moveTo(40, y).lineTo(40 + ancho, y).stroke();
  }
  if (detalles.length === 0) { doc.fontSize(10).fillColor("#999").text("Sin detalles en esta planilla.", 40, y + 10); y += 30; }

  // Totales
  y += 8;
  doc.strokeColor(CAAA_BLUE).lineWidth(1).moveTo(40, y).lineTo(40 + ancho, y).stroke();
  y += 6;
  const totCells = esPlanta
    ? ["TOTALES", money(tBruto), "", "", "", "", "", money(tNeto)]
    : ["TOTALES", money(tBruto), money(tDed), "", "", money(tNeto)];
  drawRow(totCells, { bold: true });

  y += 14;
  doc.fontSize(10).fillColor("#222").font("Helvetica")
     .text(`Total bruto: ${money(tBruto)}     Deducciones: ${money(tDed)}     Total neto a pagar: ${money(tNeto)}`, 40, y);
  if (esPlanta) doc.fillColor("#666").fontSize(9).text(`Costo patronal total (incl. aportes ISSS/AFP): ${money(tPat)}`, 40, y + 16);

  doc.end();
  return doc;
}

/** Recibo individual de pago (una persona). */
function generarReciboNominaPDF({ periodo, detalle }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const esPlanta = periodo.tipo_planilla === "PLANTA";
  let y = drawHeader(doc, "RECIBO DE PAGO", periodoLabel(periodo));
  const snap = detalle.user_snapshot || {};
  const nombre = snap.nombre || detalle.instructor_username || "—";

  doc.fontSize(11).font("Helvetica-Bold").fillColor("#222").text(nombre, 50, y);
  doc.fontSize(9).font("Helvetica").fillColor("#555")
     .text([snap.cargo, snap.dui ? `DUI: ${snap.dui}` : null, snap.isss ? `ISSS: ${snap.isss}` : null, snap.afp ? `AFP: ${snap.afp}` : null].filter(Boolean).join("   ·   "), 50, y + 16);
  y += 44;

  const line = (label, val, color) => {
    doc.fontSize(10).font("Helvetica").fillColor("#333").text(label, 60, y);
    doc.font("Helvetica-Bold").fillColor(color || "#222").text(val, 350, y, { align: "right", width: 145 });
    y += 20;
  };
  doc.strokeColor("#e5e7eb").lineWidth(0.5).moveTo(50, y - 6).lineTo(545, y - 6).stroke();
  line("Bruto", money(detalle.bruto));
  if (esPlanta) {
    line("ISR", `- ${money(detalle.isr)}`, CAAA_RED);
    line("ISSS (empleado)", `- ${money(detalle.isss)}`, CAAA_RED);
    line("AFP (empleado)", `- ${money(detalle.afp)}`, CAAA_RED);
  } else {
    line("Retención ISR (10%)", `- ${money(detalle.retencion)}`, CAAA_RED);
  }
  if (Number(detalle.bonos) > 0) line("Bonos", `+ ${money(detalle.bonos)}`, CAAA_GREEN);
  if (Number(detalle.descuentos) > 0) line("Descuentos", `- ${money(detalle.descuentos)}`, CAAA_RED);

  y += 6;
  doc.rect(50, y, 495, 40).fillColor("#f0f9f3").fill();
  doc.fillColor("#222").fontSize(11).font("Helvetica-Bold").text("NETO A PAGAR", 60, y + 13);
  doc.fontSize(18).fillColor(CAAA_GREEN).text(money(detalle.total), 350, y + 9, { align: "right", width: 185 });
  y += 64;

  if (esPlanta) {
    doc.fontSize(8).font("Helvetica").fillColor("#888")
       .text(`Aportes patronales (informativo): ISSS ${money(detalle.isss_patrono)} · AFP ${money(detalle.afp_patrono)} · Costo total ${money(detalle.costo_patronal)}`, 50, y);
    y += 24;
  }

  // Firma
  y = Math.max(y, doc.page.height - 140);
  doc.strokeColor("#999").lineWidth(0.7).moveTo(120, y).lineTo(420, y).stroke();
  doc.fontSize(9).fillColor("#555").font("Helvetica").text("Firma de recibido", 0, y + 6, { align: "center" });
  if (detalle.firmado_en) {
    const f = new Date(detalle.firmado_en).toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric" });
    doc.fillColor(CAAA_GREEN).fontSize(9).text(`Firmado digitalmente el ${f}`, 0, y + 20, { align: "center" });
  }

  drawFooter(doc);
  doc.end();
  return doc;
}

/**
 * Reporte "VUELOS POR AVIÓN" del día (apaisado): el cierre de ventas del turno.
 * Replica el formato del sistema anterior (Sistekk rptcaVuelos): vuelos completados
 * agrupados por aeronave, con tacómetro y hobbs inicial/final/horas, monto devengado
 * e instructor; subtotales por aeronave y gran total.
 *
 * @param {Object} params
 * @param {string} params.fecha      - Fecha del reporte (YYYY-MM-DD).
 * @param {Array}  params.vuelos     - Filas ya ordenadas por aeronave:
 *   { id_vuelo, avion_codigo, avion_modelo, alumno, instructor,
 *     tac_ini, tac_fin, hobbs_ini, hobbs_fin, monto }
 */
function generarReporteVuelosDiaPDF({ fecha, vuelos, turnoDia = null, asistencias = [] }) {
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40 });
  const ancho = 712; // 752 - 40 (margen derecho)
  const fmtFecha = (() => {
    const [yy, mm, dd] = String(fecha).slice(0, 10).split("-");
    return `${Number(dd)}/${Number(mm)}/${yy}`;
  })();
  let y = headerCompacto(doc, "VUELOS POR AVIÓN", `Desde ${fmtFecha} hasta ${fmtFecha}`, ancho);

  const horas = (n) => (n == null ? "" : Number(n).toFixed(2));
  // Lecturas de medidor (tac/hobbs inicial-final): el instrumento tiene 4
  // dígitos enteros, el cero inicial (ej. 0847.25) se conserva en el reporte.
  const lectura = (n) => {
    if (n == null) return "";
    const [ent, dec = "00"] = Number(n).toFixed(2).split(".");
    return `${ent.padStart(4, "0")}.${dec}`;
  };
  const horaReal = (iso) =>
    // hourCycle explícito (no basta con hour12:false): el ICU del contenedor
    // de Railway mostraba "24:02" en vez de "00:02" para la medianoche —
    // hour12:false deja el hourCycle ambiguo y algunas builds de ICU resuelven
    // a h24 (1-24) en vez de h23 (0-23). hourCycle:"h23" fuerza 0-23 sin
    // depender de qué versión de ICU trae el runtime.
    iso ? new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/El_Salvador" }) : "—";
  // Columnas: [titulo, ancho, align]
  const cols = [
    ["Fecha", 46, "left"], ["Número", 36, "right"], ["Alumno", 145, "left"],
    ["Salida", 34, "right"], ["Llegada", 40, "right"],
    ["Tac. inicial", 48, "right"], ["Tac. final", 48, "right"], ["Hora", 32, "right"],
    ["Hobbs ini.", 48, "right"], ["Hobbs fin.", 48, "right"], ["Hora", 32, "right"],
    ["Monto", 46, "right"], ["Instructor", 105, "left"],
  ];

  const drawRow = (cells, opts = {}) => {
    let x = 40;
    doc.fontSize(opts.head ? 7.5 : 8.5).font(opts.bold || opts.head ? "Helvetica-Bold" : "Helvetica")
       .fillColor(opts.color || (opts.head ? "#666" : "#222"));
    cols.forEach((c, i) => {
      doc.text(String(cells[i] ?? ""), x + 3, y + 4, { width: c[1] - 6, align: c[2] });
      x += c[1];
    });
    y += opts.head ? 18 : 16;
  };

  const nuevaPagina = () => {
    doc.addPage({ size: "LETTER", layout: "landscape", margin: 40 });
    y = 50;
    doc.rect(40, y, ancho, 18).fill("#eef2f7");
    drawRow(cols.map((c) => c[0]), { head: true });
  };

  doc.rect(40, y, ancho, 18).fill("#eef2f7");
  drawRow(cols.map((c) => c[0]), { head: true });

  // Agrupar por aeronave (las filas vienen ordenadas por avion_codigo).
  const grupos = [];
  for (const v of vuelos) {
    const g = grupos[grupos.length - 1];
    if (!g || g.codigo !== v.avion_codigo) {
      grupos.push({ codigo: v.avion_codigo, modelo: v.avion_modelo, filas: [v] });
    } else {
      g.filas.push(v);
    }
  }

  let gTac = 0, gHobbs = 0, gMonto = 0;
  for (const g of grupos) {
    if (y > 480) nuevaPagina();
    // Encabezado del grupo
    y += 4;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(CAAA_BLUE)
       .text(`AVIÓN:  ${g.codigo}    ${g.modelo || ""}`, 43, y);
    y += 16;

    let sTac = 0, sHobbs = 0, sMonto = 0;
    for (const v of g.filas) {
      if (y > 500) nuevaPagina();
      const tacH = (v.tac_ini != null && v.tac_fin != null) ? Number(v.tac_fin) - Number(v.tac_ini) : null;
      const hobH = (v.hobbs_ini != null && v.hobbs_fin != null) ? Number(v.hobbs_fin) - Number(v.hobbs_ini) : null;
      // Horas cobradas: lo que digitó el instructor, con fallback al tacómetro
      // (mismo criterio que firmarReporteVuelo) — así esta columna coincide con
      // el Monto, que ya se cobra por horas_cobradas.
      const horasCob = v.horas_cobradas != null ? Number(v.horas_cobradas) : tacH;
      if (horasCob != null) sTac += horasCob;
      if (hobH != null) sHobbs += hobH;
      sMonto += Number(v.monto || 0);
      drawRow([
        fmtFecha, v.id_vuelo, v.alumno,
        horaReal(v.salida_real), horaReal(v.llegada_real),
        lectura(v.tac_ini), lectura(v.tac_fin), horas(horasCob),
        lectura(v.hobbs_ini), lectura(v.hobbs_fin), horas(hobH),
        money(v.monto), v.instructor || "—",
      ]);
      doc.strokeColor("#eceff3").lineWidth(0.5).moveTo(40, y).lineTo(40 + ancho, y).stroke();
    }
    // Subtotal del avión
    drawRow(["", "", `Total ${g.codigo}`, "", "", "", "", horas(sTac), "", "", horas(sHobbs), money(sMonto), ""], { bold: true, color: CAAA_BLUE });
    gTac += sTac; gHobbs += sHobbs; gMonto += sMonto;
    y += 2;
  }

  if (!vuelos.length) {
    doc.fontSize(10).fillColor("#999").font("Helvetica").text("No hay vuelos completados en la fecha seleccionada.", 40, y + 10);
    y += 30;
  }

  // Gran total
  y += 6;
  doc.strokeColor(CAAA_BLUE).lineWidth(1.2).moveTo(40, y).lineTo(40 + ancho, y).stroke();
  y += 5;
  drawRow(["", "", "GRAN TOTAL", "", "", "", "", horas(gTac), "", "", horas(gHobbs), money(gMonto), ""], { bold: true, color: CAAA_BLUE });

  // Turno del día: apertura/cierre de operaciones + instructores en turno
  // (entrada/salida) — mismas tablas que usa el widget "Turno del día".
  if (y > 460) { doc.addPage({ size: "LETTER", layout: "landscape", margin: 40 }); y = 50; }
  y += 14;
  doc.strokeColor("#e5e7eb").lineWidth(0.75).moveTo(40, y).lineTo(40 + ancho, y).stroke();
  y += 12;
  doc.fontSize(10).font("Helvetica-Bold").fillColor(CAAA_BLUE).text("TURNO DEL DÍA", 40, y);
  y += 16;

  const aperturaTxt = turnoDia?.apertura_en ? horaReal(turnoDia.apertura_en) : "—";
  const cierreTxt = turnoDia?.cierre_en
    ? horaReal(turnoDia.cierre_en)
    : (turnoDia ? "aún no cerrado" : "turno no abierto ese día");
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#444").text("Apertura de operaciones: ", 40, y, { continued: true })
     .font("Helvetica").text(aperturaTxt, { continued: true })
     .font("Helvetica-Bold").text("     Cierre de operaciones: ", { continued: true })
     .font("Helvetica").text(cierreTxt);
  y += 18;

  if (asistencias.length) {
    const TURNO_LABEL = { MANANA: "Mañana", TARDE: "Tarde" };
    const colsAsist = [
      ["Instructor", 220, "left"], ["Turno", 70, "left"],
      ["Entrada", 70, "right"], ["Salida", 70, "right"],
    ];
    const anchoAsist = colsAsist.reduce((s, c) => s + c[1], 0);
    const drawRowAsist = (cells, opts = {}) => {
      let x = 40;
      doc.fontSize(opts.head ? 7.5 : 8.5).font(opts.head ? "Helvetica-Bold" : "Helvetica")
         .fillColor(opts.head ? "#666" : "#222");
      colsAsist.forEach((c, i) => {
        doc.text(String(cells[i] ?? ""), x + 3, y + 4, { width: c[1] - 6, align: c[2] });
        x += c[1];
      });
      y += opts.head ? 16 : 14;
    };
    doc.rect(40, y, anchoAsist, 16).fill("#eef2f7");
    drawRowAsist(colsAsist.map((c) => c[0]), { head: true });
    for (const a of asistencias) {
      if (y > 500) { doc.addPage({ size: "LETTER", layout: "landscape", margin: 40 }); y = 50; }
      drawRowAsist([
        a.nombre_completo || "—", TURNO_LABEL[a.turno] || a.turno,
        horaReal(a.entrada_en), horaReal(a.salida_en),
      ]);
    }
  } else {
    doc.fontSize(9).fillColor("#999").font("Helvetica").text("Sin instructores registrados en turno ese día.", 40, y);
    y += 16;
  }

  // Pie: cuándo y quién lo generó, siempre debajo del contenido.
  doc.fontSize(7.5).fillColor("#999").font("Helvetica")
     .text(`Generado el ${new Date().toLocaleString("es-SV", { timeZone: "America/El_Salvador" })} · Sistema CAAA`, 40, y + 16);

  doc.end();
  return doc;
}

/**
 * Genera el PDF "OPERACIONES DEL DÍA" (sin montos) — el reporte de cierre que
 * usa Turno. Mismo agrupado por aeronave que generarReporteVuelosDiaPDF, pero
 * sin columnas de Tac/Hobbs crudos ni Monto: solo Fecha, Número, Alumno,
 * Instructor y Horas (subtotal por aeronave = cantidad de operaciones + horas).
 *
 * @param {Object} params
 * @param {string} params.fecha  - Fecha del reporte (YYYY-MM-DD).
 * @param {Array}  params.vuelos - Filas ya ordenadas por aeronave:
 *   { id_vuelo, avion_codigo, avion_modelo, alumno, instructor,
 *     tac_ini, tac_fin, horas_cobradas }
 */
function generarReporteOperacionesDiaPDF({ fecha, vuelos, turnoDia = null, asistencias = [] }) {
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40 });
  const ancho = 712;
  const fmtFecha = (() => {
    const [yy, mm, dd] = String(fecha).slice(0, 10).split("-");
    return `${Number(dd)}/${Number(mm)}/${yy}`;
  })();
  let y = headerCompacto(doc, "OPERACIONES DEL DÍA", `Desde ${fmtFecha} hasta ${fmtFecha}`, ancho);

  const horas = (n) => (n == null ? "" : Number(n).toFixed(2));
  // horas_cobradas si existe; si no (reporte viejo sin el campo) cae a TAC.
  // 2026-07-17: se REVIRTIÓ a propósito el orden original de este archivo
  // (TAC primero, ver cb41b6a) — decisión explícita del usuario tras ver
  // operaciones reales con menos horas de las reportadas por el instructor.
  // Mismo criterio que instructorReporteController.js (cobro, ~L353) y que
  // generarReporteVuelosDiaPDF (el reporte con montos): así "Horas" coincide
  // en los tres lugares con lo que efectivamente se le acreditó al alumno.
  const horaFila = (v) => {
    if (v.horas_cobradas != null) return Number(v.horas_cobradas);
    if (v.tac_ini != null && v.tac_fin != null) return Number(v.tac_fin) - Number(v.tac_ini);
    return null;
  };
  const horaReal = (iso) =>
    // hourCycle explícito (no basta con hour12:false): el ICU del contenedor
    // de Railway mostraba "24:02" en vez de "00:02" para la medianoche —
    // hour12:false deja el hourCycle ambiguo y algunas builds de ICU resuelven
    // a h24 (1-24) en vez de h23 (0-23). hourCycle:"h23" fuerza 0-23 sin
    // depender de qué versión de ICU trae el runtime.
    iso ? new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/El_Salvador" }) : "—";
  const cols = [
    ["Fecha", 55, "left"], ["Número", 45, "right"], ["Alumno", 210, "left"],
    ["Salida", 40, "right"], ["Llegada", 45, "right"],
    ["Instructor", 210, "left"], ["Horas", 55, "right"],
  ];

  const drawRow = (cells, opts = {}) => {
    let x = 40;
    doc.fontSize(opts.head ? 7.5 : 8.5).font(opts.bold || opts.head ? "Helvetica-Bold" : "Helvetica")
       .fillColor(opts.color || (opts.head ? "#666" : "#222"));
    cols.forEach((c, i) => { doc.text(String(cells[i] ?? ""), x + 3, y + 4, { width: c[1] - 6, align: c[2] }); x += c[1]; });
    y += opts.head ? 18 : 16;
  };
  const nuevaPagina = () => {
    doc.addPage({ size: "LETTER", layout: "landscape", margin: 40 });
    y = 50; doc.rect(40, y, ancho, 18).fill("#eef2f7"); drawRow(cols.map((c) => c[0]), { head: true });
  };

  doc.rect(40, y, ancho, 18).fill("#eef2f7");
  drawRow(cols.map((c) => c[0]), { head: true });

  const grupos = [];
  for (const v of vuelos) {
    const g = grupos[grupos.length - 1];
    if (!g || g.codigo !== v.avion_codigo) grupos.push({ codigo: v.avion_codigo, modelo: v.avion_modelo, filas: [v] });
    else g.filas.push(v);
  }

  let gOps = 0, gHoras = 0;
  for (const g of grupos) {
    if (y > 480) nuevaPagina();
    y += 4;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(CAAA_BLUE).text(`AVIÓN:  ${g.codigo}    ${g.modelo || ""}`, 43, y);
    y += 16;
    let sHoras = 0;
    for (const v of g.filas) {
      if (y > 500) nuevaPagina();
      const h = horaFila(v);
      if (h != null) sHoras += h;
      drawRow([
        fmtFecha, v.id_vuelo, v.alumno,
        horaReal(v.salida_real), horaReal(v.llegada_real),
        v.instructor || "—", horas(h),
      ]);
      doc.strokeColor("#eceff3").lineWidth(0.5).moveTo(40, y).lineTo(40 + ancho, y).stroke();
    }
    drawRow(["", "", `Total ${g.codigo}`, "", "", `${g.filas.length} operaciones`, horas(sHoras)], { bold: true, color: CAAA_BLUE });
    gOps += g.filas.length; gHoras += sHoras;
    y += 2;
  }

  if (!vuelos.length) {
    doc.fontSize(10).fillColor("#999").font("Helvetica").text("No hay vuelos completados en la fecha seleccionada.", 40, y + 10);
    y += 30;
  }

  y += 6;
  doc.strokeColor(CAAA_BLUE).lineWidth(1.2).moveTo(40, y).lineTo(40 + ancho, y).stroke();
  y += 5;
  drawRow(["", "", "GRAN TOTAL", "", "", `${gOps} operaciones`, horas(gHoras)], { bold: true, color: CAAA_BLUE });

  // Turno del día: apertura/cierre de operaciones + instructores en turno
  // (entrada/salida) — mismas tablas que usa el widget "Turno del día".
  if (y > 460) { doc.addPage({ size: "LETTER", layout: "landscape", margin: 40 }); y = 50; }
  y += 14;
  doc.strokeColor("#e5e7eb").lineWidth(0.75).moveTo(40, y).lineTo(40 + ancho, y).stroke();
  y += 12;
  doc.fontSize(10).font("Helvetica-Bold").fillColor(CAAA_BLUE).text("TURNO DEL DÍA", 40, y);
  y += 16;

  const aperturaTxt = turnoDia?.apertura_en ? horaReal(turnoDia.apertura_en) : "—";
  const cierreTxt = turnoDia?.cierre_en
    ? horaReal(turnoDia.cierre_en)
    : (turnoDia ? "aún no cerrado" : "turno no abierto ese día");
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#444").text("Apertura de operaciones: ", 40, y, { continued: true })
     .font("Helvetica").text(aperturaTxt, { continued: true })
     .font("Helvetica-Bold").text("     Cierre de operaciones: ", { continued: true })
     .font("Helvetica").text(cierreTxt);
  y += 18;

  if (asistencias.length) {
    const TURNO_LABEL = { MANANA: "Mañana", TARDE: "Tarde" };
    const colsAsist = [
      ["Instructor", 220, "left"], ["Turno", 70, "left"],
      ["Entrada", 70, "right"], ["Salida", 70, "right"],
    ];
    const anchoAsist = colsAsist.reduce((s, c) => s + c[1], 0);
    const drawRowAsist = (cells, opts = {}) => {
      let x = 40;
      doc.fontSize(opts.head ? 7.5 : 8.5).font(opts.head ? "Helvetica-Bold" : "Helvetica")
         .fillColor(opts.head ? "#666" : "#222");
      colsAsist.forEach((c, i) => {
        doc.text(String(cells[i] ?? ""), x + 3, y + 4, { width: c[1] - 6, align: c[2] });
        x += c[1];
      });
      y += opts.head ? 16 : 14;
    };
    doc.rect(40, y, anchoAsist, 16).fill("#eef2f7");
    drawRowAsist(colsAsist.map((c) => c[0]), { head: true });
    for (const a of asistencias) {
      if (y > 500) { doc.addPage({ size: "LETTER", layout: "landscape", margin: 40 }); y = 50; }
      drawRowAsist([
        a.nombre_completo || "—", TURNO_LABEL[a.turno] || a.turno,
        horaReal(a.entrada_en), horaReal(a.salida_en),
      ]);
    }
  } else {
    doc.fontSize(9).fillColor("#999").font("Helvetica").text("Sin instructores registrados en turno ese día.", 40, y);
    y += 16;
  }

  doc.fontSize(7.5).fillColor("#999").font("Helvetica")
     .text(`Generado el ${new Date().toLocaleString("es-SV", { timeZone: "America/El_Salvador" })} · Sistema CAAA`, 40, y + 16);

  doc.end();
  return doc;
}

/**
 * Genera un PDF de Estado de Resultados (P&L).
 * @param {Object} pyl            - { ingresos, egresos, facturado, margen }
 * @param {Array}  ingresosDetalle - filas de ingresos por mes (puede ser [])
 * @param {Array}  egresosDetalle  - filas de egresos por categoría (puede ser [])
 * @param {string} desde          - "YYYY-MM-DD"
 * @param {string} hasta          - "YYYY-MM-DD"
 * @param {boolean} incluirMensual
 * @param {boolean} incluirCategorias
 */
function generarPyLPDF({ pyl, ingresosDetalle, egresosDetalle, desde, hasta, incluirMensual, incluirCategorias }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });

  const fmtPeriodo = (d) => {
    if (!d) return "—";
    const iso = d instanceof Date ? d.toISOString() : String(d);
    const [y, m] = iso.split("-");
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${meses[parseInt(m,10)-1]} ${y}`;
  };
  const fmtFecha = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", day: "2-digit", month: "long", year: "numeric" });
  };
  const money = (v) => `$${Number(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  const fmtCompacto = (d) => {
    if (!d) return "—";
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const dt = new Date(d + "T12:00:00");
    return `${meses[dt.getMonth()]} ${dt.getFullYear()}`;
  };
  let y = drawHeader(doc, "P & L", `${fmtCompacto(desde)} – ${fmtCompacto(hasta)}`);

  // Subtítulo completo debajo de la línea del header
  doc.fontSize(13).font("Helvetica-Bold").fillColor(CAAA_BLUE)
     .text("ESTADO DE RESULTADOS", 50, y, { align: "center", width: 495 });
  y += 22;

  // ── Cuadro de KPIs ──────────────────────────────────────────────────────
  const kpis = [
    { label: "Ingresos (recibos cobrados)", valor: pyl.ingresos, color: CAAA_GREEN },
    { label: "Egresos (gastos)", valor: pyl.egresos, color: CAAA_RED },
    { label: "Margen operativo", valor: pyl.margen, color: Number(pyl.margen) >= 0 ? CAAA_GREEN : CAAA_RED },
    { label: "Total facturado", valor: pyl.facturado, color: CAAA_BLUE },
  ];

  const boxW = 115, boxH = 52, gapX = 10;
  let bx = 50;
  kpis.forEach(({ label, valor, color }) => {
    doc.roundedRect(bx, y, boxW, boxH, 4).strokeColor("#dde2ec").lineWidth(1).stroke();
    doc.fontSize(7).font("Helvetica").fillColor("#666").text(label, bx + 8, y + 8, { width: boxW - 16 });
    doc.fontSize(15).font("Helvetica-Bold").fillColor(color).text(money(valor), bx + 8, y + 24, { width: boxW - 16, align: "right" });
    bx += boxW + gapX;
  });
  y += boxH + 20;

  // ── Desglose mensual ─────────────────────────────────────────────────────
  if (incluirMensual && ingresosDetalle && ingresosDetalle.length) {
    doc.fontSize(11).font("Helvetica-Bold").fillColor(CAAA_BLUE).text("Ingresos por mes", 50, y);
    y += 18;

    const colW = [160, 100, 80];
    const headers = ["Mes", "Total recibido", "N° recibos"];
    const startX = 50;

    doc.rect(startX, y, colW[0] + colW[1] + colW[2], 16).fill("#eef2f7");
    let cx = startX;
    headers.forEach((h, i) => {
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#555").text(h, cx + 4, y + 4, { width: colW[i] - 8, align: i > 0 ? "right" : "left" });
      cx += colW[i];
    });
    y += 16;

    let totalRec = 0, totalNr = 0;
    for (const row of ingresosDetalle) {
      if (y > 680) { doc.addPage(); y = 50; }
      cx = startX;
      const cells = [fmtPeriodo(row.mes), money(row.total), String(row.num_recibos)];
      cells.forEach((c, i) => {
        doc.fontSize(8.5).font("Helvetica").fillColor("#222").text(c, cx + 4, y + 3, { width: colW[i] - 8, align: i > 0 ? "right" : "left" });
        cx += colW[i];
      });
      doc.strokeColor("#eceff3").lineWidth(0.5).moveTo(startX, y + 14).lineTo(startX + colW[0] + colW[1] + colW[2], y + 14).stroke();
      totalRec += Number(row.total);
      totalNr += Number(row.num_recibos);
      y += 15;
    }
    // Total
    cx = startX;
    doc.rect(startX, y, colW[0] + colW[1] + colW[2], 16).fill("#e8f0fe");
    [["Total", money(totalRec), String(totalNr)]].forEach((cells) => {
      cells.forEach((c, i) => {
        doc.fontSize(8.5).font("Helvetica-Bold").fillColor(CAAA_BLUE).text(c, cx + 4, y + 4, { width: colW[i] - 8, align: i > 0 ? "right" : "left" });
        cx += colW[i];
      });
    });
    y += 24;
  }

  // ── Desglose por categoría ────────────────────────────────────────────────
  if (incluirCategorias && egresosDetalle && egresosDetalle.length) {
    if (y > 600) { doc.addPage(); y = 50; }
    doc.fontSize(11).font("Helvetica-Bold").fillColor(CAAA_BLUE).text("Egresos por categoría", 50, y);
    y += 18;

    const colW = [240, 100, 80];
    const headers = ["Categoría", "Total", "N°"];
    const startX = 50;

    doc.rect(startX, y, colW[0] + colW[1] + colW[2], 16).fill("#fdecea");
    let cx = startX;
    headers.forEach((h, i) => {
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#555").text(h, cx + 4, y + 4, { width: colW[i] - 8, align: i > 0 ? "right" : "left" });
      cx += colW[i];
    });
    y += 16;

    let totalEgr = 0, totalN = 0;
    const LABEL = {
      NOMINA:"Nómina", COMBUSTIBLE:"Combustible", MANTENIMIENTO:"Mantenimiento",
      SERVICIOS:"Servicios", SUMINISTROS:"Suministros", REPUESTOS:"Repuestos",
      HONORARIOS:"Honorarios", SERVICIOS_BASICOS:"Servicios básicos", ALQUILER:"Alquiler",
      HANGAR:"Hangar", IMPUESTOS:"Impuestos", SEGUROS:"Seguros", TASAS_AAC:"Tasas AAC",
      PUBLICIDAD:"Publicidad", VIATICOS:"Viáticos", CAPACITACION:"Capacitación",
      BANCARIO:"Bancario", OTROS:"Otros", GASTOS_FINANCIEROS:"Gastos financieros",
      IMPUESTOS_TRIBUTARIOS:"Impuestos tributarios", GASTOS_NO_DEDUCIBLES:"Gastos no deducibles",
    };
    for (const row of egresosDetalle) {
      if (y > 680) { doc.addPage(); y = 50; }
      cx = startX;
      const cells = [LABEL[row.categoria] || row.categoria, money(row.total), String(row.num)];
      cells.forEach((c, i) => {
        doc.fontSize(8.5).font("Helvetica").fillColor("#222").text(c, cx + 4, y + 3, { width: colW[i] - 8, align: i > 0 ? "right" : "left" });
        cx += colW[i];
      });
      doc.strokeColor("#eceff3").lineWidth(0.5).moveTo(startX, y + 14).lineTo(startX + colW[0] + colW[1] + colW[2], y + 14).stroke();
      totalEgr += Number(row.total);
      totalN += Number(row.num);
      y += 15;
    }
    cx = startX;
    doc.rect(startX, y, colW[0] + colW[1] + colW[2], 16).fill("#fdecea");
    [["Total", money(totalEgr), String(totalN)]].forEach((cells) => {
      cells.forEach((c, i) => {
        doc.fontSize(8.5).font("Helvetica-Bold").fillColor(CAAA_RED).text(c, cx + 4, y + 4, { width: colW[i] - 8, align: i > 0 ? "right" : "left" });
        cx += colW[i];
      });
    });
    y += 16;
  }

  drawFooter(doc);
  doc.end();
  return doc;
}

module.exports = { generarFacturaPDF, generarReciboPDF, generarPlanillaPDF, generarReciboNominaPDF, generarReporteVuelosDiaPDF, generarReporteOperacionesDiaPDF, generarPyLPDF };
