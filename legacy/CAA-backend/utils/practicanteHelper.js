// Ficha espejo del practicante (instructor que RECIBE instrucción en un vuelo
// instructor-con-instructor). El practicante ocupa el slot de estudiante con una
// fila `alumno` marcada es_practicante, ligada a su MISMO usuario. Como
// `alumno` tiene UNIQUE(id_usuario), hay a lo sumo una ficha por instructor.

const TIPOS_INSTRUCCION = ["NORMAL", "CHEQUEO", "REFRESH"];

// Normaliza el tipo de instrucción recibido del cliente.
function normalizarTipoInstruccion(v) {
  const t = String(v || "NORMAL").toUpperCase().trim();
  return TIPOS_INSTRUCCION.includes(t) ? t : "NORMAL";
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

module.exports = { asegurarFichaPracticante, normalizarTipoInstruccion, TIPOS_INSTRUCCION };
