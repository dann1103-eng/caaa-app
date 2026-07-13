const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const { guardarSuscripcion, eliminarSuscripcion, vapidPublicKey, habilitado } = require("../utils/webpush");

// Llave pública VAPID (no es secreta): la necesita el navegador para suscribirse.
router.get("/vapid-public-key", (req, res) => {
  res.json({ key: vapidPublicKey || null, habilitado });
});

// Guardar la suscripción del dispositivo del usuario autenticado.
router.post("/subscribe", authMiddleware, async (req, res) => {
  try {
    await guardarSuscripcion(req.user.id_usuario, req.body.subscription || req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
});

router.post("/unsubscribe", authMiddleware, async (req, res) => {
  try {
    await eliminarSuscripcion(req.body.endpoint);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
});

module.exports = router;
