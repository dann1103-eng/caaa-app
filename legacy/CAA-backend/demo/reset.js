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
  "taller_formulario", "taller_sticker_plantilla", "taller_repuesto",
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
    // Cada tabla va calificada con el esquema: aunque el search_path fallara,
    // esto no puede alcanzar a public.
    await c.query(
      `TRUNCATE TABLE ${tablas.map((t) => `${ESQUEMA}."${t}"`).join(", ")} RESTART IDENTITY CASCADE`
    );

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
      for (const u of usuarios.rows) {
        await cli.query(
          `INSERT INTO public.demo_cuenta (username, nota) VALUES ($1, $2)
             ON CONFLICT (username) DO NOTHING`,
          [u.username, "Sembrada por el reinicio del escenario"]
        );
      }
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
