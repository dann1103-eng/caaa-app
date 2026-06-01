const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const ctl = require("../controllers/notificacionController");

router.use(authMiddleware);
router.get("/", ctl.listar);
router.patch("/:id/leer", ctl.marcarLeida);
router.patch("/leer-todas", ctl.marcarTodas);

module.exports = router;
