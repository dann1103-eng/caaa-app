/**
 * Siembra los componentes (célula / motor / hélice), sus anclajes de horas y
 * las plantillas de texto de los stickers, sacados de los 11 formatos reales
 * que entregó la OMA (docs/formatos-aac/stickers/).
 *
 *   node ../../supabase/dump/seed_stickers_libros.js   (desde legacy/CAA-backend)
 *   node seed_stickers_libros.js --dry-run
 *
 * Es idempotente: hace UPSERT por (aeronave, tipo) y por (aeronave, parte,
 * tipo), así que se puede volver a correr sin duplicar ni romper las FK de
 * taller_tarea_programada.
 *
 * NO inventa números. Donde el papel trae el T.T. del motor o de la hélice
 * copiado del de la célula, la fila queda SIN ANCLAJE (NULL) a propósito: el
 * mecánico lo dicta del libro una vez y el primer sticker lo ancla. Un campo
 * vacío es mejor que un número copiado que se propaga a un documento legal.
 *
 * Spec: docs/superpowers/specs/2026-08-22-stickers-libros-aeronave-design.md
 */
// supabase/dump/ no comparte el node_modules del backend, y require() resuelve
// contra el archivo que lo llama: por eso dotenv y el pool se cargan por ruta
// absoluta, igual que seed_wb_plantilla_desde_aircraft.js.
const path = require("path");
require(path.resolve(__dirname, "../../legacy/CAA-backend/node_modules/dotenv")).config({
  path: path.resolve(__dirname, "../../legacy/CAA-backend/.env"),
});
const db = require(path.resolve(__dirname, "../../legacy/CAA-backend/config/db.js"));

const DRY = process.argv.includes("--dry-run");

// ── El tacómetro que dio la vuelta ──────────────────────────────────────────
// El del YS-334-PE llegó a 9999.99 entre sep-2025 (sticker: TAC 9,588.18) y
// feb-2026 (sticker: TAC 10,000.03) y volvió a 0000.03. Los mecánicos le suman
// 10,000 a mano; los instructores digitan la lectura cruda (127 lecturas en la
// BD, todas entre 331.07 y 429.10).
const OFFSETS = { "YS-334-PE": 10000 };

// ── Componentes y anclajes ──────────────────────────────────────────────────
// tac_ancla va SIEMPRE en la escala cruda del sistema (sin el offset), porque
// T.T. y TSO se calculan como diferencias y así el offset se cancela solo.
const COMPONENTES = [
  // YS-334-PE (Tomahawk) · sticker de 50 h del 30-jul-2026, orden CAAA/2026-0055
  // Sticker: TAC 10,373.99 (libro)  =>  373.99 (crudo, offset 10,000)
  { av: "YS-334-PE", tipo: "CELULA", nombre: "Célula Piper PA-38-112", marca: "PIPER",
    modelo: "THOMAHAWK", mn: "PA-38-112", sn: "38-78A0407", tc: "A18SO",
    tac: 373.99, tt: 10379.09, tso: null,
    origen: "Sticker de 50 h del 30-jul-2026 (orden CAAA/2026-0055)" },
  { av: "YS-334-PE", tipo: "MOTOR", nombre: "Motor Lycoming O-235-L2C", marca: "LYCOMING",
    modelo: "O-235-L2C", mn: "O-235-L2C", sn: "L-19136-15", tc: "E-223",
    tac: 373.99, tt: 17462.41, tso: 1832.03,
    origen: "Sticker de 50 h del 30-jul-2026 (orden CAAA/2026-0055). Offset verificado +7,088.42 en tres stickers." },
  { av: "YS-334-PE", tipo: "HELICE", nombre: "Hélice Sensenich 72CK-O-56", marca: "SENSENICH",
    modelo: "72CK-O-56", mn: "72CK-O-56", sn: "K978", tc: "P-904",
    tac: 373.99, tt: 8527.67, tso: 1831.56,
    origen: "Sticker de 50 h del 30-jul-2026 (orden CAAA/2026-0055). Offset verificado -1,846.32 en tres stickers. Ojo: el sticker anual de feb-2026 traía S/N K2364; confirmar cuál es." },

  // YS-333-PE (Cessna 152) · sticker del 12-ago-2026, orden CAAA/2026-0057
  { av: "YS-333-PE", tipo: "CELULA", nombre: "Célula Cessna C-152 II", marca: "CESSNA",
    modelo: "C-152 II", mn: "C-152 II", sn: "15283385", tc: "3A19",
    tac: 5209.7, tt: 15722.7, tso: null,
    origen: "Sticker del 12-ago-2026 (orden CAAA/2026-0057)" },
  { av: "YS-333-PE", tipo: "MOTOR", nombre: "Motor Lycoming O-235-N2C", marca: "LYCOMING",
    modelo: "O-235-N2C", mn: "O-235-N2C", sn: "RL-18193-15", tc: "E-223",
    tac: null, tt: null, tso: null, activo: false,
    origen: "REMOVIDO el 10-ago-2026 a reparación mayor (orden CAAA/2026-0058). Al reinstalar hay que re-anclar: el TSO arranca en 0." },
  { av: "YS-333-PE", tipo: "HELICE", nombre: "Hélice McCauley 1A103", marca: "McCAULEY",
    modelo: "1A103", mn: "1A103", sn: "R775210", tc: "P50GL",
    tac: null, tt: null, tso: null, activo: false,
    origen: "REMOVIDA el 10-ago-2026 a overhaul (orden CAAA/2026-0058). Al reinstalar hay que re-anclar: el TSO arranca en 0." },

  // YS-270-PE (Cherokee) · sticker de 50 h del 10-ago-2026, orden CAAA/2026-0051
  { av: "YS-270-PE", tipo: "CELULA", nombre: "Célula Piper PA-28-180", marca: "PIPER",
    modelo: "CHEROKEE", mn: "PA-28-180", sn: "28-5837", tc: "2A13",
    tac: 5988.21, tt: 7910.21, tso: null,
    origen: "Sticker de 50 h del 10-ago-2026 (orden CAAA/2026-0051)" },
  { av: "YS-270-PE", tipo: "MOTOR", nombre: "Motor Lycoming O-360-A4A", marca: "LYCOMING",
    modelo: "O-360-A4A", mn: "O-360-A4A", sn: "L-15234-36A", tc: "E-286",
    tac: null, tt: null, tso: null, activo: false,
    origen: "REMOVIDO el 10-ago-2026 por caja rajada con fuga de aceite (orden CAAA/2026-0059). Al reinstalar hay que re-anclar. En el papel el T.T. venía copiado del de la célula." },
  { av: "YS-270-PE", tipo: "HELICE", nombre: "Hélice Sensenich 76EM8", marca: "SENSENICH",
    modelo: "76EM8", mn: "76EM8 S5-O-60", sn: "30585K", tc: "P4EA",
    tac: 5988.21, tt: null, tso: 338.80,
    origen: "TSO del sticker de 50 h del 10-ago-2026 (verificado: 289.68 en junio + 49.12 de TAC). El T.T. del papel está copiado del de la célula: falta dictarlo del libro." },

  // YS-127-P (Arrow) · sticker de 50 h del 08-jul-2026, orden CAAA/2026-0050
  { av: "YS-127-P", tipo: "CELULA", nombre: "Célula Piper PA-28R-180", marca: "PIPER",
    modelo: "CHEROKEE ARROW", mn: "PA-28R-180", sn: "28R-31035", tc: "2A13",
    tac: 8271.00, tt: 9987.94, tso: null,
    origen: "Sticker de 50 h del 08-jul-2026 (orden CAAA/2026-0050). Offset verificado +1,716.94 en tres stickers." },
  { av: "YS-127-P", tipo: "MOTOR", nombre: "Motor Lycoming IO-360-B1E", marca: "LYCOMING",
    modelo: "IO-360-B1E", mn: "IO-360-B1E", sn: "L-25768-36A", tc: "1E10",
    tac: 8225.06, tt: null, tso: 785.00,
    origen: "TSO del sticker de 50 h del 30-ene-2026. El T.T. del papel está copiado del de la célula: falta dictarlo del libro." },
  { av: "YS-127-P", tipo: "HELICE", nombre: "Hélice McCauley C3D36C415", marca: "McCAULEY",
    modelo: "C3D36C415-C", mn: "C3D36C415-C/82NGA-8", sn: "911792", tc: "P58GL",
    tac: 8271.00, tt: 2846.19, tso: null,
    origen: "Sticker de 50 h del 08-jul-2026. El de sep-2025 decía 9,893.89, que es el T.T. de la célula copiado." },
];

// ── Plantillas de texto ─────────────────────────────────────────────────────
// Copiadas literal de los stickers reales. {orden} lo sustituye el sistema con
// el correlativo de la orden de trabajo al precargar.
const T = {
  "YS-334-PE": {
    CELULA: {
      "100H": "Se efectuó inspección de 100 horas a la aeronave, inspección y lubricación de llantas, inspección y lubricación de cables de control y pruebas operacionales de cabina de acuerdo con el manual de servicio fabricante P/N: 761-660 capítulo 5-20-00 pág. 3 a 12 y RAC 43 Apéndice D. Esta inspección está registrada bajo la orden de trabajo {orden}. Certifico que esta aeronave está en condiciones seguras para seguir operando.",
      "50H": "Se realizó inspección de 50 horas a la aeronave, inspección y lubricación de cables de control de vuelo y lubricación de baleros de llantas e inspección de frenos y se realizaron pruebas operacionales de cabina de acuerdo con el manual de servicio P/N 761-660 capítulo 5-20-00, página 3 a la 12 y RAC 43 Apéndice D. Este trabajo está registrado bajo la orden número {orden}. Certifico que esta aeronave está en condiciones seguras para seguir operando.",
      ANUAL: "En esta fecha se efectuó inspección anual para la renovación de certificado de aeronavegabilidad, se efectuó conforme al manual de mantenimiento P/N: 761-660 capítulo 5-20-00 pág. 4 a pág. 12 y RAC 43 Apéndice D y se realizó la inspección de las directivas de aeronavegabilidad. Certifico que esta aeronave está en condiciones seguras para seguir operando. Este trabajo está registrado bajo la orden de trabajo {orden}.",
    },
    MOTOR: {
      "100H": "Se efectuó inspección de 100 horas al motor, se realizó inspección y limpiaron bujías, se inspeccionó y se calibraron válvulas de cilindros, se reemplazaron filtros de aceite, aire y se le dio servicio de nuevo aceite y se inspeccionó por fugas de acuerdo con el manual de servicio fabricante P/N: 761-660, capítulo 5-20-00 pág. 3 a 12 y RAC 43 Apéndice D. Este trabajo está registrado bajo la orden de trabajo {orden}. Certifico que este motor está en condiciones seguras para seguir operando.",
      "50H": "Se realizó inspección de 50 horas al motor, inspección y limpieza de bujías, se reemplazó filtro de aceite y de aire del motor, servicio de nuevo aceite, se inspeccionaron mangueras de aceite y combustible por condición, conforme al manual de servicio P/N 761-660 capítulo 5-20-00 página 3 a la 12 y RAC 43 Apéndice D. Bajo la orden de trabajo {orden}. Certifico que este motor está en condiciones seguras para seguir operando.",
      ANUAL: "En esta fecha se realizó inspección anual al motor para la renovación de certificado de aeronavegabilidad, se efectuó conforme al manual de servicio del fabricante capítulo 5-20-00 pág. 4 a pág. 12 y RAC 43 Apéndice D y se realizó la inspección de las directivas de aeronavegabilidad. Certifico que este motor está en condiciones seguras para seguir operando. Este trabajo está registrado bajo la orden {orden}.",
    },
    HELICE: {
      "100H": "Se efectuó inspección de 100 horas a la hélice de acuerdo con el manual de servicio fabricante P/N: 761-660 capítulo 5-20-00 pág. 3 a 12 y RAC 43 Apéndice D. Este trabajo está registrado bajo la orden de trabajo {orden}. Certifico que esta hélice está en condiciones seguras para seguir operando.",
      "50H": "Se realizó inspección de 50 horas a la hélice, conforme al manual de servicio P/N 761-660 capítulo 5-20-00 página 3 a la 12 y RAC 43 Apéndice D. Bajo la orden de trabajo {orden}. Certifico que esta hélice está en condiciones seguras para seguir operando.",
      ANUAL: "En esta fecha se realizó inspección a la hélice para la renovación de certificado de aeronavegabilidad, se efectuó conforme al manual de servicio del fabricante capítulo 5-20-00 pág. 4 a pág. 12 y RAC 43 Apéndice D y se realizó la inspección de las directivas de aeronavegabilidad. Certifico que esta hélice está en condiciones seguras para seguir operando. Este trabajo está registrado bajo la orden {orden}.",
    },
  },
  "YS-333-PE": {
    CELULA: {
      "100H": "Se efectuó inspección de 100 hrs, limpieza de cables de control de motor inspección y lubricación, se reemplazaron filtros del sistema de vacío, lubricación, limpieza a cables de control del avión, cambio de llanta de nariz, cambio de fricciones de frenos, de acuerdo con el manual de servicio del fabricante P/N: D2064-1-13 capítulo 2 numeral 2-46 a 2-50 y RAC 43 apéndice D, con orden de trabajo {orden}. Certifico que esta aeronave está en condiciones seguras de vuelo.",
      "50H": "Se efectuó inspección de 50 hrs a la aeronave, se inspeccionó y se lubricó cables de control, se realizaron pruebas operacionales de cabina de acuerdo con el manual de servicio del fabricante P/N D2064-1-13 sección 2 párrafo 2-46 a 2-50 y RAC 43 apéndice D, con orden de trabajo {orden}. Certifico que esta aeronave está en condiciones seguras de vuelo.",
    },
    MOTOR: {
      "100H": "Se efectuó inspección de 100 hrs al motor, se inspeccionaron bujías y se encontraron en buenas condiciones, se efectuaron compresiones CYL#1 __/80, CYL#2 __/80, CYL#3 __/80 y CYL#4 __/80, se reemplazaron filtro de aceite y aire, se inspeccionaron tuberías y mangueras por fugas y se encontraron en buenas condiciones, se le dio servicio de aceite de acuerdo con el manual de servicio del fabricante P/N: D2064-1-13 capítulo 2 numeral 2-46 a 2-50 y RAC 43 apéndice D, con orden de trabajo {orden}. Certifico que este motor está en condiciones seguras de vuelo.",
      "50H": "Se efectuó inspección de 50 hrs al motor, inspección y limpieza de bujías, se reemplazaron filtros de aceite y de aire, se inspeccionaron mangueras y tuberías por fugas y se dio servicio de aceite de acuerdo con el manual de servicio del fabricante P/N D2064-1-13 sección 2 párrafo 2-46 a 2-50 y RAC 43 apéndice D. Con orden de trabajo {orden}. Certifico que este motor está en condiciones seguras de vuelo.",
    },
    HELICE: {
      "100H": "Se efectuó inspección de 100 hrs a la hélice y spinner de acuerdo con el manual de servicio del fabricante P/N: D2064-1-13 capítulo 2 numeral 2-46 a 2-50 y RAC 43 apéndice D, con orden de trabajo {orden}. Certifico que esta hélice está en condiciones seguras de vuelo.",
      "50H": "Se efectuó inspección de 50 hrs a la hélice de acuerdo con el manual de servicio del fabricante P/N D2064-1-13 sección 2 párrafo 2-46 a 2-50 y RAC 43 apéndice D. Con orden de trabajo {orden}. Certifico que esta hélice está en condiciones seguras de vuelo.",
    },
  },
  "YS-270-PE": {
    CELULA: {
      "100H": "Se efectuó inspección de 100 horas a la aeronave, inspección y lubricación de llantas, inspección y lubricación de cables de control y pruebas operacionales de cabina de acuerdo con el manual de servicio del fabricante P/N: 753-586 sección III pág. 1F18 a pág. 1G2 y RAC 43 apéndice D. Este trabajo está registrado bajo la orden de trabajo {orden}. Certifico que esta aeronave está en condiciones seguras para seguir operando.",
      "50H": "Se efectuó inspección de 50 hrs a la aeronave, inspección y lubricación de llantas, inspección y lubricación de cables de control y pruebas operacionales de cabina de acuerdo con el manual de servicio del fabricante P/N: 753-586, sección III páginas 1F20 hasta 1G2 y RAC 43 apéndice D, registrado bajo la orden de trabajo {orden}. Certifico que esta aeronave está en condiciones seguras para seguir operando.",
    },
    MOTOR: {
      "100H": "Se efectuó inspección de 100 horas al motor, se realizó inspección y limpiaron bujías, se inspeccionaron y calibraron válvulas de cilindros, se reemplazó filtro de aceite y se inspeccionó y limpió el de aire y se le dio servicio de nuevo aceite y se inspeccionó por fugas de acuerdo con el manual de servicio del fabricante P/N: 753-586, sección III pág. 1F18 a pág. 1G2 y RAC 43 apéndice D. Este trabajo está registrado bajo la orden de trabajo {orden}. Certifico que este motor está en condiciones seguras para seguir operando. CYL #1 __/80  CYL #2 __/80  CYL #3 __/80  CYL #4 __/80",
      "50H": "Se efectuó inspección de 50 hrs al motor de acuerdo con el manual de servicio del fabricante P/N: 753-586, sección III páginas 1F20 hasta 1G2 y RAC 43 apéndice D. Registrado bajo la orden de trabajo {orden}. Certifico que este motor está en condiciones seguras para seguir operando.",
    },
    HELICE: {
      "100H": "Se efectuó inspección de 100 horas a la hélice de acuerdo con el manual de servicio del fabricante P/N: 753-586, sección III pág. 1F18 a pág. 1G2 y RAC 43 apéndice D. Este trabajo está registrado bajo la orden de trabajo {orden}. Certifico que esta hélice está en condiciones seguras para seguir operando.",
      "50H": "Se efectuó inspección de 50 hrs a la hélice de acuerdo con el manual de servicio del fabricante P/N: 753-586, sección III páginas de 1F18 hasta 1G2 y RAC 43 apéndice D. Este trabajo está registrado bajo la orden de trabajo {orden}. Certifico que esta hélice está en condiciones seguras para seguir operando.",
    },
  },
  "YS-127-P": {
    CELULA: {
      "100H": "Se efectuó inspección de 100 horas al avión, se inspeccionó y lubricó trenes principales, cambio de empaques de amortiguadores y se dio servicio, inspección y lubricación de cables de control y pruebas operacionales de cabina de acuerdo con el manual de mantenimiento P/N: 753-586 sección III pág. 1G3 a pág. 1G11 y RAC 43 Apéndice D. En esta inspección se aplicaron los siguientes AD's y SB: __. Este trabajo está registrado bajo la orden de trabajo {orden}. Certifico que esta aeronave está en condiciones seguras para seguir operando.",
      "50H": "Se efectuó inspección de 50 hrs a la aeronave de acuerdo con el manual de servicio del fabricante sección III pág. 1G3 a 1G11 y RAC 43 apéndice D, con orden de trabajo {orden}. Certifico que esta aeronave está en condiciones seguras de vuelo.",
    },
    MOTOR: {
      "100H": "Se efectuó inspección de 100 horas al motor, se inspeccionó y limpiaron bujías y se chequearon calibración de válvulas, se chequearon compresiones CYL #1 __/80, CYL #2 __/80, CYL #3 __/80 y CYL #4 __/80, se reemplazaron filtros, mangueras de aceite y de combustible y se dio servicio de aceite de acuerdo con el manual de mantenimiento P/N: 753-586 sección III pág. 1G3 a pág. 1G11 y RAC 43 Apéndice D. Este trabajo está registrado bajo la orden de trabajo {orden}. Certifico que este motor está en condiciones seguras para seguir operando.",
      "50H": "Se efectuó inspección de 50 hrs al motor de acuerdo con el manual de servicio del fabricante sección III pág. 1G3 a 1G11 y RAC 43 apéndice D. Con orden de trabajo {orden}. Certifico que este motor está en condiciones seguras de vuelo.",
    },
    HELICE: {
      "100H": "Se efectuó inspección de 100 horas a la hélice de acuerdo con el manual de mantenimiento P/N: 753-586, sección III pág. 1G3 a pág. 1G11 y RAC 43 Apéndice D. Con orden de trabajo {orden}. Certifico que esta hélice está en condiciones seguras de vuelo.",
      "50H": "Se efectuó inspección de 50 hrs a la hélice de acuerdo con el manual de servicio del fabricante sección III pág. 1G3 a 1G11 y RAC 43 apéndice D. Con orden de trabajo {orden}. Certifico que esta hélice está en condiciones seguras de vuelo.",
    },
  },
};

// Iguales para todos los aviones y las tres partes.
const GENERICAS = {
  CIERRE: "En esta fecha se cierra libro de registro por términos de espacio para anotaciones.",
  APERTURA: "En esta fecha se abre nuevo libro de registro para anotaciones.",
  NO_PROGRAMADO: "",  // el trabajo no programado se escribe de cero
  "25H": "",          // el formato de 25 h todavía no lo entregó la OMA
};

const PARTES = ["CELULA", "MOTOR", "HELICE"];

async function main() {
  const flota = {};
  const r = await db.query("SELECT id_aeronave, codigo FROM aeronave");
  r.rows.forEach((a) => { flota[a.codigo] = a.id_aeronave; });

  let comps = 0, plants = 0, offs = 0;

  // 1 · Offset del tacómetro
  for (const [codigo, off] of Object.entries(OFFSETS)) {
    if (!flota[codigo]) { console.warn(`  ! ${codigo} no existe, se omite el offset`); continue; }
    console.log(`  offset  ${codigo} -> +${off}`);
    if (!DRY) await db.query("UPDATE aeronave SET tac_offset = $2 WHERE id_aeronave = $1", [flota[codigo], off]);
    offs++;
  }

  // 2 · Componentes (upsert por aeronave + tipo, para no romper FK)
  for (const c of COMPONENTES) {
    const id_aeronave = flota[c.av];
    if (!id_aeronave) { console.warn(`  ! ${c.av} no existe, se omite ${c.tipo}`); continue; }

    const vals = [
      id_aeronave, c.tipo, c.nombre, c.marca, c.modelo, c.mn, c.sn, c.tc,
      c.tac, c.tt, c.tso, c.activo === false ? false : true, c.origen,
    ];
    const ancla = c.tt == null && c.tso == null ? "SIN ANCLAJE" : `T.T. ${c.tt ?? "—"} / TSO ${c.tso ?? "N/A"} @ TAC ${c.tac}`;
    console.log(`  ${c.activo === false ? "(fuera) " : "        "}${c.av} ${c.tipo.padEnd(7)} ${ancla}`);
    if (DRY) { comps++; continue; }

    const ex = await db.query(
      "SELECT id_componente FROM taller_componente WHERE id_aeronave = $1 AND tipo = $2 ORDER BY id_componente LIMIT 1",
      [id_aeronave, c.tipo]
    );
    if (ex.rows.length) {
      // Los dos primeros valores (aeronave y tipo) son la llave de búsqueda, no
      // se actualizan: si se pasaran igual, Postgres no podría inferirles el
      // tipo (42P18) porque el SET nunca los referencia.
      await db.query(`
        UPDATE taller_componente SET
          nombre = $1, marca = $2, modelo = $3, parte_no = $4, serie_no = $5,
          tipo_certificado = $6, horas_aeronave_instalacion = $7::numeric,
          horas_componente_instalacion = $8::numeric, tso_ancla = $9::numeric, activo = $10::boolean,
          ancla_origen = $11, ancla_actualizado_en = NOW() AT TIME ZONE 'America/El_Salvador'
        WHERE id_componente = $12
      `, [...vals.slice(2), ex.rows[0].id_componente]);
    } else {
      await db.query(`
        INSERT INTO taller_componente
          (id_aeronave, tipo, nombre, marca, modelo, parte_no, serie_no, tipo_certificado,
           horas_aeronave_instalacion, horas_componente_instalacion, tso_ancla, activo,
           ancla_origen, ancla_actualizado_en)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10::numeric,$11::numeric,$12::boolean,$13, NOW() AT TIME ZONE 'America/El_Salvador')
      `, vals);
    }
    comps++;
  }

  // 3 · Plantillas de texto
  for (const [codigo, porParte] of Object.entries(T)) {
    const id_aeronave = flota[codigo];
    if (!id_aeronave) continue;
    for (const parte of PARTES) {
      const textos = { ...(porParte[parte] || {}), ...GENERICAS };
      for (const [tipo, texto] of Object.entries(textos)) {
        if (!DRY) {
          await db.query(`
            INSERT INTO taller_sticker_plantilla (id_aeronave, parte, tipo, texto)
            VALUES ($1,$2,$3,$4)
            ON CONFLICT (id_aeronave, parte, tipo) DO UPDATE SET
              texto = EXCLUDED.texto,
              actualizado_en = NOW() AT TIME ZONE 'America/El_Salvador'
          `, [id_aeronave, parte, tipo, texto]);
        }
        plants++;
      }
    }
  }

  console.log(`\n${DRY ? "[dry-run] " : ""}${offs} offset(s) · ${comps} componentes · ${plants} plantillas`);
  console.log("Sin anclaje a propósito: motor y hélice del 333 y del 270 (removidos o con el T.T. copiado en el papel),");
  console.log("y el T.T. del motor del 127. El mecánico los dicta del libro y el primer sticker los ancla.");
  await db.end?.();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
