// CAA-frontend/src/pages/Taller/manuales/paginasSeleccion.test.js
// Se corre con `npm test` (node --test): el parser del campo «Páginas» del
// visor y el agrupador de secciones son puros, sin React ni navegador.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsearPaginas, formatearPaginas, mostrarPaginas, sumarAlTexto, contiene,
  rangoDeSeccion, resolverRangoDeSeccion, agruparSecciones,
} from "./paginasSeleccion.js";

const R = (desde, hasta = desde) => ({ desde, hasta });

// ── parsearPaginas ─────────────────────────────────────────────────────────
test("páginas sueltas y un rango", () => {
  assert.deepEqual(parsearPaginas("43, 45, 47-50", 100), {
    rangos: [R(43), R(45), R(47, 50)], paginas: 6, error: null,
  });
});
test("une las contiguas, da vuelta el rango al revés y ordena", () => {
  assert.deepEqual(parsearPaginas("47,48,49", 100).rangos, [R(47, 49)]);
  assert.deepEqual(parsearPaginas("50-47", 100).rangos, [R(47, 50)]);
  assert.deepEqual(parsearPaginas("3, 1-2", 100).rangos, [R(1, 3)]);
  assert.equal(parsearPaginas("3, 1-2", 100).paginas, 3);
});
test("quita repetidos y une los solapados", () => {
  assert.deepEqual(parsearPaginas("5, 5, 1-6, 4", 100), { rangos: [R(1, 6)], paginas: 6, error: null });
  assert.deepEqual(parsearPaginas("10-20; 15-25", 100).rangos, [R(10, 25)]);
});
test("separadores: coma, punto y coma o espacio; rayas y espacios alrededor del guion", () => {
  assert.deepEqual(parsearPaginas("1;3 5", 100).rangos, [R(1), R(3), R(5)]);
  assert.deepEqual(parsearPaginas("47–50", 100).rangos, [R(47, 50)]);
  assert.deepEqual(parsearPaginas("47—50", 100).rangos, [R(47, 50)]);
  assert.deepEqual(parsearPaginas("47 - 50", 100).rangos, [R(47, 50)]);
});
test("vacío o solo espacios: nada, sin error", () => {
  assert.deepEqual(parsearPaginas("  ", 100), { rangos: [], paginas: 0, error: null });
  assert.deepEqual(parsearPaginas("", 100), { rangos: [], paginas: 0, error: null });
  assert.deepEqual(parsearPaginas(undefined, 100), { rangos: [], paginas: 0, error: null });
});
test("errores entendibles: página 0, texto, rango sin final, página que no existe", () => {
  for (const malo of ["0", "abc", "5-", "1-200", "3-0"]) {
    const r = parsearPaginas(malo, 100);
    assert.equal(typeof r.error, "string", `«${malo}» tendría que dar error`);
    assert.deepEqual(r.rangos, []);
    assert.equal(r.paginas, 0);
  }
  assert.match(parsearPaginas("0", 100).error, /empieza/);
  assert.match(parsearPaginas("abc", 100).error, /«abc»/);
  assert.match(parsearPaginas("5-", 100).error, /«5-»/);
  assert.equal(parsearPaginas("1-200", 100).error, "El manual tiene 100 páginas: no existe la 200");
});
test("sin total conocido no hay tope arriba, pero sí un número razonable", () => {
  assert.deepEqual(parsearPaginas("900", undefined).rangos, [R(900)]);
  assert.equal(typeof parsearPaginas("99999999999999999999", Infinity).error, "string");
});

// ── formatear y mostrar ────────────────────────────────────────────────────
test("formatearPaginas usa el guion común (es lo que se edita)", () => {
  assert.equal(formatearPaginas([R(43), R(45), R(47, 50)]), "43, 45, 47-50");
  assert.equal(formatearPaginas([]), "");
});
test("mostrarPaginas usa la raya", () => {
  assert.equal(mostrarPaginas([R(170), R(172), R(174, 175)]), "170, 172, 174–175");
});
test("formatear → parsear vuelve a lo mismo", () => {
  const r = parsearPaginas("1-3, 7, 9-12", 50);
  assert.deepEqual(parsearPaginas(formatearPaginas(r.rangos), 50), r);
});

// ── sumarAlTexto ───────────────────────────────────────────────────────────
test("sumarAlTexto agrega y normaliza", () => {
  assert.equal(sumarAlTexto("43", 45), "43, 45");
  assert.equal(sumarAlTexto("43, 45", 44), "43-45");
  assert.equal(sumarAlTexto("", 10, 12), "10-12");
  assert.equal(sumarAlTexto("20", 12, 10), "10-12, 20");
  assert.equal(sumarAlTexto("1-5", 3), "1-5");
});
test("sumarAlTexto con un texto con error: lo deja y agrega al final", () => {
  assert.equal(sumarAlTexto("43, abc", 45), "43, abc, 45");
  assert.equal(sumarAlTexto("1-200", 5, 5, 100), "1-200, 5");
  assert.equal(sumarAlTexto("43, abc, ", 47, 50), "43, abc, 47-50");
});

// ── contiene ───────────────────────────────────────────────────────────────
test("contiene", () => {
  const rs = [R(43), R(47, 50)];
  assert.equal(contiene(rs, 43), true);
  assert.equal(contiene(rs, 48), true);
  assert.equal(contiene(rs, 45), false);
  assert.equal(contiene([], 1), false);
});

// ── rangoDeSeccion ─────────────────────────────────────────────────────────
const INDICE = [
  { nivel: 1, pagina: 10 },
  { nivel: 2, pagina: 12 },
  { nivel: 2, pagina: 15 },
  { nivel: 1, pagina: 20 },
];
test("rangoDeSeccion: hasta antes de la próxima de nivel igual o superior", () => {
  assert.deepEqual(rangoDeSeccion(INDICE, 0, 99), R(10, 19));
  assert.deepEqual(rangoDeSeccion(INDICE, 1, 99), R(12, 14));
  assert.deepEqual(rangoDeSeccion(INDICE, 2, 99), R(15, 19));
  assert.deepEqual(rangoDeSeccion(INDICE, 3, 99), R(20, 99));
});
test("rangoDeSeccion: una entrada sin página no tiene sección", () => {
  assert.equal(rangoDeSeccion([{ nivel: 1, pagina: null }, { nivel: 1, pagina: 5 }], 0, 99), null);
  assert.equal(rangoDeSeccion(INDICE, 9, 99), null);
});
test("rangoDeSeccion: la próxima con la MISMA página (o sin página) se saltea", () => {
  const idx = [
    { nivel: 1, pagina: 10 },
    { nivel: 1, pagina: 10 },
    { nivel: 1, pagina: null },
    { nivel: 1, pagina: 14 },
  ];
  assert.deepEqual(rangoDeSeccion(idx, 0, 99), R(10, 13));
});

test("resolverRangoDeSeccion pide solo las páginas que hacen falta", async () => {
  // Un índice grande: 1 capítulo con 3.000 subentradas y después otro capítulo.
  const niveles = [{ nivel: 1 }, ...Array.from({ length: 3000 }, () => ({ nivel: 2 })), { nivel: 1 }];
  const paginaDe = (k) => (k === 0 ? 10 : k === niveles.length - 1 ? 500 : 10 + k);
  const pedidas = [];
  const r = await resolverRangoDeSeccion(niveles, 0, 999, async (k) => { pedidas.push(k); return paginaDe(k); });
  assert.deepEqual(r, R(10, 499));
  // La propia y la del próximo capítulo: ninguna de las 3.000 subentradas.
  assert.deepEqual(pedidas, [0, niveles.length - 1]);
});
test("resolverRangoDeSeccion: una subentrada corta en su hermana siguiente", async () => {
  const pedidas = [];
  const r = await resolverRangoDeSeccion(INDICE, 1, 99, async (k) => { pedidas.push(k); return INDICE[k].pagina; });
  assert.deepEqual(r, R(12, 14));
  assert.deepEqual(pedidas, [1, 2]);
});
test("resolverRangoDeSeccion: sin página propia → null; la última va hasta el final", async () => {
  assert.equal(await resolverRangoDeSeccion(INDICE, 0, 99, async () => null), null);
  assert.deepEqual(await resolverRangoDeSeccion(INDICE, 3, 99, async (k) => INDICE[k].pagina), R(20, 99));
});

// ── agruparSecciones ───────────────────────────────────────────────────────
const fila = (clave, id_manual, titulo, desde, hasta = desde, extra = {}) => ({
  clave, id_manual, titulo, pagina_desde: desde, pagina_hasta: hasta,
  manual_titulo: `Manual ${id_manual}`, manual_revision: "Rev. 1", manual_estado: "VIGENTE", manual_paginas: 900,
  ...extra,
});
test("agruparSecciones: filas consecutivas con mismo manual y título", () => {
  const filas = [
    fila("a", 1, "Lubricación", 170), fila("b", 1, "Lubricación", 172), fila("c", 1, "Lubricación", 174, 175),
    fila("d", 1, "Frenos", 200, 210),
    fila("e", 2, "Frenos", 5),
  ];
  const s = agruparSecciones(filas);
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.titulo), ["Lubricación", "Frenos", "Frenos"]);
  assert.deepEqual(s[0].rangos, [R(170), R(172), R(174, 175)]);
  assert.equal(s[0].paginas, 4);
  assert.deepEqual(s[0].filas.map((f) => f.clave), ["a", "b", "c"]);
  assert.equal(s[0].manual_titulo, "Manual 1");
  assert.equal(s[0].manual_paginas, 900);
  assert.equal(s[2].id_manual, 2);
  // Claves únicas y estables (salen de la primera fila).
  assert.equal(new Set(s.map((x) => x.clave)).size, 3);
  assert.equal(agruparSecciones(filas)[0].clave, s[0].clave);
});
test("agruparSecciones: el mismo título, separado por otra sección, son dos secciones", () => {
  const s = agruparSecciones([fila("a", 1, "X", 1), fila("b", 1, "Y", 2), fila("c", 1, "X", 3)]);
  assert.equal(s.length, 3);
});
test("agruparSecciones: la clave extra (origen) también separa, y sirve id_extracto de clave", () => {
  const filas = [
    { ...fila(undefined, 1, "X", 1), id_extracto: 7, origen: "PAQUETE" },
    { ...fila(undefined, 1, "X", 2), id_extracto: 8, origen: "MANUAL" },
  ];
  assert.equal(agruparSecciones(filas).length, 1);
  const s = agruparSecciones(filas, "origen");
  assert.equal(s.length, 2);
  assert.notEqual(s[0].clave, s[1].clave);
  assert.equal(agruparSecciones([]).length, 0);
});
