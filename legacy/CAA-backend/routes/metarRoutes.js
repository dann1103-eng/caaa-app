const express = require("express");
const router = express.Router();
const metarController = require("../controllers/metarController");

const proyeccionMiddleware = require("../middlewares/proyeccionMiddleware");

router.get("/", proyeccionMiddleware, metarController.getMetar);

module.exports = router;
