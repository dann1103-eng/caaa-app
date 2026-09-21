// legacy/CAA-backend/tests/manualesService.test.js
/**
 * Lo del servicio de manuales que no necesita la base: el PDF armado
 * (pdfDeExtractos) contra un Storage de mentira local, y sinInternos.
 * Las consultas a la base las cubre el E2E.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument, PDFName } = require("pdf-lib");
const { levantarStorageFalso } = require("./storageFalso");
const AppError = require("../utils/appError");

let falso;
let servicio;

async function manualDePrueba(n, base) {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= n; i++) doc.addPage([base + i, 300]);
  return Buffer.from(await doc.save());
}
const anchos = async (bytes) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));
const extracto = (sha, desde, hasta) => ({
  sha256: sha, archivo_path: `manuales/${sha}.pdf`, pagina_desde: desde, pagina_hasta: hasta,
});
const bajadas = () => falso.peticiones.filter((p) => p.startsWith("GET "));

test.before(async () => {
  falso = await levantarStorageFalso();
  process.env.SUPABASE_URL = falso.url;
  process.env.SUPABASE_SERVICE_KEY = "clave-falsa";
  servicio = require("../services/manualesService");
  falso.objetos.set("manuales-taller/manuales/a.pdf", await manualDePrueba(5, 200));
  falso.objetos.set("manuales-taller/manuales/b.pdf", await manualDePrueba(5, 400));
});
test.after(() => falso.cerrar());
test.beforeEach(() => {
  falso.fallas.length = 0;
  falso.peticiones.length = 0;
});

test("pdfDeExtractos: más de 10 manuales distintos → 400, sin tocar Storage", async () => {
  const once = Array.from({ length: 11 }, (_, i) => extracto(`m${i}`, 1, 1));
  await assert.rejects(servicio.pdfDeExtractos(once), (e) => {
    assert.ok(e instanceof AppError);
    assert.equal(e.statusCode, 400);
    assert.equal(e.message, "Un PDF puede juntar páginas de hasta 10 manuales distintos.");
    return true;
  });
  assert.deepEqual(falso.peticiones, []);
});

test("pdfDeExtractos: 10 manuales distintos todavía pasan el tope", async () => {
  // Faltan los archivos (no están en el Storage falso): lo que importa es que NO
  // lo frena el tope de manuales, sino la bajada.
  const diez = Array.from({ length: 10 }, (_, i) => extracto(`n${i}`, 1, 1));
  await assert.rejects(servicio.pdfDeExtractos(diez), /al bajar el archivo/);
});

test("pdfDeExtractos baja cada manual una sola vez, arma en orden, sube y firma", async () => {
  const pedido = [extracto("a", 1, 1), extracto("b", 2, 2), extracto("a", 3, 3)];
  const r = await servicio.pdfDeExtractos(pedido);
  assert.equal(r.paginas, 3);
  assert.match(r.url, /\/object\/sign\/manuales-taller\/extractos\/[0-9a-f]{64}\.pdf/);
  assert.deepEqual(bajadas(), ["GET manuales-taller/manuales/a.pdf", "GET manuales-taller/manuales/b.pdf"]);

  const armado = [...falso.objetos.entries()].find(([k]) => k.startsWith("manuales-taller/extractos/"));
  assert.ok(armado, "no se subió el PDF armado");
  assert.deepEqual(await anchos(armado[1]), [201, 402, 203]);

  // Segunda vez, mismo pedido: ya está armado, no baja nada.
  falso.peticiones.length = 0;
  await servicio.pdfDeExtractos(pedido);
  assert.deepEqual(bajadas(), []);
});

test("pdfDeExtractos: si Storage rechaza el PDF armado por tamaño (413) → 400 legible", async () => {
  falso.fallas.push({ metodo: "POST", prefijo: "manuales-taller/extractos/", status: 413 });
  await assert.rejects(servicio.pdfDeExtractos([extracto("b", 4, 5)]), (e) => {
    assert.ok(e instanceof AppError);
    assert.equal(e.statusCode, 400);
    assert.equal(e.message, "El PDF armado pasa el tope de 50 MB del almacenamiento. Imprimilo en dos partes.");
    return true;
  });
});

test("pdfDeExtractos: un PDF armado de más de 50 MB → 400, sin intentar subirlo", async () => {
  // Una página que carga 51 MB sin comprimir (ceros: baratos de generar, y
  // pdf-lib no comprime un stream crudo al guardar).
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([200, 300]);
  pagina.node.setXObject(PDFName.of("Pesado"), doc.context.register(doc.context.stream(Buffer.alloc(51 * 1024 * 1024))));
  falso.objetos.set("manuales-taller/manuales/gordo.pdf", Buffer.from(await doc.save()));
  try {
    await assert.rejects(servicio.pdfDeExtractos([extracto("gordo", 1, 1)]), (e) => {
      assert.ok(e instanceof AppError);
      assert.equal(e.statusCode, 400);
      assert.equal(e.message, "El PDF armado pasa el tope de 50 MB del almacenamiento. Imprimilo en dos partes.");
      return true;
    });
    assert.deepEqual(falso.peticiones.filter((p) => p.startsWith("POST manuales-taller/extractos/")), []);
  } finally {
    falso.objetos.delete("manuales-taller/manuales/gordo.pdf");
  }
});

test("sinInternos quita sha256 y archivo_path sin tocar el original", () => {
  const e = { id_extracto: 1, titulo: "Motor", sha256: "x".repeat(64), archivo_path: "manuales/x.pdf", paginas: 2 };
  assert.deepEqual(servicio.sinInternos(e), { id_extracto: 1, titulo: "Motor", paginas: 2 });
  assert.equal(e.sha256, "x".repeat(64));
  assert.equal(e.archivo_path, "manuales/x.pdf");
});
