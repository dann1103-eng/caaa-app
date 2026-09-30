const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const accesoEstudianteVuelo = require("../middlewares/accesoEstudianteVuelo");

const alumnoVuelo = require("../controllers/alumno/alumnoVueloController");
const alumnoCancelacion = require("../controllers/alumno/alumnoCancelacionController");
const cancelacionAdjunto = require("../controllers/cancelacionAdjuntoController");
const alumnoPlanVuelo = require("../controllers/alumno/alumnoPlanVueloController");
const alumnoWb = require("../controllers/alumno/alumnoWbController");
const alumnoReporte = require("../controllers/alumno/alumnoReporteController");
const alumnoCuenta = require("../controllers/alumno/alumnoCuentaController");

const alumnoAccess = [authMiddleware, roleMiddleware("ALUMNO")];
// Igual que alumnoAccess pero además admite al practicante (instructor que
// recibe instrucción) en las rutas por-vuelo del lado estudiante.
const estudianteAccess = [authMiddleware, accesoEstudianteVuelo];

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

// Constancias de una solicitud de cancelación: imágenes o PDF, opcionales.
// Memoria (no disco): el disco de Railway se borra en cada redeploy y de acá
// el buffer va directo a Supabase Storage.
const uploadConstancia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".pdf", ".jpg", ".jpeg", ".png"].includes(ext)) cb(null, true);
    else cb(new Error("Solo se aceptan imágenes JPG/PNG o archivos PDF."));
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
router.get("/mis-clases", alumnoAccess, alumnoVuelo.getMisClases);
router.post("/mis-clases/:id_sesion/firmar", alumnoAccess, alumnoVuelo.firmarAsistenciaClase);

// Lista de espera (stand-by): ofertas de cupos liberados.
const standby = require("../controllers/standbyController");
router.get("/mis-ofertas", alumnoAccess, standby.misOfertas);
router.post("/standby/:id_standby/aceptar", alumnoAccess, standby.aceptarOferta);
router.post("/standby/:id_standby/rechazar", alumnoAccess, standby.rechazarOferta);

// --- Cuenta corriente y Administración (Módulo Admin/Contabilidad) ---
router.get("/mi-cuenta", alumnoAccess, alumnoCuenta.miCuenta);
router.get("/mi-cuenta/extracto", alumnoAccess, alumnoCuenta.miExtracto);
router.get("/mi-avance-curso", alumnoAccess, alumnoCuenta.miAvanceCurso);
router.get("/mis-documentos", alumnoAccess, alumnoCuenta.misDocumentos);
router.get("/mis-documentos/:id/archivo-url", alumnoAccess, alumnoCuenta.miDocumentoArchivoUrl);
router.get("/mi-historial", alumnoAccess, alumnoCuenta.miHistorial);

// --- Aula virtual (resumen propio del alumno) ---
const aulaCtl = require("../controllers/administracion/aulaVirtualController");
router.get("/mi-aula-virtual", alumnoAccess, aulaCtl.miAulaVirtual);

// --- Cancelaciones ---
router.post("/vuelos/:id_vuelo/solicitar-cancelacion", alumnoAccess, alumnoCancelacion.solicitarCancelacion);
router.delete("/solicitudes-cancelacion/:id_solicitud_cancelacion", alumnoAccess, alumnoCancelacion.quitarSolicitudCancelacion);
router.get("/mis-solicitudes-cancelacion", alumnoAccess, alumnoCancelacion.getMisSolicitudesCancelacion);

// Constancias del motivo de cancelación (opcionales). Van en un request aparte
// del que crea la solicitud, a propósito: ver el comentario del controller.
router.post("/solicitudes-cancelacion/:id_solicitud_cancelacion/adjuntos", alumnoAccess, uploadConstancia.array("archivos", 5), cancelacionAdjunto.subirAdjuntos);
router.get("/solicitudes-cancelacion/:id_solicitud_cancelacion/adjuntos", alumnoAccess, cancelacionAdjunto.listarMisAdjuntos);
router.delete("/adjuntos-cancelacion/:id_adjunto", alumnoAccess, cancelacionAdjunto.borrarMiAdjunto);
router.get("/adjuntos-cancelacion/:id_adjunto/url", alumnoAccess, cancelacionAdjunto.urlMiAdjunto);

// --- Plan de Vuelo --- (por-vuelo: admite al practicante)
router.get("/vuelos/:id_vuelo/plan-vuelo", estudianteAccess, alumnoPlanVuelo.getPlanVuelo);
router.put("/vuelos/:id_vuelo/plan-vuelo", estudianteAccess, alumnoPlanVuelo.guardarPlanVuelo);
router.patch("/vuelos/:id_vuelo/plan-vuelo/completar", estudianteAccess, uploadPlan.single("pdf"), alumnoPlanVuelo.completarPlanVuelo);

// --- Weight & Balance --- (por-vuelo: admite al practicante)
router.get("/vuelos/:id_vuelo/weight-balance", estudianteAccess, alumnoWb.getWB);
router.put("/vuelos/:id_vuelo/weight-balance", estudianteAccess, alumnoWb.guardarWB);
router.patch("/vuelos/:id_vuelo/weight-balance/completar", estudianteAccess, alumnoWb.completarWB);
router.get("/vuelos/:id_vuelo/loadsheet", estudianteAccess, alumnoWb.getLoadsheet);
router.put("/vuelos/:id_vuelo/loadsheet", estudianteAccess, alumnoWb.guardarLoadsheet);
router.post("/vuelos/:id_vuelo/send-loadsheet", estudianteAccess, alumnoWb.enviarLoadsheetPDF);
router.patch("/vuelos/:id_vuelo/loadsheet/completar", estudianteAccess, uploadLoadsheet.single("pdf"), alumnoWb.completarLoadsheet);

// --- Reportes de Vuelo ---
router.get("/vuelos/:id/reporte-vuelo", estudianteAccess, alumnoReporte.getReporteVuelo);
router.put("/vuelos/:id/reporte-vuelo", estudianteAccess, alumnoReporte.guardarReporteVuelo);
router.patch("/vuelos/:id/reporte-vuelo/enviar", estudianteAccess, alumnoReporte.enviarReporteVuelo);
router.get("/reportes-pendientes", alumnoAccess, alumnoReporte.getReportesPendientesAlumno);
router.get("/reportes-completados", alumnoAccess, alumnoReporte.getReportesCompletadosAlumno);
router.patch("/vuelos/:id/reporte-vuelo/firmar", estudianteAccess, alumnoReporte.firmarReporteVueloAlumno);

module.exports = router;
