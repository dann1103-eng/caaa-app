/**
 * Rutas del entorno de demo.
 *
 * 🚨 Este router SOLO se monta si DEMO_MODE === "true" (ver server.js). Sin esa
 * variable las rutas no existen: responden 404, no 403. Una ruta que no existe
 * no se puede forzar, y esa variable no existe ni va a existir en CAAA.
 */
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { FRASE, exigirBaseDesechable } = require("../demo/guardas");
const { reiniciar } = require("../demo/reset");

router.use(authMiddleware);

/** Para que el frontend sepa si debe dibujar el botón. */
router.get("/estado", async (req, res) => {
  const { baseEsDesechable } = require("../demo/guardas");
  res.json({ ok: true, demo: true, base_desechable: await baseEsDesechable(), frase: FRASE });
});

/**
 * Reinicio. Cuarto candado: hay que ESCRIBIR la frase, no apretar "sí".
 * Un "¿estás seguro?" de un clic se contesta que sí por reflejo; escribir una
 * frase obliga a leer qué se está por hacer.
 */
router.post("/reiniciar", roleMiddleware(["ADMIN"]), exigirBaseDesechable, async (req, res) => {
  if (String(req.body?.confirmacion || "").trim() !== FRASE) {
    return res.status(400).json({
      ok: false,
      message: `Para reiniciar hay que escribir exactamente: ${FRASE}`,
    });
  }
  try {
    const pasos = [];
    const r = await reiniciar({ log: (m) => pasos.push(m) });
    res.json({ ...r, pasos });
  } catch (e) {
    console.error("[DEMO] reinicio falló:", e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
