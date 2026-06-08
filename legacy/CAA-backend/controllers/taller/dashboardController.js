const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");

const UMBRAL_HORAS = 10;
const UMBRAL_DIAS = 30;

function estadoTarea(t) {
  const horasAeronave = parseFloat(t.aeronave_horas) || 0;
  let horas_restantes = null;
  let dias_restantes = null;
  if (t.proxima_horas != null) horas_restantes = Math.round((parseFloat(t.proxima_horas) - horasAeronave) * 100) / 100;
  if (t.proxima_fecha != null) dias_restantes = Math.round((new Date(t.proxima_fecha) - new Date()) / 86400000);

  const dims = [];
  if (horas_restantes != null) dims.push({ rest: horas_restantes, prox: horas_restantes <= UMBRAL_HORAS });
  if (dias_restantes != null) dims.push({ rest: dias_restantes, prox: dias_restantes <= UMBRAL_DIAS });

  let estado = "N_A";
  if (dims.length) {
    if (dims.some((d) => d.rest <= 0)) estado = "VENCIDO";
    else if (dims.some((d) => d.prox)) estado = "PROXIMO";
    else estado = "VIGENTE";
  }
  return { horas_restantes, dias_restantes, estado };
}

// ── Tablero general del taller ─────────────────────────────────────────────
exports.dashboard = catchAsync(async (req, res) => {
  // 1. Estado de flota (mismo cálculo que el módulo de mantenimiento).
  const flota = await db.query(`
    SELECT a.id_aeronave, a.codigo, a.modelo, a.tipo, a.estado, a.activa,
           COALESCE(a.horas_acumuladas, 0) AS horas_acumuladas,
           a.horas_proxima_revision, a.tipo_proxima_revision,
           (a.horas_proxima_revision - a.horas_acumuladas) AS horas_restantes,
           EXISTS(SELECT 1 FROM mantenimiento_aeronave m
                  WHERE m.id_aeronave = a.id_aeronave AND m.estado = 'PENDIENTE' AND m.completado = false) AS requiere_mantenimiento
    FROM aeronave a
    WHERE a.tipo != 'SIMULADOR'
    ORDER BY a.codigo
  `);

  // 2. Tareas programadas → vencimientos próximos / vencidos.
  const tareasRes = await db.query(`
    SELECT t.id_tarea, t.nombre, t.tipo, t.referencia, t.proxima_horas, t.proxima_fecha,
           a.codigo AS aeronave_codigo, a.id_aeronave,
           COALESCE(a.horas_acumuladas, 0) AS aeronave_horas
    FROM taller_tarea_programada t
    JOIN aeronave a ON a.id_aeronave = t.id_aeronave
    WHERE t.activo = true
  `);
  const tareas = tareasRes.rows.map((t) => ({ ...t, ...estadoTarea(t) }));
  const vencimientos = tareas
    .filter((t) => t.estado === "VENCIDO" || t.estado === "PROXIMO")
    .sort((a, b) => {
      const peso = { VENCIDO: 0, PROXIMO: 1 };
      return (peso[a.estado] - peso[b.estado]) || ((a.horas_restantes ?? 1e9) - (b.horas_restantes ?? 1e9));
    });

  // 3. Repuestos bajo mínimo.
  const repuestos = await db.query(`
    SELECT id_repuesto, parte_no, descripcion, stock_actual, stock_minimo, unidad
    FROM taller_repuesto
    WHERE activo = true AND stock_actual <= stock_minimo
    ORDER BY descripcion
  `);

  const kpis = {
    aeronaves_total: flota.rows.length,
    aeronaves_en_mantenimiento: flota.rows.filter((a) => a.estado === "MANTENIMIENTO").length,
    vencimientos_vencidos: vencimientos.filter((v) => v.estado === "VENCIDO").length,
    vencimientos_proximos: vencimientos.filter((v) => v.estado === "PROXIMO").length,
    repuestos_bajos: repuestos.rows.length,
  };

  res.json({
    aeronaves: flota.rows,
    vencimientos,
    repuestos_bajos: repuestos.rows,
    kpis,
  });
});
