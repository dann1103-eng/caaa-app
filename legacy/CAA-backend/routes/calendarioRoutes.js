const express = require("express");
const router = express.Router();
const { 
  getCalendarioPublico, 
  getAeronavesPublicas, 
  getBloquesPublicos 
} = require("../controllers/calendarioController");

const proyeccionMiddleware = require("../middlewares/proyeccionMiddleware");

router.get("/publico", proyeccionMiddleware, getCalendarioPublico);
router.get("/aeronaves", proyeccionMiddleware, getAeronavesPublicas);
router.get("/bloques", proyeccionMiddleware, getBloquesPublicos);

module.exports = router;
