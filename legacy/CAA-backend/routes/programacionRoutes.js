const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const {
  getCalendario,
  getAeronavesActivas,
  enRevision,
  guardarCambios,
  getBloquesBloqueados,
  getEstadoFlota,
  getMantenimientoResumen,
  reasignarAeronave,
  getAeronavesDisponibles,
  guardarSolicitudProgramacion,
  agendarSolicitud,
  agendarVueloDirecto,
} = require("../controllers/programacionController");

const proyeccionMiddleware = require("../middlewares/proyeccionMiddleware");

router.get("/calendario", authMiddleware, getCalendario);
router.get("/aeronaves", authMiddleware, getAeronavesActivas);
router.get("/bloques-bloqueados", authMiddleware, getBloquesBloqueados);
router.post("/solicitudes/:id_solicitud/en-revision", authMiddleware, enRevision);
router.post("/guardar-cambios", authMiddleware, guardarCambios);
router.get("/estado-flota", proyeccionMiddleware, getEstadoFlota);
router.get("/mantenimiento-resumen", proyeccionMiddleware, getMantenimientoResumen);
router.post("/vuelos/:id_vuelo/reasignar-aeronave", authMiddleware, reasignarAeronave);
router.get("/aeronaves-disponibles", authMiddleware, getAeronavesDisponibles);
router.post("/solicitar-vuelos", authMiddleware, guardarSolicitudProgramacion);
// Agendar desde el calendario (click en slot vacío):
router.post("/solicitudes", authMiddleware, agendarSolicitud);      // semana no publicada (aditivo)
router.post("/vuelos", authMiddleware, agendarVueloDirecto);        // semana publicada (vuelo directo)

module.exports = router;