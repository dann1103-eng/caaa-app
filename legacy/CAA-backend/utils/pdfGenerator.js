const PDFDocument = require("pdfkit");

const CAAA_BLUE = "#1B365D";
const CAAA_GREEN = "#157347";
const CAAA_RED = "#C0392B";

/**
 * Encabezado común CAAA para todos los PDFs.
 */
function drawHeader(doc, titulo, fecha) {
  doc
    .fillColor(CAAA_BLUE)
    .fontSize(18)
    .font("Helvetica-Bold")
    .text("CAAA", 50, 50)
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#444")
    .text("Centro de Adiestramiento Aéreo Académico, S.A. de C.V.", 50, 72)
    .text("Aeropuerto Internacional de Ilopango, San Salvador, El Salvador", 50, 84)
    .text("Tels: (503) 2295-0029 · (503) 2295-7811 · informacion@caaa-sv.com", 50, 96);

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

module.exports = { generarFacturaPDF, generarReciboPDF };
