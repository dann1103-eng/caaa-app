const db = require("../config/db");
const bcrypt = require("bcrypt");

exports.getPerfil = async (req, res) => {
  const user = req.user;

  const result = await db.query(`
    SELECT
      u.id_usuario,
      u.username,
      u.nombre,
      u.apellido,
      u.correo,
      u.rol,
      u.must_change_password,
      u.must_set_email,
      u.datos_confirmados,
      u.dui,
      u.direccion,
      u.es_extranjero,
      u.pasaporte,
      u.nacionalidad,
      COALESCE(u.telefono, a.telefono) AS telefono,
      a.numero_licencia,
      a.certificado_medico,
      a.soleado,
      a.seguro_vida,
      a.seguro_vida_vencimiento,
      a.seguro_vida_numero,
      a.certificado_medico_numero
    FROM usuario u
    LEFT JOIN alumno a ON a.id_usuario = u.id_usuario
    WHERE u.id_usuario = $1
  `, [user.id_usuario]);

  res.json(result.rows[0]);
};

// Confirma los datos generales/fiscales del usuario (robapantallas de 1er login).
// Guarda en `usuario` y marca datos_confirmados = true para desbloquear el home.
exports.confirmarDatos = async (req, res) => {
  try {
    const user = req.user;
    const { nombre, apellido, telefono, dui, direccion, es_extranjero, pasaporte, nacionalidad } = req.body;
    if (!nombre?.trim() || !apellido?.trim()) {
      return res.status(400).json({ message: "Nombre y apellido son obligatorios" });
    }
    await db.query(`
      UPDATE usuario SET
        nombre       = $2,
        apellido     = $3,
        telefono     = $4,
        dui          = $5,
        direccion    = $6,
        es_extranjero = COALESCE($7::boolean, es_extranjero),
        pasaporte    = $8,
        nacionalidad = $9,
        datos_confirmados = true
      WHERE id_usuario = $1
    `, [user.id_usuario, nombre.trim(), apellido.trim(), telefono || null, dui || null, direccion || null,
        es_extranjero ?? null, pasaporte || null, nacionalidad || null]);
    // Si el usuario es alumno y dio teléfono, reflejarlo también en su ficha.
    if (telefono) {
      await db.query(`UPDATE alumno SET telefono = $2 WHERE id_usuario = $1`, [user.id_usuario, telefono]);
    }
    res.json({ message: "Datos confirmados ✅" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.cambiarPassword = async (req, res) => {
  const { nuevaPassword } = req.body;
  const user = req.user;

  const regex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!regex.test(nuevaPassword)) {
    return res.status(400).json({
      message: "Mínimo 8 caracteres, una mayúscula y un número"
    });
  }

  const hash = await bcrypt.hash(nuevaPassword, 10);

  await db.query(`
    UPDATE usuario
    SET password_hash = $1,
        must_change_password = false
    WHERE id_usuario = $2
  `, [hash, user.id_usuario]);

  res.json({ message: "Contraseña actualizada ✅" });
};

exports.cambiarCorreo = async (req, res) => {
  const { nuevoCorreo } = req.body;
  const user = req.user;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(nuevoCorreo)) {
    return res.status(400).json({ message: "Correo inválido" });
  }

  try {
    await db.query(
      `
      UPDATE usuario
      SET correo = $1,
          must_set_email = false
      WHERE id_usuario = $2
      `,
      [nuevoCorreo.toLowerCase(), user.id_usuario]
    );

    res.json({ message: "Correo actualizado ✅" });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(400).json({ message: "Ese correo ya está en uso" });
    }
    console.error(e);
    res.status(500).json({ message: "Error actualizando correo" });
  }
};

exports.updatePerfilAlumno = async (req, res) => {
  const user = req.user;

  if (user.rol !== "ALUMNO") {
    return res.status(403).json({ message: "Solo alumnos pueden actualizar estos campos" });
  }

  const { telefono, numero_licencia, certificado_medico, certificado_medico_numero, seguro_vida_vencimiento, seguro_vida_numero } = req.body;

  try {
    // Validaciones básicas
    if (telefono && !/^\d{4}-\d{4}$/.test(telefono)) {
      return res.status(400).json({ message: "El teléfono debe tener el formato 7777-7777" });
    }
    if (seguro_vida_numero && !/^\d{1,5}$/.test(seguro_vida_numero)) {
      return res.status(400).json({ message: "El número de seguro debe ser de máximo 5 dígitos numéricos" });
    }
    if (certificado_medico_numero && !/^\d{1,5}$/.test(certificado_medico_numero)) {
      return res.status(400).json({ message: "El número de certificado médico debe ser de máximo 5 dígitos numéricos" });
    }

    const result = await db.query(
      `UPDATE alumno
       SET telefono           = $1,
           numero_licencia    = $2,
           certificado_medico = $3,
           seguro_vida_vencimiento = $4,
           seguro_vida_numero = $5,
           certificado_medico_numero = $6
       WHERE id_usuario = $7`,
      [
        telefono?.trim() || null,
        numero_licencia?.trim() || null,
        certificado_medico || null,
        seguro_vida_vencimiento || null,
        seguro_vida_numero?.trim() || null,
        certificado_medico_numero?.trim() || null,
        user.id_usuario,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Alumno no encontrado" });
    }

    res.json({ message: "Datos actualizados ✅" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al actualizar" });
  }
};

exports.updatePerfil = async (req, res) => {
  const { nombre, apellido } = req.body;
  const user = req.user;

  try {
    await db.query(`
      UPDATE usuario
      SET nombre = $1,
          apellido = $2
      WHERE id_usuario = $3
    `, [nombre, apellido, user.id_usuario]);

    res.json({ message: "Información personal actualizada ✅" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al actualizar información" });
  }
};