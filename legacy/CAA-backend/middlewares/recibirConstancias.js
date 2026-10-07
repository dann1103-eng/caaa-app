// Recibe las constancias de una solicitud de cancelación (campo `archivos` de un
// multipart) y las deja en `req.files`, en memoria.
//
// Es multer envuelto por dos motivos:
//
//  1. Sus errores —archivo muy pesado, demasiados, tipo no permitido— llegaban
//     al middleware global y salían como 500 y en inglés ("File too large"). Acá
//     son un 400 que el alumno puede entender.
//  2. multer lee el nombre de cada archivo como latin1 y los navegadores lo
//     mandan en UTF-8: "Constancia médica.pdf" quedaba guardada como
//     "Constancia mÃ©dica.pdf". Acá se arregla, una vez, para quien venga después.
//
// En un pedido que no es multipart multer no hace nada, así que la misma ruta
// sigue aceptando JSON.
//
// Memoria y no disco: el disco de Railway se borra en cada redeploy, y de acá el
// buffer va directo a Supabase Storage. Va DESPUÉS del middleware de acceso: no
// se le guarda en memoria un archivo a quien todavía no se identificó.
const path = require("path");
const multer = require("multer");
const constancias = require("../utils/constancias");

const upload = multer({
  storage: multer.memoryStorage(),
  // +1: multer corta cuando el archivo LLEGA al límite, no cuando lo pasa, así
  // que con el límite justo rechazaba un archivo de exactamente 8 MB que el
  // formulario (y problemaDeConstancias) dan por bueno.
  limits: { fileSize: constancias.MAX_BYTES + 1, files: constancias.MAX_ARCHIVOS },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (constancias.EXTENSIONES_OK.includes(ext)) cb(null, true);
    else cb(constancias.errorDeTipo(constancias.nombreLegible(file.originalname)));
  },
}).array("archivos", constancias.MAX_ARCHIVOS);

module.exports = (req, res, next) =>
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ message: constancias.mensajeDeSubida(err) });
    for (const f of req.files || []) f.originalname = constancias.nombreLegible(f.originalname);
    next();
  });
