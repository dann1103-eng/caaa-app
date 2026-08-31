/**
 * Un INSERT con N filas en vez de N INSERT.
 *
 * El sembrado corre contra una base remota, así que lo que cuesta no es la
 * consulta sino el VIAJE: 414 idas y vueltas a ~83 ms daban 34 segundos con el
 * botón girando delante de un cliente. Agrupando quedan unas 40.
 *
 * ⚠️ Deliberadamente NO devuelve ids. PostgreSQL devuelve el RETURNING de un
 * INSERT multifila en el orden en que se pasaron las tuplas, pero eso no está
 * garantizado por el estándar, y emparejar mal un vuelo con su vouchera sería un
 * error silencioso. Cuando hacen falta los ids se vuelven a leer por una clave
 * natural (el username, el código del repuesto, el día y bloque del vuelo).
 */
async function insertarMuchos(c, tabla, columnas, filas) {
  // Postgres admite 65535 parámetros por sentencia. Con los tamaños del demo no
  // se llega ni cerca, pero partir es de una línea y evita una sorpresa el día
  // que alguien suba el escenario a mil vuelos.
  const porTanda = Math.max(1, Math.floor(60000 / columnas.length));
  for (let i = 0; i < filas.length; i += porTanda) {
    const tanda = filas.slice(i, i + porTanda);
    const valores = [];
    const tuplas = tanda.map(
      (fila) => `(${fila.map((v) => `$${valores.push(v)}`).join(",")})`
    );
    await c.query(
      `INSERT INTO ${tabla} (${columnas.join(", ")}) VALUES ${tuplas.join(", ")}`,
      valores
    );
  }
}

module.exports = { insertarMuchos };
