const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const dashboard = require("../controllers/taller/dashboardController");
const componente = require("../controllers/taller/componenteController");
const seguimiento = require("../controllers/taller/seguimientoController");
const inventario = require("../controllers/taller/inventarioController");

// Auth para todas las rutas del módulo.
router.use(authMiddleware);

// Roles: TALLER (mecánico) y ADMIN (super-usuario) tienen acceso completo.
const READ = ["TALLER", "ADMIN"];
const WRITE = ["TALLER", "ADMIN"];

// ── Dashboard ─────────────────────────────────────────────────────────────
router.get("/dashboard", roleMiddleware(READ), dashboard.dashboard);

// ── Componentes (célula / motor / hélice) ─────────────────────────────────
router.get("/componentes", roleMiddleware(READ), componente.list);
router.post("/componentes", roleMiddleware(WRITE), componente.create);
router.patch("/componentes/:id", roleMiddleware(WRITE), componente.update);

// ── Seguimiento programado (inspecciones, AD, SB, vida límite) ────────────
router.get("/tareas", roleMiddleware(READ), seguimiento.listTareas);
router.post("/tareas", roleMiddleware(WRITE), seguimiento.crearTarea);
router.patch("/tareas/:id", roleMiddleware(WRITE), seguimiento.editarTarea);
router.post("/tareas/:id/cumplimiento", roleMiddleware(WRITE), seguimiento.registrarCumplimiento);
router.get("/tareas/:id/historial", roleMiddleware(READ), seguimiento.historialTarea);
router.get("/aeronaves/:id/historial", roleMiddleware(READ), seguimiento.historialAeronave);

// ── Inventario de repuestos ────────────────────────────────────────────────
router.get("/repuestos", roleMiddleware(READ), inventario.listRepuestos);
router.post("/repuestos", roleMiddleware(WRITE), inventario.crearRepuesto);
router.patch("/repuestos/:id", roleMiddleware(WRITE), inventario.editarRepuesto);
router.post("/repuestos/:id/movimiento", roleMiddleware(WRITE), inventario.registrarMovimiento);
router.get("/repuestos/:id/movimientos", roleMiddleware(READ), inventario.movimientos);

module.exports = router;
