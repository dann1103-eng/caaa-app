// CAA-frontend/src/utils/constancias.test.js
// Se corre con `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CONSTANCIAS, MAX_BYTES_CONSTANCIA, ACCEPT_CONSTANCIAS,
  problemaDeConstancias, pesoLegible, iconoDeConstancia, textoAnticipacion,
} from "./constancias.js";

// Un archivo como lo entrega el <input type="file">.
const archivo = (name, type, size = 200_000) => ({ name, type, size });
const foto = (n = 1) => archivo(`foto${n}.jpg`, "image/jpeg");

test("los límites son los mismos que exige el servidor", () => {
  assert.equal(MAX_CONSTANCIAS, 5);
  assert.equal(MAX_BYTES_CONSTANCIA, 8 * 1024 * 1024);
  assert.equal(ACCEPT_CONSTANCIAS, "image/jpeg,image/png,application/pdf");
});

test("una lista válida no tiene problema", () => {
  assert.equal(problemaDeConstancias([]), "");
  assert.equal(problemaDeConstancias([foto(), archivo("receta.pdf", "application/pdf"), archivo("captura.png", "image/png")]), "");
  assert.equal(problemaDeConstancias([1, 2, 3, 4, 5].map(foto)), "");
});

test("más de cinco no pasan, contando las que la solicitud ya tiene", () => {
  assert.match(problemaDeConstancias([1, 2, 3, 4, 5, 6].map(foto)), /Máximo 5/);
  assert.equal(problemaDeConstancias([foto(1), foto(2)], { yaHay: 3 }), "");
  assert.match(problemaDeConstancias([foto(1), foto(2)], { yaHay: 4 }), /ya tenés 4/);
});

test("un tipo no permitido se rechaza nombrando el archivo", () => {
  assert.match(problemaDeConstancias([foto(), archivo("nota.docx", "application/msword")]), /nota\.docx/);
  assert.match(problemaDeConstancias([archivo("IMG_0012.heic", "image/heic")]), /JPG o PNG/);
  // Algunos selectores de Android entregan el archivo sin tipo: el servidor lo
  // rechazaría, así que se avisa antes de subirlo.
  assert.match(problemaDeConstancias([archivo("descarga", "")]), /descarga/);
});

test("un archivo de más de 8 MB se rechaza diciendo cuánto pesa", () => {
  assert.equal(problemaDeConstancias([archivo("justo.jpg", "image/jpeg", MAX_BYTES_CONSTANCIA)]), "");
  const m = problemaDeConstancias([archivo("enorme.jpg", "image/jpeg", 9.4 * 1024 * 1024)]);
  assert.match(m, /enorme\.jpg/);
  assert.match(m, /9\.4 MB/);
  assert.match(m, /8 MB/);
});

test("el peso se lee en KB o MB", () => {
  assert.equal(pesoLegible(0), "");
  assert.equal(pesoLegible(undefined), "");
  assert.equal(pesoLegible(840_582), "821 KB");
  assert.equal(pesoLegible(3.25 * 1024 * 1024), "3.3 MB");
});

test("el ícono distingue imagen de PDF", () => {
  assert.equal(iconoDeConstancia("image/jpeg"), "bi-file-earmark-image");
  assert.equal(iconoDeConstancia("application/pdf"), "bi-file-earmark-pdf");
  assert.equal(iconoDeConstancia(undefined), "bi-file-earmark-pdf");
});

// "Pedida X antes del vuelo", en la tarjeta de quien aprueba.
test("la anticipación se dice en minutos, horas o días según el tamaño", () => {
  assert.equal(textoAnticipacion(0.4), "24 min");
  assert.equal(textoAnticipacion(0.01), "1 min");
  assert.equal(textoAnticipacion(1), "1 h");
  assert.equal(textoAnticipacion(22.5), "23 h");
  assert.equal(textoAnticipacion(47.4), "47 h");
  assert.equal(textoAnticipacion(48), "2 días");
  assert.equal(textoAnticipacion(100), "4 días");
  assert.equal(textoAnticipacion(null), "");
  assert.equal(textoAnticipacion(-3), "");
});
