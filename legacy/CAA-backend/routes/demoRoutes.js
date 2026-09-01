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
const { marca, MARCAS } = require("../utils/marca");

router.use(authMiddleware);

/** Para que el frontend sepa si dibujar el boton. Cualquiera puede preguntar. */
router.get("/estado", (req, res) => {
  res.json({
    ok: true, en_demo: enDemo(req), esquema: enDemo(req) ? ESQUEMA : "public", frase: FRASE,
    // De dónde salió la identidad que van a llevar los PDF de ESTA sesión. Sin
    // esto, un backend que no encuentra marca.json se ve igual que uno que sí:
    // cae a los valores de respaldo, que son los de CAAA, y los documentos
    // salen con el logo equivocado sin un solo error a la vista.
    marca: { nombre: marca.nombre, codigo_oma: marca.codigo_oma, origen: MARCAS.origen || "respaldo" },
  });
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
