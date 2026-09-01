/**
 * Alumnos de programas que NO se vuelan (sobrecargo y cualquier curso de tierra).
 *
 * `licencia.vuela` es la fuente única: describe al PROGRAMA, no a la persona. Si
 * mañana la escuela abre Despachante o Mecánico de línea, es una fila más en
 * `licencia` y ningún alumno cambia.
 *
 * Fragmento COMPARTIDO, no copiado — misma disciplina que
 * utils/inventarioHelpers.js (documentoCuentaSQL) y utils/horasFacturables.js.
 * Con las aeronaves externas hubo que tocar 16 consultas porque el criterio
 * estaba escrito en cada una (CLAUDE.md §29.D); acá vive en un solo lugar.
 *
 * ── Dónde se aplica ──────────────────────────────────────────────────────
 * SOLO en los SELECTORES: los lugares que listan alumnos *para elegir uno* —
 * agendar, roster del instructor, standby, editar tripulación.
 *
 * ── Dónde NO ─────────────────────────────────────────────────────────────
 * En las ~35 consultas que entran DESDE un vuelo (`vuelo JOIN alumno`). Un
 * alumno que no vuela no tiene vuelos, así que nunca aparece; filtrarlas sería
 * ruido. Tampoco en Cuentas ni en Usuarios: ahí se muestran todos, porque un
 * alumno de tierra factura igual que cualquiera.
 */

/**
 * Condición SQL para dejar solo a los alumnos cuyo programa se vuela.
 * Se arma con EXISTS y no con un JOIN a propósito: un JOIN cambiaría la forma de
 * la consulta que lo llama (columnas ambiguas, duplicados si el llamador ya une
 * `licencia`), y esto tiene que poder pegarse en cualquier WHERE sin pensar.
 *
 * @param {string} alias - alias de la tabla `alumno` en la consulta (ej. "a").
 */
function alumnoVuelaSQL(alias = "a") {
  return `EXISTS (
    SELECT 1 FROM licencia lv
     WHERE lv.id_licencia = ${alias}.id_licencia
       AND lv.vuela = true
  )`;
}

/** La negación, para listar solo alumnos de tierra. */
function alumnoNoVuelaSQL(alias = "a") {
  return `NOT ${alumnoVuelaSQL(alias)}`;
}

module.exports = { alumnoVuelaSQL, alumnoNoVuelaSQL };
