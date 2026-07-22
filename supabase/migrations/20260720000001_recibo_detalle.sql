-- ---------------------------------------------------------------------------
-- Detalle por ítems de un recibo de ingreso (depósito al saldo del alumno):
-- cada línea con descripción, cantidad, precio unitario y subtotal — para que
-- el recibo se emita como una factura de ingreso. El total del recibo
-- (recibo_pago.monto_usd) es la suma de subtotales, calculada por el backend.
-- Los recibos sin detalle (monto único) siguen funcionando igual. Aditiva.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recibo_detalle (
  id              SERIAL PRIMARY KEY,
  id_recibo       INTEGER NOT NULL REFERENCES recibo_pago(id) ON DELETE CASCADE,
  descripcion     TEXT NOT NULL,
  cantidad        NUMERIC(10,2) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal        NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recibo_detalle_recibo ON recibo_detalle(id_recibo);
