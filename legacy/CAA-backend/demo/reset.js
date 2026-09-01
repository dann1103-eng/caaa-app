/**
 * Reinicio del demo: devuelve el esquema `demo` a su punto de partida.
 *
 * 🚨 BORRA datos — pero SOLO los del esquema `demo`. Cada sentencia nombra el
 * esquema explícitamente y hay una comprobación que aborta si alguna vez esto
 * corriera apuntando a `public`. El esquema `public`, donde viven los datos
 * reales de CAAA, no se toca nunca.
 *
 * Qué NO se borra dentro de demo: el CATÁLOGO. Flota, cursos, licencias,
 * bloques horarios, config fiscal, plantillas. Eso ES el punto de partida y lo
 * arma el runbook una sola vez.
 *
 * Se usa una allowlist (lo que se conserva) y no una denylist (lo que se borra)
 * a propósito: si mañana alguien agrega una tabla y nadie se acuerda de este
 * archivo, la tabla nueva se BORRA en el reinicio, que en un demo es inocuo. Con
 * una denylist pasaría lo contrario — sobreviviría y el demo arrastraría basura
 * entre corridas sin que nadie entienda por qué.
 */
const db = require("../config/db");
const { sembrar } = require("./escenario");

const ESQUEMA = "demo";

/** Catálogo: sobrevive al reinicio. */
const CONSERVAR = new Set([
  // Flota y su configuración
  "aeronave", "aeronave_tarifa", "licencia", "licencia_aeronave",
  "wb_plantilla", "bloque_horario",
  // Académico
  "curso", "unidad_teorica", "curso_componente_practico", "salon",
  // Administración
  "config_fiscal", "concepto_cobro", "condiciones_cancelacion",
  "instructor_tarifa", "documento_requerido_catalogo", "medico_autorizado",
  // Taller
  //
  // ⚠️ `taller_repuesto` NO está acá, y en producción sí sería catálogo: la lista
  // de repuestos la curan los mecánicos y no se tira nunca. En el demo la siembra
  // el escenario JUNTO CON sus movimientos, y el stock se calcula sumándolos. Si
  // los repuestos sobrevivieran al reinicio y sus movimientos no, la bodega
  // quedaría con existencias que ningún documento explica — que es exactamente el
  // defecto del Excel que este módulo vino a corregir.
  "taller_formulario", "taller_sticker_plantilla",
  // Infraestructura
  "push_notificacion_config", "webhook_endpoint",
  // Vive solo en public, pero por si el clon la arrastró
  "demo_cuenta",
]);

/**
 * Devuelve el esquema demo al escenario inicial. Todo en UNA transacción: si
 * algo falla a mitad no queda ni lo viejo borrado ni lo nuevo a medias.
 */
async function reiniciar({ log = () => {} } = {}) {
  // Se corre SIEMPRE contra el pool de demo, explícito. No se hereda de ningún
  // contexto: que este archivo pueda tocar `public` no debe depender de quién
  // lo llame.
  const c = await db.poolDemo.connect();
  try {
    // Red de seguridad: si por lo que fuera esta conexión no estuviera parada
    // en `demo`, se aborta antes de borrar nada.
    const sp = await c.query("SELECT current_schema() AS s");
    if (sp.rows[0].s !== ESQUEMA) {
      throw new Error(
        `Abortado: la conexión está en el esquema "${sp.rows[0].s}" y no en "${ESQUEMA}". No se borró nada.`
      );
    }

    await c.query("BEGIN");

    const r = await c.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`, [ESQUEMA]
    );
    const tablas = r.rows.map((x) => x.tablename).filter((t) => !CONSERVAR.has(t));
    if (!tablas.length) throw new Error(`El esquema ${ESQUEMA} está vacío: corré primero clonar_demo().`);

    log(`vaciando ${tablas.length} tablas de ${ESQUEMA}`);

    // 🚨 Se BORRA, no se TRUNCA, y no es un detalle de estilo.
    //
    // `TRUNCATE ... CASCADE` arrastra también las tablas que APUNTAN a las
    // vaciadas, aunque estén en la lista de las que deben sobrevivir. Así se
    // perdían en cada reinicio los 75 textos de sticker y los 7 códigos de
    // formulario de la AAC —los dos apuntan a `usuario` por `actualizado_por`—
    // y nadie se enteraba, porque la lista decía que se conservaban.
    //
    // Y TRUNCATE sin CASCADE no es opción: se niega en cuanto otra tabla la
    // referencie, aunque las claves foráneas estén desactivadas (esa
    // verificación no pasa por los triggers). Con DELETE sí alcanza apagarlas.
    //
    // Va todo en UNA sentencia con CTEs que modifican datos: 67 borrados en un
    // solo viaje a la base en vez de 67.
    await c.query("SET LOCAL session_replication_role = replica");
    await c.query(
      "WITH " + tablas.map((t, i) => `t${i} AS (DELETE FROM ${ESQUEMA}."${t}")`).join(", ") +
      " SELECT 1"
    );

    // DELETE no reinicia las secuencias. Se reinician las de las tablas
    // vaciadas y SOLO esas: las conservadas siguen teniendo filas, y bajarles el
    // contador haría que el próximo INSERT choque contra su clave primaria.
    await c.query(
      `SELECT setval(s.seq, 1, false)
         FROM (SELECT pg_get_serial_sequence($1 || '.' || quote_ident(c.table_name), c.column_name) AS seq
                 FROM information_schema.columns c
                WHERE c.table_schema = $1
                  AND c.table_name = ANY($2::text[])
                  AND pg_get_serial_sequence($1 || '.' || quote_ident(c.table_name), c.column_name) IS NOT NULL
              ) s`,
      [ESQUEMA, tablas]
    );

    // Lo que queda: filas conservadas que apuntaban a un usuario que ya no
    // existe. Se calcula del catálogo en vez de escribir la lista a mano, para
    // que siga siendo correcto cuando alguien agregue una tabla.
    const colgadas = await c.query(
      `SELECT c.conrelid::regclass::text AS tabla, a.attname AS col
         FROM pg_constraint c
         JOIN unnest(c.conkey) k ON true
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE c.contype = 'f' AND c.connamespace = $1::regnamespace
          AND NOT a.attnotnull
          AND c.conrelid::regclass::text <> ALL($2::text[])
          AND c.confrelid::regclass::text = ANY($2::text[])`,
      [ESQUEMA, tablas.map((t) => `${ESQUEMA}.${t}`)]
    );
    for (const { tabla, col } of colgadas.rows) {
      await c.query(`UPDATE ${tabla} SET "${col}" = NULL WHERE "${col}" IS NOT NULL`);
    }
    if (colgadas.rowCount) {
      log(`referencias huérfanas limpiadas: ${colgadas.rows.map((x) => `${x.tabla}.${x.col}`).join(", ")}`);
    }

    log("sembrando el escenario");
    const resumen = await sembrar(c, log);

    await c.query("COMMIT");

    // ── Sincronizar el ruteo ────────────────────────────────────────────────
    // public.demo_cuenta dice que usuarios se autentican contra `demo`. Se
    // reescribe con los que acaban de sembrarse, para que el reinicio no deje
    // registradas cuentas que ya no existen ni olvide las nuevas.
    //
    // El WHERE del DELETE es la red de seguridad: solo se tocan las filas con el
    // prefijo `demo.`. Si alguien registrara a mano una cuenta real acá -- lo
    // que la dejaria sin acceso a sus datos -- este borrado no la arrastraria en
    // silencio; quedaria a la vista.
    const usuarios = await db.poolDemo.query(`SELECT username FROM demo.usuario ORDER BY username`);
    const cli = await db.poolPublic.connect();
    try {
      await cli.query("BEGIN");
      await cli.query(`DELETE FROM public.demo_cuenta WHERE username LIKE 'demo.%'`);
      // De una sola vez: eran 29 idas y vueltas a la base, casi cuatro segundos
      // del botón girando delante de un cliente.
      await cli.query(
        `INSERT INTO public.demo_cuenta (username, nota)
         SELECT u, $2 FROM UNNEST($1::text[]) AS u
         ON CONFLICT (username) DO NOTHING`,
        [usuarios.rows.map((u) => u.username), "Sembrada por el reinicio del escenario"]
      );
      await cli.query("COMMIT");
    } catch (e) {
      await cli.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      cli.release();
    }

    return { ok: true, esquema: ESQUEMA, ...resumen,
             tablas_vaciadas: tablas.length, cuentas_registradas: usuarios.rows.length };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

module.exports = { reiniciar, CONSERVAR, ESQUEMA };
