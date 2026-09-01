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
    await disfrazar(c, log);

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

/**
 * El catálogo se copia de CAAA para que el demo se comporte igual, pero copiarlo
 * TAL CUAL lo deja hablando de CAAA: matrículas reales, salones con el nombre de
 * una persona, y los códigos de formulario de su OMA. Un prospecto branded "TU
 * ESCUELA" viendo "Salón Cap. Tito Gutiérrez" entiende de inmediato de quién es
 * el sistema, y peor: entre las aeronaves van las de los CLIENTES EXTERNOS de la
 * OMA — aviones de otras escuelas a las que CAAA les da mantenimiento. Eso no se
 * le enseña a un competidor.
 *
 * Acá se renombra todo eso. Se cambian NOMBRES, nunca ids: el escenario ya sembró
 * vuelos contra esas aeronaves y las plantillas de peso y balance se enganchan por
 * `aeronave.id_wb_plantilla` (una FK, no la matrícula), así que el disfraz no
 * puede romper ningún enlace.
 *
 * Lo que NO se disfraza a propósito: modelos de avión (TOMAHAWK, CESSNA-152),
 * nombres de curso y referencias de manual. Son hechos del avión, no datos de
 * CAAA, y cambiarlos haría que el demo mienta sobre cosas verificables.
 */
async function disfrazar(c, log) {
  // Matrículas inventadas, una por id. La flota propia va en una serie y las
  // externas en otra, para que se note que son de terceros — el demo SÍ tiene
  // que poder mostrar que la OMA le factura trabajo a otras escuelas.
  const MATRICULAS = {
    1: "YS-501-D", 2: "YS-502-D", 3: "YS-503-D", 4: "YS-504-D",
    5: "SIM-D", 6: "YS-505-D", 7: "YS-506-D",
    18: "YS-880-X", 19: "YS-881-X", 20: "YS-882-X", 21: "YS-883-X",
  };
  for (const [id, codigo] of Object.entries(MATRICULAS)) {
    await c.query(`UPDATE demo.aeronave SET codigo = $1 WHERE id_aeronave = $2`, [codigo, Number(id)]);
  }
  // Cualquiera que se agregue a la flota de CAAA después de escribir esto y que
  // no esté en la lista de arriba: se le pone una matrícula genérica en vez de
  // dejarla pasar con la real.
  const sueltas = await c.query(
    `UPDATE demo.aeronave SET codigo = 'YS-9' || LPAD(id_aeronave::text, 2, '0') || '-D'
      WHERE id_aeronave <> ALL($1::int[]) RETURNING codigo`,
    [Object.keys(MATRICULAS).map(Number)]
  );
  if (sueltas.rowCount) log(`aeronaves nuevas disfrazadas: ${sueltas.rows.map((r) => r.codigo).join(", ")}`);

  // El offset del tacómetro se pone en CERO. No es una preferencia: describe un
  // instrumento físico concreto — a un avión de CAAA el tacómetro le dio la vuelta
  // en 9999.99 y los mecánicos le suman 10,000 a mano para el libro. Heredarlo
  // hacía que el libro del demo mostrara "TAC 11200 = lectura 1200 + 10000", un
  // número que no significa nada acá.
  await c.query(`UPDATE demo.aeronave SET tac_offset = 0`);

  // La flota del demo arranca ENTERA disponible. `aeronave.activa` es "vuela
  // HOY", no "está de alta", y la copia se trae la circunstancia de CAAA: hoy
  // tiene dos aviones en el taller, así que el demo nacía con dos aviones menos
  // y sin explicación a la vista. El escenario decide después cuál entra al
  // hangar. Las externas quedan como están: son de terceros y no vuelan acá.
  await c.query(
    `UPDATE demo.aeronave SET activa = true, estado = 'ACTIVO'
      WHERE NOT COALESCE(es_externa, false)`
  );

  // Salones: el alfabeto fonético se lee bien y no es de nadie.
  const SALONES = ["Salón Alfa", "Salón Bravo", "Salón Charlie"];
  const s = await c.query(`SELECT id FROM demo.salon ORDER BY id`);
  for (let i = 0; i < s.rows.length; i++) {
    await c.query(`UPDATE demo.salon SET nombre = $1 WHERE id = $2`,
      [SALONES[i] || `Salón ${i + 1}`, s.rows[i].id]);
  }

  // Códigos de formulario de la AAC: van impresos en cada PDF del taller.
  // El de la OMA sale de marca.json (la marca del demo); los demás pierden el
  // nombre de CAAA. REPLACE y no una lista fija: si mañana hay un formulario
  // nuevo con el mismo patrón, queda cubierto sin tocar este archivo.
  const { MARCAS } = require("../utils/marca");
  await c.query(
    `UPDATE demo.taller_formulario
        SET codigo = REPLACE(REPLACE(codigo, 'CO-OMA-CAAA-014', $1), 'CAAA', 'DEMO')`,
    [MARCAS.demo.codigo_oma]
  );

  // ── El curso de TRIPULANTE DE CABINA ────────────────────────────────────
  // CAAA no lo ofrece, pero es de lo primero que pregunta una escuela que sí, y
  // el sistema lo soporta desde que `licencia.vuela` distingue los programas de
  // tierra. Va en el CATÁLOGO —no en el escenario— porque el catálogo sobrevive
  // al reinicio: sembrarlo en el escenario lo duplicaría en cada corrida.
  const yaEsta = await c.query(`SELECT id FROM demo.curso WHERE codigo = 'SOB'`);
  if (!yaEsta.rows.length) {
    const curso = await c.query(
      `INSERT INTO demo.curso (codigo, nombre, descripcion, costo_teorico_usd, horas_teoricas,
                               gastos_administrativos_usd, total_usd_estimado, activo,
                               pago_teoria_instructor_usd)
       VALUES ('SOB', 'Tripulante de Cabina',
               'Programa de tierra: no requiere horas de vuelo ni instructor asignado.',
               1450, 120, 150, 1600, true, 250)
       RETURNING id`
    );
    const UNIDADES = [
      "Normativa aeronáutica y documentación",
      "Seguridad y equipos de emergencia",
      "Primeros auxilios a bordo",
      "Servicio a bordo y atención al pasajero",
      "Mercancías peligrosas",
      "Factores humanos y CRM",
    ];
    for (let i = 0; i < UNIDADES.length; i++) {
      await c.query(
        `INSERT INTO demo.unidad_teorica (id_curso, numero, nombre, horas_estimadas, orden, activo)
         VALUES ($1, $2, $3, 20, $2, true)`,
        [curso.rows[0].id, i + 1, UNIDADES[i]]
      );
    }
    log("catálogo: curso de tripulante de cabina con sus 6 unidades");
  }

  log("catálogo disfrazado: matrículas, salones y códigos de formulario");
}

module.exports = { copiarCatalogo, CATALOGO, disfrazar };
