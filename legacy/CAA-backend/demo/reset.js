/**
 * Reinicio del demo: devuelve la base al punto de partida del escenario.
 *
 * 🚨 BORRA datos. Los candados están en demo/guardas.js y hay que leerlos antes
 * de tocar este archivo.
 *
 * Qué NO se borra: el CATÁLOGO. Flota, cursos, licencias, bloques horarios,
 * config fiscal, plantillas de peso y balance, formularios del taller. Eso ES el
 * punto de partida y lo arma el runbook una sola vez; el reinicio solo devuelve
 * las personas y la operación.
 *
 * Se usa una allowlist (lo que se conserva) y no una denylist (lo que se borra)
 * a propósito: si mañana alguien agrega una tabla y nadie se acuerda de este
 * archivo, la tabla nueva se BORRA en el reinicio, que en un demo es inocuo. Con
 * una denylist pasaría lo contrario — la tabla nueva sobreviviría al reinicio y
 * el demo arrastraría basura entre corridas sin que nadie entienda por qué.
 */
const db = require("../config/db");
const { sembrar } = require("./escenario");
const { baseEsDesechable } = require("./guardas");

/** Catálogo: sobrevive al reinicio. */
const CONSERVAR = new Set([
  "demo_sentinela",
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
]);

async function tablasABorrar(c) {
  const r = await c.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  );
  return r.rows.map((x) => x.table_name).filter((t) => !CONSERVAR.has(t));
}

/**
 * Devuelve la base al escenario inicial. Todo en UNA transacción: si algo falla
 * a mitad no queda ni lo viejo borrado ni lo nuevo a medias.
 */
async function reiniciar({ log = () => {} } = {}) {
  if (!(await baseEsDesechable())) {
    throw new Error("La base no está marcada como desechable. Reinicio abortado.");
  }

  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const tablas = await tablasABorrar(c);
    log(`borrando ${tablas.length} tablas`);
    // TRUNCATE de una sola vez: CASCADE resuelve el orden de las FK solo, y
    // RESTART IDENTITY hace que los ids arranquen en 1 en cada corrida, así el
    // demo es idéntico siempre.
    await c.query(
      `TRUNCATE TABLE ${tablas.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
    );

    log("sembrando el escenario");
    const resumen = await sembrar(c, log);

    await c.query("COMMIT");
    return { ok: true, ...resumen, tablas_vaciadas: tablas.length };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

module.exports = { reiniciar, CONSERVAR };
