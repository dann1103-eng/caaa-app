const router = require("express").Router();
const authMiddleware = require("../middlewares/authMiddleware");
const ls = require("../controllers/loadsheetController");

// Cualquier usuario autenticado (alumno/instructor/staff) — sin restricción de rol.
router.get("/plantilla", authMiddleware, ls.getPlantilla);
router.get("/aeronaves", authMiddleware, ls.listAeronaves);

module.exports = router;
