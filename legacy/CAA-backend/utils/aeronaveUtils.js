const db = require("../config/db");
const transporter = require("./mailer");

/**
 * Actualiza las horas de una aeronave y verifica si debe disparar mantenimientos o alertas.
 * @param {Object} client - Cliente de la base de datos (con transacción)
 * @param {number} id_aeronave 
 * @param {number} horasAAgregar - Horas a sumar (provenientes del TAC)
 * @param {Object} io - Objeto socket.io para alertas en tiempo real
 */
async function actualizarHorasAeronave(client, id_vuelo, id_aeronave, horasAAgregar, io) {
  if (horasAAgregar <= 0) return;

  const aeronaveRes = await client.query(
    `SELECT COALESCE(horas_acumuladas, 0) AS horas_acumuladas, codigo 
     FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`,
    [id_aeronave]
  );
  if (aeronaveRes.rows.length === 0) return;

  const horasAntes = parseFloat(aeronaveRes.rows[0].horas_acumuladas);
  const nuevasHoras = horasAntes + horasAAgregar;
  const codigo = aeronaveRes.rows[0].codigo;

  // 1. Registrar histórico
  await client.query(
    `INSERT INTO horas_vuelo_aeronave (id_vuelo, id_aeronave, horas_voladas, horas_acumuladas, registrado_en)
     VALUES ($1, $2, $3, $4, NOW())`,
    [id_vuelo, id_aeronave, horasAAgregar, nuevasHoras]
  );

  // 2. Actualizar aeronave
  const updRes = await client.query(
    `UPDATE aeronave
     SET horas_acumuladas = $1::numeric,
         tipo_proxima_revision = CASE
           WHEN $1::numeric < 50  THEN '50HR'
           WHEN $1::numeric < 100 THEN '100HR'
           ELSE tipo_proxima_revision
         END,
         horas_proxima_revision = CASE
           WHEN $1::numeric < 50  THEN 50
           WHEN $1::numeric < 100 THEN 100
           ELSE horas_proxima_revision
         END
     WHERE id_aeronave = $2
     RETURNING horas_acumuladas, horas_proxima_revision, tipo_proxima_revision`,
    [nuevasHoras, id_aeronave]
  );

  // 2. Verificar cruce de umbrales (50HR, 100HR)
  let cruzado50 = false;
  if (horasAntes < 50 && nuevasHoras >= 50) {
    const dup = await client.query(
      `SELECT 1 FROM mantenimiento_aeronave
       WHERE id_aeronave = $1 AND tipo = '50HR' AND completado = false`,
      [id_aeronave]
    );
    if (dup.rows.length === 0) {
      await client.query(
        `INSERT INTO mantenimiento_aeronave
           (id_aeronave, tipo, fecha_programada, horas_actuales, horas_proxima, completado, estado)
         VALUES ($1, '50HR', CURRENT_DATE, $2, 50, false, 'PENDIENTE')`,
        [id_aeronave, nuevasHoras]
      );
      cruzado50 = true;
    }
  }

  let cruzado100 = false;
  if (horasAntes < 100 && nuevasHoras >= 100) {
    const dup = await client.query(
      `SELECT 1 FROM mantenimiento_aeronave
       WHERE id_aeronave = $1 AND tipo = '100HR' AND completado = false`,
      [id_aeronave]
    );
    if (dup.rows.length === 0) {
      await client.query(
        `INSERT INTO mantenimiento_aeronave
           (id_aeronave, tipo, fecha_programada, horas_actuales, horas_proxima, completado, estado)
         VALUES ($1, '100HR', CURRENT_DATE, $2, 100, false, 'PENDIENTE')`,
        [id_aeronave, nuevasHoras]
      );
      cruzado100 = true;
    }
  }

  // 3. Notificaciones Socket.io
  if (io) {
    if (cruzado50) {
      io.emit("alerta_mantenimiento", {
        aeronave_codigo: codigo,
        horas_acumuladas: nuevasHoras,
        tipo: "50HR",
        mensaje: `${codigo} ha alcanzado 50HR — requiere mantenimiento.`,
      });
    }
    if (cruzado100) {
      io.emit("alerta_mantenimiento", {
        aeronave_codigo: codigo,
        horas_acumuladas: nuevasHoras,
        tipo: "100HR",
        mensaje: `${codigo} ha alcanzado 100HR — requiere mantenimiento.`,
      });
    }
  }

  // 4. Alertas de proximidad (Mail y Socket)
  const proximaFija = nuevasHoras < 50 ? 50 : nuevasHoras < 100 ? 100 : null;
  if (proximaFija !== null) {
    const hRestantes = proximaFija - nuevasHoras;
    let tipoAlerta = null;
    if (hRestantes <= 5)       tipoAlerta = "ALERTA_MANTENIMIENTO_5HR";
    else if (hRestantes <= 10) tipoAlerta = "ALERTA_MANTENIMIENTO_10HR";

    if (tipoAlerta) {
      const usuariosRes = await client.query(
        `SELECT id_usuario, correo FROM usuario WHERE rol IN ('ADMIN', 'PROGRAMACION') AND activo = true`
      );
      const correosAdmin = usuariosRes.rows.map(u => u.correo).filter(Boolean);
      if (correosAdmin.length > 0) {
        const texto = `Alerta de mantenimiento para la aeronave ${codigo}.\nHoras acumuladas: ${nuevasHoras.toFixed(2)}\nHoras restantes para el próximo mantenimiento (${proximaFija}HR): ${hRestantes.toFixed(2)}`;
        transporter.sendMail({
          from: process.env.MAIL_FROM_ADDRESS,
          to: correosAdmin.join(", "),
          subject: `Alerta de mantenimiento — ${codigo}`,
          text: texto
        }).catch(err => console.error(err));
      }

      if (io && hRestantes <= 5) {
        io.emit("proximidad_mantenimiento", {
          aeronave_codigo: codigo,
          horas_restantes: parseFloat(hRestantes.toFixed(2)),
          tipo: proximaFija === 50 ? "50HR" : "100HR",
          mensaje: `${codigo}: faltan ${hRestantes.toFixed(1)} horas para mantenimiento.`,
        });
      }
    }
  }

  // 5. Módulo Taller: avisar si alguna tarea programada (por horas) acaba de
  //    cruzar a "próxima a vencer" (<=10h) o ya "vencida" con este vuelo.
  //    Defensivo: si las tablas aún no existen (módulo no migrado), se ignora
  //    sin afectar el cierre del vuelo.
  try {
    const tareasRes = await client.query(
      `SELECT nombre, tipo, proxima_horas
         FROM taller_tarea_programada
        WHERE id_aeronave = $1 AND activo = true AND proxima_horas IS NOT NULL`,
      [id_aeronave]
    );
    for (const t of tareasRes.rows) {
      const prox = parseFloat(t.proxima_horas);
      const restanteAntes = prox - horasAntes;
      const restanteAhora = prox - nuevasHoras;
      const cruzoVencido = restanteAntes > 0 && restanteAhora <= 0;
      const cruzoProximo = restanteAntes > 10 && restanteAhora <= 10 && restanteAhora > 0;
      if (io && (cruzoVencido || cruzoProximo)) {
        io.emit("alerta_taller", {
          aeronave_codigo: codigo,
          tarea: t.nombre,
          tipo: t.tipo,
          horas_restantes: parseFloat(restanteAhora.toFixed(2)),
          estado: cruzoVencido ? "VENCIDO" : "PROXIMO",
          mensaje: cruzoVencido
            ? `${codigo}: "${t.nombre}" está VENCIDA.`
            : `${codigo}: "${t.nombre}" próxima a vencer (${restanteAhora.toFixed(1)}h).`,
        });
      }
    }
  } catch (e) {
    // Módulo Taller no disponible / no migrado: no es crítico para el vuelo.
    if (e.code !== "42P01") console.error("Taller alerta tareas:", e.message);
  }
}

module.exports = {
  actualizarHorasAeronave,
};
