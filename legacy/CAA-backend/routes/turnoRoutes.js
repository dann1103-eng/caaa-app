const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const { requireCapacidad } = require("../utils/capacidades");
const router = express.Router();

const turnoController = require("../controllers/turnoController");
const turnoMantenimiento = require("../controllers/turnoMantenimientoController");
const turnoDia = require("../controllers/turnoDiaController");

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

// Editar tripulación (alumno/instructor/aeronave) + almas a bordo. Mutación
// más sensible que avanzar estado → gate de rol explícito (no solo JWT válido).
router.patch("/vuelos/:id_vuelo/tripulacion", authMiddleware, requireCapacidad(["TURNO", "ADMIN"], "OPERACIONES"), turnoController.editarTripulacion);
router.post("/vuelos/:id_vuelo/inasistencia", authMiddleware, turnoController.registrarInasistencia);

// Reporte de cierre del día (vuelos por avión, PDF). Lo usa TURNO; ADMIN como
// super-usuario y ADMINISTRACION (es su insumo para debitar saldos).
router.get("/reporte-vuelos-dia", authMiddleware, requireCapacidad(["TURNO", "ADMIN", "ADMINISTRACION"], "OPERACIONES"), turnoController.getReporteVuelosDia);

// Mantenimiento imprevisto de una aeronave (falla detectada en pre-vuelo):
// Turno la saca de servicio, cancela y notifica sus vuelos, y la reactiva
// cuando taller termina. Mutaciones sensibles → gate de rol explícito.
const turnoMantAccess = requireCapacidad(["TURNO", "ADMIN"], "OPERACIONES");
router.get("/mantenimiento/flota", authMiddleware, turnoMantAccess, turnoMantenimiento.getFlotaMantenimiento);
router.post("/aeronaves/:id/preview-mantenimiento", authMiddleware, turnoMantAccess, turnoMantenimiento.previewMantenimientoAeronave);
router.post("/aeronaves/:id/mantenimiento", authMiddleware, turnoMantAccess, turnoMantenimiento.iniciarMantenimientoAeronave);
router.post("/aeronaves/:id/completar-mantenimiento", authMiddleware, turnoMantAccess, turnoMantenimiento.completarMantenimientoAeronave);

// Ciclo del turno del día (apertura / pausa almuerzo / cambio de turno /
// cierre) + asistencia de instructores. El GET usa proyeccionMiddleware para
// que la pantalla de Proyección lo lea con su llave.
router.get("/dia", proyeccionMiddleware, turnoDia.getTurnoDia);
router.get("/instructores", authMiddleware, turnoMantAccess, turnoDia.getInstructoresParaTurno);
router.post("/dia/abrir", authMiddleware, turnoMantAccess, turnoDia.abrirTurno);
router.post("/dia/pausa", authMiddleware, turnoMantAccess, turnoDia.pausarTurno);
router.post("/dia/reanudar", authMiddleware, turnoMantAccess, turnoDia.reanudarTurno);
router.post("/dia/cambio", authMiddleware, turnoMantAccess, turnoDia.cambioTurno);
router.post("/dia/cerrar", authMiddleware, turnoMantAccess, turnoDia.cerrarTurno);

// Ajustes puntuales de asistencia dentro del turno YA abierto (agregar a
// alguien que llegó tarde, o marcar la salida de uno solo) sin forzar un
// cambio de turno completo.
router.post("/dia/asistencia", authMiddleware, turnoMantAccess, turnoDia.agregarInstructorTurno);
router.post("/dia/asistencia/:id_asistencia/salida", authMiddleware, turnoMantAccess, turnoDia.marcarSalidaInstructor);

module.exports = router;
