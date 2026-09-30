// Cantidad del detalle de un recibo de ingreso: admite 6 decimales (la base la
// guarda como NUMERIC(14,6)) porque administración suele despejar las horas del
// monto depositado — $1,976.25 a $135 la hora son 14.638888… horas.
//
// Se muestra con 2 decimales como mínimo, para que los recibos de siempre se
// vean igual, y sin ceros de cola. La MISMA regla vive en el backend
// (legacy/CAA-backend/utils/reciboItems.js), que la usa para el PDF.
const DECIMALES_CANTIDAD = 6;

export function formatCantidad(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(DECIMALES_CANTIDAD).replace(/0{1,4}$/, "");
}
