const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const alumnoVuelo = require("../controllers/alumno/alumnoVueloController");
const alumnoCancelacion = require("../controllers/alumno/alumnoCancelacionController");
const alumnoPlanVuelo = require("../controllers/alumno/alumnoPlanVueloController");
const alumnoWb = require("../controllers/alumno/alumnoWbController");
const alumnoReporte = require("../controllers/alumno/alumnoReporteController");
const alumnoCuenta = require("../controllers/alumno/alumnoCuentaController");

const alumnoAccess = [authMiddleware, roleMiddleware("ALUMNO")];

const planesDir = path.join(__dirname, "..", "uploads", "planes-vuelo");
if (!fs.existsSync(planesDir)) {
  fs.mkdirSync(planesDir, { recursive: true });
}

const storagePlan = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, planesDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `plan_${Date.now()}${ext}`);
  },
});

const uploadPlan = multer({
  storage: storagePlan,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".pdf") cb(null, true);
    else cb(new Error("Solo se aceptan archivos PDF."));
  },
});

const uploadLoadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".pdf") cb(null, true);
    else cb(new Error("Solo se aceptan archivos PDF."));
  },
});

// --- Dashboard y Horarios ---
router.get("/mi-horario", alumnoAccess, alumnoVuelo.getMiHorario);
router.get("/licencia", alumnoAccess, alumnoVuelo.getMiLicencia);
router.get("/mi-info", alumnoAccess, alumnoVuelo.getMiInfo);
router.get("/mi-proximo-mantenimiento", alumnoAccess, alumnoVuelo.getMiProximoMantenimiento);
router.get("/bloques-bloqueados", alumnoAccess, alumnoVuelo.getBloquesBloqueados);
router.get("/condiciones-cancelacion", alumnoAccess, alumnoVuelo.getCondicionesCancelacion);

// --- Cuenta corriente y Administración (Módulo Admin/Contabilidad) ---
router.get("/mi-cuenta", alumnoAccess, alumnoCuenta.miCuenta);
router.get("/mi-cuenta/extracto", alumnoAccess, alumnoCuenta.miExtracto);
router.get("/mi-avance-curso", alumnoAccess, alumnoCuenta.miAvanceCurso);
router.get("/mis-documentos", alumnoAccess, alumnoCuenta.misDocumentos);

// --- Aula virtual (resumen propio del alumno) ---
const aulaCtl = require("../controllers/administracion/aulaVirtualController");
router.get("/mi-aula-virtual", alumnoAccess, aulaCtl.miAulaVirtual);

// --- Cancelaciones ---
router.post("/vuelos/:id_vuelo/solicitar-cancelacion", alumnoAccess, alumnoCancelacion.solicitarCancelacion);
router.delete("/solicitudes-cancelacion/:id_solicitud_cancelacion", alumnoAccess, alumnoCancelacion.quitarSolicitudCancelacion);
router.get("/mis-solicitudes-cancelacion", alumnoAccess, alumnoCancelacion.getMisSolicitudesCancelacion);

// --- Plan de Vuelo ---
router.get("/vuelos/:id_vuelo/plan-vuelo", alumnoAccess, alumnoPlanVuelo.getPlanVuelo);
router.put("/vuelos/:id_vuelo/plan-vuelo", alumnoAccess, alumnoPlanVuelo.guardarPlanVuelo);
router.patch("/vuelos/:id_vuelo/plan-vuelo/completar", alumnoAccess, uploadPlan.single("pdf"), alumnoPlanVuelo.completarPlanVuelo);

// --- Weight & Balance ---
router.get("/vuelos/:id_vuelo/weight-balance", alumnoAccess, alumnoWb.getWB);
router.put("/vuelos/:id_vuelo/weight-balance", alumnoAccess, alumnoWb.guardarWB);
router.patch("/vuelos/:id_vuelo/weight-balance/completar", alumnoAccess, alumnoWb.completarWB);
router.get("/vuelos/:id_vuelo/loadsheet", alumnoAccess, alumnoWb.getLoadsheet);
router.put("/vuelos/:id_vuelo/loadsheet", alumnoAccess, alumnoWb.guardarLoadsheet);
router.post("/vuelos/:id_vuelo/send-loadsheet", alumnoAccess, alumnoWb.enviarLoadsheetPDF);
router.patch("/vuelos/:id_vuelo/loadsheet/completar", alumnoAccess, uploadLoadsheet.single("pdf"), alumnoWb.completarLoadsheet);

// --- Reportes de Vuelo ---
router.get("/vuelos/:id/reporte-vuelo", alumnoAccess, alumnoReporte.getReporteVuelo);
router.put("/vuelos/:id/reporte-vuelo", alumnoAccess, alumnoReporte.guardarReporteVuelo);
router.patch("/vuelos/:id/reporte-vuelo/enviar", alumnoAccess, alumnoReporte.enviarReporteVuelo);
router.get("/reportes-pendientes", alumnoAccess, alumnoReporte.getReportesPendientesAlumno);
router.get("/reportes-completados", alumnoAccess, alumnoReporte.getReportesCompletadosAlumno);
router.patch("/vuelos/:id/reporte-vuelo/firmar", alumnoAccess, alumnoReporte.firmarReporteVueloAlumno);

module.exports = router;
