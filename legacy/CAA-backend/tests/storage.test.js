// legacy/CAA-backend/tests/storage.test.js
/**
 * Errores de Storage que tienen que salir legibles y con su status, contra un
 * Storage de mentira local (tests/storageFalso.js) y el cliente de verdad.
 *
 * El status de Storage va en `storageStatus`, NUNCA en `statusCode`: el
 * middleware de errores usa `statusCode` como status de la respuesta, y un 403
 * o un 404 de Storage no es la respuesta correcta de la API (es un 500 nuestro).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { levantarStorageFalso } = require("./storageFalso");

let falso;
let storage;

test.before(async () => {
  falso = await levantarStorageFalso();
  process.env.SUPABASE_URL = falso.url;
  process.env.SUPABASE_SERVICE_KEY = "clave-falsa";
  storage = require("../utils/storage");
});
test.after(() => falso.cerrar());
test.beforeEach(() => {
  falso.fallas.length = 0;
  falso.objetos.clear();
});

/** El error trae el status de Storage donde va, no donde lo leería el middleware, y su causa. */
function statusDeStorage(e, esperado) {
  assert.equal(e.storageStatus, esperado);
  assert.equal(e.statusCode, undefined, "statusCode lo usaría el middleware como status de la API");
  assert.ok(e.cause, "falta la causa original");
}

test("existeArchivo: true si está, false si Storage dice que no existe", async () => {
  falso.objetos.set("b/a.pdf", Buffer.from("x"));
  assert.equal(await storage.existeArchivo("b", "a.pdf"), true);
  assert.equal(await storage.existeArchivo("b", "no-esta.pdf"), false);
});

test("existeArchivo no se traga un 403: tira con el status", async () => {
  falso.fallas.push({ metodo: "HEAD", prefijo: "b/", status: 403 });
  await assert.rejects(storage.existeArchivo("b", "a.pdf"), (e) => {
    assert.match(e.message, /Storage respondió 403 al consultar el archivo/);
    statusDeStorage(e, 403);
    return true;
  });
});

test("existeArchivo no se traga un 500", async () => {
  falso.fallas.push({ metodo: "HEAD", prefijo: "b/", status: 500 });
  await assert.rejects(storage.existeArchivo("b", "a.pdf"), /Storage respondió 500 al consultar el archivo/);
});

test("existeArchivo con la conexión cortada: error de red, no 'no existe'", async () => {
  falso.fallas.push({ metodo: "HEAD", prefijo: "b/", status: "cortar" });
  await assert.rejects(storage.existeArchivo("b", "a.pdf"), (e) => {
    assert.match(e.message, /Storage respondió con un error de red al consultar el archivo/);
    statusDeStorage(e, null);
    return true;
  });
});

test("descargarArchivo devuelve los bytes", async () => {
  falso.objetos.set("b/a.pdf", Buffer.from("contenido"));
  const bytes = await storage.descargarArchivo("b", "a.pdf");
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(bytes.toString(), "contenido");
});

test("descargarArchivo con error: mensaje legible con el status (antes decía '{}')", async () => {
  await assert.rejects(storage.descargarArchivo("b", "no-esta.pdf"), (e) => {
    assert.match(e.message, /Storage respondió 404 al bajar el archivo/);
    statusDeStorage(e, 404);
    return true;
  });
});

test("descargarArchivo cortado en plena transferencia: error legible, no 'TypeError: terminated'", async () => {
  falso.fallas.push({ metodo: "GET", prefijo: "b/", status: "cortar-a-medias" });
  await assert.rejects(storage.descargarArchivo("b", "grande.pdf"), (e) => {
    assert.equal(e.message, "No se pudo bajar el archivo de Storage (conexión cortada)");
    statusDeStorage(e, null);
    return true;
  });
});

test("subirArchivo sin upsert sobre algo que existe: 409 y la causa", async () => {
  falso.objetos.set("b/a.pdf", Buffer.from("viejo"));
  await assert.rejects(
    storage.subirArchivo("b", "a.pdf", Buffer.from("nuevo"), "application/pdf", { upsert: false }),
    (e) => { statusDeStorage(e, 409); return true; }
  );
  assert.equal(falso.objetos.get("b/a.pdf").toString(), "viejo");
});

test("subirArchivo: si el cuerpo trae un código no numérico, manda el status HTTP", async () => {
  falso.fallas.push({
    metodo: "POST", prefijo: "b/", status: 413,
    body: { statusCode: "EntityTooLarge", error: "Payload too large", message: "The object exceeded the maximum allowed size" },
  });
  await assert.rejects(
    storage.subirArchivo("b", "grande.pdf", Buffer.from("x"), "application/pdf", { upsert: false }),
    (e) => { statusDeStorage(e, 413); return true; }
  );
});
