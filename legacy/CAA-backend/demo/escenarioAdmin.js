/**
 * La parte administrativa del demo: facturas, egresos y planillas.
 *
 * Sin esto, Contabilidad se ve con los ingresos de los vuelos pero sin un solo
 * egreso ni una planilla — o sea, sin la mitad que le interesa a quien decide la
 * compra. La nómina además es el módulo con más trabajo adentro (dos planillas,
 * ISR por tramos, ISSS, AFP y costo patronal) y no se puede mostrar vacío.
 *
 * Fechas RELATIVAS a la corrida, como el resto del escenario.
 */
const { insertarMuchos } = require("./lotes");

const DIA = 86400000;
const sumarDias = (d, n) => new Date(d.getTime() + n * DIA);
const soloFecha = (d) => d.toISOString().slice(0, 10);
const r2 = (n) => Math.round(n * 100) / 100;

/** Gastos de una escuela de aviación en un mes cualquiera. */
const EGRESOS = [
  ["COMBUSTIBLE", "Aviación Fuel, S.A. de C.V.", "Jet A-1 / AvGas 100LL — recarga de tanque", 4820.00, -26],
  ["COMBUSTIBLE", "Aviación Fuel, S.A. de C.V.", "AvGas 100LL — recarga quincenal", 3910.50, -12],
  ["REPUESTOS", "Aeropartes del Istmo, S.A.", "Compra de repuestos según factura 12045", 1284.65, -21],
  ["MANTENIMIENTO", "Taller Aeronáutico Cuscatlán", "Reparación de magneto — trabajo externo", 640.00, -18],
  ["HANGAR", "Autoridad Aeroportuaria", "Alquiler de hangar — mes corriente", 1500.00, -28],
  ["SERVICIOS_BASICOS", "Distribuidora Eléctrica", "Energía eléctrica — hangar y oficinas", 412.30, -24],
  ["SERVICIOS_BASICOS", "Telecomunicaciones", "Internet y telefonía", 98.75, -24],
  ["SEGUROS", "Aseguradora Continental", "Póliza de casco y RC — cuota mensual", 2150.00, -20],
  ["TASAS_AAC", "Autoridad de Aviación Civil", "Tasas por renovación de certificados", 375.00, -16],
  ["SUMINISTROS", "Librería Central", "Papelería y formatos de la OMA", 143.20, -9],
  ["CAPACITACION", "Instituto de Seguridad Aérea", "Curso de factores humanos — 2 instructores", 780.00, -7],
  ["BANCARIO", "Banco Agrícola", "Comisiones y manejo de cuenta", 46.80, -4],
];

/** Personal administrativo, para la planilla de PLANTA. */
const EMPLEADOS = [
  ["Rosa Contreras", "Contadora", 1100.00],
  ["Óscar Turno", "Jefe de operaciones", 950.00],
  ["Marta Aprendiz", "Asistente de taller", 500.00],
];

async function sembrarAdmin(c, log, ctx) {
  const { idsAlumno, idsInstructor, prefijo } = ctx;
  const hoy = new Date();
  const anio = hoy.getFullYear();

  // ── Egresos ─────────────────────────────────────────────────────────────
  log("contabilidad: egresos");
  const idAdmin = (await c.query(
    `SELECT id_usuario FROM usuario WHERE username = $1`, [`${prefijo}conta`]
  )).rows[0]?.id_usuario || null;

  await insertarMuchos(c, "egreso",
    ["categoria", "proveedor", "concepto", "monto_usd", "fecha", "registrado_por"],
    EGRESOS.map(([cat, prov, concepto, monto, dias]) =>
      [cat, prov, concepto, monto, soloFecha(sumarDias(hoy, dias)), idAdmin])
  );

  // ── Facturas ────────────────────────────────────────────────────────────
  // El modelo del negocio es saldo prepagado: el alumno deposita y se le debita.
  // La factura es el documento FISCAL, que se emite aparte (~30 al mes) — por eso
  // son menos que los vuelos y no cuelgan de cada uno.
  log("contabilidad: facturas");
  const facturados = idsAlumno.slice(0, 9);
  await insertarMuchos(c, "factura",
    ["numero_correlativo", "id_alumno", "fecha_emision", "subtotal_usd", "iva_usd",
     "total_usd", "estado", "concepto", "emitida_por"],
    facturados.map((idA, k) => {
      const sub = r2(150 * (1 + (k % 4) * 0.5));
      const iva = r2(sub * 0.13);
      return [String(1000 + k), idA, soloFecha(sumarDias(hoy, -(30 - k * 3))), sub, iva,
              r2(sub + iva), "EMITIDA", "Horas de instrucción de vuelo", idAdmin];
    })
  );

  // ── Planillas ───────────────────────────────────────────────────────────
  // Dos planillas del mes pasado: la de PLANTA (sueldo fijo, con ISR por tramos,
  // ISSS y AFP) y la de SERVICIOS (instructores, con su retención del 10%). Es
  // la dualidad que distingue a este módulo y no se entiende con una sola.
  log("nómina: planillas");
  await insertarMuchos(c, "empleado",
    ["nombre", "cargo", "sueldo_base", "es_servicios_profesionales", "activo"],
    EMPLEADOS.map(([nombre, cargo, sueldo]) => [nombre, cargo, sueldo, false, true])
  );
  const empleados = (await c.query(`SELECT id, nombre, sueldo_base FROM empleado ORDER BY id`)).rows;

  const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  const periodos = [
    { tipo: "PLANTA",    estado: "PAGADA"   },
    { tipo: "SERVICIOS", estado: "APROBADA" },
  ];
  await insertarMuchos(c, "nomina_periodo",
    ["periodo_inicio", "periodo_fin", "estado", "tipo_planilla", "anio", "mes",
     "creado_por", "aprobado_por", "fecha_pago"],
    periodos.map((p) => [soloFecha(mesPasado), soloFecha(finMes), p.estado, p.tipo,
                         mesPasado.getFullYear(), mesPasado.getMonth() + 1,
                         idAdmin, idAdmin,
                         p.estado === "PAGADA" ? soloFecha(sumarDias(finMes, 3)) : null])
  );
  const idsPeriodo = new Map(
    (await c.query(`SELECT id, tipo_planilla FROM nomina_periodo`)).rows
      .map((r) => [r.tipo_planilla, r.id])
  );

  // Deducciones con el MISMO helper que usa el módulo y la MISMA config fiscal
  // guardada, no una cuenta aparte. Un demo con ISR inventado lo desarma el
  // contador del prospecto en treinta segundos, y además dejaría de servir para
  // mostrar que el cálculo salvadoreño está bien hecho.
  const { calcularPlanta, retencionServicios } = require("../utils/deducciones");
  const config = (await c.query(
    `SELECT * FROM config_fiscal ORDER BY vigente_desde DESC LIMIT 1`
  )).rows[0];

  const planta = empleados.map((e) => {
    const bruto = Number(e.sueldo_base);
    const d = calcularPlanta(bruto, config);
    return [idsPeriodo.get("PLANTA"), e.id, bruto, d.isr, d.isss, d.afp,
            r2(bruto - d.isr - d.isss - d.afp),
            d.isss_patrono, d.afp_patrono,
            r2(bruto + d.isss_patrono + d.afp_patrono), "PLANTA"];
  });
  await insertarMuchos(c, "nomina_detalle",
    ["id_periodo", "id_empleado", "bruto", "isr", "isss", "afp", "total",
     "isss_patrono", "afp_patrono", "costo_patronal", "tipo_pago"], planta);

  // Los instructores cobran por hora volada, con retención del 10%.
  const servicios = idsInstructor.map((idI, k) => {
    const horas = 28 + k * 9;
    const tarifa = 22;
    const bruto = r2(horas * tarifa);
    const retencion = retencionServicios(bruto, config);
    return [idsPeriodo.get("SERVICIOS"), idI, horas, tarifa, bruto, bruto, retencion,
            r2(bruto - retencion), "SERVICIOS", r2(bruto), k === 0 ? 60 : 0];
  });
  await insertarMuchos(c, "nomina_detalle",
    ["id_periodo", "id_instructor", "horas_voladas", "tarifa_hora", "subtotal", "bruto",
     "retencion", "total", "tipo_pago", "monto_vuelo", "monto_teorico"], servicios);

  // El egreso que respalda la planilla pagada, como lo genera el sistema real.
  const totalPlanta = planta.reduce((s, f) => s + Number(f[6]), 0);
  await c.query(
    `INSERT INTO egreso (categoria, proveedor, concepto, monto_usd, fecha, id_nomina, registrado_por)
     VALUES ('NOMINA', 'Planilla de personal', $1, $2, $3, $4, $5)`,
    [`Planilla PLANTA ${mesPasado.getMonth() + 1}/${mesPasado.getFullYear()}`,
     r2(totalPlanta), soloFecha(sumarDias(finMes, 3)), idsPeriodo.get("PLANTA"), idAdmin]
  );

  return {
    egresos: EGRESOS.length + 1,
    facturas: facturados.length,
    empleados: EMPLEADOS.length,
    planillas: periodos.length,
    renglones_planilla: planta.length + servicios.length,
  };
}

module.exports = { sembrarAdmin };
