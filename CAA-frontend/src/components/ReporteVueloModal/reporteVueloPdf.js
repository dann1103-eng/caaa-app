export async function generarPdfReporteVuelo({
  vueloInfo,
  datos,
  firmaAlumno,
  firmaInstructor,
  esInasistencia = false,
  motivoInasistencia = "",
  download = false,
}) {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const pdfFontsModule = await import("pdfmake/build/vfs_fonts");

  const pdfMake = pdfMakeModule.default || pdfMakeModule;
  const pdfFonts = pdfFontsModule.default || pdfFontsModule;

  if (pdfFonts.pdfMake?.vfs) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
  } else if (pdfFonts.vfs) {
    pdfMake.vfs = pdfFonts.vfs;
  }

  const v = vueloInfo ?? {};
  const d = datos ?? {};

  const fechaStr = v.fecha_hora_vuelo
    ? new Date(v.fecha_hora_vuelo).toLocaleDateString("es-SV")
    : "—";
  const horaStr = v.fecha_hora_vuelo
    ? new Date(v.fecha_hora_vuelo).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const correlativo = (v.aeronave_modelo && v.id_vuelo)
    ? `${v.aeronave_modelo}-${String(v.id_vuelo).padStart(7, "0")}`
    : "—";

  const cell = (text, opts = {}) => ({
    text: String(text ?? ""),
    fontSize: 8,
    margin: [3, 3, 3, 3],
    ...opts,
  });

  const hdr = (text, opts = {}) => ({
    text,
    fontSize: 7,
    bold: true,
    color: "#fff",
    fillColor: "#1e3a5f",
    alignment: "center",
    margin: [3, 3, 3, 3],
    ...opts,
  });

  const lv = (lbl, val) => ({
    stack: [
      { text: lbl, fontSize: 6, color: "#555", bold: true, margin: [0, 0, 0, 1] },
      { text: String(val ?? "—"), fontSize: 8 },
    ],
    margin: [0, 0, 0, 4],
  });

  const formatNum = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    const n = parseFloat(val);
    return isNaN(n) ? val : n.toFixed(1);
  };

  // Filas de datos
  const dataRows = [
    ["Tacómetro Salida",    formatNum(d.tacometro_salida)],
    ["Tacómetro Llegada",   formatNum(d.tacometro_llegada)],
    ["Hobbs Salida",        formatNum(d.hobbs_salida)],
    ["Hobbs Llegada",       formatNum(d.hobbs_llegada)],
    ["Combustible Salida",  formatNum(d.combustible_salida)],
    ["Combustible Llegada", formatNum(d.combustible_llegada)],
    ["Cantidad agregada",   formatNum(d.cantidad_combustible)],
  ];

  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [40, 40, 40, 40],
    content: [
      // ── Header CAAA ──
      {
        text: "CAAA, S.A. de C.V.",
        fontSize: 14,
        bold: true,
        alignment: "center",
        color: "#1e3a5f",
        margin: [0, 0, 0, 2],
      },
      {
        text: "REPORTE DE VUELOS",
        fontSize: 11,
        bold: true,
        alignment: "center",
        margin: [0, 0, 0, 10],
      },

      // ── Banner INASISTENCIA (solo si aplica) ──
      ...(esInasistencia ? [{
        table: {
          widths: ["*"],
          body: [[
            {
              text: "⚠  INASISTENCIA / NO-SHOW",
              fontSize: 14,
              bold: true,
              color: "#ffffff",
              fillColor: "#b91c1c",
              alignment: "center",
              margin: [10, 10, 10, 10],
            }
          ]]
        },
        layout: "noBorders",
        margin: [0, 0, 0, 10],
      }, {
        text: "El alumno no se presentó al vuelo programado. Los campos técnicos se omiten en este registro.",
        fontSize: 8,
        color: "#7f1d1d",
        alignment: "center",
        italics: true,
        margin: [0, 0, 0, 8],
      }, {
        stack: [
          { text: "MOTIVO DE LA INASISTENCIA:", fontSize: 7, bold: true, color: "#991b1b", margin: [0, 0, 0, 2] },
          { text: motivoInasistencia || "No se especificó motivo.", fontSize: 9, italics: true }
        ],
        margin: [0, 0, 0, 15]
      }] : []),

      // ── Info del vuelo ──
      {
        table: {
          widths: ["*", "*", "*", "*", "*", "*"],
          body: [
            [
              hdr("REPORTE #"),
              hdr("HORA"),
              hdr("FECHA"),
              hdr("TIPO AVIÓN"),
              hdr("AVIÓN No."),
              hdr("VUELO No."),
            ],
            [
              cell(correlativo),
              cell(horaStr),
              cell(fechaStr),
              cell(v.aeronave_modelo ?? "—"),
              cell(v.aeronave_codigo ?? "—"),
              cell(correlativo),
            ],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 10],
      },

      // ── Tipo de vuelo (omitido en inasistencia) ──
      ...(!esInasistencia ? [{
        table: {
          widths: ["auto", "*"],
          body: [
            [
              hdr("TIPO DE VUELO"),
              cell(d.tipo_vuelo ?? "—", { bold: true, fontSize: 9 }),
            ],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 10],
      }] : []),

      // ── Datos técnicos (omitidos en inasistencia) ──
      ...(!esInasistencia ? [{
        table: {
          widths: ["*", "*"],
          body: [
            [hdr("CAMPO"), hdr("VALOR")],
            ...dataRows.map(([campo, valor]) => [
              cell(campo, { bold: true }),
              cell(valor),
            ]),
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 20],
      }] : [{ text: "", margin: [0, 0, 0, 20] }]),

      // ── Firmas ──
      {
        columns: [
          // Alumno
          {
            stack: [
              { text: "NOMBRE ALUMNO", fontSize: 7, bold: true, color: "#555", margin: [0, 0, 0, 4] },
              firmaAlumno
                ? { image: firmaAlumno, width: 180, height: 60, margin: [0, 0, 0, 4] }
                : { text: "(Sin firma)", fontSize: 8, color: "#999", margin: [0, 0, 0, 4] },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 4] },
              { text: v.alumno_nombre ?? "—", fontSize: 9, bold: true },
              { text: `Licencia No.: ${v.alumno_licencia ?? "—"}`, fontSize: 8 },
            ],
          },
          // Instructor
          {
            stack: [
              { text: "NOMBRE INSTRUCTOR", fontSize: 7, bold: true, color: "#555", margin: [0, 0, 0, 4] },
              firmaInstructor
                ? { image: firmaInstructor, width: 180, height: 60, margin: [0, 0, 0, 4] }
                : { text: "(Sin firma)", fontSize: 8, color: "#999", margin: [0, 0, 0, 4] },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 4] },
              { text: v.instructor_nombre ?? "—", fontSize: 9, bold: true },
              { text: `Licencia No.: ${v.instructor_licencia ?? "—"}`, fontSize: 8 },
            ],
          },
        ],
        columnGap: 20,
      },

      // ── Pie ──
      {
        text: "IMPRESOS RIVAS, S.A. DE C.V. — 7742-5029",
        fontSize: 7,
        color: "#999",
        alignment: "center",
        margin: [0, 20, 0, 0],
      },
    ],
  };

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = pdfMake.createPdf(docDefinition);
      if (download) {
        pdfDoc.download(`reporte-vuelo-${correlativo}.pdf`);
        resolve(null);
      } else {
        pdfDoc.getBase64((base64) => resolve(base64));
      }
    } catch (e) {
      reject(e);
    }
  });
}
