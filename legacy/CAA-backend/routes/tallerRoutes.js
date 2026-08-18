const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const dashboard = require("../controllers/taller/dashboardController");
const componente = require("../controllers/taller/componenteController");
const seguimiento = require("../controllers/taller/seguimientoController");
const inventario = require("../controllers/taller/inventarioController");
const documentos = require("../controllers/taller/documentoInventarioController");
const ot = require("../controllers/taller/ordenTrabajoController");
const adminAeronave = require("../controllers/admin/adminAeronaveController");

// Auth para todas las rutas del módulo.
router.use(authMiddleware);

// Roles: TALLER (jefe de taller) y ADMIN (super-usuario) tienen acceso completo.
// TECNICO es el mecánico de piso: hace su trabajo pero no anula ni fuerza.
const READ = ["TALLER", "TECNICO", "ADMIN"];
const WRITE = ["TALLER", "TECNICO", "ADMIN"];
// Lo que solo ve y hace el jefe de taller: cuadres, anulaciones, configuración.
const JEFE = ["TALLER", "ADMIN"];

// El inventario lo LEE también Administración: la ingesta de costos es trabajo
// conjunto de Taller y Contabilidad, y el valor del inventario es dato contable.
const READ_INV = ["TALLER", "TECNICO", "ADMIN", "ADMINISTRACION"];
// Costear una entrada NO mueve stock ni cantidades: solo pone el precio que el
// Excel nunca tuvo. Por eso Administración sí escribe acá, y solo acá.
const COSTEAR = ["TALLER", "ADMIN", "ADMINISTRACION"];

// ── Dashboard ─────────────────────────────────────────────────────────────
router.get("/dashboard", roleMiddleware(READ), dashboard.dashboard);

// ── Componentes (célula / motor / hélice) ─────────────────────────────────
router.get("/componentes", roleMiddleware(READ), componente.list);
router.post("/componentes", roleMiddleware(WRITE), componente.create);
router.patch("/componentes/:id", roleMiddleware(WRITE), componente.update);

// Corregir el TAC actual del avión (mismo endpoint auditado que usa Admin →
// Mantenimiento) — el Taller necesita poder ajustarlo al sembrar/corregir
// una inspección periódica, no solo verlo.
router.post("/horas-manuales", roleMiddleware(WRITE), adminAeronave.registrarHorasManuales);

// ── Seguimiento programado (inspecciones, AD, SB, vida límite) ────────────
router.get("/tareas", roleMiddleware(READ), seguimiento.listTareas);
router.post("/tareas", roleMiddleware(WRITE), seguimiento.crearTarea);
router.patch("/tareas/:id", roleMiddleware(WRITE), seguimiento.editarTarea);
router.post("/tareas/:id/cumplimiento", roleMiddleware(WRITE), seguimiento.registrarCumplimiento);
router.get("/tareas/:id/historial", roleMiddleware(READ), seguimiento.historialTarea);
router.get("/aeronaves/:id/historial", roleMiddleware(READ), seguimiento.historialAeronave);

// ── Inventario de bodega (OMA) ─────────────────────────────────────────────
//
// El stock NO se toca por acá: se mueve exclusivamente con documentos
// (entrada / salida / ajuste), igual que la bodega en el Excel.

// Catálogo de ítems y kardex
router.get("/inventario/items", roleMiddleware(READ_INV), inventario.listItems);
router.post("/inventario/items", roleMiddleware(WRITE), inventario.crearItem);
router.patch("/inventario/items/:id", roleMiddleware(WRITE), inventario.editarItem);
router.get("/inventario/items/:id/kardex", roleMiddleware(READ_INV), inventario.kardex);
router.get("/inventario/catalogos", roleMiddleware(READ_INV), inventario.catalogos);

// Documentos — requisición (borrador) → solicitud (descarga) → retorno (sobrantes)
router.get("/inventario/documentos", roleMiddleware(READ_INV), documentos.listDocumentos);
router.post("/inventario/documentos", roleMiddleware(WRITE), documentos.crearDocumento);
router.get("/inventario/documentos/:id", roleMiddleware(READ_INV), documentos.getDocumento);
router.post("/inventario/documentos/:id/anular", roleMiddleware(WRITE), documentos.anularDocumento);
// La requisición es el único documento editable: es un borrador que no mueve
// existencia. Al despacharse se congela.
router.patch("/inventario/requisiciones/:id", roleMiddleware(WRITE), documentos.editarRequisicion);
router.get("/inventario/documentos/:id/retornables", roleMiddleware(READ_INV), documentos.retornablesSolicitud);

// Reportes que salen del kardex, sin tablas nuevas
router.get("/inventario/entrega-aceites", roleMiddleware(READ_INV), inventario.entregaAceites);
router.get("/inventario/entrega-aceites.pdf", roleMiddleware(READ_INV), inventario.imprimirEntregaAceites);
router.get("/inventario/duplicados-parte", roleMiddleware(READ_INV), inventario.duplicadosPorParte);

// Impresión de los formatos en papel. El código y la revisión del formulario
// son editables (la AAC puede publicar una Rev. nueva y eso no debe desplegarse).
router.get("/inventario/documentos/:id/pdf", roleMiddleware(READ_INV), documentos.imprimirDocumento);
router.get("/inventario/formularios", roleMiddleware(READ_INV), documentos.listFormularios);
router.patch("/inventario/formularios/:clave", roleMiddleware(WRITE), documentos.editarFormulario);

// Costos pendientes — la cola conjunta de Taller y Contabilidad
router.get("/inventario/pendientes-costo", roleMiddleware(READ_INV), inventario.pendientesCosto);
router.patch("/inventario/documentos/:id/costos", roleMiddleware(COSTEAR), documentos.completarCostos);

// Apoyo y reportes
router.get("/inventario/aeronaves", roleMiddleware(READ_INV), documentos.aeronavesBodega);
router.get("/inventario/aeronaves/:id_aeronave/mantenimientos", roleMiddleware(READ_INV), documentos.opcionesMantenimiento);
router.get("/inventario/consumo-aeronave", roleMiddleware(READ_INV), documentos.consumoAeronave);

// ── Órdenes de trabajo — la columna vertebral del papeleo ──────────────────
router.get("/ordenes", roleMiddleware(READ), ot.listOrdenes);
router.post("/ordenes", roleMiddleware(WRITE), ot.crearOrden);
router.get("/ordenes/:id", roleMiddleware(READ), ot.getOrden);
router.patch("/ordenes/:id", roleMiddleware(WRITE), ot.editarOrden);
router.post("/ordenes/:id/firmar", roleMiddleware(WRITE), ot.firmarOrden);
// Anular es del jefe: una orden anulada arrastra el papeleo que cuelga de ella.
router.post("/ordenes/:id/anular", roleMiddleware(JEFE), ot.anularOrden);

// ── Reporte de Inspección — el disparador ──────────────────────────────────
router.get("/reportes-inspeccion", roleMiddleware(READ), ot.listReportes);
router.post("/reportes-inspeccion", roleMiddleware(WRITE), ot.crearReporte);
router.get("/aeronaves/:id_aeronave/sugerencia-inspeccion", roleMiddleware(READ), ot.sugerenciaInspeccion);

// ── El folder del avión: todo lo del Taller de esa matrícula ───────────────
router.get("/aeronaves/:id_aeronave/ficha", roleMiddleware(READ), ot.fichaAeronave);

// Impresión de los formatos de la Fase 2
router.get("/ordenes/:id/pdf", roleMiddleware(READ), ot.imprimirOrden);
router.get("/reportes-inspeccion/:id/pdf", roleMiddleware(READ), ot.imprimirReporte);

module.exports = router;
