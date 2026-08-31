/**
 * Rutas de la cuenta de demostraciones.
 *
 * Corren en el MISMO despliegue que CAAA. El candado no es el despliegue sino
 * la SESION: el token tiene que decir esquema "demo", y eso solo lo recibe quien
 * este en public.demo_cuenta. Ver demo/guardas.js.
 */
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { FRASE, enDemo, exigirSesionDemo } = require("../demo/guardas");
const { reiniciar, ESQUEMA } = require("../demo/reset");

router.use(authMiddleware);

/** Para que el frontend sepa si dibujar el boton. Cualquiera puede preguntar. */
router.get("/estado", (req, res) => {
  res.json({ ok: true, en_demo: enDemo(req), esquema: enDemo(req) ? ESQUEMA : "public", frase: FRASE });
});

router.post("/reiniciar", exigirSesionDemo, roleMiddleware(["ADMIN"]), async (req, res) => {
  if (String(req.body?.confirmacion || "").trim() !== FRASE) {
    return res.status(400).json({ ok: false, message: `Para reiniciar hay que escribir exactamente: ${FRASE}` });
  }
  try {
    const pasos = [];
    const r = await reiniciar({ log: (m) => pasos.push(m) });
    res.json({ ...r, pasos });
  } catch (e) {
    console.error("[DEMO] reinicio fallo:", e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
