const db = require("../config/db");
const { logAuditoria } = require("../utils/auditoria");
const { notificarUsuario } = require("../utils/notificaciones");

// Reglas (configurables): margen mínimo para ofrecer un cupo liberado y plazo
// que tiene el candidato para responder una oferta antes de pasar al siguiente.
const MARGEN_MIN_HORAS = 6;       // no ofrecer si faltan <6h para el vuelo
const OFERTA_VENTANA_HORAS = 4;   // plazo para aceptar/rechazar una oferta

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ─────────────────────────────────────────────────────────────────────
// TURNO: armar y ordenar la lista de espera de un horario (día+bloque).
// ─────────────────────────────────────────────────────────────────────

// Candidatos posibles: alumnos que pidieron ese día+bloque (por solicitud_vuelo)
// y que NO están volando ese horario (no tienen vuelo activo ahí). Sirve para que
// Turno elija a quién poner en espera.
exports.getCandidatos = async (req, res) => {
  try {
    const { id_semana, dia_semana, id_bloque } = req.query;
    if (!id_semana || !dia_semana || !id_bloque) return res.status(400).json({ message: "Faltan parámetros" });

    const r = await db.query(`
      SELECT DISTINCT ss.id_alumno,
             u.nombre || ' ' || u.apellido AS alumno_nombre,
             LEFT(u.nombre,1) || '.' || split_part(u.apellido,' ',1) AS alumno_nombre_corto,
             sv.id_aeronave, COALESCE(sv.id_instructor, al.id_instructor) AS id_instructor
      FROM solicitud_vuelo sv
      JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
      JOIN alumno al ON al.id_alumno = ss.id_alumno
      JOIN usuario u ON u.id_usuario = al.id_usuario
      WHERE sv.id_semana = $1 AND sv.dia_semana = $2 AND sv.id_bloque = $3
        AND ss.estado NOT IN ('RECHAZADA','CANCELADA')
        AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')
        AND NOT EXISTS (
          SELECT 1 FROM vuelo v
          WHERE v.id_semana = $1 AND v.dia_semana = $2 AND v.id_bloque = $3
            AND v.id_alumno = ss.id_alumno AND v.estado <> 'CANCELADO'
        )
      ORDER BY alumno_nombre
    `, [id_semana, dia_semana, id_bloque]);

    res.json(r.rows);
  } catch (e) {
    console.error("standby.getCandidatos:", e);
    res.status(500).json({ message: "Error al obtener candidatos" });
  }
};

exports.getLista = async (req, res) => {
  try {
    const { id_semana, dia_semana, id_bloque } = req.query;
    if (!id_semana || !dia_semana || !id_bloque) return res.status(400).json({ message: "Faltan parámetros" });
    const r = await db.query(`
      SELECT s.*, u.nombre || ' ' || u.apellido AS alumno_nombre,
             LEFT(u.nombre,1) || '.' || split_part(u.apellido,' ',1) AS alumno_nombre_corto
      FROM slot_standby s
      JOIN alumno al ON al.id_alumno = s.id_alumno
      JOIN usuario u ON u.id_usuario = al.id_usuario
      WHERE s.id_semana = $1 AND s.dia_semana = $2 AND s.id_bloque = $3
        AND s.estado NOT IN ('ACEPTADO','DESCARTADO')
      ORDER BY s.orden, s.creado_en
    `, [id_semana, dia_semana, id_bloque]);
    res.json(r.rows);
  } catch (e) {
    console.error("standby.getLista:", e);
    res.status(500).json({ message: "Error al obtener la lista de espera" });
  }
};

// Turno define/reemplaza la lista ordenada de un horario.
// body: { id_semana, dia_semana, id_bloque, candidatos: [{id_alumno, id_instructor?, id_aeronave?}] }
exports.setLista = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_semana, dia_semana, id_bloque, candidatos } = req.body;
    if (!id_semana || !dia_semana || !id_bloque || !Array.isArray(candidatos)) {
      return res.status(400).json({ message: "Datos incompletos" });
    }
    await client.query("BEGIN");
    // Borrar los EN_ESPERA actuales que ya no estén en la nueva lista (conserva
    // OFRECIDO/ACEPTADO para no romper una oferta en curso).
    const ids = candidatos.map((c) => Number(c.id_alumno));
    await client.query(`
      DELETE FROM slot_standby
      WHERE id_semana=$1 AND dia_semana=$2 AND id_bloque=$3 AND estado='EN_ESPERA'
        AND ($4::int[] = '{}' OR id_alumno <> ALL($4::int[]))
    `, [id_semana, dia_semana, id_bloque, ids]);

    let orden = 1;
    for (const c of candidatos) {
      await client.query(`
        INSERT INTO slot_standby (id_semana, dia_semana, id_bloque, id_alumno, id_instructor, id_aeronave, orden, estado, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'EN_ESPERA',$8)
        ON CONFLICT (id_semana, dia_semana, id_bloque, id_alumno)
        DO UPDATE SET orden = EXCLUDED.orden,
                      id_instructor = EXCLUDED.id_instructor,
                      id_aeronave = EXCLUDED.id_aeronave
        WHERE slot_standby.estado = 'EN_ESPERA'
      `, [id_semana, dia_semana, id_bloque, c.id_alumno, c.id_instructor || null, c.id_aeronave || null, orden, req.user.id_usuario]);
      orden++;
    }
    await logAuditoria(client, { accion: "OTRO", entidad: "slot_standby", id_entidad: null, id_semana,
      actor: req.user, req, descripcion: `Turno definió lista de espera ${DIAS[dia_semana]} bloque ${id_bloque} (${candidatos.length})` });
    await client.query("COMMIT");
    res.json({ message: "Lista de espera actualizada" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("standby.setLista:", e);
    res.status(500).json({ message: "Error al guardar la lista de espera" });
  } finally {
    client.release();
  }
};

exports.quitarCandidato = async (req, res) => {
  try {
    const { id_standby } = req.params;
    await db.query(`DELETE FROM slot_standby WHERE id_standby = $1 AND estado = 'EN_ESPERA'`, [id_standby]);
    res.json({ message: "Candidato quitado" });
  } catch (e) {
    console.error("standby.quitarCandidato:", e);
    res.status(500).json({ message: "Error al quitar candidato" });
  }
};

// ─────────────────────────────────────────────────────────────────────
// Disparo automático de ofertas
// ─────────────────────────────────────────────────────────────────────

/**
 * Ofrece el cupo al siguiente candidato EN_ESPERA (menor orden) de un horario.
 * Marca OFRECIDO + expira_en y notifica. No hace nada si no hay candidatos.
 * Debe llamarse dentro de una transacción (client) o con el pool (db).
 */
async function ofrecerSiguiente(conn, { id_semana, dia_semana, id_bloque }, io) {
  const cand = await conn.query(`
    SELECT s.*, al.id_usuario AS alumno_uid
    FROM slot_standby s
    JOIN alumno al ON al.id_alumno = s.id_alumno
    WHERE s.id_semana=$1 AND s.dia_semana=$2 AND s.id_bloque=$3 AND s.estado='EN_ESPERA'
    ORDER BY s.orden, s.creado_en
    LIMIT 1
  `, [id_semana, dia_semana, id_bloque]);
  if (cand.rows.length === 0) return null;

  const s = cand.rows[0];
  const expira = new Date(Date.now() + OFERTA_VENTANA_HORAS * 3600 * 1000);
  await conn.query(`
    UPDATE slot_standby SET estado='OFRECIDO', ofrecido_en=now(), expira_en=$2 WHERE id_standby=$1
  `, [s.id_standby, expira]);

  const bloque = await conn.query(`SELECT hora_inicio FROM bloque_horario WHERE id_bloque=$1`, [id_bloque]);
  const hora = bloque.rows[0]?.hora_inicio ? String(bloque.rows[0].hora_inicio).slice(0, 5) : "";
  const msg = `Se liberó un vuelo el ${DIAS[dia_semana]} ${hora}. ¿Lo tomás? Tenés ${OFERTA_VENTANA_HORAS}h para responder.`;
  await notificarUsuario(conn, s.alumno_uid, { tipo: "STANDBY", mensaje: msg, enlace: "/alumno/dashboard" });
  if (io) io.emit("standby_oferta", { id_alumno: s.id_alumno });
  return s;
}

/**
 * Al cancelarse un vuelo por decisión del alumno (NO por cierre de operaciones):
 * si falta más del margen mínimo, ofrece el cupo al primer candidato en espera.
 * Se llama dentro de la transacción de la cancelación.
 */
async function dispararOfertaPorCancelacion(conn, id_vuelo, io) {
  const v = await conn.query(`
    SELECT v.id_semana, v.dia_semana, v.id_bloque, v.fecha_vuelo, b.hora_inicio
    FROM vuelo v JOIN bloque_horario b ON b.id_bloque = v.id_bloque
    WHERE v.id_vuelo = $1
  `, [id_vuelo]);
  if (v.rows.length === 0) return;
  const { id_semana, dia_semana, id_bloque, fecha_vuelo, hora_inicio } = v.rows[0];

  // Margen: si el vuelo es en menos de MARGEN_MIN_HORAS, no ofrecer.
  if (fecha_vuelo) {
    const fecha = new Date(fecha_vuelo);
    const [hh, mm] = String(hora_inicio || "00:00:00").split(":");
    fecha.setUTCHours(Number(hh) + 6, Number(mm), 0, 0); // fecha_vuelo es 00:00Z; hora local SV = UTC-6
    const horasRestantes = (fecha.getTime() - Date.now()) / 3600000;
    if (horasRestantes < MARGEN_MIN_HORAS) return;
  }

  await ofrecerSiguiente(conn, { id_semana, dia_semana, id_bloque }, io);
}

// Job periódico: expira ofertas vencidas y ofrece al siguiente.
async function expirarOfertasVencidas(io) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const venc = await client.query(`
      SELECT id_standby, id_semana, dia_semana, id_bloque
      FROM slot_standby
      WHERE estado='OFRECIDO' AND expira_en IS NOT NULL AND expira_en < now()
      FOR UPDATE
    `);
    for (const row of venc.rows) {
      await client.query(`UPDATE slot_standby SET estado='EXPIRADO', respondido_en=now() WHERE id_standby=$1`, [row.id_standby]);
      await ofrecerSiguiente(client, row, io);
    }
    await client.query("COMMIT");
    if (venc.rows.length) console.log(`[standby] ${venc.rows.length} ofertas expiradas y reofertadas`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[standby] expirarOfertasVencidas:", e.message);
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────
// ALUMNO: ver ofertas y aceptar/rechazar
// ─────────────────────────────────────────────────────────────────────

exports.misOfertas = async (req, res) => {
  try {
    const al = await db.query(`SELECT id_alumno FROM alumno WHERE id_usuario=$1`, [req.user.id_usuario]);
    const idAlumno = al.rows[0]?.id_alumno;
    if (!idAlumno) return res.json([]);
    const r = await db.query(`
      SELECT s.id_standby, s.id_semana, s.dia_semana, s.id_bloque, s.expira_en, s.id_aeronave, s.id_instructor,
             b.hora_inicio, b.hora_fin, ae.codigo AS aeronave_codigo
      FROM slot_standby s
      JOIN bloque_horario b ON b.id_bloque = s.id_bloque
      LEFT JOIN aeronave ae ON ae.id_aeronave = s.id_aeronave
      WHERE s.id_alumno=$1 AND s.estado='OFRECIDO' AND (s.expira_en IS NULL OR s.expira_en > now())
      ORDER BY s.ofrecido_en
    `, [idAlumno]);
    res.json(r.rows);
  } catch (e) {
    console.error("standby.misOfertas:", e);
    res.status(500).json({ message: "Error al obtener ofertas" });
  }
};

exports.rechazarOferta = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_standby } = req.params;
    await client.query("BEGIN");
    const s = await client.query(`
      SELECT s.*, al.id_usuario FROM slot_standby s JOIN alumno al ON al.id_alumno=s.id_alumno
      WHERE s.id_standby=$1 FOR UPDATE
    `, [id_standby]);
    if (s.rows.length === 0 || s.rows[0].id_usuario !== req.user.id_usuario) {
      await client.query("ROLLBACK"); return res.status(403).json({ message: "No tenés acceso a esta oferta" });
    }
    if (s.rows[0].estado !== "OFRECIDO") { await client.query("ROLLBACK"); return res.status(400).json({ message: "La oferta ya no está vigente" }); }

    await client.query(`UPDATE slot_standby SET estado='RECHAZADO', respondido_en=now() WHERE id_standby=$1`, [id_standby]);
    const row = s.rows[0];
    await ofrecerSiguiente(client, { id_semana: row.id_semana, dia_semana: row.dia_semana, id_bloque: row.id_bloque }, req.app.get("io"));
    await client.query("COMMIT");
    res.json({ message: "Oferta rechazada" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("standby.rechazarOferta:", e);
    res.status(500).json({ message: "Error al rechazar la oferta" });
  } finally {
    client.release();
  }
};

exports.aceptarOferta = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_standby } = req.params;
    await client.query("BEGIN");
    const s = await client.query(`
      SELECT s.*, al.id_usuario, al.id_instructor AS instructor_default
      FROM slot_standby s JOIN alumno al ON al.id_alumno=s.id_alumno
      WHERE s.id_standby=$1 FOR UPDATE
    `, [id_standby]);
    if (s.rows.length === 0 || s.rows[0].id_usuario !== req.user.id_usuario) {
      await client.query("ROLLBACK"); return res.status(403).json({ message: "No tenés acceso a esta oferta" });
    }
    const row = s.rows[0];
    if (row.estado !== "OFRECIDO") { await client.query("ROLLBACK"); return res.status(400).json({ message: "La oferta ya no está vigente" }); }
    if (row.expira_en && new Date(row.expira_en) < new Date()) { await client.query("ROLLBACK"); return res.status(400).json({ message: "La oferta expiró" }); }

    const idInstructor = row.id_instructor || row.instructor_default;

    // La aeronave: la que pidió, o alguna libre del horario. Verificamos que la
    // aeronave elegida siga libre (que el cupo realmente exista).
    let idAero = row.id_aeronave;
    const libre = await client.query(`
      SELECT 1 FROM vuelo WHERE id_semana=$1 AND dia_semana=$2 AND id_bloque=$3 AND id_aeronave=$4 AND estado<>'CANCELADO' LIMIT 1
    `, [row.id_semana, row.dia_semana, row.id_bloque, idAero]);
    if (!idAero || libre.rows.length > 0) {
      // Buscar una aeronave activa libre en ese horario.
      const alt = await client.query(`
        SELECT a.id_aeronave FROM aeronave a
        WHERE a.activa=true AND a.estado='ACTIVO'
          AND NOT EXISTS (SELECT 1 FROM vuelo v WHERE v.id_semana=$1 AND v.dia_semana=$2 AND v.id_bloque=$3 AND v.id_aeronave=a.id_aeronave AND v.estado<>'CANCELADO')
        ORDER BY a.codigo LIMIT 1
      `, [row.id_semana, row.dia_semana, row.id_bloque]);
      if (alt.rows.length === 0) { await client.query("ROLLBACK"); return res.status(409).json({ message: "Ya no hay aeronave libre en ese horario." }); }
      idAero = alt.rows[0].id_aeronave;
    }

    // Conflicto: el alumno no debe tener otro vuelo en ese horario.
    const conf = await client.query(`
      SELECT 1 FROM vuelo WHERE id_semana=$1 AND dia_semana=$2 AND id_bloque=$3 AND id_alumno=$4 AND estado<>'CANCELADO' LIMIT 1
    `, [row.id_semana, row.dia_semana, row.id_bloque, row.id_alumno]);
    if (conf.rows.length > 0) { await client.query("ROLLBACK"); return res.status(409).json({ message: "Ya tenés un vuelo en ese horario." }); }

    // Crear solicitud_vuelo de respaldo + vuelo publicado.
    const ss = await client.query(`
      INSERT INTO solicitud_semana (id_semana, id_alumno, estado) VALUES ($1,$2,'PUBLICADO')
      ON CONFLICT (id_semana, id_alumno) DO UPDATE SET fecha_actualizacion=now() RETURNING id_solicitud
    `, [row.id_semana, row.id_alumno]);
    const sv = await client.query(`
      INSERT INTO solicitud_vuelo (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, id_instructor)
      VALUES ($1,$2,$3,$4,$5,'LOCAL',$4,$6) RETURNING id_detalle
    `, [ss.rows[0].id_solicitud, row.id_semana, row.dia_semana, row.id_bloque, idAero, idInstructor]);
    const vue = await client.query(`
      INSERT INTO vuelo (id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, tipo_vuelo, id_bloque_fin, estado, creado_por, fecha_vuelo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'LOCAL',$7,'PUBLICADO','PROGRAMACION',
              (SELECT fecha_inicio FROM semana_vuelo WHERE id_semana=$2) + ($6 - 1))
      RETURNING id_vuelo
    `, [sv.rows[0].id_detalle, row.id_semana, row.id_alumno, idInstructor, idAero, row.dia_semana, row.id_bloque]);

    await client.query(`UPDATE slot_standby SET estado='ACEPTADO', respondido_en=now(), id_vuelo_generado=$2 WHERE id_standby=$1`, [id_standby, vue.rows[0].id_vuelo]);
    // Descartar las otras ofertas/espera de este alumno en el mismo horario.
    await client.query(`
      UPDATE slot_standby SET estado='DESCARTADO'
      WHERE id_semana=$1 AND dia_semana=$2 AND id_bloque=$3 AND id_alumno=$4 AND id_standby<>$5 AND estado IN ('EN_ESPERA','OFRECIDO')
    `, [row.id_semana, row.dia_semana, row.id_bloque, row.id_alumno, id_standby]);

    await logAuditoria(client, { accion: "OTRO", entidad: "vuelo", id_entidad: vue.rows[0].id_vuelo, id_semana: row.id_semana,
      actor: req.user, req, descripcion: `Alumno tomó cupo de lista de espera (${DIAS[row.dia_semana]} bloque ${row.id_bloque})` });

    // Notificar al instructor.
    const insU = await client.query(`SELECT id_usuario FROM instructor WHERE id_instructor=$1`, [idInstructor]);
    if (insU.rows[0]?.id_usuario) {
      await notificarUsuario(client, insU.rows[0].id_usuario, { tipo: "VUELO", mensaje: `Se te asignó un vuelo (lista de espera) el ${DIAS[row.dia_semana]}.`, enlace: "/instructor" });
    }

    await client.query("COMMIT");
    const io = req.app.get("io");
    if (io) io.emit("guardar_cambios", { origen: "standby" });
    res.json({ message: "¡Tomaste el cupo! El vuelo quedó agendado.", id_vuelo: vue.rows[0].id_vuelo });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("standby.aceptarOferta:", e);
    res.status(500).json({ message: "Error al aceptar la oferta" });
  } finally {
    client.release();
  }
};

module.exports = exports;
module.exports.dispararOfertaPorCancelacion = dispararOfertaPorCancelacion;
module.exports.ofrecerSiguiente = ofrecerSiguiente;
module.exports.expirarOfertasVencidas = expirarOfertasVencidas;
