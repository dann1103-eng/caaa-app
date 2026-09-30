// Detalle por ítems de un recibo de ingreso (depósito al saldo del alumno).
//
// La CANTIDAD admite 6 decimales (recibo_detalle.cantidad es NUMERIC(14,6)).
// Hace falta porque administración suele partir del MONTO que depositó el
// alumno y despejar las horas: $1,976.25 a $135 la hora son 14.638888… horas.
// Con 2 decimales no hay cantidad que dé ese total al centavo (14.63 → $1,975.05,
// 14.64 → $1,976.40). Para acertar cualquier centavo el paso de la cantidad tiene
// que valer menos de un centavo: con 6 decimales alcanza hasta $10,000 por unidad.
//
// La MISMA regla de formato vive en CAA-frontend/src/utils/cantidad.js (el modal
// "Ver detalle"); este archivo la usa para el PDF del recibo.
const DECIMALES_CANTIDAD = 6;

const redondear = (n, dec) => Math.round(n * 10 ** dec) / 10 ** dec;

/**
 * Valida y normaliza los ítems que manda el formulario. La cantidad se redondea
 * ANTES de calcular el subtotal, para que el subtotal salga de la cantidad que
 * de verdad queda guardada y el recibo multiplique bien.
 * @returns {{ detalle: object[] } | { error: string }}
 */
function normalizarItemsRecibo(items) {
  const detalle = [];
  if (!Array.isArray(items)) return { detalle };
  for (const it of items) {
    const desc = String(it?.descripcion ?? "").trim();
    const cant = redondear(Number(it?.cantidad), DECIMALES_CANTIDAD);
    const precio = Number(it?.precio_unitario);
    if (!desc) return { error: "Cada ítem necesita una descripción" };
    if (!isFinite(cant) || cant <= 0) return { error: `Cantidad inválida en "${desc}"` };
    if (!isFinite(precio) || precio < 0) return { error: `Precio unitario inválido en "${desc}"` };
    detalle.push({ descripcion: desc.slice(0, 300), cantidad: cant, precio_unitario: precio, subtotal: redondear(cant * precio, 2) });
  }
  return { detalle };
}

/** 2 decimales como mínimo (los recibos de siempre se ven igual) y sin ceros de cola. */
function formatCantidad(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(DECIMALES_CANTIDAD).replace(/0{1,4}$/, "");
}

module.exports = { normalizarItemsRecibo, formatCantidad, DECIMALES_CANTIDAD };
