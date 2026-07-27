const db = require("../../config/db");
const { logAuditoria } = require("../../utils/auditoria");

// ── Sección "Voucheras" de Administración ────────────────────────────────────
// Lista las voucheras (reportes post-vuelo) de un día, opcionalmente filtradas
// por aeronave, con TODO lo que el generador de PDF client-side necesita
// (lecturas, horas cobradas, firmas) — así el front puede tanto listar como
// armar el PDF del día completo sin más viajes al servidor.

exports.listAeronaves = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT id_aeronave, codigo, modelo, tipo, activa
      FROM aeronave
      ORDER BY codigo
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    console.error("voucheras.listAeronaves:", e);
    res.status(500).json({ ok: false, message: "Error al listar aeronaves" });
  }
};

exports.listVoucherasDia = async (req, res) => {
  try {
    let fecha = String(req.query.fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const hoy = await db.query(`SELECT (NOW() AT TIME ZONE 'America/El_Salvador')::date::text AS d`);
      fecha = hoy.rows[0].d;
    }
    const idAeronave = parseInt(req.query.id_aeronave, 10) || null;

    // Solo vuelos COMPLETADOS con reporte (la vouchera existe recién cuando el
    // instructor la llenó). Incluye inasistencias: son parte del papeleo del día.
    const r = await db.query(`
      SELECT v.id_vuelo, v.fecha_vuelo::text AS fecha_vuelo,
             b.hora_inicio, b.hora_fin,
             a.id_aeronave, a.codigo AS aeronave_codigo, a.modelo AS aeronave_modelo, a.tipo AS aeronave_tipo,
             TRIM(u.nombre || ' ' || COALESCE(u.apellido, ''))  AS alumno_nombre,
             al.numero_licencia AS alumno_licencia,
             TRIM(u2.nombre || ' ' || COALESCE(u2.apellido, '')) AS instructor_nombre,
             i.licencia AS instructor_licencia,
             rv.id_reporte, rv.estado AS reporte_estado, rv.tipo_vuelo,
             rv.tacometro_salida, rv.tacometro_llegada,
             rv.hobbs_salida, rv.hobbs_llegada,
             rv.combustible_salida, rv.combustible_llegada, rv.cantidad_combustible,
             rv.horas_cobradas, rv.firma_alumno, rv.firma_instructor,
             COALESCE(rv.es_inasistencia, false) AS es_inasistencia, rv.motivo_inasistencia
      FROM vuelo v
      JOIN aeronave a        ON a.id_aeronave = v.id_aeronave
      JOIN alumno al         ON al.id_alumno = v.id_alumno
      JOIN usuario u         ON u.id_usuario = al.id_usuario
      LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
      LEFT JOIN usuario u2   ON u2.id_usuario = i.id_usuario
      JOIN bloque_horario b  ON b.id_bloque = v.id_bloque
      JOIN reporte_vuelo rv  ON rv.id_vuelo = v.id_vuelo
      WHERE v.fecha_vuelo = $1::date
        AND v.estado = 'COMPLETADO'
        AND ($2::int IS NULL OR v.id_aeronave = $2::int)
      ORDER BY a.codigo, b.hora_inicio, v.id_vuelo
    `, [fecha, idAeronave]);

    res.json({ ok: true, fecha, data: r.rows });
  } catch (e) {
    console.error("voucheras.listVoucherasDia:", e);
    res.status(500).json({ ok: false, message: "Error al listar las voucheras del día" });
  }
};

// Deshacer una inasistencia marcada por error. Una inasistencia deja el vuelo
// COMPLETADO con reporte_vuelo.es_inasistencia=true y libera a propósito ese
// avión/alumno/instructor para que otra tripulación pueda ocupar el mismo
// horario (ver programacionController/turnoController: los chequeos de
// conflicto excluyen vuelos con es_inasistencia). Revertir deshace exactamente
// eso: borra el reporte-inasistencia y regresa el vuelo a PUBLICADO para que
// recorra el flujo real de nuevo (salida de hangar → ... → reporte firmado),
// en vez de dejarlo "COMPLETADO sin reporte" — que exigiría un checklist
// post-vuelo que nunca se llenó (la inasistencia salta ese flujo por completo).
// Si el hueco liberado ya lo ocupó otra tripulación real, se bloquea con 409:
// revertir en silencio movería a esa tripulación sin que nadie lo decida.
exports.revertirInasistencia = async (req, res) => {
  const { id_vuelo } = req.params;
  const user = req.user;
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const vueloRes = await client.query(
      `SELECT v.id_vuelo, v.id_semana, v.dia_semana, v.id_bloque, v.id_bloque_fin,
              v.id_aeronave, v.id_alumno, v.id_instructor, v.estado,
              COALESCE(rv.es_inasistencia, false) AS es_inasistencia
         FROM vuelo v
         LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
        WHERE v.id_vuelo = $1
        FOR UPDATE OF v`,
      [Number(id_vuelo)]
    );
    if (vueloRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Vuelo no encontrado" });
    }

    const vuelo = vueloRes.rows[0];
    if (!vuelo.es_inasistencia) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "Este vuelo no está marcado como inasistencia" });
    }

    const fin = vuelo.id_bloque_fin || vuelo.id_bloque;

    const conflicto = async (columna, valor, label) => {
      const r = await client.query(
        `SELECT id_vuelo FROM vuelo v2
          WHERE v2.id_semana = $1 AND v2.dia_semana = $2 AND v2.${columna} = $3
            AND v2.id_vuelo <> $6 AND v2.estado <> 'CANCELADO'
            AND NOT ($5 < v2.id_bloque OR $4 > COALESCE(v2.id_bloque_fin, v2.id_bloque))
            AND NOT EXISTS (SELECT 1 FROM reporte_vuelo rv2 WHERE rv2.id_vuelo = v2.id_vuelo AND rv2.es_inasistencia = true)
          LIMIT 1`,
        [vuelo.id_semana, vuelo.dia_semana, valor, vuelo.id_bloque, fin, vuelo.id_vuelo]
      );
      if (r.rows.length) {
        throw Object.assign(
          new Error(`No se puede revertir: ${label} ya tiene otro vuelo (#${r.rows[0].id_vuelo}) en ese mismo horario.`),
          { code: "CONFLICTO" }
        );
      }
    };

    await conflicto("id_aeronave", vuelo.id_aeronave, "la aeronave");
    if (vuelo.id_instructor) await conflicto("id_instructor", vuelo.id_instructor, "el instructor");
    if (vuelo.id_alumno) await conflicto("id_alumno", vuelo.id_alumno, "el alumno");

    await client.query("DELETE FROM reporte_vuelo WHERE id_vuelo = $1", [id_vuelo]);
    await client.query(
      "UPDATE vuelo SET estado = 'PUBLICADO', tiempo_vuelo_min = NULL WHERE id_vuelo = $1",
      [id_vuelo]
    );
    await client.query(
      "DELETE FROM vuelo_estado_tiempo WHERE id_vuelo = $1 AND estado = 'COMPLETADO'",
      [id_vuelo]
    );

    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "vuelo",
      id_entidad: Number(id_vuelo),
      actor: user,
      req,
      descripcion: `Inasistencia revertida para el vuelo #${id_vuelo} (marcada por error)`,
    });

    await client.query("COMMIT");
    res.json({ ok: true, message: "Inasistencia revertida — el vuelo vuelve a estar activo" });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "CONFLICTO") return res.status(409).json({ ok: false, message: e.message });
    console.error("voucheras.revertirInasistencia:", e);
    res.status(500).json({ ok: false, message: "Error al revertir la inasistencia" });
  } finally {
    client.release();
  }
};
