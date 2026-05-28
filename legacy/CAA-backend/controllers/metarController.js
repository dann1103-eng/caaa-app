const { getCached } = require("../services/metarService");

exports.getMetar = (req, res) => {
  const data = getCached();
  if (!data) {
    return res.status(503).json({ message: "METAR aún no disponible, reintentá en un momento" });
  }
  res.json(data);
};
