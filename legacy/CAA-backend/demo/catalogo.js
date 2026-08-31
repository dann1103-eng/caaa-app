/**
 * Copia el CATÁLOGO de `public` a `demo`: flota, licencias, bloques horarios,
 * cursos, tarifas, config fiscal, plantillas de peso y balance.
 *
 * Es lo que hace que el demo se comporte igual que el sistema real. No copia
 * NINGÚN dato de personas ni de operación — ni un alumno, ni un vuelo, ni un
 * saldo. La lista de abajo es explícita justamente para que agregar una tabla
 * acá sea una decisión consciente y no un descuido.
 *
 * Se corre una vez, después de clonar_demo(). El reinicio del escenario NO la
 * vuelve a correr: el catálogo es el punto de partida y sobrevive.
 */
const db = require("../config/db");

/**
 * El orden NO importa: durante la copia se desactiva la verificación de claves
 * foráneas (session_replication_role = replica) y se reactiva al terminar,
 * dentro de la misma transacción. Ordenar 17 tablas a mano funcionaba hasta que
 * alguien agregara una y no se acordara de ponerla en el lugar correcto.
 */
const CATALOGO = [
  "licencia",
  "bloque_horario",
  "aeronave",
  "licencia_aeronave",
  "aeronave_tarifa",
  "wb_plantilla",
  "curso",
  "unidad_teorica",
  "curso_componente_practico",
  "salon",
  "config_fiscal",
  "concepto_cobro",
  "condiciones_cancelacion",
  "documento_requerido_catalogo",
  "medico_autorizado",
  "taller_formulario",
  "taller_sticker_plantilla",
];

async function copiarCatalogo({ log = () => {} } = {}) {
  const c = await db.poolDemo.connect();
  try {
    const sp = await c.query("SELECT current_schema() AS s");
    if (sp.rows[0].s !== "demo") {
      throw new Error(`Abortado: la conexión está en "${sp.rows[0].s}", no en "demo".`);
    }

    await c.query("BEGIN");
    // Sin esto hay que copiar en orden de dependencia exacto: aeronave apunta a
    // wb_plantilla, que a su vez... Vale solo para esta sesión y esta
    // transacción, y las FK quedan verificadas igual al final por el COMMIT de
    // las que se crean después.
    await c.query("SET LOCAL session_replication_role = replica");
    const copiadas = {};
    for (const t of CATALOGO) {
      // La tabla puede no existir en una instalación vieja: se salta sin drama.
      const existe = await c.query(
        `SELECT 1 FROM pg_tables WHERE schemaname='demo' AND tablename=$1`, [t]
      );
      if (!existe.rows.length) { log(`(sin ${t})`); continue; }

      await c.query(`DELETE FROM demo."${t}"`);
      const r = await c.query(`INSERT INTO demo."${t}" SELECT * FROM public."${t}"`);
      copiadas[t] = r.rowCount;

      // Las filas se copiaron con su id explícito, así que la secuencia de demo
      // sigue en 1 y el próximo INSERT chocaría contra la clave primaria.
      const seq = await c.query(
        `SELECT column_name, pg_get_serial_sequence('demo.' || quote_ident($1), column_name) AS s
           FROM information_schema.columns
          WHERE table_schema='demo' AND table_name=$1
            AND pg_get_serial_sequence('demo.' || quote_ident($1), column_name) IS NOT NULL`, [t]
      );
      for (const s of seq.rows) {
        // El nombre de tabla y de columna van interpolados con comillas dobles
        // porque un identificador no puede ir como parámetro; ambos vienen del
        // catálogo de PostgreSQL, no de nada que escriba un usuario.
        await c.query(
          `SELECT setval($1, COALESCE((SELECT MAX("${s.column_name}") FROM demo."${t}"), 1))`,
          [s.s]
        );
      }
    }
    await c.query("COMMIT");
    log(`catálogo copiado: ${Object.entries(copiadas).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    return copiadas;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

module.exports = { copiarCatalogo, CATALOGO };
