// legacy/CAA-backend/tests/pdfExtractos.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { PDFDocument, PDFName } = require("pdf-lib");
const {
  validarRango, leerRangos, claveExtractos, armarPdf, analizarPdf, paginasDe, enCola,
} = require("../utils/pdfExtractos");

/** armarPdf pide cada manual con una función; en las pruebas sale de un Map. */
const desde = (mapa) => async (sha) => mapa.get(sha);

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

// leerRangos: lo que pide "agregar páginas" a una orden (una sección = varios rangos).
test("leerRangos sin `rangos`: el par suelto de siempre, sin prefijo en el error", () => {
  assert.deepEqual(leerRangos({ pagina_desde: "3", pagina_hasta: 5 }, 10), {
    lista: false, rangos: [{ pagina_desde: 3, pagina_hasta: 5 }],
  });
  assert.deepEqual(leerRangos({ pagina_desde: 1, pagina_hasta: 11 }, 10), {
    error: "El manual tiene 10 páginas: no existe la 11",
  });
  assert.match(leerRangos(undefined, 10).error, /enteros/);
});
test("leerRangos con `rangos`: todos, en orden, y los sueltos se ignoran", () => {
  const r = leerRangos({
    pagina_desde: 99, pagina_hasta: 99,
    rangos: [{ pagina_desde: 43, pagina_hasta: 43 }, { pagina_desde: "47", pagina_hasta: "50" }],
  }, 100);
  assert.deepEqual(r, {
    lista: true, rangos: [{ pagina_desde: 43, pagina_hasta: 43 }, { pagina_desde: 47, pagina_hasta: 50 }],
  });
});
test("leerRangos: un rango malo frena todo y dice cuál es", () => {
  const r = leerRangos({ rangos: [{ pagina_desde: 1, pagina_hasta: 2 }, { pagina_desde: 5, pagina_hasta: 3 }] }, 10);
  assert.equal(r.error, "Rango 2: La página final (3) no puede ser menor que la inicial (5)");
  assert.equal(leerRangos({ rangos: [{ pagina_desde: 1, pagina_hasta: 2 }, null] }, 10).error, "Rango 2: está mal armado");
  assert.equal(leerRangos({ rangos: [{ pagina_desde: 1, pagina_hasta: 20 }] }, 10).error,
    "Rango 1: El manual tiene 10 páginas: no existe la 20");
});
test("leerRangos: lista vacía, que no es lista, o de más de 50 → error", () => {
  assert.equal(leerRangos({ rangos: [] }, 10).error, "Elegí al menos un rango de páginas");
  assert.equal(leerRangos({ rangos: "1-3" }, 10).error, "Los rangos tienen que venir en una lista");
  const muchos = Array.from({ length: 51 }, (_, i) => ({ pagina_desde: i + 1, pagina_hasta: i + 1 }));
  assert.equal(leerRangos({ rangos: muchos }, 100).error, "Son 51 rangos: el máximo por vez es 50");
  assert.equal(leerRangos({ rangos: muchos.slice(0, 50) }, 100).rangos.length, 50);
});
test("claveExtractos depende del contenido y del orden", () => {
  const a = { sha256: "a".repeat(64), pagina_desde: 1, pagina_hasta: 2 };
  const b = { sha256: "b".repeat(64), pagina_desde: 5, pagina_hasta: 5 };
  assert.equal(claveExtractos([a, b]), claveExtractos([{ ...a, titulo: "x" }, { ...b }]));
  assert.notEqual(claveExtractos([a, b]), claveExtractos([b, a]));
  assert.match(claveExtractos([a]), /^[0-9a-f]{64}$/);
});
test("claveExtractos lleva la versión de la receta adentro", () => {
  const a = { sha256: "a".repeat(64), pagina_desde: 1, pagina_hasta: 2 };
  const b = { sha256: "b".repeat(64), pagina_desde: "5", pagina_hasta: "5" };
  const esperada = crypto.createHash("sha256")
    .update(JSON.stringify(["v2", [["a".repeat(64), 1, 2], ["b".repeat(64), 5, 5]]]))
    .digest("hex");
  assert.equal(claveExtractos([a, b]), esperada);
});
test("paginasDe suma los rangos", () => {
  assert.equal(paginasDe([{ pagina_desde: 3, pagina_hasta: 4 }, { pagina_desde: 1, pagina_hasta: 1 }]), 3);
});
test("armarPdf saca exactamente las páginas pedidas, en el orden pedido", async () => {
  const fuentes = new Map([["m", await manualDePrueba(10)]]);
  const out = await armarPdf([
    { sha256: "m", pagina_desde: 3, pagina_hasta: 4 },
    { sha256: "m", pagina_desde: 1, pagina_hasta: 1 },
  ], desde(fuentes));
  assert.deepEqual(await anchos(out), [203, 204, 201]);
});
test("armarPdf le pone un título neutro, que el visor muestra en la pestaña", async () => {
  // Sin título la pestaña mostraba el nombre del archivo guardado: un hash.
  // Neutro, sin marca: el mismo PDF guardado lo reciben CAAA y el demo.
  const fuentes = new Map([["m", await manualDePrueba(3)]]);
  const out = await PDFDocument.load(await armarPdf([{ sha256: "m", pagina_desde: 1, pagina_hasta: 1 }], desde(fuentes)));
  assert.equal(out.getTitle(), "Páginas de manual");
  assert.equal(out.catalog.lookup(PDFName.of("ViewerPreferences"))?.lookup(PDFName.of("DisplayDocTitle"))?.asBoolean(), true);
});
test("armarPdf junta páginas de dos manuales", async () => {
  const fuentes = new Map([["a", await manualDePrueba(5, 200)], ["b", await manualDePrueba(5, 400)]]);
  const out = await armarPdf([
    { sha256: "b", pagina_desde: 2, pagina_hasta: 2 },
    { sha256: "a", pagina_desde: 5, pagina_hasta: 5 },
  ], desde(fuentes));
  assert.deepEqual(await anchos(out), [402, 205]);
});
test("armarPdf respeta el orden intercalado A, B, A", async () => {
  const fuentes = new Map([["a", await manualDePrueba(5, 200)], ["b", await manualDePrueba(5, 400)]]);
  const out = await armarPdf([
    { sha256: "a", pagina_desde: 1, pagina_hasta: 1 },
    { sha256: "b", pagina_desde: 2, pagina_hasta: 2 },
    { sha256: "a", pagina_desde: 3, pagina_hasta: 3 },
  ], desde(fuentes));
  assert.deepEqual(await anchos(out), [201, 402, 203]);
});
test("armarPdf pide cada manual una sola vez, de a uno, en el orden en que aparece", async () => {
  const fuentes = new Map([["a", await manualDePrueba(5, 200)], ["b", await manualDePrueba(5, 400)]]);
  const pedidos = [];
  let activos = 0;
  let maximo = 0;
  const obtener = async (sha) => {
    pedidos.push(sha);
    activos++;
    maximo = Math.max(maximo, activos);
    await new Promise((r) => setTimeout(r, 5));
    activos--;
    return fuentes.get(sha);
  };
  await armarPdf([
    { sha256: "a", pagina_desde: 1, pagina_hasta: 1 },
    { sha256: "b", pagina_desde: 2, pagina_hasta: 2 },
    { sha256: "a", pagina_desde: 3, pagina_hasta: 4 },
    { sha256: "b", pagina_desde: 1, pagina_hasta: 1 },
  ], obtener);
  assert.deepEqual(pedidos, ["a", "b"]);
  assert.equal(maximo, 1);
});
/**
 * Espía de PDFDocument.load: anota cada carga en `eventos` y guarda una WeakRef
 * al documento cargado (sin retenerlo). Devuelve la función que lo desarma.
 */
function espiarCargas(eventos, cargados) {
  const original = PDFDocument.load;
  PDFDocument.load = async function (...args) {
    const doc = await original.apply(this, args);
    eventos.push("cargado");
    cargados.push(new WeakRef(doc));
    return doc;
  };
  return () => { PDFDocument.load = original; };
}

test("armarPdf termina de cargar cada manual antes de pedir el siguiente", async () => {
  const fuentes = new Map([
    ["a", await manualDePrueba(5, 200)], ["b", await manualDePrueba(5, 400)], ["c", await manualDePrueba(5, 600)],
  ]);
  const eventos = [];
  const desarmar = espiarCargas(eventos, []);
  try {
    await armarPdf([
      { sha256: "a", pagina_desde: 1, pagina_hasta: 1 },
      { sha256: "b", pagina_desde: 1, pagina_hasta: 1 },
      { sha256: "c", pagina_desde: 1, pagina_hasta: 1 },
      { sha256: "a", pagina_desde: 2, pagina_hasta: 2 },
    ], async (sha) => { eventos.push(`pide ${sha}`); return fuentes.get(sha); });
  } finally {
    desarmar();
  }
  assert.deepEqual(eventos, ["pide a", "cargado", "pide b", "cargado", "pide c", "cargado"]);
});

test("armarPdf suelta el manual anterior antes de bajar el siguiente", async () => {
  // gc() a mano: se habilita en caliente y se toma de un contexto nuevo.
  require("v8").setFlagsFromString("--expose-gc");
  const gc = require("vm").runInNewContext("gc");

  const fuentes = new Map([
    ["a", await manualDePrueba(5, 200)], ["b", await manualDePrueba(5, 400)], ["c", await manualDePrueba(5, 600)],
  ]);
  const cargados = [];
  const desarmar = espiarCargas([], cargados);
  const vivoElAnterior = [];
  try {
    await armarPdf([
      { sha256: "a", pagina_desde: 1, pagina_hasta: 2 },
      { sha256: "b", pagina_desde: 3, pagina_hasta: 3 },
      { sha256: "c", pagina_desde: 4, pagina_hasta: 4 },
    ], async (sha) => {
      if (cargados.length) {
        // Otra vuelta del event loop: la WeakRef ya no está protegida por el
        // trabajo en que se creó, y el gc puede soltar lo que nadie retiene.
        await new Promise((r) => setImmediate(r));
        gc();
        vivoElAnterior.push(cargados[cargados.length - 1].deref() !== undefined);
      }
      return fuentes.get(sha);
    });
  } finally {
    desarmar();
  }
  assert.deepEqual(vivoElAnterior, [false, false], "el manual anterior seguía en memoria mientras se bajaba el siguiente");
});

test("armarPdf no arrastra la página a la que apunta un link", async () => {
  const fuentes = new Map([["m", await manualDePrueba(10)]]);
  const out = await armarPdf([{ sha256: "m", pagina_desde: 1, pagina_hasta: 1 }], desde(fuentes));
  assert.ok(out.length < 50000, `pesa ${out.length} bytes: se colaron los 300 KB de la página del link`);
});
test("armarPdf avisa si falta el archivo de un manual", async () => {
  await assert.rejects(
    armarPdf([{ sha256: "zz", pagina_desde: 1, pagina_hasta: 1 }], async () => undefined),
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
test("analizarPdf rechaza un PDF con el árbol de páginas roto (abre, pero no se pueden contar)", async () => {
  const roto = await PDFDocument.create();
  roto.addPage([200, 300]);
  roto.catalog.delete(PDFName.of("Pages"));
  const bytes = await roto.save({ addDefaultPage: false });
  const r = await analizarPdf(Buffer.from(bytes));
  assert.equal(r.error, "El archivo no es un PDF que se pueda leer.");
});
test("analizarPdf rechaza un PDF sin páginas", async () => {
  // addDefaultPage:false: sin eso pdf-lib le agrega una página en blanco al guardar.
  const vacio = await (await PDFDocument.create()).save({ addDefaultPage: false });
  const r = await analizarPdf(Buffer.from(vacio));
  assert.equal(r.error, "El PDF no tiene páginas legibles.");
});

test("enCola corre los trabajos de a uno", async () => {
  let activos = 0;
  let maximo = 0;
  const trabajo = (ms) => enCola(async () => {
    activos++;
    maximo = Math.max(maximo, activos);
    await new Promise((r) => setTimeout(r, ms));
    activos--;
  });
  await Promise.all([trabajo(20), trabajo(5), trabajo(10)]);
  assert.equal(maximo, 1);
});
test("enCola: un trabajo que falla no traba al siguiente", async () => {
  const fallido = enCola(async () => { throw new Error("boom"); });
  const siguiente = enCola(async () => "sigue");
  await assert.rejects(fallido, /boom/);
  assert.equal(await siguiente, "sigue");
});
test("enCola devuelve lo que devuelve el trabajo", async () => {
  assert.equal(await enCola(async () => 42), 42);
});
