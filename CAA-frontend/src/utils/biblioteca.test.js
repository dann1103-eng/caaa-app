// CAA-frontend/src/utils/biblioteca.test.js
// Se corre con `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { bibliotecaPara } from "./biblioteca.js";

const URL_CAAA = "https://drive.google.com/open?id=14RwFkPzo8enUEBmThX12czFu-GU_299B";

test("la ven todos los roles menos los de taller", () => {
  for (const rol of ["ALUMNO", "INSTRUCTOR", "PROGRAMACION", "TURNO", "ADMINISTRACION", "ADMIN", "DUENO"]) {
    assert.equal(bibliotecaPara({ rol }, URL_CAAA), URL_CAAA, rol);
  }
});

test("los de taller no la ven: ni el jefe ni el mecánico", () => {
  assert.equal(bibliotecaPara({ rol: "TALLER" }, URL_CAAA), null);
  assert.equal(bibliotecaPara({ rol: "TECNICO" }, URL_CAAA), null);
  assert.equal(bibliotecaPara({ rol: "tecnico" }, URL_CAAA), null, "el rol se compara sin mirar mayúsculas");
});

test("sin sesión no hay botón", () => {
  assert.equal(bibliotecaPara(null, URL_CAAA), null);
  assert.equal(bibliotecaPara(undefined, URL_CAAA), null);
  assert.equal(bibliotecaPara({}, URL_CAAA), null);
});

// La cuenta de demostraciones usa otra marca, que no trae enlace: un prospecto
// no tiene que terminar en el Drive de la escuela.
test("si la marca no tiene biblioteca, no hay botón", () => {
  assert.equal(bibliotecaPara({ rol: "ALUMNO" }, ""), null);
  assert.equal(bibliotecaPara({ rol: "ALUMNO" }, undefined), null);
  assert.equal(bibliotecaPara({ rol: "ALUMNO" }, "   "), null);
});

test("solo se acepta un enlace web", () => {
  assert.equal(bibliotecaPara({ rol: "ALUMNO" }, "javascript:alert(1)"), null);
  assert.equal(bibliotecaPara({ rol: "ALUMNO" }, "drive.google.com/open?id=x"), null);
  assert.equal(bibliotecaPara({ rol: "ALUMNO" }, "  https://ejemplo.com/biblioteca  "), "https://ejemplo.com/biblioteca");
});
