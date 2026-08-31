/**
 * Candados del entorno de demostraciones.
 *
 * 🚨 Acá vive un endpoint que BORRA datos. Corre en el MISMO despliegue que
 * CAAA, así que los candados son lo único que separa una demostración de un
 * accidente en producción. Son cuatro, y cada uno alcanza por sí solo:
 *
 *   1. El token tiene que decir `esquema: "demo"`. Va FIRMADO, así que nadie se
 *      pasa a demo -- ni un admin real de CAAA -- tocando la petición. Y solo
 *      recibe ese token quien esté en public.demo_cuenta.
 *   2. Rol ADMIN dentro de demo.
 *   3. Hay que ESCRIBIR una frase, no apretar "sí".
 *   4. reset.js nombra el esquema en cada sentencia y aborta si su conexión no
 *      está parada en `demo`.
 *
 * La consecuencia importante: un ADMIN de verdad de CAAA, con su sesión real,
 * NO puede disparar el reinicio. Su token dice `public` y el primer candado lo
 * frena. El botón ni siquiera se le dibuja.
 */

const FRASE = "REINICIAR LA DEMOSTRACION";

/** ¿La sesión que hace esta petición está operando sobre el esquema demo? */
const enDemo = (req) => req.user?.esquema === "demo";

/** Middleware: solo pasa quien tenga una sesión de demostración. */
function exigirSesionDemo(req, res, next) {
  if (!enDemo(req)) {
    return res.status(403).json({
      ok: false,
      message:
        "Esta acción solo existe para la cuenta de demostraciones. Tu sesión trabaja sobre los " +
        "datos reales, así que no puede reiniciar nada.",
    });
  }
  next();
}

module.exports = { FRASE, enDemo, exigirSesionDemo };
