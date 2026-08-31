const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");

// Antes acá vivía una copia literal de calcularEstado, con los mismos umbrales
// escritos por segunda vez — y sin saber de `aplica`, así que al cargar los ADs
// habría contado como alerta los renglones que no aplican al avión.
const { calcularEstado: estadoTarea } = require("../../utils/vencimientos");

// ── Tablero general del taller ─────────────────────────────────────────────
exports.dashboard = catchAsync(async (req, res) => {
  // 1. Estado de flota (mismo cálculo que el módulo de mantenimiento).
  const flota = await db.query(`
    -- El Taller SÍ ve las aeronaves de terceros: les da mantenimiento y les
    -- requisa material. Son las únicas pantallas donde aparecen.
    SELECT a.id_aeronave, a.codigo, a.modelo, a.tipo, a.estado, a.activa, a.es_externa,
           -- Lo consume el selector de Aeronavegabilidad para pasar de escala del
           -- sistema a escala de libro. Sin esto la pantalla mostraba la ultima
           -- aplicacion del YS-334-PE como 0.03 en vez de 10,000.03.
           COALESCE(a.tac_offset, 0) AS tac_offset,
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
           -- Estos cuatro los NECESITA calcularEstado para distinguir NO_APLICA y
           -- SIN_INTERVALO. Sin ellos llegan como undefined y el cálculo cae en la
           -- rama vieja en silencio: la trampa del objeto literal de siempre.
           t.aplica, t.recurrente, t.intervalo_horas, t.intervalo_dias,
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
