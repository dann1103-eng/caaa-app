const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const duenoController = require("../controllers/duenoController");

const router = express.Router();

// Única acción del dueño: visto bueno por vuelo (ADMIN como super-usuario,
// igual que en el resto de módulos).
router.patch(
  "/vuelos/:id_vuelo/aprobar",
  authMiddleware,
  roleMiddleware(["DUENO", "ADMIN"]),
  duenoController.aprobarVuelo
);

module.exports = router;
