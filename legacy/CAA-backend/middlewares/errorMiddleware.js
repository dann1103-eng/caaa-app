/**
 * Middleware de manejo de errores global.
 * Captura todos los errores pasados a next() y responde en formato JSON consistente.
 */
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // En desarrollo queremos ver todos los detalles
  if (process.env.NODE_ENV === "development") {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  // En producción ocultamos detalles técnicos
  // Errores operacionales (conocidos)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  // Errores de programación o desconocidos: no filtramos detalles al cliente
  console.error("💥 ERROR DESCONOCIDO:", err);
  return res.status(500).json({
    status: "error",
    message: err.message || "Algo salió mal en el servidor.",
    detail: err.detail || null
  });
};
