const express = require("express");
const router = express.Router();
const { login, refresh } = require("../controllers/authController");
const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Limitar cada IP a 10 peticiones por ventana
  message: { message: "Demasiadas peticiones desde esta IP. Intente de nuevo en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", authLimiter, login);
router.get("/refresh", refresh);

module.exports = router;
