import { LOGO_CAAA_DATAURL } from "../../assets/logoCaaa";

async function cargarPdfMake() {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const pdfFontsModule = await import("pdfmake/build/vfs_fonts");

  const pdfMake = pdfMakeModule.default || pdfMakeModule;
  const pdfFonts = pdfFontsModule.default || pdfFontsModule;

  if (pdfFonts.pdfMake?.vfs) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
  } else if (pdfFonts.vfs) {
    pdfMake.vfs = pdfFonts.vfs;
  }
  return pdfMake;
}

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

const formatNum = (val) => {
  if (val === null || val === undefined || val === "") return "—";
  const n = parseFloat(val);
  return isNaN(n) ? val : n.toFixed(1);
};

// Lecturas de medidor: el instrumento tiene 4 dígitos enteros, el cero
// inicial (ej. 0847.2) se conserva rellenando la parte entera a 4 dígitos.
const formatMedidor = (val) => {
  if (val === null || val === undefined || val === "") return "—";
  const s = String(val);
  if (!/^\d+(\.\d+)?$/.test(s)) return s;
  const [ent, dec = ""] = s.split(".");
  const decLimpio = dec.replace(/0+$/, "") || "0";
  return `${ent.padStart(4, "0")}.${decLimpio}`;
};

// ── Contenido de UNA vouchera ────────────────────────────────────────────────
// Devuelve el array `content` de pdfmake para una vouchera (header CAAA, datos
// del vuelo, medidores, firmas). Compartido entre el PDF individual y el
// combinado del día — cualquier cambio de layout aplica a ambos.
function buildVoucheraContent({
  vueloInfo,
  datos,
  firmaAlumno,
  firmaInstructor,
  esInasistencia = false,
  motivoInasistencia = "",
}) {
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

  const isSim = v.aeronave_tipo === "SIMULADOR";

  // Filas de datos: simulador solo Hobbs + horas a cobrar (sin tacómetro/combustible).
  const dataRows = isSim
    ? [
        ["Hobbs Inicio",     formatMedidor(d.hobbs_salida)],
        ["Hobbs Cierre",     formatMedidor(d.hobbs_llegada)],
        ["Horas a cobrar",   formatNum(d.horas_cobradas)],
      ]
    : [
        ["Combustible Salida",  formatNum(d.combustible_salida)],
        ["Combustible Llegada", formatNum(d.combustible_llegada)],
        ["Cantidad agregada",   formatNum(d.cantidad_combustible)],
        ["Horas a cobrar",      formatNum(d.horas_cobradas)],
      ];

  // Bloque Tacómetro/Hobbs (solo avión real): dos columnas lado a lado,
  // cada una con Llegada arriba y Salida abajo — así queda igual que el
  // instrumento físico, donde la lectura crece de abajo hacia arriba.
  const medidorColumn = (titulo, llegada, salida) => ({
    table: {
      widths: ["*", "*"],
      body: [
        [hdr(titulo, { colSpan: 2, alignment: "center" }), {}],
        [cell("Llegada", { bold: true }), cell(llegada)],
        [cell("Salida", { bold: true }), cell(salida)],
      ],
    },
    layout: "lightHorizontalLines",
  });

  return [
    // ── Header CAAA ──
    { image: LOGO_CAAA_DATAURL, width: 58, alignment: "center", margin: [0, 0, 0, 4] },
    {
      text: "CAAA, S.A. de C.V.",
      fontSize: 14,
      bold: true,
      alignment: "center",
      color: "#1e3a5f",
      margin: [0, 0, 0, 2],
    },
    {
      text: isSim ? "VOUCHERA DE SIMULADOR" : "REPORTE DE VUELOS",
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

    // ── Tipo de vuelo (omitido en inasistencia y en simulador) ──
    ...(!esInasistencia && !isSim ? [{
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

    // ── Tacómetro / Hobbs (solo avión real, omitido en inasistencia) ──
    ...(!esInasistencia && !isSim ? [{
      columns: [
        medidorColumn("TACÓMETRO", formatMedidor(d.tacometro_llegada), formatMedidor(d.tacometro_salida)),
        medidorColumn("HOBBS", formatMedidor(d.hobbs_llegada), formatMedidor(d.hobbs_salida)),
      ],
      columnGap: 10,
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
  ];
}

const DOC_BASE = {
  pageSize: "A4",
  pageOrientation: "portrait",
  pageMargins: [40, 40, 40, 40],
};

export async function generarPdfReporteVuelo({
  vueloInfo,
  datos,
  firmaAlumno,
  firmaInstructor,
  esInasistencia = false,
  motivoInasistencia = "",
  download = false,
}) {
  const pdfMake = await cargarPdfMake();

  const v = vueloInfo ?? {};
  const correlativo = (v.aeronave_modelo && v.id_vuelo)
    ? `${v.aeronave_modelo}-${String(v.id_vuelo).padStart(7, "0")}`
    : "—";

  const docDefinition = {
    ...DOC_BASE,
    content: buildVoucheraContent({ vueloInfo, datos, firmaAlumno, firmaInstructor, esInasistencia, motivoInasistencia }),
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

// ── PDF combinado del día ────────────────────────────────────────────────────
// Junta N voucheras (mismo layout que la individual) en un solo archivo, una
// por página, para imprimirlas todas al cierre del turno. `voucheras` es un
// array con los mismos parámetros que recibe generarPdfReporteVuelo.
export async function generarPdfVoucherasDia({ voucheras, filename = "voucheras.pdf" }) {
  const pdfMake = await cargarPdfMake();

  const content = voucheras.flatMap((params, i) => {
    const c = buildVoucheraContent(params);
    // Salto de página antes de cada vouchera menos la primera.
    if (i > 0 && c.length) c[0] = { ...c[0], pageBreak: "before" };
    return c;
  });

  const docDefinition = { ...DOC_BASE, content };

  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).download(filename);
      resolve(null);
    } catch (e) {
      reject(e);
    }
  });
}
