const POLL_INTERVAL_MS = 20 * 60 * 1000;

let cached = null;

function decodeMetar(raw) {
  if (!raw) return null;

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

  if (parts[idx] && /^[A-Z]{4}$/.test(parts[idx])) {
    result.estacion = parts[idx++];
  }

  if (parts[idx] && /^\d{6}Z$/.test(parts[idx])) {
    const t = parts[idx++];
    result.tiempo = `Día ${t.slice(0, 2)} ${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  }

  if (parts[idx] && /^(AUTO|COR|SPECI)$/.test(parts[idx])) idx++;

  if (parts[idx] && /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?KT$/.test(parts[idx])) {
    const w = parts[idx++];
    const dirRaw = w.slice(0, 3);
    const spdMatch = w.match(/^(?:VRB|\d{3})(\d{2,3})/);
    const spd = spdMatch ? parseInt(spdMatch[1], 10) : 0;
    const gustMatch = w.match(/G(\d{2,3})KT$/);

    result.viento = {
      direccion: dirRaw === "VRB" ? "Variable" : `${parseInt(dirRaw, 10)}°`,
      velocidad: `${spd} KT`,
      racha: gustMatch ? `${parseInt(gustMatch[1], 10)} KT` : null,
      texto:
        dirRaw === "VRB"
          ? `Variable / ${spd} KT${gustMatch ? ` (racha ${parseInt(gustMatch[1], 10)} KT)` : ""}`
          : `${parseInt(dirRaw, 10)}° / ${spd} KT${gustMatch ? ` (racha ${parseInt(gustMatch[1], 10)} KT)` : ""}`,
    };
  }

  if (parts[idx] && /^\d{3}V\d{3}$/.test(parts[idx])) idx++;

  if (parts[idx] === "CAVOK") {
    idx++;
    result.visibilidad = { metros: ">9999", texto: ">10 km", valor: 10000 };
    result.nubes = [{ tipo: "NCD", altura_ft: null, texto: "Sin nubes significativas (CAVOK)" }];
  } else if (parts[idx] && /^\d{4}$/.test(parts[idx])) {
    const v = parseInt(parts[idx++], 10);
    result.visibilidad = {
      metros: v >= 9999 ? ">9999" : v,
      texto: v >= 9999 ? ">10 km" : v >= 1000 ? `${v / 1000} km` : `${v} m`,
      valor: v >= 9999 ? 10000 : v,
    };
  } else if (parts[idx] && /^\d{1,2}$/.test(parts[idx])) {
    const sm = parseInt(parts[idx++], 10);
    const metros = sm >= 9 ? 16000 : Math.round(sm * 1609);
    result.visibilidad = {
      metros: sm >= 9 ? ">9999" : metros,
      texto: sm >= 9 ? ">10 km" : `${sm} SM`,
      valor: sm >= 9 ? 10000 : metros,
    };
  }

  while (parts[idx] && /^\d{1,3}$/.test(parts[idx])) idx++;

  while (parts[idx] && /^R\d{2}[LCR]?\/.+/.test(parts[idx])) idx++;

  while (
    parts[idx] &&
    /^[+-]?(TS|SH|FZ|MI|PR|BC|DR|BL)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)/.test(
      parts[idx]
    )
  ) {
    idx++;
  }

  const TIPO_LABEL = {
    FEW: "Pocas",
    SCT: "Dispersas",
    BKN: "Fragmentadas",
    OVC: "Cubierto",
    VV: "Visib. vertical",
  };

  while (parts[idx] && /^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(parts[idx])) {
    const c = parts[idx++];
    const tipoMatch = c.match(/^(FEW|SCT|BKN|OVC|VV)/);
    const tipo = tipoMatch ? tipoMatch[1] : "FEW";
    const altMatch = c.match(/\d{3}/);
    const altura_ft = altMatch ? parseInt(altMatch[0], 10) * 100 : null;
    const sufijo = /CB$/.test(c) ? " CB" : /TCU$/.test(c) ? " TCU" : "";
    result.nubes.push({
      tipo,
      altura_ft,
      texto: `${TIPO_LABEL[tipo] || tipo}${sufijo} a ${altura_ft} ft`,
    });
  }

  if (parts[idx] && /^(SKC|CLR|NSC|NCD)$/.test(parts[idx])) {
    result.nubes.push({ tipo: parts[idx], altura_ft: null, texto: "Despejado" });
    idx++;
  }

  if (parts[idx] && /^M?\d{2}\/M?\d{2}$/.test(parts[idx])) {
    const [tStr, dStr] = parts[idx++].split("/");
    const parseT = (s) =>
      s.startsWith("M") ? -parseInt(s.slice(1), 10) : parseInt(s, 10);
    result.temperatura = parseT(tStr);
    result.punto_rocio = parseT(dStr);
  }

  if (parts[idx] && /^Q\d{4}$/.test(parts[idx])) {
    result.qnh = { valor: parseInt(parts[idx++].slice(1), 10), unidad: "hPa" };
  } else if (parts[idx] && /^A\d{4}$/.test(parts[idx])) {
    const inHg = parseInt(parts[idx++].slice(1), 10) / 100;
    result.qnh = { valor: Math.round(inHg * 33.8639), unidad: "hPa" };
  }

  const visMt = typeof result.visibilidad?.valor === "number"
    ? result.visibilidad.valor
    : 10000;

  const ceilingFt = result.nubes
    .filter((n) => n.tipo === "BKN" || n.tipo === "OVC" || n.tipo === "VV")
    .reduce(
      (min, n) => (n.altura_ft !== null && n.altura_ft < min ? n.altura_ft : min),
      Infinity
    );
  const hasCeiling = isFinite(ceilingFt);

  if (visMt < 1600 || (hasCeiling && ceilingFt < 500)) {
    result.condicion = "LIFR";
  } else if (visMt < 3000 || (hasCeiling && ceilingFt < 1000)) {
    result.condicion = "IFR";
  } else if (visMt <= 5000 || (hasCeiling && ceilingFt <= 3000)) {
    result.condicion = "MVFR";
  } else {
    result.condicion = "VFR";
  }

  return result;
}

async function fetchMetarForStation(icao) {
  const url = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

  console.log(`[METAR] ${icao} — HTTP ${res.status}`);

  const bodyText = await res.text();
  console.log(`[METAR] ${icao} — body raw: ${bodyText}`);

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  let json;
  try {
    json = JSON.parse(bodyText);
  } catch (e) {
    throw new Error(`JSON inválido para ${icao}: ${e.message}`);
  }

  if (!Array.isArray(json) || json.length === 0) return null;
  return json[0];
}

// Solo MSSS (Ilopango, la base real). Antes había un fallback a MSLP (San
// Salvador Intl. — un aeropuerto DISTINTO) cuando MSSS no tenía METAR vigente,
// lo que mostraba condiciones de otro sitio sin avisar y generaba confusión.
// Ahora, si MSSS no responde, se conserva el último METAR válido de MSSS en
// `cached` (no se pisa) y el frontend lo marca como VENCIDO según su antigüedad.
async function fetchMetar() {
  try {
    const entry = await fetchMetarForStation("MSSS");
    if (!entry) {
      console.warn("[METAR] MSSS devolvió array vacío (sin METAR vigente) — se conserva el último dato en caché.");
      return;
    }

    const raw = entry.rawOb ?? entry.raw_text ?? "";
    const decoded = decodeMetar(raw);
    // reportTime/obsTime = cuándo se EMITIÓ el METAR según aviationweather.gov
    // (el grupo ddhhmmZ del propio reporte) — distinto de fetchedAt, que es
    // cuándo NUESTRO poller lo bajó (puede repetir el mismo METAR si la
    // estación todavía no reemitió uno nuevo en esos 20 min).
    const emitidoAt = entry.reportTime
      ?? (entry.obsTime ? new Date(entry.obsTime * 1000).toISOString() : null);
    cached = { raw, decoded, fetchedAt: new Date().toISOString(), emitidoAt };
    console.log(`[METAR] Actualizado (MSSS): ${raw}`);
  } catch (e) {
    console.warn(`[METAR] Fallo con MSSS: ${e.message} — se conserva el último dato en caché.`);
  }
}

function getCached() {
  return cached;
}

function startMetarPoller() {
  fetchMetar();
  setInterval(fetchMetar, POLL_INTERVAL_MS);
}

module.exports = { startMetarPoller, getCached };
