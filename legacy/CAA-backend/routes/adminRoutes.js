const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const { requireCapacidad } = require("../utils/capacidades");

const adminVuelo = require("../controllers/admin/adminVueloController");
const adminAeronave = require("../controllers/admin/adminAeronaveController");
const adminMantenimiento = require("../controllers/admin/adminMantenimientoController");
const adminUsuario = require("../controllers/admin/adminUsuarioController");
const adminAuditoria = require("../controllers/admin/adminAuditoriaController");
const adminCancelacion = require("../controllers/admin/adminCancelacionController");

// Roles de operaciones, o un INSTRUCTOR activo con el toggle puede_programar
// (capacidad PROGRAMAR = todo lo que hace el rol PROGRAMACION).
const adminAccess = [authMiddleware, requireCapacidad(["ADMIN", "PROGRAMACION", "TURNO"], "PROGRAMAR")];

// --- Semanas y Calendario ---
router.get("/semanas", adminAccess, adminVuelo.getSemanas);
router.get("/publicar-semana/precheck", adminAccess, adminVuelo.prechequearPublicacion);
router.post("/publicar-semana", adminAccess, adminVuelo.publicarSemana);
// Crea la siguiente fila de semana_vuelo si no existe (rescate cuando la semana
// actual ya está publicada y no hay semana futura → el agendado quedaba bloqueado
// con "No se encontró la semana siguiente").
router.post("/asegurar-semana-futura", adminAccess, adminVuelo.asegurarSemanaFutura);
router.get("/calendario", adminAccess, adminVuelo.getCalendario);
router.get("/bloques-horario", adminAccess, adminVuelo.getBloquesHorario);
router.put("/guardar-cambios", adminAccess, adminVuelo.guardarCambios);
router.get("/bloques-bloqueados", adminAccess, adminVuelo.getBloquesBloqueados);
router.get("/instructores-activos", adminAccess, adminVuelo.getInstructoresActivos);
router.patch("/solicitudes/:id_detalle/cambiar-instructor", adminAccess, adminVuelo.cambiarInstructorVuelo);
router.patch("/solicitudes/:id_detalle/rechazar", adminAccess, adminVuelo.rechazarSolicitudIndividual);
router.patch("/solicitudes-semana/:id_solicitud/rechazar", adminAccess, adminVuelo.rechazarSolicitudSemana);
router.patch("/solicitudes-semana/:id_solicitud/cancelar", adminAccess, adminVuelo.cancelarSolicitud);

// --- Aeronaves ---
router.get("/aeronaves", adminAccess, adminAeronave.getAeronavesActivas);
router.get("/aeronaves/:id/vuelos-futuros-count", adminAccess, adminAeronave.getVuelosFuturosAeronave);
router.put("/aeronaves/:id/foto", adminAccess, adminAeronave.setFotoAeronave);
router.post("/mantenimiento/horas-manuales", adminAccess, adminAeronave.registrarHorasManuales);

// --- Mantenimiento ---
router.get("/mantenimiento", adminAccess, adminMantenimiento.getMantenimientoAeronaves);
router.get("/mantenimiento/:id/detalle", adminAccess, adminMantenimiento.getMantenimientoDetalle);
router.post("/aeronaves/:id/iniciar-mantenimiento", adminAccess, adminMantenimiento.iniciarMantenimiento);
router.post("/aeronaves/:id/completar-mantenimiento", adminAccess, adminMantenimiento.completarMantenimiento);
router.get("/aeronaves/alertas-mantenimiento", adminAccess, adminMantenimiento.getAlertasMantenimiento);
router.post("/aeronaves/:id/preview-mantenimiento", adminAccess, adminMantenimiento.previewMantenimiento);

// --- Usuarios y Alumnos ---
router.get("/alumnos", adminAccess, adminUsuario.getAlumnosListAdmin);
router.get("/alumnos/:id_alumno/perfil", adminAccess, adminUsuario.getAlumnoPerfilAdmin);
router.get("/alumnos/:id_alumno/aeronaves-permitidas", adminAccess, adminUsuario.getAeronavesPermitidasAlumno);
router.patch("/alumnos/:id_alumno/soleado", adminAccess, adminUsuario.setSoleado);
router.get("/alumnos-limite", adminAccess, adminUsuario.getAlumnosConLimite);
router.patch("/alumnos/:id_alumno/habilitar-vuelo-extra", adminAccess, adminUsuario.habilitarVueloExtra);

// --- Auditoría ---
router.get("/auditoria/acciones", adminAccess, adminAuditoria.getAccionesAuditoria);
router.get("/auditoria", adminAccess, adminAuditoria.getAuditoria);

// --- Cancelaciones ---
router.get("/solicitudes-cancelacion", adminAccess, adminCancelacion.getSolicitudesCancelacion);
router.post("/solicitudes-cancelacion/:id/resolver", adminAccess, adminCancelacion.resolverSolicitudCancelacion);

module.exports = router;