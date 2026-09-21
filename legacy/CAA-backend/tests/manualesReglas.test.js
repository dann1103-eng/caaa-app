// legacy/CAA-backend/tests/manualesReglas.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  aTipoPaquete, resolverInspeccion, esMecanicoDeOrden, esJefe, TIPOS_PAQUETE,
  claveRango, sinRangosRepetidos, esArchivoFaltante,
} = require("../utils/manualesReglas");

test("los cuatro tipos de paquete", () => {
  assert.deepEqual(TIPOS_PAQUETE, ["25HR", "50HR", "100HR", "ANUAL"]);
});
test("un código ya hecho se usa tal cual (y sin distinguir mayúsculas)", () => {
  assert.equal(aTipoPaquete("100HR"), "100HR");
  assert.equal(aTipoPaquete("anual"), "ANUAL");
});
test("el nombre libre se traduce con el mapa que ya existe", () => {
  assert.equal(aTipoPaquete("Inspección 25 horas"), "25HR");
  assert.equal(aTipoPaquete("Inspección 50 horas"), "50HR");
  assert.equal(aTipoPaquete("Anual"), "ANUAL");
});
test("lo que no es una inspección de paquete no cuenta", () => {
  assert.equal(aTipoPaquete("CORRECTIVO"), null);
  assert.equal(aTipoPaquete("Overhaul"), null);
  assert.equal(aTipoPaquete("AD 2011-10-09"), null);
  assert.equal(aTipoPaquete("100 hrs"), null);
  assert.equal(aTipoPaquete(""), null);
  assert.equal(aTipoPaquete(null), null);
});
test("resolverInspeccion: el mantenimiento manda", () => {
  assert.equal(resolverInspeccion({ tipo_mantenimiento: "50HR", nombre_tarea: "Anual" }), "50HR");
});
test("resolverInspeccion: un correctivo sigue buscando en la tarea", () => {
  assert.equal(resolverInspeccion({ tipo_mantenimiento: "CORRECTIVO", nombre_tarea: "Inspección 100 horas" }), "100HR");
});
test("resolverInspeccion: el reporte es el último recurso", () => {
  assert.equal(resolverInspeccion({ tipo_inspeccion_reporte: "25HR" }), "25HR");
});
test("resolverInspeccion: sin nada, no hay inspección", () => {
  assert.equal(resolverInspeccion({}), null);
});
test("esMecanicoDeOrden: quien la abrió, a quien se la asignaron y quien la trabaja de segundo", () => {
  const o = { creado_por: 10, id_mecanico_asignado: 11, id_aprendiz: 12 };
  assert.equal(esMecanicoDeOrden(o, 10), true);
  assert.equal(esMecanicoDeOrden(o, "11"), true);
  assert.equal(esMecanicoDeOrden(o, 12), true);
  assert.equal(esMecanicoDeOrden(o, 99), false);
  assert.equal(esMecanicoDeOrden({ creado_por: null, id_mecanico_asignado: null, id_aprendiz: null }, 0), false);
});
test("esJefe: TALLER y ADMIN", () => {
  assert.equal(esJefe("TALLER"), true);
  assert.equal(esJefe("ADMIN"), true);
  assert.equal(esJefe("TECNICO"), false);
});
test("claveRango: manual y las dos puntas, sin importar si llegan como texto", () => {
  assert.equal(claveRango({ id_manual: 3, pagina_desde: 10, pagina_hasta: 12 }), "3:10:12");
  assert.equal(claveRango({ id_manual: "3", pagina_desde: "10", pagina_hasta: "12" }), "3:10:12");
});
test("sinRangosRepetidos: quita del paquete lo que ya está copiado a mano, y nada más", () => {
  const paquete = [
    { id_extracto: 1, id_manual: 3, pagina_desde: 10, pagina_hasta: 12 },
    { id_extracto: 2, id_manual: 3, pagina_desde: 20, pagina_hasta: 20 },
    { id_extracto: 3, id_manual: 4, pagina_desde: 10, pagina_hasta: 12 },
  ];
  const manuales = [
    { id_extracto: 9, id_manual: 3, pagina_desde: 10, pagina_hasta: 12 }, // el mismo rango
    { id_extracto: 8, id_manual: 3, pagina_desde: 20, pagina_hasta: 21 }, // se superpone, pero no es el mismo
  ];
  assert.deepEqual(sinRangosRepetidos(paquete, manuales).map((e) => e.id_extracto), [2, 3]);
  assert.deepEqual(sinRangosRepetidos(paquete, []).map((e) => e.id_extracto), [1, 2, 3]);
  assert.deepEqual(sinRangosRepetidos([], manuales), []);
});
test("esArchivoFaltante: solo el 400 o 404 de Storage, no una caída ni un error cualquiera", () => {
  assert.equal(esArchivoFaltante({ storageStatus: 400 }), true);
  assert.equal(esArchivoFaltante({ storageStatus: 404 }), true);
  assert.equal(esArchivoFaltante({ storageStatus: 403 }), false);
  assert.equal(esArchivoFaltante({ storageStatus: 503 }), false);
  assert.equal(esArchivoFaltante({ storageStatus: null }), false); // corte de red
  assert.equal(esArchivoFaltante({ statusCode: 404 }), false); // el status de la API no cuenta
  assert.equal(esArchivoFaltante(new Error("Storage no configurado")), false);
  assert.equal(esArchivoFaltante(undefined), false);
});
