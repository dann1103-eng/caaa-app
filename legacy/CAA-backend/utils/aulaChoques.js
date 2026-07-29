const db = require("../config/db");

// Choque de salón: mismo salón, misma fecha, rango de bloques que se solapa,
// contra otra sesion_clase no cancelada o contra una reserva_salon.
// `excluirIdSesion` se usa al editar/reasignar, para no chocar contra sí misma.
async function choqueSalon(client, { id_salon, fecha, id_bloque, id_bloque_fin, excluirIdSesion = null }) {
  const fin = id_bloque_fin || id_bloque;

  const sesionOcup = await client.query(
    `SELECT sc.id, c.codigo AS curso_codigo, u_ins.nombre AS instructor_nombre
       FROM sesion_clase sc
       JOIN curso c ON c.id = sc.id_curso
       LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
       LEFT JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario
      WHERE sc.id_salon = $1 AND sc.fecha = $2 AND sc.estado <> 'CANCELADA'
        AND ($5::int IS NULL OR sc.id <> $5)
        AND NOT ($4 < sc.id_bloque OR $3 > COALESCE(sc.id_bloque_fin, sc.id_bloque))
      LIMIT 1`,
    [id_salon, fecha, id_bloque, fin, excluirIdSesion]
  );
  if (sesionOcup.rows.length) {
    const r = sesionOcup.rows[0];
    throw Object.assign(
      new Error(`Ese salón ya tiene una clase de ${r.instructor_nombre || "otro instructor"} (${r.curso_codigo}) en ese horario.`),
      { code: "CHOQUE_SALON" }
    );
  }

  const reservaOcup = await client.query(
    `SELECT id, motivo FROM reserva_salon
      WHERE id_salon = $1 AND fecha = $2
        AND NOT ($4 < id_bloque OR $3 > COALESCE(id_bloque_fin, id_bloque))
      LIMIT 1`,
    [id_salon, fecha, id_bloque, fin]
  );
  if (reservaOcup.rows.length) {
    throw Object.assign(
      new Error(`Ese salón está reservado (${reservaOcup.rows[0].motivo}) en ese horario.`),
      { code: "CHOQUE_SALON" }
    );
  }
}

// Choque cruzado vuelo↔teoría: el mismo instructor no puede tener un vuelo Y
// una clase de teoría al mismo tiempo (ni dos clases de teoría a la vez).
async function choqueInstructor(client, { id_instructor, fecha, id_bloque, id_bloque_fin, excluirIdSesion = null }) {
  if (!id_instructor) return;
  const fin = id_bloque_fin || id_bloque;

  const otraClase = await client.query(
    `SELECT id FROM sesion_clase
      WHERE id_instructor = $1 AND fecha = $2 AND estado <> 'CANCELADA'
        AND ($5::int IS NULL OR id <> $5)
        AND NOT ($4 < id_bloque OR $3 > COALESCE(id_bloque_fin, id_bloque))
      LIMIT 1`,
    [id_instructor, fecha, id_bloque, fin, excluirIdSesion]
  );
  if (otraClase.rows.length) {
    throw Object.assign(new Error("Ese instructor ya tiene otra clase de teoría en ese horario."), { code: "CHOQUE_INSTRUCTOR" });
  }

  const vueloOcup = await client.query(
    `SELECT id_vuelo FROM vuelo
      WHERE id_instructor = $1 AND fecha_vuelo = $2 AND estado <> 'CANCELADO'
        AND NOT ($4 < id_bloque OR $3 > COALESCE(id_bloque_fin, id_bloque))
      LIMIT 1`,
    [id_instructor, fecha, id_bloque, fin]
  );
  if (vueloOcup.rows.length) {
    throw Object.assign(new Error("Ese instructor ya tiene un vuelo agendado en ese horario."), { code: "CHOQUE_INSTRUCTOR" });
  }
}

module.exports = { choqueSalon, choqueInstructor };
