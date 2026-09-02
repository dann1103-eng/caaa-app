// Helpers de "qué semana está mirando el usuario", compartidos por los
// dashboards de alumno e instructor.
//
// Contexto: una `semana_vuelo` va de LUNES a DOMINGO (fecha_fin = inicio + 6),
// pero los vuelos solo existen de lunes a sábado (dia_semana 1..6). O sea que el
// domingo es el único día que cae dentro de una semana cuyos días operativos ya
// pasaron: el backend lo sigue llamando "semana actual" mientras el programa
// recién publicado —el que arranca mañana— queda del lado "semana siguiente".
// Por eso el domingo los paneles abren directo en la semana que viene.

const TZ = "America/El_Salvador";

/** Día de hoy en formato de la BD (ISO: lunes=1 … domingo=7), hora de El Salvador. */
export function diaHoyDb() {
  // Se fuerza la zona de la escuela en vez de confiar en la del navegador: un
  // teléfono con la zona corrida movía el "hoy" de las pestañas del calendario.
  const hoy = new Date(
    `${new Date().toLocaleDateString("en-CA", { timeZone: TZ })}T12:00:00`
  );
  const n = hoy.getDay(); // Dom=0 … Sáb=6
  return n === 0 ? 7 : n;
}

/**
 * Pestaña en la que conviene abrir el panel. El domingo la "semana actual" ya no
 * tiene ningún día por volar, así que se abre en la que arranca mañana — que es
 * justo la que el instructor o el alumno acaba de recibir publicada.
 */
export function weekModeInicial() {
  return diaHoyDb() === 7 ? "next" : "current";
}

/** "1 – 6 de septiembre" / "31 de agosto – 5 de septiembre" a partir de la fila `semana_vuelo`. */
export function rangoSemana(semana) {
  if (!semana?.fecha_inicio || !semana?.fecha_fin) return "";
  // Se toma solo la parte de fecha y se ancla al mediodía local: así ningún
  // corrimiento de zona horaria mueve el día mostrado.
  const aFecha = (v) => new Date(`${String(v).slice(0, 10)}T12:00:00`);
  const ini = aFecha(semana.fecha_inicio);
  // La semana termina el domingo pero no se vuela ese día: se muestra hasta el
  // sábado, que es el último día operativo y lo que la escuela entiende por
  // "la semana".
  const fin = aFecha(semana.fecha_fin);
  fin.setDate(fin.getDate() - 1);

  const mes = (d) => d.toLocaleDateString("es-SV", { month: "long" });
  return ini.getMonth() === fin.getMonth()
    ? `${ini.getDate()} – ${fin.getDate()} de ${mes(fin)}`
    : `${ini.getDate()} de ${mes(ini)} – ${fin.getDate()} de ${mes(fin)}`;
}
