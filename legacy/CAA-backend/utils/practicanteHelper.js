// Fichas "espejo"/placeholder para vuelos que no tienen un alumno real de
// cabecera en el slot de estudiante:
//   - CHEQUEO_LINEA (instructor-con-instructor): ficha espejo POR INSTRUCTOR
//     (es_practicante), ligada a su mismo usuario — se factura individualmente.
//   - DEMO (pasajero externo no registrado): UNA ficha placeholder COMPARTIDA
//     (es_externo) — nunca se factura contra ella (comisionaría saldos de
//     personas distintas); el cobro del demo se hace manual con los datos que
//     se anoten en `nombre_externo`.

const TIPOS_INSTRUCCION = ["NORMAL", "CHEQUEO", "REFRESH"];
const CATEGORIAS = ["NORMAL", "DEMO", "CHEQUEO", "CHEQUEO_LINEA"];

// Normaliza el tipo de instrucción recibido del cliente.
function normalizarTipoInstruccion(v) {
  const t = String(v || "NORMAL").toUpperCase().trim();
  return TIPOS_INSTRUCCION.includes(t) ? t : "NORMAL";
}

// Normaliza la categoría de vuelo recibida del cliente.
function normalizarCategoria(v) {
  const t = String(v || "NORMAL").toUpperCase().trim();
  return CATEGORIAS.includes(t) ? t : "NORMAL";
}

// Devuelve el id_alumno de la ficha espejo del instructor cuyo usuario es
// `idUsuarioInstructor`, creándola si no existe. Debe correr DENTRO de una
// transacción (recibe el client). Lanza Error con code 'VALIDATION' si el
// usuario no corresponde a un instructor del sistema.
async function asegurarFichaPracticante(client, idUsuarioInstructor) {
  const uid = Number(idUsuarioInstructor);
  if (!Number.isInteger(uid)) {
    throw Object.assign(new Error("Usuario de practicante inválido"), { code: "VALIDATION" });
  }

  // ¿Ya tiene ficha? (cualquier fila alumno — respeta UNIQUE(id_usuario)).
  const existing = await client.query(
    `SELECT id_alumno FROM alumno WHERE id_usuario = $1 LIMIT 1`,
    [uid]
  );
  if (existing.rows.length) return existing.rows[0].id_alumno;

  // Debe ser un instructor real.
  const insRes = await client.query(
    `SELECT id_instructor, licencia FROM instructor WHERE id_usuario = $1 LIMIT 1`,
    [uid]
  );
  if (insRes.rows.length === 0) {
    throw Object.assign(new Error("El practicante debe ser un instructor del sistema"), { code: "VALIDATION" });
  }
  const idInstructor = insRes.rows[0].id_instructor;
  const numeroLicencia = insRes.rows[0].licencia ? String(insRes.rows[0].licencia).slice(0, 10) : null;

  // Licencia "Instructor" (mapea a las 5 aeronaves); fallback: la de mayor nivel.
  const licRes = await client.query(
    `SELECT id_licencia FROM licencia ORDER BY (nombre ILIKE 'instructor') DESC, nivel DESC LIMIT 1`
  );
  if (licRes.rows.length === 0) {
    throw Object.assign(new Error("No hay licencias configuradas en el sistema"), { code: "VALIDATION" });
  }
  const idLicencia = licRes.rows[0].id_licencia;

  const created = await client.query(
    `INSERT INTO alumno (id_usuario, id_instructor, id_licencia, numero_licencia, es_practicante, activo, horas_acumuladas)
     VALUES ($1, $2, $3, $4, true, true, 0)
     RETURNING id_alumno`,
    [uid, idInstructor, idLicencia, numeroLicencia]
  );
  return created.rows[0].id_alumno;
}

// Devuelve el id_alumno de la ficha placeholder compartida "sistema.externo"
// (sembrada por la migración 20260714000001). Si por algún motivo no existe
// todavía, la crea sobre la marcha con el mismo criterio.
async function asegurarFichaExterno(client) {
  const existing = await client.query(
    `SELECT a.id_alumno FROM alumno a JOIN usuario u ON u.id_usuario = a.id_usuario
      WHERE u.username = 'sistema.externo' LIMIT 1`
  );
  if (existing.rows.length) return existing.rows[0].id_alumno;

  const uRes = await client.query(
    `INSERT INTO usuario (nombre, apellido, correo, password_hash, rol, activo, must_change_password, username, must_set_email)
     VALUES ('Pasajero', 'Externo (Demo)', NULL, 'DISABLED_SYSTEM_ACCOUNT', 'ALUMNO', false, false, 'sistema.externo', false)
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
     RETURNING id_usuario`
  );
  const uid = uRes.rows[0].id_usuario;

  const licRes = await client.query(`SELECT id_licencia FROM licencia ORDER BY nivel DESC LIMIT 1`);
  const insRes = await client.query(`SELECT id_instructor FROM instructor ORDER BY id_instructor LIMIT 1`);
  if (licRes.rows.length === 0 || insRes.rows.length === 0) {
    throw Object.assign(new Error("No se pudo preparar la ficha de pasajero externo"), { code: "VALIDATION" });
  }

  const aRes = await client.query(
    `INSERT INTO alumno (id_usuario, id_instructor, id_licencia, es_externo, activo, horas_acumuladas)
     VALUES ($1, $2, $3, true, true, 0)
     RETURNING id_alumno`,
    [uid, insRes.rows[0].id_instructor, licRes.rows[0].id_licencia]
  );
  return aRes.rows[0].id_alumno;
}

/**
 * Resuelve el id_alumno efectivo para el slot de estudiante según la categoría
 * del vuelo, dentro de una transacción ya abierta. Centraliza NORMAL/DEMO/
 * CHEQUEO/CHEQUEO_LINEA para que ambos paths (semana publicada y no publicada)
 * se comporten igual.
 *
 * Devuelve { categoria, id_alumno, saltarConflictoAlumno, nombre_externo,
 * tipo_instruccion, id_licencia_chequeo }. Lanza Error con code 'VALIDATION' en
 * datos faltantes o inconsistentes (PIC == practicante, falta alumno, falta
 * practicante).
 */
async function resolverVueloEspecial(client, {
  categoria, id_alumno, id_instructor, id_usuario_practicante, tipo_instruccion, nombre_externo,
  id_licencia_chequeo,
}) {
  const cat = normalizarCategoria(categoria);

  if (cat === "NORMAL" || cat === "CHEQUEO") {
    if (!id_alumno) {
      throw Object.assign(new Error("Falta el alumno"), { code: "VALIDATION" });
    }
    // Para CHEQUEO, persistimos la licencia EFECTIVAMENTE chequeada (el
    // override elegido, o si no se eligió ninguna, la propia del alumno —
    // así la Proyección siempre tiene un dato para mostrar "SIGLA/CHECK").
    let idLicenciaChequeoEfectiva = null;
    if (cat === "CHEQUEO") {
      if (id_licencia_chequeo) {
        idLicenciaChequeoEfectiva = Number(id_licencia_chequeo);
      } else {
        const a = await client.query(`SELECT id_licencia FROM alumno WHERE id_alumno = $1`, [id_alumno]);
        idLicenciaChequeoEfectiva = a.rows[0]?.id_licencia ?? null;
      }
    }
    return {
      categoria: cat, id_alumno: Number(id_alumno), saltarConflictoAlumno: false,
      nombre_externo: null, tipo_instruccion: null, id_licencia_chequeo: idLicenciaChequeoEfectiva,
    };
  }

  if (cat === "DEMO") {
    const idAlumnoExterno = await asegurarFichaExterno(client);
    const nombre = nombre_externo ? String(nombre_externo).trim().slice(0, 120) || null : null;
    return { categoria: cat, id_alumno: idAlumnoExterno, saltarConflictoAlumno: true, nombre_externo: nombre, tipo_instruccion: null, id_licencia_chequeo: null };
  }

  // CHEQUEO_LINEA (instructor-con-instructor)
  if (!id_usuario_practicante) {
    throw Object.assign(new Error("Falta el instructor practicante"), { code: "VALIDATION" });
  }
  const tipoInstruccion = normalizarTipoInstruccion(tipo_instruccion);
  if (tipoInstruccion === "NORMAL") {
    throw Object.assign(new Error("Elegí si el chequeo de línea es Chequeo o Refresh"), { code: "VALIDATION" });
  }
  if (id_instructor) {
    const picRes = await client.query(`SELECT id_usuario FROM instructor WHERE id_instructor = $1`, [id_instructor]);
    if (picRes.rows[0]?.id_usuario === Number(id_usuario_practicante)) {
      throw Object.assign(new Error("El PIC y el practicante no pueden ser la misma persona"), { code: "VALIDATION" });
    }
  }
  const idAlumnoEspejo = await asegurarFichaPracticante(client, id_usuario_practicante);
  return { categoria: cat, id_alumno: idAlumnoEspejo, saltarConflictoAlumno: false, nombre_externo: null, tipo_instruccion: tipoInstruccion, id_licencia_chequeo: null };
}

module.exports = {
  asegurarFichaPracticante,
  asegurarFichaExterno,
  resolverVueloEspecial,
  normalizarTipoInstruccion,
  normalizarCategoria,
  TIPOS_INSTRUCCION,
  CATEGORIAS,
};
