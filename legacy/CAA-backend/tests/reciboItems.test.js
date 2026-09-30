// legacy/CAA-backend/tests/reciboItems.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizarItemsRecibo, formatCantidad, DECIMALES_CANTIDAD } = require("../utils/reciboItems");

// El caso real que la escuela no pudo registrar (2026-09-28): $1,976.25 a $135
// la hora son 14.638888… horas; con 14.63888 el subtotal redondea al centavo.
test("la cantidad con varios decimales se conserva y el total cuadra al centavo", () => {
  const { detalle, error } = normalizarItemsRecibo([
    { descripcion: "14.6 horas de vuelo curso Instrumentos", cantidad: 14.63888, precio_unitario: 135 },
  ]);
  assert.equal(error, undefined);
  assert.equal(detalle[0].cantidad, 14.63888);
  assert.equal(detalle[0].subtotal, 1976.25);
});

test("la cantidad se redondea a los decimales que guarda la base", () => {
  assert.equal(DECIMALES_CANTIDAD, 6);
  const { detalle } = normalizarItemsRecibo([
    { descripcion: "x", cantidad: 1.23456789, precio_unitario: 100 },
  ]);
  assert.equal(detalle[0].cantidad, 1.234568);
  // El subtotal sale de la cantidad YA redondeada: la que queda guardada.
  assert.equal(detalle[0].subtotal, 123.46);
});

test("una cantidad que redondea a cero no pasa", () => {
  const { error } = normalizarItemsRecibo([{ descripcion: "x", cantidad: 0.0000001, precio_unitario: 1 }]);
  assert.match(error, /Cantidad inválida/);
});

test("las validaciones de siempre siguen igual", () => {
  assert.match(normalizarItemsRecibo([{ descripcion: " ", cantidad: 1, precio_unitario: 1 }]).error, /descripción/);
  assert.match(normalizarItemsRecibo([{ descripcion: "x", cantidad: -1, precio_unitario: 1 }]).error, /Cantidad inválida/);
  assert.match(normalizarItemsRecibo([{ descripcion: "x", cantidad: 1, precio_unitario: -5 }]).error, /Precio unitario inválido/);
  assert.deepEqual(normalizarItemsRecibo(undefined), { detalle: [] });
  assert.deepEqual(normalizarItemsRecibo([]), { detalle: [] });
});

test("la cantidad se muestra con 2 decimales como mínimo y sin ceros de cola", () => {
  assert.equal(formatCantidad("14.638880"), "14.63888"); // como vuelve de NUMERIC(14,6)
  assert.equal(formatCantidad("1.000000"), "1.00");      // los recibos de antes se ven igual
  assert.equal(formatCantidad("1.00"), "1.00");
  assert.equal(formatCantidad(2.5), "2.50");
  assert.equal(formatCantidad("14.638800"), "14.6388");
  assert.equal(formatCantidad("0.000001"), "0.000001");
  assert.equal(formatCantidad(null), "");
});
