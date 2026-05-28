const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const {
  getPerfil,
  cambiarPassword,
  cambiarCorreo,
  updatePerfil,
  updatePerfilAlumno,
} = require("../controllers/usuarioController");

router.get("/perfil", authMiddleware, getPerfil);
router.put("/cambiar-password", authMiddleware, cambiarPassword);
router.put("/cambiar-correo", authMiddleware, cambiarCorreo);
router.put("/update-info", authMiddleware, updatePerfil);
router.put("/update-perfil-alumno", authMiddleware, updatePerfilAlumno);

module.exports = router;
