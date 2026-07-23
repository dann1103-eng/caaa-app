const db = require("../../config/db");
const { resolverIdInstructor } = require("../../utils/instructorHelpers");
const { actualizarHorasAeronave } = require("../../utils/aeronaveUtils");

// Los campos numéricos/tipo_vuelo del reporte son opcionales (hobbs y
// combustible no siempre se llevan) — "" no es lo mismo que "sin dato" para
// una columna NUMERIC/CHECK de Postgres ("" revienta con "invalid input
// syntax for type numeric" o viola el CHECK). Normaliza "" -> null.
const blankToNull = (v) => (v === "" || v === undefined ? null : v);

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
    const {
      tipo_vuelo, tacometro_salida, tacometro_llegada,
      hobbs_salida, hobbs_llegada, combustible_salida,
      combustible_llegada, cantidad_combustible, horas_cobradas,
      es_inasistencia, motivo_inasistencia,
    } = req.body;

    const esInasistencia = es_inasistencia === true || es_inasistencia === 'true';

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
         cantidad_combustible, horas_cobradas, estado, es_inasistencia, motivo_inasistencia
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'BORRADOR',$11,$12)
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
       esInasistencia ? null : blankToNull(horas_cobradas),
       esInasistencia,
       blankToNull(motivo_inasistencia)]
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
    } = req.body;
    if (!firma_instructor) {
      return res.status(400).json({ message: 'Se requiere firma_instructor' });
    }

    const esInasistencia = es_inasistencia === true || es_inasistencia === 'true';

    // Simulador: sesión sin aeronave física — se factura por horas_cobradas
    // (independiente del Hobbs) en vez del diferencial de tacómetro.
    const aeroTipoRes = await db.query(
      `SELECT a.tipo FROM vuelo v JOIN aeronave a ON a.id_aeronave = v.id_aeronave WHERE v.id_vuelo = $1`,
      [id]
    );
    const esSimulador = aeroTipoRes.rows[0]?.tipo === 'SIMULADOR';

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
      if (blankToNull(horas_cobradas) != null) {
        const h = parseFloat(horas_cobradas);
        if (isNaN(h) || h <= 0) {
          return res.status(400).json({ message: "Las horas a cobrar deben ser un número mayor que 0." });
        }
        if (h > 24) {
          return res.status(400).json({ message: "Las horas a cobrar son mayores a 24 — ¿te faltó el punto decimal?" });
        }
      }
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

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
           cantidad_combustible, horas_cobradas, firma_instructor, archivo_pdf, estado, es_inasistencia, motivo_inasistencia
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDIENTE_ALUMNO',$13,$14)
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
         esInasistencia ? null : blankToNull(horas_cobradas),
         firma_instructor, blankToNull(archivo_pdf), esInasistencia, blankToNull(motivo_inasistencia)]
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
        // NO suman en vuelos extracurriculares, DEMO ni CHEQUEO_LINEA.
        const horasCobradas = blankToNull(horas_cobradas) != null ? parseFloat(horas_cobradas) : diff;
        const id_alumno = vueloRes.rows[0].id_alumno;
        if (sumaHorasLicencia && !vueloRes.rows[0].es_extracurricular && id_alumno) {
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
      // Solo si NO es inasistencia y el módulo está migrado.
      let cargoAutomatico = null;
      if (!esInasistencia) {
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
