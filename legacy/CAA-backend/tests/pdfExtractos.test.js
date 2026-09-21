// legacy/CAA-backend/tests/pdfExtractos.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { PDFDocument, PDFName } = require("pdf-lib");
const {
  validarRango, claveExtractos, armarPdf, analizarPdf, paginasDe,
} = require("../utils/pdfExtractos");

/**
 * Manual de juguete: N páginas cuyo ANCHO dice qué página es (base+1, base+2…),
 * así se comprueba qué páginas salieron y en qué orden. La 1 lleva un link a la
 * última, y la última carga 300 KB que no se comprimen: si el link se copiara,
 * el PDF resultante pesaría eso (es el defecto medido en el service manual del
 * Cherokee: 20 páginas pesaban 14.8 MB).
 */
async function manualDePrueba(n, base = 200) {
  const doc = await PDFDocument.create();
  const paginas = [];
  for (let i = 1; i <= n; i++) paginas.push(doc.addPage([base + i, 300]));
  const ultima = paginas[n - 1];
  const pesado = doc.context.register(doc.context.stream(crypto.randomBytes(300000)));
  ultima.node.setXObject(PDFName.of("Pesado"), pesado);
  const link = doc.context.register(doc.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 10], Border: [0, 0, 0], Dest: [ultima.ref, "Fit"],
  }));
  paginas[0].node.set(PDFName.of("Annots"), doc.context.obj([link]));
  return doc.save();
}
const anchos = async (bytes) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));

test("validarRango acepta un rango dentro del manual", () => {
  assert.equal(validarRango(3, 5, 10), null);
  assert.equal(validarRango("3", "3", 10), null);
});
test("validarRango rechaza desde > hasta", () => {
  assert.match(validarRango(5, 3, 10), /no puede ser menor/);
});
test("validarRango rechaza pasar del total", () => {
  assert.match(validarRango(1, 11, 10), /tiene 10 páginas/);
});
test("validarRango rechaza página 0, vacíos y no-enteros", () => {
  assert.match(validarRango(0, 2, 10), /1 o más/);
  assert.match(validarRango("x", 2, 10), /enteros/);
  assert.match(validarRango(1.5, 2, 10), /enteros/);
  assert.match(validarRango("", 2, 10), /enteros/);
  assert.match(validarRango(null, 2, 10), /enteros/);
});
test("claveExtractos depende del contenido y del orden", () => {
  const a = { sha256: "a".repeat(64), pagina_desde: 1, pagina_hasta: 2 };
  const b = { sha256: "b".repeat(64), pagina_desde: 5, pagina_hasta: 5 };
  assert.equal(claveExtractos([a, b]), claveExtractos([{ ...a, titulo: "x" }, { ...b }]));
  assert.notEqual(claveExtractos([a, b]), claveExtractos([b, a]));
  assert.match(claveExtractos([a]), /^[0-9a-f]{64}$/);
});
test("paginasDe suma los rangos", () => {
  assert.equal(paginasDe([{ pagina_desde: 3, pagina_hasta: 4 }, { pagina_desde: 1, pagina_hasta: 1 }]), 3);
});
test("armarPdf saca exactamente las páginas pedidas, en el orden pedido", async () => {
  const fuentes = new Map([["m", await manualDePrueba(10)]]);
  const out = await armarPdf([
    { sha256: "m", pagina_desde: 3, pagina_hasta: 4 },
    { sha256: "m", pagina_desde: 1, pagina_hasta: 1 },
  ], fuentes);
  assert.deepEqual(await anchos(out), [203, 204, 201]);
});
test("armarPdf junta páginas de dos manuales", async () => {
  const fuentes = new Map([["a", await manualDePrueba(5, 200)], ["b", await manualDePrueba(5, 400)]]);
  const out = await armarPdf([
    { sha256: "b", pagina_desde: 2, pagina_hasta: 2 },
    { sha256: "a", pagina_desde: 5, pagina_hasta: 5 },
  ], fuentes);
  assert.deepEqual(await anchos(out), [402, 205]);
});
test("armarPdf no arrastra la página a la que apunta un link", async () => {
  const fuentes = new Map([["m", await manualDePrueba(10)]]);
  const out = await armarPdf([{ sha256: "m", pagina_desde: 1, pagina_hasta: 1 }], fuentes);
  assert.ok(out.length < 50000, `pesa ${out.length} bytes: se colaron los 300 KB de la página del link`);
});
test("armarPdf avisa si falta el archivo de un manual", async () => {
  await assert.rejects(
    armarPdf([{ sha256: "zz", pagina_desde: 1, pagina_hasta: 1 }], new Map()),
    /Falta el archivo/
  );
});
test("analizarPdf da la huella y las páginas", async () => {
  const bytes = await manualDePrueba(7);
  const r = await analizarPdf(Buffer.from(bytes));
  assert.equal(r.paginas, 7);
  assert.equal(r.sha256, crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex"));
});
test("analizarPdf rechaza lo que no es un PDF", async () => {
  const r = await analizarPdf(Buffer.from("esto no es un pdf"));
  assert.match(r.error, /no es un PDF/);
});
