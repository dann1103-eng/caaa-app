const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const router = express.Router();

const instructorVuelo = require("../controllers/instructor/instructorVueloController");
const instructorAlumno = require("../controllers/instructor/instructorAlumnoController");
const instructorReporte = require("../controllers/instructor/instructorReporteController");
const alumnoWb = require("../controllers/alumno/alumnoWbController");

// Defensa en profundidad: además del JWT, exigimos rol INSTRUCTOR (o ADMIN como
// super-usuario). Antes estas rutas sólo verificaban el token, así que cualquier
// usuario autenticado de otro rol podía invocarlas.
const access = [authMiddleware, roleMiddleware(["INSTRUCTOR", "ADMIN"])];

router.get("/vuelos-hoy",                                     access, instructorVuelo.getVuelosHoy);
router.get("/vuelos-semana",                                  access, instructorVuelo.getVuelosSemana);
router.get("/mis-alumnos",                                    access, instructorAlumno.getMisAlumnos);
router.get("/mi-ficha",                                       access, instructorAlumno.miFicha);
router.get("/mi-historial",                                   access, instructorAlumno.miHistorial);
router.get("/recibo/:idDet",                                  access, instructorAlumno.descargarMiRecibo);
router.patch("/recibo/:idDet/firmar",                         access, instructorAlumno.firmarMiRecibo);
router.post("/vuelos/:id_vuelo/avanzar",                      access, instructorVuelo.avanzarEstadoVuelo);
router.post("/vuelos/:id_vuelo/inasistencia",                 access, instructorVuelo.registrarInasistencia);
router.patch("/alumnos/:id_alumno/limites",                   access, instructorAlumno.actualizarLimitesAlumno);
router.patch("/alumnos/:id_alumno/habilitar-vuelo-extra",     access, instructorAlumno.habilitarVueloExtra);

router.get("/reportes-pendientes",                            access, instructorReporte.getReportesPendientes);
router.get("/vuelos/:id/reporte-vuelo",                       access, instructorReporte.getReporteVueloInstructor);
router.put("/vuelos/:id/reporte-vuelo",                       access, instructorReporte.guardarReporteVueloInstructor);
router.patch("/vuelos/:id/reporte-vuelo/firmar",              access, instructorReporte.firmarReporteVuelo);
router.get("/vuelos/:id/checklist-postvuelo",                 access, instructorReporte.getChecklistPostvuelo);
router.post("/vuelos/:id/checklist-postvuelo",                access, instructorReporte.guardarChecklistPostvuelo);
router.delete("/vuelos/:id/checklist-postvuelo",              access, instructorReporte.eliminarChecklistPostvuelo);

// Ver loadsheet del alumno (solo lectura) — reutiliza los controllers del alumno
router.get("/vuelos/:id_vuelo/weight-balance",                access, alumnoWb.getWB);
router.get("/vuelos/:id_vuelo/loadsheet",                     access, alumnoWb.getLoadsheet);

module.exports = router;
