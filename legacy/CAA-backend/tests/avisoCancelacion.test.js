// legacy/CAA-backend/tests/avisoCancelacion.test.js
//
// El aviso push a quienes resuelven las cancelaciones (los instructores con
// puede_programar) existe desde el 2026-07-23 y NUNCA se envió: la función
// estaba definida en utils/webpush.js pero no exportada. El controller la pedía
// con un destructuring, recibía undefined, y el TypeError se lo comía el
// try/catch del aviso (que es best-effort a propósito). El aviso de la campana
// sí llegaba, y por eso nadie lo notó.
const test = require("node:test");
const assert = require("node:assert/strict");

test("el push a un conjunto de usuarios está exportado", () => {
  const webpush = require("../utils/webpush");
  assert.equal(typeof webpush.notificarUsuarios, "function");
});

test("sin destinatarios no hace nada ni se rompe", async () => {
  const { notificarUsuarios } = require("../utils/webpush");
  await notificarUsuarios([], { title: "x", body: "y" });
  await notificarUsuarios(undefined, { title: "x", body: "y" });
});
