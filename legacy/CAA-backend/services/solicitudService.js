const db = require("../config/db");
const { resolverVueloEspecial } = require("../utils/practicanteHelper");
const { mantenimientoCubreFechaSQL } = require("../utils/mantenimientoUtils");

/**
 * Lógica compartida de solicitudes de vuelo (semana próxima, no publicada).
 * La consumen: programación (guardar-cambios / agendar), el instructor (revisión
 * de sus alumnos) y el modal "Agendar" del calendario. Centralizar evita
 * duplicar los chequeos de conflicto (aeronave / alumno / instructor) y el
 * upsert del "basket" solicitud_semana.
 *
 * Los códigos de error de conflicto se conservan iguales a los que ya usa el
 * frontend/controllers: 23505 (aeronave), 23506 (alumno), 23507 (instructor).
 */

/** Semana siguiente ({id_semana, publicada}) o null. */
async function getNextSemana(conn = db) {
  const r = await conn.query(`
    SELECT id_semana, publicada
    FROM semana_vuelo
    WHERE fecha_inicio > CURRENT_DATE
    ORDER BY fecha_inicio
    LIMIT 1
  `);
  return r.rows[0] || null;
}

/** id de la semana en curso o null. */
async function getCurrentSemana(conn = db) {
  const r = await conn.query(`
    SELECT id_semana, fecha_inicio, publicada
    FROM semana_vuelo
    WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
    LIMIT 1
  `);
  return r.rows[0] || null;
}

/**
 * Verifica que un slot esté libre de conflictos (aeronave, alumno, instructor),
 * considerando RANGOS (RUTA que abarca varios bloques) en ambos lados: dos
 * intervalos [a,b] y [c,d] se solapan salvo que uno termine antes que empiece
 * el otro. Excluye `excluir` (ids de detalle que se están moviendo).
 * Lanza Error con .code 23505/23506/23507 si hay conflicto.
 *
 * `saltarConflictoAeronave`/`saltarConflictoInstructor`: igual que el alumno
 * (que YA puede "solicitar encimado" sobre otro alumno, migración
 * drop_uq_slot), el instructor de vuelo debe poder pedir horas para sus
 * alumnos aunque la aeronave o él mismo ya estén pedidos en ese horario por
 * otra solicitud — el choque real lo resuelve Programación al publicar, no
 * bloquea el pedido. Solo aplica al PEDIDO (instructor); Programación al
 * mover/colocar vuelos sigue exigiendo ambos (son quienes dan la palabra final).
 */
async function assertSlotLibre(client, {
  id_semana, dia_semana, id_bloque, id_bloque_fin,
  id_aeronave, id_alumno, id_instructor, excluir = [],
  saltarConflictoAlumno = false,
  saltarConflictoAeronave = false,
  saltarConflictoInstructor = false,
}) {
  const fin = id_bloque_fin || id_bloque;
  const excl = excluir.length ? excluir : [-1];

  if (!saltarConflictoAeronave) {
    const aero = await client.query(
      `SELECT 1 FROM solicitud_vuelo sv
          JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
        WHERE sv.id_semana = $1 AND sv.dia_semana = $2 AND sv.id_aeronave = $3
          AND sv.id_detalle <> ALL($4::int[])
          AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')
          AND ss.estado NOT IN ('RECHAZADA','CANCELADA')
          AND NOT ($6 < sv.id_bloque OR $5 > COALESCE(sv.id_bloque_fin, sv.id_bloque))
        LIMIT 1`,
      [id_semana, dia_semana, id_aeronave, excl, id_bloque, fin]
    );
    if (aero.rows.length) {
      throw Object.assign(new Error("Ese bloque y aeronave ya está ocupado"), { code: "23505" });
    }
  }

  // Vuelos DEMO comparten una ficha placeholder única (no representa a una
  // persona real que pueda estar "ocupada"), así que dos DEMO en el mismo
  // horario (aviones distintos) no deben chocar entre sí por este chequeo.
  if (id_alumno && !saltarConflictoAlumno) {
    const al = await client.query(
      `SELECT 1 FROM solicitud_vuelo sv
        JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
       WHERE sv.id_semana = $1 AND ss.id_alumno = $2 AND sv.dia_semana = $3
         AND sv.id_detalle <> ALL($4::int[])
         AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')
         AND ss.estado NOT IN ('RECHAZADA','CANCELADA')
         AND NOT ($6 < sv.id_bloque OR $5 > COALESCE(sv.id_bloque_fin, sv.id_bloque))
       LIMIT 1`,
      [id_semana, id_alumno, dia_semana, excl, id_bloque, fin]
    );
    if (al.rows.length) {
      throw Object.assign(new Error("El alumno ya tiene un vuelo en ese horario"), { code: "23506" });
    }
  }

  if (id_instructor && !saltarConflictoInstructor) {
    const ins = await client.query(
      `SELECT 1 FROM solicitud_vuelo sv
        JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
        JOIN alumno al ON al.id_alumno = ss.id_alumno
       WHERE sv.id_semana = $1 AND COALESCE(sv.id_instructor, al.id_instructor_vuelo, al.id_instructor) = $2 AND sv.dia_semana = $3
         AND sv.id_detalle <> ALL($4::int[])
         AND (sv.estado IS NULL OR sv.estado <> 'RECHAZADA')
         AND ss.estado NOT IN ('RECHAZADA','CANCELADA')
         AND NOT ($6 < sv.id_bloque OR $5 > COALESCE(sv.id_bloque_fin, sv.id_bloque))
       LIMIT 1`,
      [id_semana, id_instructor, dia_semana, excl, id_bloque, fin]
    );
    if (ins.rows.length) {
      throw Object.assign(new Error("El instructor ya tiene un vuelo en ese horario"), { code: "23507" });
    }
  }
}

/**
 * Chequeo en memoria de que los destinos de un lote de movimientos no choquen
 * ENTRE SÍ (dos que se mueven al mismo bloque/aeronave, mismo alumno u mismo
 * instructor en el mismo horario). Lanza con .code de conflicto.
 */
function validarMovimientosEnMemoria(movimientos, infoPorDetalle) {
  const destAero = new Set();
  const destAlumno = new Set();
  const destInstructor = new Set();

  for (const m of movimientos) {
    const info = infoPorDetalle.get(Number(m.id_detalle));
    if (!info) throw new Error(`No se encontró información del detalle ${m.id_detalle}`);

    const kAero = `${m.dia_semana}-${m.id_bloque}-${m.id_aeronave}`;
    if (destAero.has(kAero)) {
      throw Object.assign(new Error("Dos vuelos no pueden quedar en el mismo bloque y aeronave"), { code: "23505" });
    }
    destAero.add(kAero);

    const kAl = `${info.id_alumno}-${m.dia_semana}-${m.id_bloque}`;
    if (destAlumno.has(kAl)) {
      throw Object.assign(new Error("Un alumno no puede tener dos vuelos en el mismo horario"), { code: "23506" });
    }
    destAlumno.add(kAl);

    const kIns = `${info.id_instructor}-${m.dia_semana}-${m.id_bloque}`;
    if (destInstructor.has(kIns)) {
      throw Object.assign(new Error("Un instructor no puede tener dos vuelos en el mismo horario"), { code: "23507" });
    }
    destInstructor.add(kIns);
  }
}

/**
 * Aplica un lote de movimientos de solicitud_vuelo dentro de una transacción ya
 * abierta por el caller (el caller maneja BEGIN/COMMIT/ROLLBACK, la auditoría y
 * los correos post-commit). Devuelve { infoPorDetalle }.
 *
 * Reutiliza el patrón "aparcar en día 0 → validar contra BD → colocar" del
 * guardarCambios original. `assertOwnership(infoPorDetalle)` es opcional: la
 * variante del instructor la usa para exigir que todos los detalles sean suyos.
 */
async function aplicarMovimientos(client, {
  id_semana, movimientos, assertOwnership,
  saltarConflictoAeronave = false, saltarConflictoInstructor = false,
}) {
  const idsMovidos = movimientos.map((m) => m.id_detalle);

  const infoRes = await client.query(
    `SELECT sv.id_detalle, ss.id_alumno, ss.id_solicitud,
            sv.id_bloque AS orig_id_bloque, sv.id_bloque_fin AS orig_id_bloque_fin,
            COALESCE(sv.id_instructor, al.id_instructor_vuelo, al.id_instructor) AS id_instructor
       FROM solicitud_vuelo sv
       JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
       JOIN alumno al ON al.id_alumno = ss.id_alumno
      WHERE sv.id_detalle = ANY($1::int[])`,
    [idsMovidos]
  );
  const infoPorDetalle = new Map(infoRes.rows.map((r) => [Number(r.id_detalle), r]));

  if (typeof assertOwnership === "function") assertOwnership(infoPorDetalle);

  validarMovimientosEnMemoria(movimientos, infoPorDetalle);

  // Aparcar (día 0) para evitar colisiones intermedias durante los UPDATE.
  for (let idx = 0; idx < movimientos.length; idx++) {
    await client.query(
      `UPDATE solicitud_vuelo SET dia_semana = 0, id_bloque = $1 WHERE id_detalle = $2`,
      [idx + 1, movimientos[idx].id_detalle]
    );
  }

  // Validar cada destino contra la BD (excluyendo los que se mueven).
  for (const m of movimientos) {
    const info = infoPorDetalle.get(Number(m.id_detalle));
    await assertSlotLibre(client, {
      id_semana,
      dia_semana: m.dia_semana,
      id_bloque: m.id_bloque,
      id_bloque_fin: m.id_bloque_fin,
      id_aeronave: m.id_aeronave,
      id_alumno: info.id_alumno,
      id_instructor: info.id_instructor,
      excluir: idsMovidos,
      saltarConflictoAeronave,
      saltarConflictoInstructor,
    });
  }

  // Colocar en el destino final (preservando el ancho de las RUTA).
  // OJO: el ancho se calcula con el id_bloque ORIGINAL (capturado antes de
  // aparcar), NO con el id_bloque ya aparcado (día 0, índice descartable) —
  // usar el aparcado aquí produce un id_bloque_fin corrupto (bug histórico).
  for (const m of movimientos) {
    const info = infoPorDetalle.get(Number(m.id_detalle));
    const nuevoFin = info.orig_id_bloque_fin != null
      ? Number(m.id_bloque) + (Number(info.orig_id_bloque_fin) - Number(info.orig_id_bloque))
      : null;
    await client.query(
      `UPDATE solicitud_vuelo
          SET dia_semana = $1,
              id_bloque_fin = $2,
              id_bloque = $3,
              id_aeronave = $4
        WHERE id_detalle = $5`,
      [m.dia_semana, nuevoFin, m.id_bloque, m.id_aeronave, m.id_detalle]
    );
  }

  return { infoPorDetalle };
}

/**
 * Inserta UN solo vuelo aditivamente en el basket del alumno (crea el basket si
 * no existe, sin pisar los vuelos ya guardados ni cambiar su estado). Valida
 * licencia (salvo extracurricular) y conflictos. Devuelve {id_solicitud, id_detalle}.
 *
 * `categoria` (NORMAL/DEMO/CHEQUEO/CHEQUEO_LINEA) resuelve el id_alumno real del
 * slot vía `resolverVueloEspecial` — para DEMO/CHEQUEO_LINEA el `id_alumno`
 * recibido se ignora y se usa la ficha placeholder/espejo correspondiente.
 * `id_licencia_chequeo` (solo CHEQUEO) filtra la validación de aeronave contra
 * esa licencia en vez de la propia del alumno.
 */
async function insertarSolicitudVuelo(client, {
  id_alumno, id_semana, dia_semana, id_bloque, id_bloque_fin,
  id_aeronave, tipo_vuelo, id_instructor, es_extracurricular,
  validarLicencia = true,
  categoria, id_licencia_chequeo, id_usuario_practicante, tipo_instruccion, nombre_externo,
  saltarConflictoAeronave = false, saltarConflictoInstructor = false,
}) {
  const resuelto = await resolverVueloEspecial(client, {
    categoria, id_alumno, id_instructor, id_usuario_practicante, tipo_instruccion, nombre_externo,
    id_licencia_chequeo,
  });
  const idAlumnoEfectivo = resuelto.id_alumno;

  const ssRes = await client.query(
    `INSERT INTO solicitud_semana (id_semana, id_alumno, estado)
     VALUES ($1, $2, 'BORRADOR')
     ON CONFLICT (id_semana, id_alumno)
     DO UPDATE SET fecha_actualizacion = now()
     RETURNING id_solicitud`,
    [id_semana, idAlumnoEfectivo]
  );
  const id_solicitud = ssRes.rows[0].id_solicitud;

  // Validación de licencia/aeronave: NORMAL siempre contra la del alumno;
  // CHEQUEO contra la licencia elegida (o la del alumno si no se especificó
  // ninguna); DEMO/CHEQUEO_LINEA no aplica (no hay una licencia "propia").
  if (!es_extracurricular && validarLicencia && (resuelto.categoria === "NORMAL" || resuelto.categoria === "CHEQUEO")) {
    const idLicenciaCheck = resuelto.categoria === "CHEQUEO" && id_licencia_chequeo ? Number(id_licencia_chequeo) : null;
    const lic = idLicenciaCheck
      ? await client.query(
          `SELECT 1 FROM licencia_aeronave WHERE id_licencia = $1 AND id_aeronave = $2`,
          [idLicenciaCheck, id_aeronave]
        )
      : await client.query(
          `SELECT 1 FROM alumno a
             JOIN licencia_aeronave la ON la.id_licencia = a.id_licencia AND la.id_aeronave = $2
            WHERE a.id_alumno = $1`,
          [idAlumnoEfectivo, id_aeronave]
        );
    if (lic.rows.length === 0) {
      throw Object.assign(new Error("La aeronave no está habilitada para esa licencia"), { status: 400 });
    }
  }

  // Mantenimiento, validado contra la FECHA PEDIDA (no contra hoy) — mismo
  // criterio date-aware que ya usa agendarController (alumno) y
  // getAeronavesDisponibles (staff). Aplica siempre, incluso extracurricular:
  // la aeronave está físicamente fuera de servicio sin importar quién la pida.
  // Ya NO bloquea el guardado — es una ADVERTENCIA que viaja en la respuesta
  // (pedido explícito: no impedir agendar/solicitar, solo avisar del riesgo).
  const fechaSlotSQL = `((SELECT fecha_inicio FROM semana_vuelo WHERE id_semana = $1) + ($2::int - 1))`;
  const mantRes = await client.query(
    `SELECT a.codigo, ${fechaSlotSQL} AS fecha_slot,
            (SELECT MIN(m.fecha_fin::date) FROM mantenimiento_aeronave m
              WHERE m.id_aeronave = a.id_aeronave
                AND ${mantenimientoCubreFechaSQL(fechaSlotSQL)}) AS hasta
       FROM aeronave a
      WHERE a.id_aeronave = $3
        AND EXISTS (SELECT 1 FROM mantenimiento_aeronave m
                     WHERE m.id_aeronave = a.id_aeronave
                       AND ${mantenimientoCubreFechaSQL(fechaSlotSQL)})`,
    [id_semana, dia_semana, id_aeronave]
  );
  let advertenciaMantenimiento = null;
  if (mantRes.rows.length > 0) {
    const { codigo, fecha_slot, hasta } = mantRes.rows[0];
    advertenciaMantenimiento =
      `${codigo} está en mantenimiento el ${String(fecha_slot).slice(0, 10)}` +
      (hasta ? ` (vuelve el ${String(hasta).slice(0, 10)}).` : " (sin fecha de regreso todavía).") +
      " El vuelo se guardó igual, pero corre riesgo de no poder realizarse.";
  }

  // Instructor efectivo para el chequeo de conflicto (override explícito, o el
  // instructor de vuelo asignado al alumno, o si no tiene, el de cabecera). En
  // DEMO/CHEQUEO_LINEA el id_instructor viene siempre explícito (PIC) — no hay
  // "instructor de cabecera" de un placeholder.
  let instrEff = id_instructor;
  if (!instrEff && resuelto.categoria !== "DEMO" && resuelto.categoria !== "CHEQUEO_LINEA") {
    const a = await client.query(`SELECT id_instructor_vuelo, id_instructor FROM alumno WHERE id_alumno = $1`, [idAlumnoEfectivo]);
    instrEff = a.rows[0]?.id_instructor_vuelo || a.rows[0]?.id_instructor || null;
  }

  await assertSlotLibre(client, {
    id_semana, dia_semana, id_bloque, id_bloque_fin, id_aeronave,
    id_alumno: idAlumnoEfectivo, id_instructor: instrEff, excluir: [],
    saltarConflictoAlumno: resuelto.saltarConflictoAlumno,
    saltarConflictoAeronave, saltarConflictoInstructor,
  });

  const ins = await client.query(
    `INSERT INTO solicitud_vuelo
       (id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave, tipo_vuelo, id_bloque_fin, id_instructor, es_extracurricular, categoria, tipo_instruccion, nombre_externo, id_licencia_chequeo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id_detalle`,
    [
      id_solicitud, id_semana, dia_semana, id_bloque, id_aeronave,
      tipo_vuelo || "LOCAL", id_bloque_fin || id_bloque,
      id_instructor || null, es_extracurricular === true,
      resuelto.categoria, resuelto.tipo_instruccion || "NORMAL", resuelto.nombre_externo,
      resuelto.id_licencia_chequeo,
    ]
  );
  return {
    id_solicitud, id_detalle: ins.rows[0].id_detalle, id_alumno: idAlumnoEfectivo,
    advertencia: advertenciaMantenimiento,
  };
}

module.exports = {
  getNextSemana,
  getCurrentSemana,
  assertSlotLibre,
  validarMovimientosEnMemoria,
  aplicarMovimientos,
  insertarSolicitudVuelo,
};
