const raw = "METAR MSSS 281600Z VRB02KT 9000 SCT020 30/21 Q1017 A3001 NOSIG RMK BR";
const parts = raw.trim().split(/\s+/);

function decode(raw) {
  const parts = raw.trim().split(/\s+/);
  let idx = 0;
  const result = {
    estacion: null,
    tiempo: null,
    viento: null,
    visibilidad: null,
    nubes: [],
    temperatura: null,
    punto_rocio: null,
    qnh: null,
    condicion: null,
  };

  if (parts[idx] && /^(METAR|SPECI)$/.test(parts[idx])) idx++;
  if (parts[idx] && /^[A-Z]{4}$/.test(parts[idx])) result.estacion = parts[idx++];
  if (parts[idx] && /^\d{6}Z$/.test(parts[idx])) idx++; // skip time
  if (parts[idx] && /^(AUTO|COR|SPECI)$/.test(parts[idx])) idx++;

  if (parts[idx] && /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?KT$/.test(parts[idx])) {
    const w = parts[idx++];
    result.viento = { texto: w };
  }
  
  if (parts[idx] && /^\d{3}V\d{3}$/.test(parts[idx])) idx++;

  if (parts[idx] === "CAVOK") {
    idx++;
    result.visibilidad = { texto: ">10 km" };
  } else if (parts[idx] && /^\d{4}$/.test(parts[idx])) {
    result.visibilidad = { texto: parts[idx++] };
  }

  // Skip other stuff until clouds
  while (parts[idx] && !/^(FEW|SCT|BKN|OVC|VV)\d{3}/.test(parts[idx]) && !/^M?\d{2}\/M?\d{2}$/.test(parts[idx])) {
    idx++;
  }

  while (parts[idx] && /^(FEW|SCT|BKN|OVC|VV)\d{3}/.test(parts[idx])) {
    result.nubes.push(parts[idx++]);
  }

  if (parts[idx] && /^M?\d{2}\/M?\d{2}$/.test(parts[idx])) {
    const [t, d] = parts[idx++].split("/");
    result.temperatura = t;
    result.punto_rocio = d;
  }

  if (parts[idx] && /^Q\d{4}$/.test(parts[idx])) {
    result.qnh = { valor: parts[idx++].slice(1), unidad: "hPa" };
  }

  return result;
}

console.log(JSON.stringify(decode(raw), null, 2));
