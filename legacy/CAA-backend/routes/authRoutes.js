const express = require("express");
const router = express.Router();
const { login, refresh } = require("../controllers/authController");
const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  // Solo cuentan los intentos FALLIDOS: un inicio de sesión correcto (200) no
  // consume cupo. Así, en la escuela donde muchos usuarios comparten la misma
  // IP pública (NAT), los ingresos legítimos nunca disparan el límite; solo lo
  // hace un patrón de fallos repetidos (fuerza bruta / password spraying).
  // La defensa por-cuenta (bloqueo tras 5 fallos, en authController) sigue
  // protegiendo a cada usuario individualmente.
  // (El límite anterior era 10 peticiones/IP contando éxitos y fallos, lo que
  //  bloqueaba a toda la escuela tras unos pocos ingresos legítimos.)
  max: 50, // hasta 50 intentos FALLIDOS por IP por ventana
  skipSuccessfulRequests: true,
  message: { message: "Demasiados intentos fallidos de inicio de sesión desde esta red. Esperá unos minutos e intentá de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", authLimiter, login);
router.get("/refresh", refresh);

module.exports = router;
