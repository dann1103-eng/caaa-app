// legacy/CAA-backend/tests/cancelacionConstancias.test.js
//
// Subir y borrar las constancias de una solicitud de cancelación, contra el
// Storage de mentira (tests/storageFalso.js) y una conexión de base de mentira.
// Sin red.
const test = require("node:test");
const assert = require("node:assert/strict");
const { levantarStorageFalso } = require("./storageFalso");

const BUCKET = "documentos-alumno";
let falso, servicio, db;

test.before(async () => {
  falso = await levantarStorageFalso();
  process.env.SUPABASE_URL = falso.url;
  process.env.SUPABASE_SERVICE_KEY = "clave-falsa";
  servicio = require("../services/cancelacionService");
  db = require("../config/db");
});
test.after(() => falso.cerrar());
test.beforeEach(() => {
  falso.fallas.length = 0;
  falso.objetos.clear();
});

const archivo = (originalname, mimetype = "image/jpeg") =>
  ({ originalname, mimetype, size: 4, buffer: Buffer.from("dato") });

/** Conexión de mentira: guarda lo que se insertó y devuelve una fila por INSERT. */
function conexionFalsa() {
  const filas = [];
  return {
    filas,
    query: async (_sql, p) => {
      filas.push({ id_solicitud: p[0], nombre_archivo: p[1], archivo_path: p[2], content_type: p[3], tamano_bytes: p[4], subido_por: p[5] });
      return { rows: [{ id_adjunto: filas.length, nombre_archivo: p[1], content_type: p[3], tamano_bytes: p[4] }] };
    },
  };
}

const rutasEnStorage = () => [...falso.objetos.keys()].sort();

test("cada constancia queda en Storage y con su fila, bajo la carpeta de la solicitud", async () => {
  const conn = conexionFalsa();
  const intentadas = [];
  const { guardadas, fallo } = await servicio.guardarConstancias(conn, {
    id_solicitud: 77, id_usuario: 9, intentadas,
    archivos: [archivo("Constancia médica.pdf", "application/pdf"), archivo("foto.JPG"), archivo("captura.png", "image/png")],
  });
  assert.equal(fallo, null);
  assert.equal(guardadas.length, 3);
  assert.deepEqual(guardadas.map((g) => g.nombre_archivo), ["Constancia médica.pdf", "foto.JPG", "captura.png"]);

  assert.equal(conn.filas.length, 3);
  for (const f of conn.filas) {
    assert.equal(f.id_solicitud, 77);
    assert.equal(f.subido_por, 9);
    assert.match(f.archivo_path, /^cancelaciones\/77\/\d+-[a-z0-9]+\.(pdf|jpg|png)$/);
  }
  // Lo que dice la base es lo que hay en Storage, y es lo que se anotó para limpiar.
  assert.deepEqual(rutasEnStorage(), conn.filas.map((f) => `${BUCKET}/${f.archivo_path}`).sort());
  assert.deepEqual([...intentadas].sort(), conn.filas.map((f) => f.archivo_path).sort());
});

test("si una subida falla, las otras se guardan igual y el fallo se informa", async () => {
  falso.fallas.push({ metodo: "POST", prefijo: `${BUCKET}/cancelaciones/77/`, status: 500, veces: 1 });
  const conn = conexionFalsa();
  const intentadas = [];
  const { guardadas, fallo } = await servicio.guardarConstancias(conn, {
    id_solicitud: 77, id_usuario: 9, intentadas,
    archivos: [archivo("a.jpg"), archivo("b.jpg"), archivo("c.jpg")],
  });
  assert.ok(fallo, "el fallo de subida tiene que volver");
  assert.equal(guardadas.length, 2);
  assert.equal(conn.filas.length, 2, "no se guarda fila de lo que no subió");
  assert.equal(falso.objetos.size, 2);
  // Las tres rutas quedan anotadas, también la que falló: quien hace ROLLBACK
  // limpia todo lo que se intentó.
  assert.equal(intentadas.length, 3);
});

test("si Storage rechaza todo, no se guarda ninguna fila", async () => {
  falso.fallas.push({ metodo: "POST", prefijo: `${BUCKET}/`, status: 503 });
  const conn = conexionFalsa();
  const { guardadas, fallo } = await servicio.guardarConstancias(conn, {
    id_solicitud: 77, id_usuario: 9, intentadas: [], archivos: [archivo("a.jpg"), archivo("b.jpg")],
  });
  assert.ok(fallo);
  assert.deepEqual(guardadas, []);
  assert.equal(conn.filas.length, 0);
});

test("un error de la base no se disfraza de fallo de subida: se relanza", async () => {
  const conn = { query: async () => { throw new Error("relation does not exist"); } };
  await assert.rejects(
    servicio.guardarConstancias(conn, { id_solicitud: 77, id_usuario: 9, intentadas: [], archivos: [archivo("a.jpg")] }),
    /relation does not exist/
  );
});

// La cuenta de demostraciones comparte el bucket y sus ids chocan con los reales.
test("desde la cuenta demo las constancias van a su propia carpeta", async () => {
  const conn = conexionFalsa();
  await db.enEsquema("demo", () => servicio.guardarConstancias(conn, {
    id_solicitud: 77, id_usuario: 9, intentadas: [], archivos: [archivo("a.jpg")],
  }));
  assert.match(conn.filas[0].archivo_path, /^cancelaciones\/demo-77\//);
});

test("borrarDeStorage quita exactamente las rutas que se le dan, no la carpeta", async () => {
  falso.objetos.set(`${BUCKET}/cancelaciones/77/mia.jpg`, Buffer.from("x"));
  falso.objetos.set(`${BUCKET}/cancelaciones/77/de-otro.jpg`, Buffer.from("x"));
  await servicio.borrarDeStorage(["cancelaciones/77/mia.jpg"]);
  assert.deepEqual(rutasEnStorage(), [`${BUCKET}/cancelaciones/77/de-otro.jpg`]);
  // Y con una lista vacía o sin lista no hace nada ni se rompe.
  await servicio.borrarDeStorage([]);
  await servicio.borrarDeStorage(undefined);
  assert.equal(falso.objetos.size, 1);
});
