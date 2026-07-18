import { LOGO_CAAA_DATAURL } from "../../assets/logoCaaa";

// ¿El error viene de un chunk que ya no existe (deploy nuevo con la pestaña
// vieja abierta)? El generador se carga bajo demanda: tras un deploy, el
// archivo con el hash viejo desaparece de Vercel y el import dinámico falla.
export function mensajeErrorPdf(e) {
  return /dynamically imported|Failed to fetch|Importing a module script failed|error loading/i.test(e?.message || "")
    ? "Hay una versión nueva de la app — recargá la página (Cmd+R / Ctrl+R) y volvé a intentar."
    : "No se pudo generar el PDF.";
}

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

// Formato compacto: la vouchera ocupa UN TERCIO de página carta, para que el
// PDF del día imprima 3 por hoja (con guía de corte) y no se desperdicie
// papel. Tipografías chicas a propósito — es un comprobante, no un informe.
const cell = (text, opts = {}) => ({
  text: String(text ?? ""),
  fontSize: 7,
  margin: [2, 1.5, 2, 1.5],
  ...opts,
});

const hdr = (text, opts = {}) => ({
  text,
  fontSize: 6,
  bold: true,
  color: "#fff",
  fillColor: "#1e3a5f",
  alignment: "center",
  margin: [2, 2, 2, 2],
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

// Mini-tabla: encabezado azul + filas [etiqueta, valor].
const miniTabla = (titulo, filas) => ({
  table: {
    widths: ["*", "*"],
    body: [
      [hdr(titulo, { colSpan: 2 }), {}],
      ...filas.map(([lbl, val]) => [cell(lbl, { bold: true }), cell(val, { alignment: "right" })]),
    ],
  },
  layout: "lightHorizontalLines",
});

// Mini-tabla de valor único: encabezado azul + una celda centrada.
const miniValor = (titulo, valor, opts = {}) => ({
  table: {
    widths: ["*"],
    body: [[hdr(titulo)], [cell(valor, { bold: true, alignment: "center" })]],
  },
  layout: "lightHorizontalLines",
  ...opts,
});

// ── Contenido de UNA vouchera (⅓ de carta) ───────────────────────────────────
// Devuelve el array `content` de pdfmake para una vouchera compacta. Compartido
// entre el PDF individual y el combinado del día — cualquier cambio de layout
// aplica a ambos.
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

  // Bloque central según el caso. Columnas balanceadas para que la banda
  // completa quede baja y pareja.
  let centro;
  if (esInasistencia) {
    centro = [{
      table: {
        widths: ["auto", "*"],
        body: [[
          {
            text: "INASISTENCIA / NO-SHOW",
            fontSize: 8, bold: true, color: "#ffffff", fillColor: "#b91c1c",
            margin: [6, 3, 6, 3],
          },
          cell(`Motivo: ${motivoInasistencia || "no especificado"}. Los campos técnicos se omiten.`, { italics: true, color: "#7f1d1d" }),
        ]],
      },
      layout: "noBorders",
      margin: [0, 0, 0, 6],
    }];
  } else if (isSim) {
    centro = [{
      columns: [
        miniTabla("HOBBS", [
          ["Inicio", formatMedidor(d.hobbs_salida)],
          ["Cierre", formatMedidor(d.hobbs_llegada)],
        ]),
        miniTabla("COBRO", [["Horas a cobrar", formatNum(d.horas_cobradas)]]),
      ],
      columnGap: 8,
      margin: [0, 0, 0, 6],
    }];
  } else {
    centro = [{
      columns: [
        {
          stack: [
            miniValor("TIPO DE VUELO", d.tipo_vuelo ?? "—"),
            miniValor("HORAS A COBRAR", formatNum(d.horas_cobradas), { margin: [0, 4, 0, 0] }),
          ],
        },
        // Llegada arriba y Salida abajo, como el instrumento físico.
        miniTabla("TACÓMETRO", [
          ["Llegada", formatMedidor(d.tacometro_llegada)],
          ["Salida", formatMedidor(d.tacometro_salida)],
        ]),
        miniTabla("HOBBS", [
          ["Llegada", formatMedidor(d.hobbs_llegada)],
          ["Salida", formatMedidor(d.hobbs_salida)],
        ]),
        miniTabla("COMBUSTIBLE", [
          ["Salida", formatNum(d.combustible_salida)],
          ["Llegada", formatNum(d.combustible_llegada)],
          ["Agregado", formatNum(d.cantidad_combustible)],
        ]),
      ],
      columnGap: 8,
      margin: [0, 0, 0, 6],
    }];
  }

  const firma = (label, imagen, nombre, licencia) => ({
    stack: [
      { text: label, fontSize: 6, bold: true, color: "#555", margin: [0, 0, 0, 2] },
      imagen
        ? { image: imagen, width: 84, height: 30, margin: [0, 0, 0, 2] }
        : { text: "(Sin firma)", fontSize: 7, color: "#999", margin: [0, 10, 0, 12] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 2] },
      { text: nombre ?? "—", fontSize: 7.5, bold: true },
      { text: `Licencia No.: ${licencia ?? "—"}`, fontSize: 6.5 },
    ],
  });

  return [
    // ── Encabezado en línea: logo + razón social + título ──
    {
      columns: [
        { image: LOGO_CAAA_DATAURL, width: 20 },
        {
          text: [
            { text: "CAAA, S.A. de C.V.   ", fontSize: 10, bold: true, color: "#1e3a5f" },
            { text: isSim ? "VOUCHERA DE SIMULADOR" : "REPORTE DE VUELOS", fontSize: 8.5, bold: true },
          ],
          margin: [6, 5, 0, 0],
        },
        {
          text: "IMPRESOS RIVAS, S.A. DE C.V. — 7742-5029",
          fontSize: 5.5, color: "#999", alignment: "right", margin: [0, 8, 0, 0],
        },
      ],
      margin: [0, 0, 0, 5],
    },

    // ── Info del vuelo ──
    {
      table: {
        widths: ["*", 40, 48, "*", "*", "*"],
        body: [
          [hdr("REPORTE #"), hdr("HORA"), hdr("FECHA"), hdr("TIPO AVIÓN"), hdr("AVIÓN No."), hdr("VUELO No.")],
          [
            cell(correlativo), cell(horaStr), cell(fechaStr),
            cell(v.aeronave_modelo ?? "—"), cell(v.aeronave_codigo ?? "—"), cell(correlativo),
          ],
        ],
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 6],
    },

    // ── Bloque central (medidores / sim / inasistencia) ──
    ...centro,

    // ── Firmas ──
    {
      columns: [
        firma("NOMBRE ALUMNO", firmaAlumno, v.alumno_nombre, v.alumno_licencia),
        firma("NOMBRE INSTRUCTOR", firmaInstructor, v.instructor_nombre, v.instructor_licencia),
      ],
      columnGap: 24,
      margin: [0, 2, 0, 0],
    },
  ];
}

// Carta con márgenes angostos: caben 3 voucheras de ⅓ de hoja por página.
const DOC_BASE = {
  pageSize: "LETTER",
  pageOrientation: "portrait",
  pageMargins: [36, 18, 36, 14],
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
// Junta N voucheras (⅓ de carta cada una) en un solo archivo — 3 por página,
// con guía de corte punteada — para imprimirlas al cierre del turno.
// `voucheras` es un array con los mismos parámetros de generarPdfReporteVuelo.
export async function generarPdfVoucherasDia({ voucheras, filename = "voucheras.pdf" }) {
  const pdfMake = await cargarPdfMake();

  const content = voucheras.map((params) => ({
    // unbreakable: una vouchera nunca queda partida entre dos páginas — si no
    // cabe entera en el espacio restante, pasa completa a la siguiente.
    unbreakable: true,
    stack: [
      ...buildVoucheraContent(params),
      // Guía de corte entre voucheras.
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 540, y2: 0, lineWidth: 0.5, dash: { length: 4, space: 3 }, lineColor: "#bbb" }],
        margin: [0, 8, 0, 10],
      },
    ],
  }));

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
