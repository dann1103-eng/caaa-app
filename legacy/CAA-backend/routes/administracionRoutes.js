const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const tarifas = require("../controllers/administracion/tarifasController");
const cursos = require("../controllers/administracion/cursosController");
const cuenta = require("../controllers/administracion/cuentaController");
const recibos = require("../controllers/administracion/recibosController");
const facturas = require("../controllers/administracion/facturasController");
const egresos = require("../controllers/administracion/egresosController");
const nomina = require("../controllers/administracion/nominaController");
const documentos = require("../controllers/administracion/documentosController");
const medicos = require("../controllers/administracion/medicosController");
const reportes = require("../controllers/administracion/reportesController");
const aula     = require("../controllers/administracion/aulaVirtualController");
const adminUsuario = require("../controllers/admin/adminUsuarioController");

// Upload de documentos: en memoria, para subir el buffer a Supabase Storage
// (persistente). El disco de Railway es efímero y se borra en cada redeploy.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Auth para todas las rutas
router.use(authMiddleware);

// Roles: ADMINISTRACION puede TODO. ADMIN tiene SOLO lectura (GET) en todo el módulo.
const READ_ROLES = ["ADMINISTRACION", "ADMIN"];
const WRITE_ROLES = ["ADMINISTRACION"];

// ── Ficha de alumno (consolidada) ─────────────────────────────────────
router.get("/licencias",                    roleMiddleware(READ_ROLES),  adminUsuario.listLicencias);
router.get("/alumnos/:id_alumno/ficha",     roleMiddleware(READ_ROLES),  adminUsuario.getAlumnoFichaAdmin);
router.put("/alumnos/:id_alumno",           roleMiddleware(WRITE_ROLES), adminUsuario.actualizarAlumnoFull);

// ── Tarifas ───────────────────────────────────────────────────────────
router.get("/tarifas/aeronaves",            roleMiddleware(READ_ROLES),  tarifas.listAeronaveTarifas);
router.get("/tarifas/aeronaves/lista",      roleMiddleware(READ_ROLES),  tarifas.listAeronaves);
router.get("/tarifas/aeronaves/historial",  roleMiddleware(READ_ROLES),  tarifas.historialAeronave);
router.put("/tarifas/aeronaves",            roleMiddleware(WRITE_ROLES), tarifas.upsertAeronaveTarifa);
router.get("/tarifas/instructores",         roleMiddleware(READ_ROLES),  tarifas.listInstructorTarifas);
router.get("/tarifas/instructores/disponibles", roleMiddleware(READ_ROLES), tarifas.listInstructoresDisponibles);
router.put("/tarifas/instructores",         roleMiddleware(WRITE_ROLES), tarifas.upsertInstructorTarifa);

// ── Cursos ────────────────────────────────────────────────────────────
router.get("/cursos",                       roleMiddleware(READ_ROLES),  cursos.list);
router.post("/cursos",                      roleMiddleware(WRITE_ROLES), cursos.create);
router.patch("/cursos/:id",                 roleMiddleware(WRITE_ROLES), cursos.update);
router.get("/inscripciones",                roleMiddleware(READ_ROLES),  cursos.listInscripciones);
router.post("/inscripciones",               roleMiddleware(WRITE_ROLES), cursos.crearInscripcion);
router.patch("/inscripciones/:id/finalizar",roleMiddleware(WRITE_ROLES), cursos.finalizarInscripcion);

// ── Cuenta corriente ──────────────────────────────────────────────────
router.get("/cuentas",                      roleMiddleware(READ_ROLES),  cuenta.listAlumnosConSaldo);
router.get("/cuenta/:id_alumno",            roleMiddleware(READ_ROLES),  cuenta.getCuenta);
router.get("/cuenta/:id_alumno/extracto",   roleMiddleware(READ_ROLES),  cuenta.getExtracto);
router.post("/cuenta/:id_alumno/ajuste",    roleMiddleware(WRITE_ROLES), cuenta.ajuste);
router.post("/cuenta/:id_alumno/cargo-manual", roleMiddleware(WRITE_ROLES), cuenta.cargoManual);
router.patch("/movimientos/:id",            roleMiddleware(WRITE_ROLES), cuenta.editarMovimiento);
router.patch("/movimientos/:id/anular",     roleMiddleware(WRITE_ROLES), cuenta.anularMovimiento);

// ── Recibos ───────────────────────────────────────────────────────────
router.get("/recibos",                      roleMiddleware(READ_ROLES),  recibos.list);
router.post("/recibos",                     roleMiddleware(WRITE_ROLES), recibos.create);
router.get("/recibos/:id/pdf",              roleMiddleware(READ_ROLES),  recibos.pdf);
router.patch("/recibos/:id/anular",         roleMiddleware(WRITE_ROLES), recibos.anular);

// ── Facturas ──────────────────────────────────────────────────────────
router.get("/facturas",                     roleMiddleware(READ_ROLES),  facturas.list);
router.post("/facturas",                    roleMiddleware(WRITE_ROLES), facturas.emitirManual);
router.get("/facturas/:id/pdf",             roleMiddleware(READ_ROLES),  facturas.pdf);
router.patch("/facturas/:id/anular",        roleMiddleware(WRITE_ROLES), facturas.anular);

// ── Egresos ───────────────────────────────────────────────────────────
router.get("/egresos",                      roleMiddleware(READ_ROLES),  egresos.list);
router.post("/egresos",                     roleMiddleware(WRITE_ROLES), egresos.create);
router.patch("/egresos/:id",                roleMiddleware(WRITE_ROLES), egresos.update);

// ── Nómina ────────────────────────────────────────────────────────────
router.get("/nomina/periodos",              roleMiddleware(READ_ROLES),  nomina.listPeriodos);
router.get("/nomina/periodos/:id/detalles", roleMiddleware(READ_ROLES),  nomina.detallesPeriodo);
router.post("/nomina/calcular",             roleMiddleware(WRITE_ROLES), nomina.calcular);
router.patch("/nomina/detalles/:idDet",     roleMiddleware(WRITE_ROLES), nomina.editarDetalle);
router.patch("/nomina/:id/aprobar",         roleMiddleware(WRITE_ROLES), nomina.aprobar);
router.patch("/nomina/:id/pagar",           roleMiddleware(WRITE_ROLES), nomina.pagar);

// ── Documentación ─────────────────────────────────────────────────────
router.get("/documentos/catalogo",          roleMiddleware(READ_ROLES),  documentos.catalogo);
router.get("/documentos/alumno/:id_alumno", roleMiddleware(READ_ROLES),  documentos.documentosAlumno);
router.get("/documentos/:id/archivo-url",   roleMiddleware(READ_ROLES),  documentos.archivoUrl);
router.post("/documentos/alumno/:id_alumno",roleMiddleware(WRITE_ROLES), upload.single("archivo"), documentos.subirDocumento);
router.patch("/documentos/:id",             roleMiddleware(WRITE_ROLES), documentos.revisar);
router.get("/documentos/alertas",           roleMiddleware(READ_ROLES),  documentos.alertasVencimiento);

// ── Médicos autorizados (lectura amplia, incluso ALUMNO) ──────────────
router.get("/medicos",                      roleMiddleware(["ADMINISTRACION","ADMIN","ALUMNO","INSTRUCTOR","PROGRAMACION","TURNO"]), medicos.list);
router.post("/medicos",                     roleMiddleware(WRITE_ROLES), medicos.create);
router.patch("/medicos/:id",                roleMiddleware(WRITE_ROLES), medicos.update);

// ── Aula Virtual ──────────────────────────────────────────────────────
// Read se comparte con instructor; write solo admin/administracion.
const AULA_READ  = ["ADMINISTRACION","ADMIN","INSTRUCTOR"];
const AULA_WRITE = ["ADMINISTRACION","ADMIN","INSTRUCTOR"];

router.get("/aula/unidades",                   roleMiddleware(AULA_READ),  aula.listUnidades);
router.post("/aula/unidades",                  roleMiddleware(AULA_WRITE), aula.crearUnidad);
router.patch("/aula/unidades/:id",             roleMiddleware(AULA_WRITE), aula.actualizarUnidad);
router.delete("/aula/unidades/:id",            roleMiddleware(AULA_WRITE), aula.eliminarUnidad);
router.get("/aula/alumnos/:id_alumno/progreso",roleMiddleware(AULA_READ),  aula.progresoAlumno);
router.post("/aula/progreso",                  roleMiddleware(AULA_WRITE), aula.actualizarProgreso);

router.get("/aula/evaluaciones",                          roleMiddleware(AULA_READ),  aula.listEvaluaciones);
router.post("/aula/evaluaciones",                         roleMiddleware(AULA_WRITE), aula.crearEvaluacion);
router.get("/aula/evaluaciones/:id_evaluacion/alumnos",   roleMiddleware(AULA_READ),  aula.listEvaluacionAlumnos);
router.patch("/aula/evaluacion-alumno/:id",               roleMiddleware(AULA_WRITE), aula.registrarNota);

// Vista del propio alumno (estaba implementada sin ruta).
router.get("/aula/mi-aula",                               roleMiddleware(["ALUMNO"]), aula.miAulaVirtual);

// Material por unidad (lectura/descarga también para el alumno).
const AULA_VIEW = ["ADMINISTRACION","ADMIN","INSTRUCTOR","ALUMNO"];
router.get("/aula/unidades/:id_unidad/material",          roleMiddleware(AULA_VIEW),  aula.listMaterial);
router.post("/aula/unidades/:id_unidad/material",         roleMiddleware(AULA_WRITE), upload.single("archivo"), aula.subirMaterial);
router.get("/aula/material/:id/url",                      roleMiddleware(AULA_VIEW),  aula.materialUrl);
router.delete("/aula/material/:id",                       roleMiddleware(AULA_WRITE), aula.eliminarMaterial);

// ── Reportes / KPIs ───────────────────────────────────────────────────
router.get("/reportes/ingresos",            roleMiddleware(READ_ROLES),  reportes.ingresos);
router.get("/reportes/egresos",             roleMiddleware(READ_ROLES),  reportes.egresos);
router.get("/reportes/pyl",                 roleMiddleware(READ_ROLES),  reportes.pyl);
router.get("/reportes/morosos",             roleMiddleware(READ_ROLES),  reportes.morosos);
router.get("/reportes/kpis-dashboard",      roleMiddleware(READ_ROLES),  reportes.kpisDashboard);

module.exports = router;
