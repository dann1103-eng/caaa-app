const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const router = express.Router();

const turnoController = require("../controllers/turnoController");

const proyeccionMiddleware = require("../middlewares/proyeccionMiddleware");

router.get("/vuelos-hoy",         authMiddleware, turnoController.getVuelosHoy);
router.get("/estado-operaciones", proyeccionMiddleware, turnoController.getEstadoOperaciones);
router.put("/estado-operaciones", authMiddleware, turnoController.setEstadoOperaciones);
router.get("/ticker",             proyeccionMiddleware, turnoController.getTicker);
router.post("/ticker",            authMiddleware, turnoController.publicarTicker);
router.delete("/ticker",          authMiddleware, turnoController.limpiarTicker);
router.delete("/ticker/:id",      authMiddleware, turnoController.limpiarUnicoTicker);
router.post("/agregar-bloques-suspension", authMiddleware, turnoController.agregarBloquesSuspension);
router.patch("/vuelos/:id_vuelo/estado", authMiddleware, turnoController.avanzarEstadoVuelo);
router.post("/vuelos/:id_vuelo/inasistencia", authMiddleware, turnoController.registrarInasistencia);

// Reporte de cierre del día (vuelos por avión, PDF). Lo usa TURNO; ADMIN como
// super-usuario y ADMINISTRACION (es su insumo para debitar saldos).
router.get("/reporte-vuelos-dia", authMiddleware, roleMiddleware(["TURNO", "ADMIN", "ADMINISTRACION"]), turnoController.getReporteVuelosDia);

module.exports = router;
