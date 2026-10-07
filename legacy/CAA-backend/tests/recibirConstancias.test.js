// legacy/CAA-backend/tests/recibirConstancias.test.js
//
// El middleware que recibe las constancias, con pedidos HTTP de verdad contra un
// Express mínimo. Sin base ni Storage.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const recibirConstancias = require("../middlewares/recibirConstancias");
const { MAX_BYTES } = require("../utils/constancias");

let server, url;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.post("/x", recibirConstancias, (req, res) => {
    res.json({
      motivo: req.body?.motivo ?? null,
      archivos: (req.files || []).map((f) => ({ nombre: f.originalname, tipo: f.mimetype, bytes: f.size })),
    });
  });
  await new Promise((r) => { server = app.listen(0, "127.0.0.1", r); });
  url = `http://127.0.0.1:${server.address().port}/x`;
});
test.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));

const formulario = (archivos, motivo = "Estoy enfermo") => {
  const fd = new FormData();
  fd.append("motivo", motivo);
  for (const [nombre, tipo, bytes = 10] of archivos) {
    fd.append("archivos", new Blob([Buffer.alloc(bytes, 1)], { type: tipo }), nombre);
  }
  return fd;
};
const enviar = async (body, headers) => {
  const r = await fetch(url, { method: "POST", body, headers });
  return { status: r.status, json: await r.json() };
};

test("un pedido JSON sin archivos pasa de largo: el cliente viejo sigue andando", async () => {
  const r = await enviar(JSON.stringify({ motivo: "Con margen" }), { "content-type": "application/json" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { motivo: "Con margen", archivos: [] });
});

test("un multipart trae el motivo y los archivos, con el nombre bien leído", async () => {
  const r = await enviar(formulario([
    ["Constancia médica.pdf", "application/pdf", 1200],
    ["foto del año.JPG", "image/jpeg", 800],
  ]));
  assert.equal(r.status, 200);
  assert.equal(r.json.motivo, "Estoy enfermo");
  assert.deepEqual(r.json.archivos, [
    { nombre: "Constancia médica.pdf", tipo: "application/pdf", bytes: 1200 },
    { nombre: "foto del año.JPG", tipo: "image/jpeg", bytes: 800 },
  ]);
});

test("un archivo de más de 8 MB es un 400 que se entiende, no un 500 en inglés", async () => {
  const r = await enviar(formulario([["enorme.jpg", "image/jpeg", MAX_BYTES + 1]]));
  assert.equal(r.status, 400);
  assert.match(r.json.message, /8 MB/);
  assert.doesNotMatch(r.json.message, /too large/i);
});

test("justo 8 MB pasa", async () => {
  const r = await enviar(formulario([["justo.jpg", "image/jpeg", MAX_BYTES]]));
  assert.equal(r.status, 200);
  assert.equal(r.json.archivos[0].bytes, MAX_BYTES);
});

test("seis archivos son un 400", async () => {
  const r = await enviar(formulario([1, 2, 3, 4, 5, 6].map((n) => [`f${n}.png`, "image/png"])));
  assert.equal(r.status, 400);
  assert.match(r.json.message, /Máximo 5/);
});

test("un tipo no permitido es un 400 que nombra el archivo", async () => {
  const r = await enviar(formulario([["apunte de física.docx", "application/msword"]]));
  assert.equal(r.status, 400);
  assert.match(r.json.message, /apunte de física\.docx/);
  assert.match(r.json.message, /JPG o PNG/);
});
