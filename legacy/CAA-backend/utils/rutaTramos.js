// Helpers puros para rutas con parada (N tramos por ruta). Sin acceso a DB.
// El alumno pide solo los ICAO intermedios; el origen del primer tramo y el
// destino del último son siempre la base (MSSS) y se autocompletan.
const BASE_ICAO = "MSSS";
const MAX_PARADAS = 4;

// ["mggt"," MHTG "] -> ["MGGT","MHTG"]. Lanza Error con .status=400 si algo
// no es un ICAO de 4 letras o si hay demasiadas paradas.
function normalizarParadas(tramos_ruta) {
  if (!Array.isArray(tramos_ruta) || tramos_ruta.length === 0) {
    throw Object.assign(
      new Error("Una ruta con parada necesita al menos un aeropuerto destino (código ICAO)."),
      { status: 400 }
    );
  }
  if (tramos_ruta.length > MAX_PARADAS) {
    throw Object.assign(new Error(`Máximo ${MAX_PARADAS} paradas por ruta.`), { status: 400 });
  }
  return tramos_ruta.map((c) => {
    const icao = String(c || "").trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(icao)) {
      throw Object.assign(
        new Error(`"${c}" no es un código ICAO válido (4 letras, ej. MGGT).`),
        { status: 400 }
      );
    }
    return icao;
  });
}

// Reparte el rango de bloques total en N tramos iguales. El horario por tramo
// es PRESENTACIONAL (la reserva real del avión es el rango completo); el gate
// operativo de los tramos 2..N es la acción del instructor, no la hora.
// paradas ["MGGT"] => [{1: MSSS->MGGT}, {2: MGGT->MSSS}]
function construirTramos({ paradas, id_bloque, id_bloque_fin }) {
  const icaos = [BASE_ICAO, ...paradas, BASE_ICAO];
  const n = icaos.length - 1;
  const b0 = Number(id_bloque);
  const b1 = Number(id_bloque_fin || id_bloque);
  const total = Math.max(1, b1 - b0 + 1);
  const por = Math.max(1, Math.floor(total / n));
  const tramos = [];
  for (let i = 0; i < n; i++) {
    const ini = Math.min(b1, b0 + i * por);
    const fin = i === n - 1 ? b1 : Math.min(b1, ini + por - 1);
    tramos.push({
      orden_tramo: i + 1,
      total_tramos: n,
      icao_origen: icaos[i],
      icao_destino: icaos[i + 1],
      id_bloque: ini,
      id_bloque_fin: fin,
    });
  }
  return tramos;
}

module.exports = { BASE_ICAO, MAX_PARADAS, normalizarParadas, construirTramos };
