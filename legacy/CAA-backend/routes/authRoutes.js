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
  //
  // La defensa REAL contra fuerza bruta es por-cuenta (5 fallos → bloqueo de
  // 3 min, en authController), no este límite por IP. Este límite por IP es
  // una segunda capa que solo importa para frenar "spraying" (probar muchas
  // cuentas distintas desde una misma IP): con max=200 y el bloqueo por-cuenta
  // a los 5 fallos, un atacante igual queda topado a ~40 cuentas probadas por
  // IP cada 15 min. Se sube de 50→200 (con más alumnos entrando a la vez,
  // sobre todo en oleadas de primer login/onboarding compartiendo la IP de la
  // escuela, 50 fallos se agotaban solo con errores de tipeo normales).
  // (El límite original era 10 peticiones/IP contando éxitos y fallos, lo que
  //  bloqueaba a toda la escuela tras unos pocos ingresos legítimos.)
  max: 200, // hasta 200 intentos FALLIDOS por IP por ventana
  skipSuccessfulRequests: true,
  message: { message: "Demasiados intentos fallidos de inicio de sesión desde esta red. Esperá unos minutos e intentá de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", authLimiter, login);
router.get("/refresh", refresh);

module.exports = router;
