-- El modelo de "anular" (bandera anulado=TRUE + fila ANULACION de reverso) se
-- reemplazó por BORRADO directo tipo Excel (el movimiento desaparece y el saldo
-- corrido se recalcula al leer). Este script limpia los datos viejos.
--
-- Hay 3 patrones de anulación vieja, todos NETEAN A CERO en el saldo:
--   (a) movimiento anulado (cuentaController): original con anulado=TRUE + fila ANULACION.
--   (b) recibo anulado (recibosController): el depósito NO queda marcado anulado,
--       pero su recibo_pago sí (anulado=TRUE) y se le insertó una fila ANULACION.
--   (c) factura anulada (facturasController): igual que (b) con la factura.
-- Se borran las filas de los tres patrones; como cada uno netea a cero, el saldo
-- total no cambia. Luego se re-sincroniza saldo_actual = suma de lo que queda
-- (self-heal por si algún saldo guardado había quedado desincronizado).
-- Idempotente. Ver sesión 2026-07-22 (fix cuenta corriente tipo Excel).

DELETE FROM movimiento_cuenta m
WHERE m.anulado = TRUE
   OR m.tipo = 'ANULACION'
   OR m.id_recibo  IN (SELECT id FROM recibo_pago WHERE anulado = TRUE)
   OR m.id_factura IN (SELECT id FROM factura     WHERE anulado = TRUE);

UPDATE cuenta_corriente_alumno c
SET saldo_actual_usd = (
  SELECT COALESCE(SUM(monto_usd), 0)
  FROM movimiento_cuenta
  WHERE id_alumno = c.id_alumno
);
