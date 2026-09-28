// CAA-frontend/src/utils/cantidad.test.js
// Se corre con `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCantidad } from "./cantidad.js";

test("la cantidad se muestra con 2 decimales como mínimo y sin ceros de cola", () => {
  assert.equal(formatCantidad("14.638880"), "14.63888"); // como vuelve de NUMERIC(14,6)
  assert.equal(formatCantidad("1.000000"), "1.00");      // los recibos de antes se ven igual
  assert.equal(formatCantidad(2.5), "2.50");
  assert.equal(formatCantidad("14.638800"), "14.6388");
  assert.equal(formatCantidad("0.000001"), "0.000001");
  assert.equal(formatCantidad(undefined), "");
});
