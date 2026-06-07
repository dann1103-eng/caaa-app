const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();

const instructorVuelo = require("../controllers/instructor/instructorVueloController");
const instructorAlumno = require("../controllers/instructor/instructorAlumnoController");
const instructorReporte = require("../controllers/instructor/instructorReporteController");
const alumnoWb = require("../controllers/alumno/alumnoWbController");

router.get("/vuelos-hoy",                                     authMiddleware, instructorVuelo.getVuelosHoy);
router.get("/vuelos-semana",                                  authMiddleware, instructorVuelo.getVuelosSemana);
router.get("/mis-alumnos",                                    authMiddleware, instructorAlumno.getMisAlumnos);
router.get("/mi-ficha",                                       authMiddleware, instructorAlumno.miFicha);
router.get("/mi-historial",                                   authMiddleware, instructorAlumno.miHistorial);
router.get("/recibo/:idDet",                                  authMiddleware, instructorAlumno.descargarMiRecibo);
router.patch("/recibo/:idDet/firmar",                         authMiddleware, instructorAlumno.firmarMiRecibo);
router.post("/vuelos/:id_vuelo/avanzar",                      authMiddleware, instructorVuelo.avanzarEstadoVuelo);
router.post("/vuelos/:id_vuelo/inasistencia",                 authMiddleware, instructorVuelo.registrarInasistencia);
router.patch("/alumnos/:id_alumno/limites",                   authMiddleware, instructorAlumno.actualizarLimitesAlumno);
router.patch("/alumnos/:id_alumno/habilitar-vuelo-extra",     authMiddleware, instructorAlumno.habilitarVueloExtra);

router.get("/reportes-pendientes",                            authMiddleware, instructorReporte.getReportesPendientes);
router.get("/vuelos/:id/reporte-vuelo",                       authMiddleware, instructorReporte.getReporteVueloInstructor);
router.put("/vuelos/:id/reporte-vuelo",                       authMiddleware, instructorReporte.guardarReporteVueloInstructor);
router.patch("/vuelos/:id/reporte-vuelo/firmar",              authMiddleware, instructorReporte.firmarReporteVuelo);
router.get("/vuelos/:id/checklist-postvuelo",                 authMiddleware, instructorReporte.getChecklistPostvuelo);
router.post("/vuelos/:id/checklist-postvuelo",                authMiddleware, instructorReporte.guardarChecklistPostvuelo);
router.delete("/vuelos/:id/checklist-postvuelo",              authMiddleware, instructorReporte.eliminarChecklistPostvuelo);

// Ver loadsheet del alumno (solo lectura) — reutiliza los controllers del alumno
router.get("/vuelos/:id_vuelo/weight-balance",                authMiddleware, alumnoWb.getWB);
router.get("/vuelos/:id_vuelo/loadsheet",                     authMiddleware, alumnoWb.getLoadsheet);

module.exports = router;
