// Lecturas de medidor (tacómetro y Hobbs). El instructor copia a la vouchera lo
// que ve en la carátula del instrumento: 4 dígitos enteros y una cantidad fija
// de decimales. De ahí salen las dos reglas de este archivo:
//
//  · el molde es FIJO (4 + N) y no crece. Lo que pasa de 4 dígitos enteros es la
//    escala de LIBRO del Taller (el +10,000 del YS-334-PE, cuyo tacómetro dio la
//    vuelta), no lo que se anota en la vouchera;
//  · los decimales son EXACTOS, nunca se recortan los ceros de cola. Un TAC de
//    847.20 que se muestre "0847.2" se relee después como 084.72 — otro número.
//
// Es la fuente única: la usan el campo de la vouchera, el mini-form de tramo y
// el PDF. Antes había dos copias de esto y ya divergían.

export const FORMATO_TACOMETRO = { enteros: 4, decimales: 2 };
export const FORMATO_HOBBS = { enteros: 4, decimales: 1 };

const NUMERICO = /^\d+(\.\d+)?$/;

const sinCerosIzq = (ent) => ent.replace(/^0+(?=\d)/, "");

export function moldeMedidor({ enteros, decimales }) {
  return `${"0".repeat(enteros)}.${"0".repeat(decimales)}`;
}

// ¿La lectura entra en el molde? Un dato viejo con más decimales de los que tiene
// el instrumento NO entra: pasarlo por la máscara lo redondearía, y redondear por
// su cuenta una lectura ya guardada no es tarea de un campo de texto.
export function cabeEnMolde(val, { enteros, decimales }) {
  const s = String(val ?? "").trim();
  if (!NUMERICO.test(s)) return false;
  const [ent, dec = ""] = s.split(".");
  return sinCerosIzq(ent).length <= enteros && dec.replace(/0+$/, "").length <= decimales;
}

// Lectura → la ristra de dígitos que la produce (sin punto, ya rellenada a los
// decimales exactos). `""` si no hay lectura, `null` si no cabe en el molde.
export function digitosDesdeValor(val, formato) {
  if (val === null || val === undefined || val === "") return "";
  if (!cabeEnMolde(val, formato)) return null;
  const [ent, dec = ""] = String(val).trim().split(".");
  const decimales = dec.replace(/0+$/, "").padEnd(formato.decimales, "0");
  return `${sinCerosIzq(ent).padStart(formato.enteros, "0")}${decimales}`;
}

// Dígitos tecleados → la lectura que se guarda en el formulario. Los dígitos
// entran por la derecha: los últimos son los decimales y el punto no se mueve.
export function valorDesdeDigitos(digitos, { enteros, decimales }) {
  if (!digitos) return "";
  const total = enteros + decimales;
  const pad = digitos.slice(-total).padStart(total, "0");
  return `${pad.slice(0, enteros)}.${pad.slice(enteros)}`;
}

// El texto que se ve, partido en dos: el molde que todavía nadie tecleó (gris) y
// lo que el instructor ya escribió (negro). El punto cae del lado del molde
// mientras siga habiendo enteros sin teclear.
export function partesMedidor(digitos, formato) {
  const texto = valorDesdeDigitos(digitos, formato) || moldeMedidor(formato);
  const sinTeclear = formato.enteros + formato.decimales - digitos.length;
  let vistos = 0;
  let molde = "";
  let escrito = "";
  for (const ch of texto) {
    if (vistos < sinTeclear) molde += ch;
    else escrito += ch;
    if (ch >= "0" && ch <= "9") vistos++;
  }
  return { texto, molde, escrito };
}

// Cómo se muestra e imprime una lectura guardada: los 4 dígitos de la carátula y
// los decimales del instrumento, sin redondear ni recortar. Si el dato trae más
// decimales de los que el instrumento tiene (lecturas viejas: la columna es
// numeric(10,2) y el Hobbs se llena con uno solo), se imprimen tal cual — antes
// que mentir sobre lo que está guardado.
export function formatMedidor(val, formato = FORMATO_TACOMETRO) {
  if (val === null || val === undefined || val === "") return "";
  const s = String(val).trim();
  if (!NUMERICO.test(s)) return s;
  const [ent, dec = ""] = s.split(".");
  const limpio = dec.replace(/0+$/, "");
  const decimales = limpio.length >= formato.decimales ? limpio : limpio.padEnd(formato.decimales, "0");
  return `${sinCerosIzq(ent).padStart(formato.enteros, "0")}.${decimales}`;
}
