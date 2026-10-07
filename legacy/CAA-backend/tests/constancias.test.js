// legacy/CAA-backend/tests/constancias.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_ARCHIVOS, MAX_BYTES, problemaDeConstancias, mensajeDeSubida, extensionDe, nombreLegible,
} = require("../utils/constancias");

// Un archivo como lo entrega multer.
const archivo = (originalname, mimetype, size = 200_000) => ({ originalname, mimetype, size });
const foto = (n = 1) => archivo(`foto${n}.jpg`, "image/jpeg");

test("los límites son los que anuncia el formulario", () => {
  assert.equal(MAX_ARCHIVOS, 5);
  assert.equal(MAX_BYTES, 8 * 1024 * 1024);
});

test("una lista válida no tiene problema", () => {
  assert.equal(problemaDeConstancias([]), null);
  assert.equal(problemaDeConstancias([foto(), archivo("receta.pdf", "application/pdf"), archivo("captura.PNG", "image/png")]), null);
  assert.equal(problemaDeConstancias([1, 2, 3, 4, 5].map(foto)), null);
});

test("más de cinco archivos no pasan, contando los que la solicitud ya tiene", () => {
  assert.match(problemaDeConstancias([1, 2, 3, 4, 5, 6].map(foto)), /Máximo 5/);
  assert.equal(problemaDeConstancias([foto(1), foto(2)], { yaHay: 3 }), null);
  const m = problemaDeConstancias([foto(1), foto(2)], { yaHay: 4 });
  assert.match(m, /Máximo 5/);
  assert.match(m, /ya tenés 4/);
});

test("un tipo no permitido se rechaza nombrando el archivo", () => {
  const m = problemaDeConstancias([foto(), archivo("nota.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]);
  assert.match(m, /nota\.docx/);
  assert.match(m, /JPG o PNG/);
  // Una foto HEIC del iPhone elegida como archivo: no es de los tipos del bucket.
  assert.match(problemaDeConstancias([archivo("IMG_0012.heic", "image/heic")]), /IMG_0012\.heic/);
  // Sin tipo declarado tampoco: Storage lo rechazaría.
  assert.match(problemaDeConstancias([archivo("misterio", "application/octet-stream")]), /misterio/);
});

test("un archivo de más de 8 MB se rechaza nombrándolo", () => {
  assert.equal(problemaDeConstancias([archivo("justo.jpg", "image/jpeg", MAX_BYTES)]), null);
  const m = problemaDeConstancias([archivo("enorme.jpg", "image/jpeg", MAX_BYTES + 1)]);
  assert.match(m, /enorme\.jpg/);
  assert.match(m, /8 MB/);
});

test("los errores de multer salen en español", () => {
  assert.match(mensajeDeSubida({ name: "MulterError", code: "LIMIT_FILE_SIZE" }), /8 MB/);
  assert.match(mensajeDeSubida({ name: "MulterError", code: "LIMIT_FILE_COUNT" }), /Máximo 5/);
  assert.match(mensajeDeSubida({ name: "MulterError", code: "LIMIT_UNEXPECTED_FILE" }), /Máximo 5/);
  // Un código de multer que no conocemos, o cualquier otra cosa: mensaje
  // genérico, nunca el texto en inglés de la librería.
  const generico = mensajeDeSubida({ name: "MulterError", code: "LIMIT_PART_COUNT", message: "Too many parts" });
  assert.doesNotMatch(generico, /Too many/);
  assert.match(generico, /No se pudo recibir/);
  assert.match(mensajeDeSubida(new Error("Unexpected end of form")), /No se pudo recibir/);
});

test("el rechazo por tipo del filtro conserva su mensaje", () => {
  const { errorDeTipo } = require("../utils/constancias");
  const e = errorDeTipo("apunte.docx");
  assert.match(mensajeDeSubida(e), /apunte\.docx/);
  assert.match(mensajeDeSubida(e), /JPG o PNG/);
});

test("la extensión sale en minúsculas y sin inventar nada", () => {
  assert.equal(extensionDe("Foto.JPG"), ".jpg");
  assert.equal(extensionDe("constancia médica.final.pdf"), ".pdf");
  assert.equal(extensionDe("sin_extension"), "");
  assert.equal(extensionDe(undefined), "");
});

// multer lee el nombre del archivo como latin1 y los navegadores lo mandan en
// UTF-8. El caso real del 2026-10-06: "Constancia médica .pdf" quedó guardada
// como "Constancia mÃ©dica .pdf".
test("el nombre con tildes se recupera", () => {
  assert.equal(nombreLegible("Constancia mÃ©dica .pdf"), "Constancia médica .pdf");
  assert.equal(nombreLegible(Buffer.from("año ñandú.png", "utf8").toString("latin1")), "año ñandú.png");
  assert.equal(nombreLegible("foto_1.jpg"), "foto_1.jpg");
  assert.equal(nombreLegible(undefined), "");
});

test("un nombre que no venía en UTF-8 se deja como llegó", () => {
  // "médica" en latin1 de verdad: reinterpretarlo como UTF-8 lo rompería.
  assert.equal(nombreLegible("médica.pdf"), "médica.pdf");
});
