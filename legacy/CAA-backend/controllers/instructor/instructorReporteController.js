const db = require("../../config/db");
const { resolverIdInstructor } = require("../../utils/instructorHelpers");
const { actualizarHorasAeronave } = require("../../utils/aeronaveUtils");

// Los campos numéricos/tipo_vuelo del reporte son opcionales (hobbs y
// combustible no siempre se llevan) — "" no es lo mismo que "sin dato" para
// una columna NUMERIC/CHECK de Postgres ("" revienta con "invalid input
// syntax for type numeric" o viola el CHECK). Normaliza "" -> null.
const blankToNull = (v) => (v === "" || v === undefined ? null : v);

// Espejo exacto del CHECK de reporte_vuelo.motivo_emergencia (migración
// 20260728000001). Si acá se dejara pasar un valor que el CHECK no permite, el
// INSERT reventaría con un error críptico de constraint en vez de un 400 legible.
const MOTIVOS_EMERGENCIA = ['CLIMA', 'FALLA_MECANICA', 'OTRO'];

exports.getReportesPendientes = async (req, res) => {
  try {
    const user = req.user;
    const result = await db.query(
      `SELECT rv.id_reporte, rv.estado, v.id_vuelo, v.fecha_vuelo,
              b.hora_inicio, b.hora_fin,
              a.codigo AS aeronave_codigo,
              u.nombre AS alumno_nombre, u.apellido AS alumno_apellido
       FROM reporte_vuelo rv
       JOIN vuelo v ON v.id_vuelo = rv.id_vuelo
       JOIN aeronave a ON a.id_aeronave = v.id_aeronave
       JOIN alumno al ON al.id_alumno = v.id_alumno
       JOIN usuario u ON u.id_usuario = al.id_usuario
       JOIN instructor i ON i.id_instructor = v.id_instructor
       JOIN bloque_horario b ON b.id_bloque = v.id_bloque
       WHERE rv.estado = 'PENDIENTE_ALUMNO'
         AND i.id_usuario = $1
       ORDER BY v.fecha_vuelo DESC`,
      [user.id_usuario]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Error getReportesPendientes:', e);
    res.status(500).json({ message: 'Error al obtener reportes pendientes' });
  }
};

exports.getReporteVueloInstructor = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT v.id_vuelo, v.fecha_vuelo, v.estado AS vuelo_estado,
              b.hora_inicio, b.hora_fin,
              a.codigo AS aeronave_codigo, a.modelo AS aeronave_modelo, a.tipo AS aeronave_tipo,
              u.nombre AS alumno_nombre, u.apellido AS alumno_apellido,
              al.numero_licencia AS alumno_licencia,
              u2.nombre AS instructor_nombre, u2.apellido AS instructor_apellido,
              rv.id_reporte, rv.tipo_vuelo, rv.tacometro_salida, rv.tacometro_llegada,
              rv.hobbs_salida, rv.hobbs_llegada, rv.combustible_salida, rv.combustible_llegada,
              rv.cantidad_combustible, rv.horas_cobradas, rv.firma_alumno, rv.firma_instructor,
              rv.estado AS reporte_estado, rv.archivo_pdf, rv.es_inasistencia, rv.motivo_inasistencia,
              rv.regreso_emergencia, rv.motivo_emergencia, rv.detalle_emergencia,
              rv.editado_en, rv.motivo_edicion,
              v.categoria, v.tipo_instruccion, v.debitar_saldo,
              EXISTS(
                SELECT 1 FROM movimiento_cuenta mc
                WHERE mc.id_vuelo = v.id_vuelo AND mc.tipo = 'CARGO_VUELO'
                  AND COALESCE(mc.anulado, false) = false
              ) AS se_debito
       FROM vuelo v
       JOIN aeronave a ON a.id_aeronave = v.id_aeronave
       JOIN alumno al ON al.id_alumno = v.id_alumno
       JOIN usuario u ON u.id_usuario = al.id_usuario
       JOIN instructor i ON i.id_instructor = v.id_instructor
       JOIN usuario u2 ON u2.id_usuario = i.id_usuario
       JOIN bloque_horario b ON b.id_bloque = v.id_bloque
       LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
       WHERE v.id_vuelo = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: 'Vuelo no encontrado' });
    const vuelo = {
      id_vuelo: row.id_vuelo,
      fecha_vuelo: row.fecha_vuelo,
      vuelo_estado: row.vuelo_estado,
      hora_inicio: row.hora_inicio,
      hora_fin: row.hora_fin,
      aeronave_codigo: row.aeronave_codigo,
      aeronave_modelo: row.aeronave_modelo,
      aeronave_tipo: row.aeronave_tipo,
      alumno_nombre: row.alumno_nombre,
      alumno_apellido: row.alumno_apellido,
      alumno_licencia: row.alumno_licencia,
      instructor_nombre: row.instructor_nombre,
      instructor_apellido: row.instructor_apellido,
      categoria: row.categoria,
      tipo_instruccion: row.tipo_instruccion,
      debitar_saldo: row.debitar_saldo,
      se_debito: row.se_debito,
    };
    const reporte = row.id_reporte ? {
      id_reporte: row.id_reporte,
      estado: row.reporte_estado,
      tipo_vuelo: row.tipo_vuelo,
      tacometro_salida: row.tacometro_salida,
      tacometro_llegada: row.tacometro_llegada,
      hobbs_salida: row.hobbs_salida,
      hobbs_llegada: row.hobbs_llegada,
      combustible_salida: row.combustible_salida,
      combustible_llegada: row.combustible_llegada,
      cantidad_combustible: row.cantidad_combustible,
      horas_cobradas: row.horas_cobradas,
      firma_alumno: row.firma_alumno,
      firma_instructor: row.firma_instructor,
      archivo_pdf: row.archivo_pdf,
      es_inasistencia: row.es_inasistencia ?? false,
      motivo_inasistencia: row.motivo_inasistencia,
      // Sin estas 3 la marca de emergencia no vuelve al reabrir la vouchera (este
      // endpoint no devuelve la fila cruda, mapea a un objeto explícito) y el
      // instructor firmaría un vuelo normal sin notar que la había marcado.
      regreso_emergencia: row.regreso_emergencia ?? false,
      motivo_emergencia: row.motivo_emergencia,
      detalle_emergencia: row.detalle_emergencia,
      editado_en: row.editado_en,
      motivo_edicion: row.motivo_edicion,
    } : null;
    res.json({ vuelo, reporte });
  } catch (e) {
    console.error('Error getReporteVueloInstructor:', e);
    res.status(500).json({ message: 'Error al obtener reporte de vuelo' });
  }
};

exports.guardarReporteVueloInstructor = async (req, res) => {
  try {
    const { id } = req.params;

    // Un reporte ya firmado no se puede seguir editando: el ON CONFLICT de abajo
    // preserva el estado, pero pisaba TAC/horas_cobradas — desincronizando la
    // vouchera del cargo que ya se calculó con los valores viejos. La UI ya lo
    // impide (el modal queda en solo-lectura al pasar a PENDIENTE_ALUMNO), pero
    // el endpoint lo permitía. Acá alcanza un chequeo simple: este handler no
    // abre transacción ni cobra, así que no hay nada que serializar como en
    // firmarReporteVuelo (que además necesita advisory lock por el cobro).
    const yaFirmado = await db.query(
      `SELECT estado FROM reporte_vuelo WHERE id_vuelo = $1`, [id]
    );
    if (["PENDIENTE_ALUMNO", "COMPLETADO"].includes(yaFirmado.rows[0]?.estado)) {
      return res.status(409).json({ message: "Este reporte ya fue firmado y no se puede seguir editando." });
    }

    const {
      tipo_vuelo, tacometro_salida, tacometro_llegada,
      hobbs_salida, hobbs_llegada, combustible_salida,
      combustible_llegada, cantidad_combustible, horas_cobradas,
      es_inasistencia, motivo_inasistencia,
      regreso_emergencia, motivo_emergencia, detalle_emergencia,
    } = req.body;

    const esInasistencia = es_inasistencia === true || es_inasistencia === 'true';
    const esEmergencia = regreso_emergencia === true || regreso_emergencia === 'true';

    // Los dos estados se contradicen a nivel de datos (inasistencia ⇒ TAC en NULL
    // porque el avión nunca se movió; emergencia ⇒ TAC lleno porque salió y volvió).
    // Se rechaza también acá, no solo al firmar: un borrador contradictorio se podía
    // guardar y después bloqueaba la firma hasta limpiar uno de los dos.
    if (esEmergencia && esInasistencia) {
      return res.status(400).json({ message: "Un vuelo no puede ser inasistencia y regreso por emergencia a la vez." });
    }

    // A diferencia de firmarReporteVuelo, acá el motivo NO es obligatorio: un
    // borrador es un formulario a medio llenar y exigirlo impediría guardar. Pero
    // si viene con un valor, tiene que ser uno de los del CHECK — si no, el INSERT
    // revienta con un error críptico de constraint en vez de un 400 legible.
    if (esEmergencia && motivo_emergencia && !MOTIVOS_EMERGENCIA.includes(motivo_emergencia)) {
      return res.status(400).json({ message: "El motivo del regreso por emergencia debe ser Clima, Falla mecánica u Otro." });
    }

    // Validar rangos numéricos solo si NO es inasistencia
    if (!esInasistencia) {
      const fieldsToValidate = [tacometro_salida, tacometro_llegada, hobbs_salida, hobbs_llegada, combustible_salida, combustible_llegada, cantidad_combustible, horas_cobradas];
      if (fieldsToValidate.some(v => v && (isNaN(v) || parseFloat(v) < 0))) {
        return res.status(400).json({ message: "Los valores numéricos deben ser números válidos." });
      }
    }

    const result = await db.query(
      `INSERT INTO reporte_vuelo (
         id_vuelo, tipo_vuelo, tacometro_salida, tacometro_llegada,
         hobbs_salida, hobbs_llegada, combustible_salida, combustible_llegada,
         cantidad_combustible, horas_cobradas, estado, es_inasistencia, motivo_inasistencia,
         regreso_emergencia, motivo_emergencia, detalle_emergencia
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'BORRADOR',$11,$12,$13,$14,$15)
       ON CONFLICT (id_vuelo) DO UPDATE SET
         tipo_vuelo=EXCLUDED.tipo_vuelo,
         tacometro_salida=EXCLUDED.tacometro_salida,
         tacometro_llegada=EXCLUDED.tacometro_llegada,
         hobbs_salida=EXCLUDED.hobbs_salida,
         hobbs_llegada=EXCLUDED.hobbs_llegada,
         combustible_salida=EXCLUDED.combustible_salida,
         combustible_llegada=EXCLUDED.combustible_llegada,
         cantidad_combustible=EXCLUDED.cantidad_combustible,
         horas_cobradas=EXCLUDED.horas_cobradas,
         es_inasistencia=EXCLUDED.es_inasistencia,
         motivo_inasistencia=EXCLUDED.motivo_inasistencia,
         regreso_emergencia=EXCLUDED.regreso_emergencia,
         motivo_emergencia=EXCLUDED.motivo_emergencia,
         detalle_emergencia=EXCLUDED.detalle_emergencia,
         estado = CASE WHEN reporte_vuelo.estado IN ('PENDIENTE_ALUMNO', 'COMPLETADO')
                       THEN reporte_vuelo.estado ELSE 'BORRADOR' END,
         actualizado_en=NOW()
       RETURNING *`,
      [id, esInasistencia ? null : blankToNull(tipo_vuelo),
       esInasistencia ? null : blankToNull(tacometro_salida),
       esInasistencia ? null : blankToNull(tacometro_llegada),
       esInasistencia ? null : blankToNull(hobbs_salida),
       esInasistencia ? null : blankToNull(hobbs_llegada),
       esInasistencia ? null : blankToNull(combustible_salida),
       esInasistencia ? null : blankToNull(combustible_llegada),
       esInasistencia ? null : blankToNull(cantidad_combustible),
       // Mismo criterio que al firmar: en un regreso por emergencia no hay horas
       // que cobrar, así que el borrador tampoco las conserva.
       (esInasistencia || esEmergencia) ? null : blankToNull(horas_cobradas),
       esInasistencia,
       blankToNull(motivo_inasistencia),
       esEmergencia,
       esEmergencia ? blankToNull(motivo_emergencia) : null,
       esEmergencia ? blankToNull(detalle_emergencia) : null]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Error guardarReporteVueloInstructor:', e);
    res.status(500).json({ message: 'Error al guardar reporte de vuelo' });
  }
};

exports.firmarReporteVuelo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firma_instructor, archivo_pdf,
      tipo_vuelo, tacometro_salida, tacometro_llegada,
      hobbs_salida, hobbs_llegada, combustible_salida,
      combustible_llegada, cantidad_combustible, horas_cobradas,
      es_inasistencia, motivo_inasistencia,
      regreso_emergencia, motivo_emergencia, detalle_emergencia,
    } = req.body;
    if (!firma_instructor) {
      return res.status(400).json({ message: 'Se requiere firma_instructor' });
    }

    const esInasistencia = es_inasistencia === true || es_inasistencia === 'true';
    const esEmergencia = regreso_emergencia === true || regreso_emergencia === 'true';

    // Simulador: sesión sin aeronave física — se factura por horas_cobradas
    // (independiente del Hobbs) en vez del diferencial de tacómetro.
    const aeroTipoRes = await db.query(
      `SELECT a.tipo, a.id_aeronave FROM vuelo v JOIN aeronave a ON a.id_aeronave = v.id_aeronave WHERE v.id_vuelo = $1`,
      [id]
    );
    const esSimulador = aeroTipoRes.rows[0]?.tipo === 'SIMULADOR';
    const idAeronaveVuelo = aeroTipoRes.rows[0]?.id_aeronave || null;

    // Regreso por emergencia: el avión salió del hangar y se regresó sin llegar a
    // hacer el vuelo (mal clima, falla mecánica). El TAC sigue siendo obligatorio
    // —el motor corrió y de ahí sale el mantenimiento 50/100h— pero no se le cobra
    // al alumno ni se le acreditan horas de licencia, así que horas_cobradas se
    // fuerza a NULL más abajo. Va ANTES del bloque de !esInasistencia a propósito:
    // un simulador marcado como emergencia debe leer este mensaje y no el genérico
    // "ingresá las horas a cobrar de la sesión de simulador".
    if (esEmergencia) {
      // Mutuamente excluyentes: o el alumno no llegó (inasistencia, TAC en NULL
      // porque el avión nunca se movió), o el avión salió y se regresó (emergencia,
      // TAC lleno). Las dos juntas dan una fila contradictoria, y como este bloque
      // corre primero, un `regreso_emergencia` viejo pegado a una inasistencia
      // devolvía el desconcertante "Elegí el motivo del regreso por emergencia".
      if (esInasistencia) {
        return res.status(400).json({ message: "Un vuelo no puede ser inasistencia y regreso por emergencia a la vez." });
      }
      if (esSimulador) {
        return res.status(400).json({ message: "El regreso por emergencia solo aplica a aeronaves reales, no a simuladores." });
      }
      if (!motivo_emergencia) {
        return res.status(400).json({ message: "Elegí el motivo del regreso por emergencia." });
      }
      if (!MOTIVOS_EMERGENCIA.includes(motivo_emergencia)) {
        return res.status(400).json({ message: "El motivo del regreso por emergencia debe ser Clima, Falla mecánica u Otro." });
      }
    }

    // Validar rangos numéricos / campos requeridos solo si NO es inasistencia
    if (!esInasistencia) {
      if (esSimulador) {
        if (!horas_cobradas || isNaN(horas_cobradas) || parseFloat(horas_cobradas) <= 0) {
          return res.status(400).json({ message: "Ingresá las horas a cobrar de la sesión de simulador." });
        }
      } else {
        if (!tipo_vuelo) {
          return res.status(400).json({ message: "Elegí el tipo de vuelo antes de firmar." });
        }
      }
      const fieldsToValidate = [tacometro_salida, tacometro_llegada, hobbs_salida, hobbs_llegada, combustible_salida, combustible_llegada, cantidad_combustible, horas_cobradas];
      if (fieldsToValidate.some(v => v && (isNaN(v) || parseFloat(v) < 0))) {
        return res.status(400).json({ message: "Los valores numéricos deben ser números válidos." });
      }
      // Horas a cobrar: aplica a TODA aeronave, no solo al simulador — es el campo
      // que multiplica plata (horas x tarifa) y el que le suma horas de licencia al
      // alumno. El tope de 24 es la misma red que la del tacómetro: ataja el punto
      // decimal olvidado, que acá costaría 10 veces de más y en silencio. Además la
      // columna es NUMERIC(5,2): arriba de 999.99 reventaría con overflow críptico.
      // En un regreso por emergencia no se valida porque no se guarda: el campo se
      // fuerza a NULL (no hay nada que cobrar), y si el cliente manda un residuo
      // del formulario —un 0, típicamente— rechazarlo sería un 400 sin sentido.
      if (blankToNull(horas_cobradas) != null && !esEmergencia) {
        const h = parseFloat(horas_cobradas);
        if (isNaN(h) || h <= 0) {
          return res.status(400).json({ message: "Las horas a cobrar deben ser un número mayor que 0." });
        }
        if (h > 24) {
          return res.status(400).json({ message: "Las horas a cobrar son mayores a 24 — ¿te faltó el punto decimal?" });
        }
      }

      // Tacómetro: red contra el punto decimal corrido. El tach físico puede
      // pasar de 10,000h y el instrumento muestra solo 4 dígitos ("0374.06");
      // si se omite el cero inicial y se corre el punto ("3740.6"), el delta se
      // multiplica x10: el avión "vuela" horas que no existen (infla el
      // mantenimiento 50/100h) y, si horas_cobradas viene vacío, el cobro cae
      // al fallback del TAC y se le debita de más al alumno. Caso real: YS-334-PE
      // acumuló +6.9h por una vouchera con 3727.7→3734.6 (era 0372.77→0373.46).
      if (!esSimulador && blankToNull(tacometro_salida) != null && blankToNull(tacometro_llegada) != null) {
        const tacS = parseFloat(tacometro_salida);
        const tacL = parseFloat(tacometro_llegada);
        const deltaTac = tacL - tacS;
        if (deltaTac < 0) {
          return res.status(400).json({ message: "El tacómetro de llegada es menor que el de salida — revisá las lecturas." });
        }
        if (deltaTac > 8) {
          return res.status(400).json({ message: `La diferencia de tacómetro da ${deltaTac.toFixed(2)} h de vuelo — revisá el punto decimal: copiá la lectura tal cual la muestra el instrumento, cero inicial incluido (ej. 0374.06).` });
        }
        // Continuidad: la salida debe empatar (±2h) con la última llegada
        // registrada del mismo avión. Si la vouchera ANTERIOR es la que quedó
        // mal digitada, este chequeo daría falso positivo — por eso se puede
        // confirmar (confirmar_tac=true) en vez de bloquear duro: un typo ya
        // firmado no traba la cadena de las voucheras siguientes.
        if (idAeronaveVuelo) {
          const prevTac = await db.query(`
            SELECT rv.tacometro_llegada
              FROM reporte_vuelo rv
              JOIN vuelo v2 ON v2.id_vuelo = rv.id_vuelo
              LEFT JOIN bloque_horario b ON b.id_bloque = v2.id_bloque
             WHERE v2.id_aeronave = $1 AND v2.id_vuelo <> $2::int
               AND rv.estado IN ('PENDIENTE_ALUMNO', 'COMPLETADO')
               AND rv.tacometro_llegada IS NOT NULL
             ORDER BY v2.fecha_vuelo DESC, b.hora_inicio DESC NULLS LAST
             LIMIT 1
          `, [idAeronaveVuelo, id]);
          const ultimaLlegada = prevTac.rows.length ? parseFloat(prevTac.rows[0].tacometro_llegada) : null;
          if (ultimaLlegada !== null && Math.abs(tacS - ultimaLlegada) > 2 && req.body.confirmar_tac !== true) {
            return res.status(409).json({
              code: "TAC_DISCONTINUO",
              message: `El tacómetro de salida (${tacS}) no empata con la última llegada registrada de este avión (${ultimaLlegada}). Verificá la lectura contra el instrumento — si de verdad es correcta, confirmá para firmar igual.`,
            });
          }
        }
      }
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // La UI ya impide re-firmar (el modal queda en solo-lectura al pasar a
      // PENDIENTE_ALUMNO), pero el endpoint lo permitía por el ON CONFLICT DO UPDATE —
      // y ni el cobro ni actualizarHorasAeronave son idempotentes, así que una segunda
      // llamada cobraba dos veces y le sumaba al avión las horas otra vez.
      //
      // No alcanza con un FOR UPDATE sobre reporte_vuelo: esa fila puede NO existir
      // todavía (handleFirmarInstructor, en ReporteVueloModal, firma sin pasar por
      // "Guardar borrador", que es un botón aparte) y FOR UPDATE no bloquea filas
      // inexistentes — dos requests concurrentes leerían ambas 0 filas, ambas
      // pasarían el guard y ambas cobrarían.
      //
      // Tampoco se lockea la fila de `vuelo`: eso invertiría el orden de locks
      // respecto de turnoMantenimientoController.iniciarMantenimientoImprevisto, que
      // toma aeronave (FOR UPDATE) y después actualiza vuelo, mientras que acá el
      // orden natural es aeronave (dentro de actualizarHorasAeronave) → vuelo. Orden
      // inverso sobre el mismo par = deadlock (40P01), y justo en el caso de uso de
      // esta feature: el avión vuelve por falla mecánica, el instructor cierra el
      // vuelo y Turno lo manda a mantenimiento al mismo tiempo.
      //
      // El advisory lock serializa por id_vuelo sin entrar en el grafo de locks de
      // vuelo/aeronave, y se libera solo al terminar la transacción.
      await client.query(`SELECT pg_advisory_xact_lock(4711, $1::int)`, [id]);
      const yaFirmado = await client.query(
        `SELECT estado FROM reporte_vuelo WHERE id_vuelo = $1`, [id]
      );
      if (["PENDIENTE_ALUMNO", "COMPLETADO"].includes(yaFirmado.rows[0]?.estado)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Este reporte ya fue firmado y no se puede volver a firmar." });
      }

      // Snapshot de horas_acumuladas del alumno ANTES de tocar nada en esta
      // transacción. Más abajo, si el vuelo suma horas de licencia, se
      // incrementa alumno.horas_acumuladas — pero el H.T. que se imprime en el
      // extracto (movimiento_cuenta.horas_totales) se calcula SIEMPRE como
      // "esta base + las horas de esta vouchera" una sola vez, sin importar en
      // qué orden corran las cosas más abajo (ver cargarVueloACuentaDentroTx).
      let horasAcumuladasAntes = null;
      if (!esInasistencia) {
        const alumnoSnap = await client.query(
          `SELECT al.horas_acumuladas FROM vuelo v LEFT JOIN alumno al ON al.id_alumno = v.id_alumno WHERE v.id_vuelo = $1`,
          [id]
        );
        horasAcumuladasAntes = Number(alumnoSnap.rows[0]?.horas_acumuladas || 0);
      }

      // Validar checklist solo si NO es inasistencia y NO es simulador (el
      // checklist post-vuelo es de aeronave física — frenos, hélice, etc.).
      if (!esInasistencia && !esSimulador) {
        const checklistRes = await client.query(
          'SELECT id_vuelo FROM checklist_postvuelo WHERE id_vuelo = $1',
          [id]
        );
        if (checklistRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: 'Debe completar el checklist post-vuelo primero antes de firmar el reporte' });
        }
      }

      const result = await client.query(
        `INSERT INTO reporte_vuelo (
           id_vuelo, tipo_vuelo, tacometro_salida, tacometro_llegada,
           hobbs_salida, hobbs_llegada, combustible_salida, combustible_llegada,
           cantidad_combustible, horas_cobradas, firma_instructor, archivo_pdf, estado, es_inasistencia, motivo_inasistencia,
           regreso_emergencia, motivo_emergencia, detalle_emergencia
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDIENTE_ALUMNO',$13,$14,$15,$16,$17)
         ON CONFLICT (id_vuelo) DO UPDATE SET
           tipo_vuelo=EXCLUDED.tipo_vuelo,
           tacometro_salida=EXCLUDED.tacometro_salida,
           tacometro_llegada=EXCLUDED.tacometro_llegada,
           hobbs_salida=EXCLUDED.hobbs_salida,
           hobbs_llegada=EXCLUDED.hobbs_llegada,
           combustible_salida=EXCLUDED.combustible_salida,
           combustible_llegada=EXCLUDED.combustible_llegada,
           cantidad_combustible=EXCLUDED.cantidad_combustible,
           horas_cobradas=EXCLUDED.horas_cobradas,
           firma_instructor=EXCLUDED.firma_instructor,
           archivo_pdf=EXCLUDED.archivo_pdf,
           es_inasistencia=EXCLUDED.es_inasistencia,
           motivo_inasistencia=EXCLUDED.motivo_inasistencia,
           regreso_emergencia=EXCLUDED.regreso_emergencia,
           motivo_emergencia=EXCLUDED.motivo_emergencia,
           detalle_emergencia=EXCLUDED.detalle_emergencia,
           estado='PENDIENTE_ALUMNO',
           actualizado_en=NOW()
         RETURNING *`,
        [id,
         (esInasistencia || esSimulador) ? null : blankToNull(tipo_vuelo),
         (esInasistencia || esSimulador) ? null : blankToNull(tacometro_salida),
         (esInasistencia || esSimulador) ? null : blankToNull(tacometro_llegada),
         esInasistencia ? null : blankToNull(hobbs_salida),
         esInasistencia ? null : blankToNull(hobbs_llegada),
         esInasistencia ? null : blankToNull(combustible_salida),
         esInasistencia ? null : blankToNull(combustible_llegada),
         esInasistencia ? null : blankToNull(cantidad_combustible),
         // En un regreso por emergencia no hay horas que cobrar: se guarda NULL para
         // que ningún consumidor posterior (cobro, bitácora, nómina) las levante.
         (esInasistencia || esEmergencia) ? null : blankToNull(horas_cobradas),
         firma_instructor, blankToNull(archivo_pdf), esInasistencia, blankToNull(motivo_inasistencia),
         esEmergencia,
         esEmergencia ? blankToNull(motivo_emergencia) : null,
         esEmergencia ? blankToNull(detalle_emergencia) : null]
      );

      // --- Lógica de Mantenimiento por TAC (no aplica a simuladores: no
      // tienen motor/hélice que desgastar ni horas de licencia por Tacómetro;
      // su cargo se factura más abajo directo por horas_cobradas) ---
      if (!esInasistencia && !esSimulador) {
        const tacSalida = parseFloat(tacometro_salida);
        const tacLlegada = parseFloat(tacometro_llegada);
        const diff = tacLlegada - tacSalida;

        if (isNaN(diff) || diff <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "El Tacómetro de llegada debe ser mayor al de salida." });
        }
        // Tope de cordura: ningún vuelo dura más de 24h. Sin este chequeo, un
        // error de tipeo en salida/llegada genera un "diff" enorme que revienta
        // horas_vuelo_aeronave.horas_voladas (NUMERIC(5,2), máx 999.99) con un
        // "numeric field overflow" críptico en vez de un mensaje claro.
        if (diff > 24) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "La diferencia entre Tacómetro salida y llegada es mayor a 24 horas — revisá los valores." });
        }

        // Obtener datos del vuelo
        const vueloRes = await client.query(
          "SELECT id_aeronave, id_alumno, es_extracurricular, categoria FROM vuelo WHERE id_vuelo = $1",
          [id]
        );
        const id_aeronave = vueloRes.rows[0].id_aeronave;
        const categoriaVuelo = vueloRes.rows[0].categoria || "NORMAL";
        // NORMAL y CHEQUEO cuentan horas de licencia como un vuelo real; DEMO
        // (pasajero externo) y CHEQUEO_LINEA (ficha espejo del practicante) no.
        const sumaHorasLicencia = categoriaVuelo === "NORMAL" || categoriaVuelo === "CHEQUEO";

        // Actualizar horas acumuladas de la aeronave y disparar mantenimiento/alertas.
        // SIEMPRE se registran (todas las categorías gastan motor/mantenimiento).
        const io = req.app.get("io");
        await actualizarHorasAeronave(client, id, id_aeronave, diff, io);

        // Horas de licencia del ALUMNO: siguen a las horas COBRADAS, no al TAC
        // (decisión de Daniel, 2026-07-16): al alumno se le acredita exactamente lo
        // que se le cobra. Si el instructor no digitó horas (reportes viejos), se cae
        // al TAC, que era el comportamiento anterior.
        // NO suman en vuelos extracurriculares, DEMO ni CHEQUEO_LINEA — ni en un
        // regreso por emergencia: el avión ya sumó su TAC unas líneas arriba (el
        // motor corrió), pero el alumno no voló, así que no se le acredita nada.
        const horasCobradas = blankToNull(horas_cobradas) != null ? parseFloat(horas_cobradas) : diff;
        const id_alumno = vueloRes.rows[0].id_alumno;
        if (sumaHorasLicencia && !esEmergencia && !vueloRes.rows[0].es_extracurricular && id_alumno) {
          await client.query(
            `UPDATE alumno SET horas_acumuladas = horas_acumuladas + $1 WHERE id_alumno = $2`,
            [horasCobradas, id_alumno]
          );
        }
      }

      // Avanzar el estado del vuelo a COMPLETADO
      await client.query(
        "UPDATE vuelo SET estado = 'COMPLETADO' WHERE id_vuelo = $1",
        [id]
      );

      const ts = await client.query(
        `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
         VALUES ($1, 'COMPLETADO', (SELECT id_usuario FROM instructor WHERE id_usuario = (SELECT id_usuario FROM instructor WHERE id_usuario = $2 LIMIT 1) LIMIT 1))
         RETURNING (registrado_en AT TIME ZONE 'America/El_Salvador') AS registrado_en`,
        [id, req.user.id_usuario]
      );

      // --- Cargo automático a cuenta corriente (Módulo Administración) ---
      // Solo si NO es inasistencia, NO es regreso por emergencia (salió del hangar
      // pero no voló: no se le cobra), y el módulo está migrado. Saltear este
      // bloque también evita el avance de curso, que vive adentro de
      // cargarVueloACuentaDentroTx.
      let cargoAutomatico = null;
      if (!esInasistencia && !esEmergencia) {
        try {
          const { cargarVueloACuentaDentroTx } = require("../administracion/facturasController");
          // Lo que se cobra son las horas que digitó el instructor — en TODA aeronave,
          // no solo el simulador: al cobrar se hacen estimaciones que no coinciden con
          // el tacómetro. Si el campo no viene (reportes viejos, clientes que todavía
          // no lo mandan) se cae al Tacómetro, que es como funcionaba antes, así que
          // ningún vuelo queda sin cobrar. En simulador no hay TAC del cual caer, y por
          // eso ahí horas_cobradas es obligatorio.
          const tacDiff = blankToNull(horas_cobradas) != null
            ? parseFloat(horas_cobradas)
            : parseFloat(tacometro_llegada) - parseFloat(tacometro_salida);
          const vueloInfo = await client.query(`
            SELECT v.id_vuelo, v.id_alumno, v.id_aeronave, v.fecha_vuelo AS fecha,
                   v.es_extracurricular, v.categoria, v.tipo_instruccion, v.debitar_saldo,
                   COALESCE(a.modelo, a.tipo, 'Cessna 152') AS modelo_aeronave
            FROM vuelo v
            LEFT JOIN aeronave a ON a.id_aeronave = v.id_aeronave
            WHERE v.id_vuelo = $1
          `, [id]);
          // DEMO (pasajero externo, se factura manual), PRUEBA (vuelo interno
          // sin pasajero, nunca se factura) y CHEQUEO_LINEA (instructor-con-
          // instructor: CHEQUEO lo paga la escuela, REFRESH sin debitar_saldo
          // se cobra manual desde administración) NO se auto-debitan. NORMAL y
          // CHEQUEO (alumno real) sí, igual que siempre.
          const infoV = vueloInfo.rows[0] || {};
          const categoriaVuelo = infoV.categoria || "NORMAL";
          // Excepción nueva (spec 2026-07-22): un CHEQUEO_LINEA sub-tipo REFRESH
          // donde el practicante eligió "debitar de mi saldo" SÍ se auto-cobra
          // (si el saldo aún cubre — cargarVuelo lo revalida con la cuenta
          // lockeada). El resto de CHEQUEO_LINEA + DEMO + PRUEBA siguen sin
          // cobro automático.
          const esRefreshDebitable = categoriaVuelo === "CHEQUEO_LINEA"
            && infoV.tipo_instruccion === "REFRESH"
            && infoV.debitar_saldo === true;
          const sinCobroAutomatico = (categoriaVuelo === "DEMO" || categoriaVuelo === "PRUEBA" || categoriaVuelo === "CHEQUEO_LINEA") && !esRefreshDebitable;
          if (!sinCobroAutomatico && vueloInfo.rows.length > 0 && vueloInfo.rows[0].id_alumno) {
            const info = vueloInfo.rows[0];
            cargoAutomatico = await cargarVueloACuentaDentroTx(client, {
              id_vuelo: info.id_vuelo,
              id_alumno: info.id_alumno,
              id_aeronave: info.id_aeronave,
              tacometro: tacDiff,
              modelo_aeronave: info.modelo_aeronave,
              fecha: info.fecha,
              emitida_por: req.user.id_usuario,
              es_extracurricular: info.es_extracurricular,
              horas_acumuladas_antes: horasAcumuladasAntes,
              modo_refresh: esRefreshDebitable,
              solo_si_saldo_cubre: esRefreshDebitable
            });
            if (cargoAutomatico?.skipped) {
              console.warn(`[refresh] vuelo ${info.id_vuelo}: saldo dejó de cubrir ($${cargoAutomatico.saldo} < $${cargoAutomatico.total}) — queda como pago al momento`);
              // El débito no ocurrió → el vuelo deja de decir "debita de saldo":
              // así calendario y vouchera reflejan la realidad (pago al momento)
              // y administración sabe que tiene que cobrarlo a mano.
              cargoAutomatico = null;
              await client.query(`UPDATE vuelo SET debitar_saldo = false WHERE id_vuelo = $1`, [info.id_vuelo]);
            }
          }
        } catch (eFin) {
          // No abortar el cierre del vuelo si el módulo financiero falla;
          // se loguea y se podrá generar la factura manualmente luego.
          console.warn("[admin] cargo automático falló:", eFin.message);
        }
      }

      await client.query("COMMIT");

      const io = req.app.get("io");
      if (io) {
        io.emit("vuelo_estado_changed", {
          id_vuelo: Number(id),
          estado: 'COMPLETADO',
          registrado_en: ts.rows[0].registrado_en
        });
        if (cargoAutomatico) {
          io.emit("cuenta_alumno_movimiento", {
            id_alumno: cargoAutomatico.id_alumno,
            saldo: cargoAutomatico.saldo_resultante
          });
        }
      }

      res.json({ ...result.rows[0], cargo_automatico: cargoAutomatico });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error firmarReporteVuelo:', e);
    res.status(500).json({ message: 'Error al firmar reporte de vuelo' });
  }
};

// Corrige una vouchera YA firmada (PENDIENTE_ALUMNO) mientras el alumno todavía
// no la firmó — para cuando el instructor se equivocó al llenarla. Deliberadamente
// más angosto que firmarReporteVuelo: no permite tocar es_inasistencia ni
// regreso_emergencia (cambiar la naturaleza del reporte reabriría toda la lógica
// de ramas de firmarReporteVuelo) ni la firma. Solo corrige los valores de un
// vuelo normal ya firmado, recalculando por DELTA los 3 efectos secundarios
// (horas de aeronave, horas de licencia del alumno, cargo en cuenta corriente)
// en vez de revertir todo y reaplicar — así una vouchera ya cobrada no se
// "des-cobra" nunca, ni siquiera en un rollback tardío.
exports.editarReporteVueloFirmado = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tipo_vuelo, tacometro_salida, tacometro_llegada,
      hobbs_salida, hobbs_llegada, combustible_salida,
      combustible_llegada, cantidad_combustible, horas_cobradas,
      motivo_edicion,
    } = req.body;

    if (!motivo_edicion || !motivo_edicion.trim() || motivo_edicion.trim().length < 3) {
      return res.status(400).json({ message: "Contá qué se corrigió (mínimo 3 caracteres) — queda en el historial de la vouchera." });
    }

    const aeroTipoRes = await db.query(
      `SELECT a.tipo FROM vuelo v JOIN aeronave a ON a.id_aeronave = v.id_aeronave WHERE v.id_vuelo = $1`,
      [id]
    );
    if (aeroTipoRes.rows.length === 0) return res.status(404).json({ message: "Vuelo no encontrado" });
    const esSimulador = aeroTipoRes.rows[0].tipo === "SIMULADOR";

    // Mismas validaciones de forma que firmarReporteVuelo (sin las ramas de
    // inasistencia/emergencia: esta vía no las toca).
    if (esSimulador) {
      if (!horas_cobradas || isNaN(horas_cobradas) || parseFloat(horas_cobradas) <= 0) {
        return res.status(400).json({ message: "Ingresá las horas a cobrar de la sesión de simulador." });
      }
    } else {
      if (!tipo_vuelo) {
        return res.status(400).json({ message: "Elegí el tipo de vuelo." });
      }
    }
    const fieldsToValidate = [tacometro_salida, tacometro_llegada, hobbs_salida, hobbs_llegada, combustible_salida, combustible_llegada, cantidad_combustible, horas_cobradas];
    if (fieldsToValidate.some(v => v && (isNaN(v) || parseFloat(v) < 0))) {
      return res.status(400).json({ message: "Los valores numéricos deben ser números válidos." });
    }
    if (blankToNull(horas_cobradas) != null) {
      const h = parseFloat(horas_cobradas);
      if (isNaN(h) || h <= 0) {
        return res.status(400).json({ message: "Las horas a cobrar deben ser un número mayor que 0." });
      }
      if (h > 24) {
        return res.status(400).json({ message: "Las horas a cobrar son mayores a 24 — ¿te faltó el punto decimal?" });
      }
    }
    let nuevoDiff = null;
    if (!esSimulador) {
      nuevoDiff = parseFloat(tacometro_llegada) - parseFloat(tacometro_salida);
      if (isNaN(nuevoDiff) || nuevoDiff <= 0) {
        return res.status(400).json({ message: "El Tacómetro de llegada debe ser mayor al de salida." });
      }
      if (nuevoDiff > 8) {
        return res.status(400).json({ message: `La diferencia de tacómetro da ${nuevoDiff.toFixed(2)} h de vuelo — revisá el punto decimal: copiá la lectura tal cual la muestra el instrumento, cero inicial incluido (ej. 0374.06).` });
      }
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Mismo advisory lock que firmarReporteVuelo (keyed por id_vuelo): serializa
      // contra una firma/edición concurrente sin entrar al grafo de locks de
      // aeronave/vuelo (ver comentario largo en firmarReporteVuelo).
      await client.query(`SELECT pg_advisory_xact_lock(4711, $1::int)`, [id]);

      const reporteRes = await client.query(`SELECT * FROM reporte_vuelo WHERE id_vuelo = $1 FOR UPDATE`, [id]);
      const reporte = reporteRes.rows[0];
      if (!reporte) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Este vuelo todavía no tiene una vouchera firmada." });
      }
      if (reporte.estado === "COMPLETADO") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "El alumno ya firmó esta vouchera — ya no se puede editar." });
      }
      if (reporte.estado !== "PENDIENTE_ALUMNO") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Esta vouchera todavía no está firmada — usá 'Guardar borrador'." });
      }
      if (reporte.es_inasistencia || reporte.regreso_emergencia) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Esta vouchera es de inasistencia o regreso por emergencia — no se puede corregir desde acá." });
      }

      const vueloRes = await client.query(
        `SELECT id_aeronave, id_alumno, es_extracurricular, categoria FROM vuelo WHERE id_vuelo = $1`,
        [id]
      );
      const vuelo = vueloRes.rows[0];
      const categoriaVuelo = vuelo.categoria || "NORMAL";
      const sumaHorasLicencia = categoriaVuelo === "NORMAL" || categoriaVuelo === "CHEQUEO";

      // --- Corregir horas de la aeronave por DELTA (no aplica a simulador) ---
      if (!esSimulador) {
        const viejoDiff = parseFloat(reporte.tacometro_llegada) - parseFloat(reporte.tacometro_salida);
        if (!isNaN(viejoDiff) && nuevoDiff !== viejoDiff) {
          // Revierte el efecto viejo con un ajuste directo (sin alertas ni fila de
          // histórico — el forward de abajo reconstruye el histórico correcto) y
          // reaplica con actualizarHorasAeronave para pasar por el mismo camino
          // que al firmar: umbrales 50/100h, alertas, fila de horas_vuelo_aeronave.
          // Nota: si el valor VIEJO (incorrecto) ya había cruzado un umbral de
          // mantenimiento y la corrección lo baja de nuevo, la alerta ya disparada
          // no se retira sola — se cancela a mano desde Mantenimiento si aplica
          // (caso raro: una corrección de TAC que cruce 50/100h).
          await client.query(`SELECT 1 FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`, [vuelo.id_aeronave]);
          await client.query(`UPDATE aeronave SET horas_acumuladas = horas_acumuladas - $1 WHERE id_aeronave = $2`, [viejoDiff, vuelo.id_aeronave]);
          await client.query(`DELETE FROM horas_vuelo_aeronave WHERE id_vuelo = $1`, [id]);
          const io = req.app.get("io");
          await actualizarHorasAeronave(client, id, vuelo.id_aeronave, nuevoDiff, io);
        }
      }

      // --- Corregir horas de licencia del alumno por DELTA ---
      const horasCobradasNuevas = blankToNull(horas_cobradas) != null ? parseFloat(horas_cobradas) : nuevoDiff;
      const viejoDiffAlumno = !isNaN(parseFloat(reporte.tacometro_llegada) - parseFloat(reporte.tacometro_salida))
        ? parseFloat(reporte.tacometro_llegada) - parseFloat(reporte.tacometro_salida) : null;
      const horasCobradasViejas = blankToNull(reporte.horas_cobradas) != null ? parseFloat(reporte.horas_cobradas) : viejoDiffAlumno;
      const deltaHorasCobradas = (horasCobradasNuevas != null && horasCobradasViejas != null) ? horasCobradasNuevas - horasCobradasViejas : 0;
      if (sumaHorasLicencia && !vuelo.es_extracurricular && vuelo.id_alumno && deltaHorasCobradas !== 0) {
        await client.query(`UPDATE alumno SET horas_acumuladas = horas_acumuladas + $1 WHERE id_alumno = $2`, [deltaHorasCobradas, vuelo.id_alumno]);
      }

      // --- Corregir el cargo en cuenta corriente (movimiento_cuenta CARGO_VUELO) ---
      // Mismo patrón que cuentaController.editarMovimiento: UPDATE in-place con
      // editado_en/editado_por/motivo_edicion + recompute del saldo por SUM total
      // (saldo_actual_usd nunca filtra por `anulado`, así que un ajuste in-place es
      // el único camino consistente — ver nota histórica de la sesión).
      if (deltaHorasCobradas !== 0) {
        const movRes = await client.query(
          `SELECT * FROM movimiento_cuenta WHERE id_vuelo = $1 AND tipo = 'CARGO_VUELO' AND COALESCE(anulado,false) = false FOR UPDATE`,
          [id]
        );
        if (movRes.rows.length > 0) {
          const mov = movRes.rows[0];
          const horasMovViejas = Number(mov.horas_vuelo);
          // Tarifa efectiva derivada del cargo YA hecho (no se re-consulta la tabla
          // de tarifas): así una corrección de horas no queda expuesta a que la
          // tarifa vigente haya cambiado entre firmar y corregir.
          const tarifaEfectiva = horasMovViejas > 0 ? Math.abs(Number(mov.monto_usd)) / horasMovViejas : 0;
          if (tarifaEfectiva > 0) {
            const nuevoTotal = +(tarifaEfectiva * horasCobradasNuevas).toFixed(2);
            const nuevoMonto = -nuevoTotal;
            const diffMonto = nuevoMonto - Number(mov.monto_usd);
            await client.query(`
              UPDATE movimiento_cuenta SET
                monto_usd = $2, horas_vuelo = $3,
                editado_en = NOW(), editado_por = $4, motivo_edicion = $5
              WHERE id = $1
            `, [mov.id, nuevoMonto, horasCobradasNuevas, req.user.id_usuario, `Corrección de vouchera: ${motivo_edicion.trim()}`]);
            if (diffMonto !== 0) {
              await client.query(`
                UPDATE cuenta_corriente_alumno
                SET saldo_actual_usd = (SELECT COALESCE(SUM(monto_usd), 0) FROM movimiento_cuenta WHERE id_alumno = $1),
                    ultimo_movimiento_en = NOW()
                WHERE id_alumno = $1
              `, [mov.id_alumno]);
            }
          }
        }
      }

      // --- Actualizar la vouchera misma ---
      const result = await client.query(
        `UPDATE reporte_vuelo SET
           tipo_vuelo = $2, tacometro_salida = $3, tacometro_llegada = $4,
           hobbs_salida = $5, hobbs_llegada = $6, combustible_salida = $7,
           combustible_llegada = $8, cantidad_combustible = $9, horas_cobradas = $10,
           actualizado_en = NOW(), editado_en = NOW(), editado_por = $11, motivo_edicion = $12
         WHERE id_vuelo = $1
         RETURNING *`,
        [id,
         esSimulador ? null : blankToNull(tipo_vuelo),
         esSimulador ? null : blankToNull(tacometro_salida),
         esSimulador ? null : blankToNull(tacometro_llegada),
         blankToNull(hobbs_salida), blankToNull(hobbs_llegada),
         blankToNull(combustible_salida), blankToNull(combustible_llegada),
         blankToNull(cantidad_combustible), blankToNull(horas_cobradas),
         req.user.id_usuario, motivo_edicion.trim()]
      );

      await client.query("COMMIT");

      const io = req.app.get("io");
      if (io && vuelo.id_alumno) {
        io.emit("cuenta_alumno_movimiento", { id_alumno: vuelo.id_alumno });
      }

      res.json(result.rows[0]);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error editarReporteVueloFirmado:', e);
    res.status(500).json({ message: 'Error al corregir el reporte de vuelo' });
  }
};

exports.getChecklistPostvuelo = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM checklist_postvuelo WHERE id_vuelo = $1',
      [id]
    );
    res.json(result.rows[0] ?? null);
  } catch (e) {
    console.error('Error getChecklistPostvuelo:', e);
    res.status(500).json({ message: 'Error al obtener checklist' });
  }
};

exports.guardarChecklistPostvuelo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      freno_parqueo, mezcla_corte, magnetos_off, master_switch_off,
      llaves_removidas, calzos_colocados, fuselaje_sin_danos,
      bordes_ataque_sin_impactos, alerones_libres, tapas_combustible,
      sin_fugas_combustible, llantas_buen_estado, helice_sin_melladuras,
      aceite_en_rango, cowling_asegurado, switches_breakers_off,
      horas_registradas, combustible_anotado, discrepancias_reportadas,
      comentarios, firma_piloto, licencia_numero,
    } = req.body;
    const result = await db.query(
      `INSERT INTO checklist_postvuelo (
         id_vuelo, freno_parqueo, mezcla_corte, magnetos_off, master_switch_off,
         llaves_removidas, calzos_colocados, fuselaje_sin_danos, bordes_ataque_sin_impactos,
         alerones_libres, tapas_combustible, sin_fugas_combustible, llantas_buen_estado,
         helice_sin_melladuras, aceite_en_rango, cowling_asegurado, switches_breakers_off,
         horas_registradas, combustible_anotado, discrepancias_reportadas,
         comentarios, firma_piloto, licencia_numero
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id_vuelo) DO UPDATE SET
         freno_parqueo=EXCLUDED.freno_parqueo,
         mezcla_corte=EXCLUDED.mezcla_corte,
         magnetos_off=EXCLUDED.magnetos_off,
         master_switch_off=EXCLUDED.master_switch_off,
         llaves_removidas=EXCLUDED.llaves_removidas,
         calzos_colocados=EXCLUDED.calzos_colocados,
         fuselaje_sin_danos=EXCLUDED.fuselaje_sin_danos,
         bordes_ataque_sin_impactos=EXCLUDED.bordes_ataque_sin_impactos,
         alerones_libres=EXCLUDED.alerones_libres,
         tapas_combustible=EXCLUDED.tapas_combustible,
         sin_fugas_combustible=EXCLUDED.sin_fugas_combustible,
         llantas_buen_estado=EXCLUDED.llantas_buen_estado,
         helice_sin_melladuras=EXCLUDED.helice_sin_melladuras,
         aceite_en_rango=EXCLUDED.aceite_en_rango,
         cowling_asegurado=EXCLUDED.cowling_asegurado,
         switches_breakers_off=EXCLUDED.switches_breakers_off,
         horas_registradas=EXCLUDED.horas_registradas,
         combustible_anotado=EXCLUDED.combustible_anotado,
         discrepancias_reportadas=EXCLUDED.discrepancias_reportadas,
         comentarios=EXCLUDED.comentarios,
         firma_piloto=EXCLUDED.firma_piloto,
         licencia_numero=EXCLUDED.licencia_numero
       RETURNING *`,
      [
        id,
        freno_parqueo ?? false,
        mezcla_corte ?? false,
        magnetos_off ?? false,
        master_switch_off ?? false,
        llaves_removidas ?? false,
        calzos_colocados ?? false,
        fuselaje_sin_danos ?? false,
        bordes_ataque_sin_impactos ?? false,
        alerones_libres ?? false,
        tapas_combustible ?? false,
        sin_fugas_combustible ?? false,
        llantas_buen_estado ?? false,
        helice_sin_melladuras ?? false,
        aceite_en_rango ?? false,
        cowling_asegurado ?? false,
        switches_breakers_off ?? false,
        horas_registradas ?? false,
        combustible_anotado ?? false,
        discrepancias_reportadas ?? false,
        comentarios ?? null,
        firma_piloto ?? null,
        licencia_numero ?? null,
      ]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Error guardarChecklistPostvuelo:', e);
    res.status(500).json({ message: 'Error al guardar checklist post-vuelo' });
  }
};

exports.eliminarChecklistPostvuelo = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM checklist_postvuelo WHERE id_vuelo = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error eliminarChecklistPostvuelo:', e);
    res.status(500).json({ message: 'Error al eliminar checklist' });
  }
};
