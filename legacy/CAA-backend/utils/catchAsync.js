/**
 * Envuelve una función asíncrona para capturar cualquier error y pasarlo al middleware de error global.
 * Esto elimina la necesidad de usar bloques try/catch en cada controlador.
 */
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
