const db = require("../../config/db");

exports.listAlumnosConSaldo = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT a.id_alumno,
             u.username,
             u.correo,
             u.nombre, u.apellido,
             u.dui, u.direccion,
             u.es_extranjero, u.pasaporte, u.nacionalidad,
             COALESCE(u.telefono, a.telefono) AS telefono,
             COALESCE(c.saldo_actual_usd, 0) AS saldo_actual_usd,
             c.ultimo_movimiento_en,
             a.es_practicante,
             a.numero_licencia,
             a.id_instructor, iu.username AS instructor_username,
             a.id_licencia, l.nombre AS licencia_nombre
      FROM alumno a
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      LEFT JOIN cuenta_corriente_alumno c ON c.id_alumno = a.id_alumno
      LEFT JOIN instructor i ON i.id_instructor = a.id_instructor
      LEFT JOIN usuario iu ON iu.id_usuario = i.id_usuario
      LEFT JOIN licencia l ON l.id_licencia = a.id_licencia
      WHERE NOT COALESCE(a.es_externo, false)
      ORDER BY u.username
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Actualiza los datos fiscales/generales (en `usuario`) de un alumno. Sirve para
// crear DUI/dirección/teléfono que antes no existían (fila "Ver datos fiscales").
exports.actualizarDatosFiscales = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const { dui, direccion, telefono, correo, nombre, apellido, es_extranjero, pasaporte, nacionalidad } = req.body;
    const uRes = await db.query(`SELECT id_usuario FROM alumno WHERE id_alumno = $1`, [id_alumno]);
    if (!uRes.rows.length) return res.status(404).json({ ok: false, message: "Alumno no encontrado" });
    const id_usuario = uRes.rows[0].id_usuario;
    const r = await db.query(`
      UPDATE usuario SET
        dui          = COALESCE($2, dui),
        direccion    = COALESCE($3, direccion),
        telefono     = COALESCE($4, telefono),
        correo       = COALESCE(NULLIF($5, ''), correo),
        nombre       = COALESCE(NULLIF($6, ''), nombre),
        apellido     = COALESCE(NULLIF($7, ''), apellido),
        es_extranjero = COALESCE($8::boolean, es_extranjero),
        pasaporte    = COALESCE($9, pasaporte),
        nacionalidad = COALESCE($10, nacionalidad)
      WHERE id_usuario = $1
      RETURNING dui, direccion, telefono, correo, nombre, apellido, es_extranjero, pasaporte, nacionalidad
    `, [id_usuario, dui ?? null, direccion ?? null, telefono ?? null, correo ?? null, nombre ?? null, apellido ?? null,
        es_extranjero ?? null, pasaporte ?? null, nacionalidad ?? null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.getCuenta = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const cuenta = await db.query(`
      SELECT c.id_alumno, COALESCE(c.saldo_actual_usd, 0) AS saldo_actual_usd,
             c.ultimo_movimiento_en, u.username, u.correo
      FROM alumno a
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      LEFT JOIN cuenta_corriente_alumno c ON c.id_alumno = a.id_alumno
      WHERE a.id_alumno = $1
    `, [id_alumno]);
    if (cuenta.rows.length === 0) return res.status(404).json({ ok: false, message: "Alumno no encontrado" });
    res.json({ ok: true, data: cuenta.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.getExtracto = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const { desde, hasta } = req.query;
    // El SALDO de cada fila se calcula AL LEER como suma corrida ordenada por
    // (fecha, id) — NO se lee de la columna guardada `saldo_resultante_usd`
    // (que quedaba congelada y desincronizada al meter/editar movimientos con
    // fecha anterior). Así el extracto se comporta como Excel: insertás o
    // editás cualquier movimiento con cualquier fecha y todos los saldos de
    // abajo se recalculan solos. El campo se llama `saldo_corrido`.
    //
    // La suma corrida se calcula en el CTE sobre TODOS los movimientos del
    // alumno; el filtro de fechas (desde/hasta) solo limita las filas que se
    // muestran, no el punto de partida del saldo.
    const params = [id_alumno];
    let dateFilter = "";
    if (desde) { params.push(desde); dateFilter += ` AND base.fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta); dateFilter += ` AND base.fecha <= $${params.length}`; }
    const r = await db.query(`
      WITH base AS (
        SELECT m.*,
               SUM(m.monto_usd) OVER (
                 ORDER BY m.fecha ASC, m.id ASC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS saldo_corrido
        FROM movimiento_cuenta m
        WHERE m.id_alumno = $1
      )
      SELECT base.*,
             f.numero_correlativo AS factura_correlativo,
             r.numero_correlativo AS recibo_correlativo,
             u.username AS registrado_por_username,
             ue.username AS editado_por_username
      FROM base
      LEFT JOIN factura f ON f.id = base.id_factura
      LEFT JOIN recibo_pago r ON r.id = base.id_recibo
      LEFT JOIN usuario u ON u.id_usuario = base.registrado_por
      LEFT JOIN usuario ue ON ue.id_usuario = base.editado_por
      WHERE TRUE ${dateFilter}
      ORDER BY base.fecha ASC, base.id ASC
      LIMIT 500
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * Ajuste rápido HABER/DEBE sin metadatos de hoja azul.
 * Para cargos completos estilo bitácora física, usar `cargoManual` abajo.
 */
exports.ajuste = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_alumno } = req.params;
    const { tipo, monto_usd, descripcion } = req.body;
    if (!['AJUSTE_DEBE','AJUSTE_HABER'].includes(tipo)) {
      return res.status(400).json({ ok: false, message: "Tipo de ajuste inválido" });
    }
    const signo = tipo === 'AJUSTE_HABER' ? 1 : -1;
    await client.query("BEGIN");
    let cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    if (cuenta.rows.length === 0) {
      await client.query(`INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd) VALUES ($1, 0)`, [id_alumno]);
      cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    }
    const saldo_actual = Number(cuenta.rows[0].saldo_actual_usd);
    const nuevo_saldo = saldo_actual + (signo * Number(monto_usd));
    await client.query(`UPDATE cuenta_corriente_alumno SET saldo_actual_usd = $2, ultimo_movimiento_en = NOW() WHERE id_alumno = $1`, [id_alumno, nuevo_saldo]);
    await client.query(`
      INSERT INTO movimiento_cuenta (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, registrado_por)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id_alumno, tipo, descripcion || `Ajuste manual`, signo * Number(monto_usd), nuevo_saldo, req.user?.id_usuario || null]);
    await client.query("COMMIT");
    res.json({ ok: true, saldo: nuevo_saldo });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

/**
 * Cargo manual estilo hoja azul CAAA.
 *
 * Permite a Administración registrar un débito o crédito con TODOS los
 * campos visibles de la cuenta corriente física:
 *   fecha, instructor, factura_no, avion (código), h_v (horas vuelo del día),
 *   h_t (horas totales acumuladas), debe, haber, descripcion.
 *
 * Si viene `debe` > 0 → movimiento tipo CARGO_OTRO con monto negativo.
 * Si viene `haber` > 0 → movimiento tipo DEPOSITO con monto positivo.
 */
exports.cargoManual = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_alumno } = req.params;
    const {
      fecha, instructor, factura_no, avion, h_v, h_t,
      debe, haber, descripcion, nota, es_multa
    } = req.body;

    const debeNum = Number(debe || 0);
    const haberNum = Number(haber || 0);
    if (debeNum <= 0 && haberNum <= 0) {
      return res.status(400).json({ ok: false, message: "Debes indicar un monto en DEBE o HABER" });
    }
    if (debeNum > 0 && haberNum > 0) {
      return res.status(400).json({ ok: false, message: "Un movimiento no puede tener DEBE y HABER simultáneamente" });
    }

    const esCargo = debeNum > 0;
    const monto = esCargo ? -debeNum : haberNum;
    // Una multa (ej. no-show) es un cargo que debita saldo pero NO registra horas
    // de vuelo ni se suma a horas totales.
    const tipo  = esCargo ? (es_multa ? 'CARGO_MULTA' : 'CARGO_OTRO') : 'DEPOSITO';
    // En multas se ignoran las horas aunque vengan en el body.
    const horasVuelo  = es_multa ? null : (h_v != null && h_v !== '' ? Number(h_v) : null);
    const horasTotales = es_multa ? null : (h_t != null && h_t !== '' ? Number(h_t) : null);

    await client.query("BEGIN");

    // Asegurar fila de cuenta y bloquearla
    let cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    if (cuenta.rows.length === 0) {
      await client.query(`INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd) VALUES ($1, 0)`, [id_alumno]);
      cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    }
    const nuevo_saldo = Number(cuenta.rows[0].saldo_actual_usd) + monto;

    await client.query(`
      UPDATE cuenta_corriente_alumno
      SET saldo_actual_usd = $2, ultimo_movimiento_en = NOW()
      WHERE id_alumno = $1
    `, [id_alumno, nuevo_saldo]);

    const descripcionFinal = descripcion ||
      (es_multa
        ? `Multa${instructor ? ' - ' + instructor : ''}`
        : esCargo
          ? `Cargo manual${avion ? ' ' + avion : ''}${h_v ? ' ' + h_v + 'h' : ''}${instructor ? ' - ' + instructor : ''}`
          : `Depósito manual${descripcion ? ' - ' + descripcion : ''}`);

    const mov = await client.query(`
      INSERT INTO movimiento_cuenta
        (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
         instructor_nombre, avion_codigo, horas_vuelo, horas_totales, nota,
         generado_automatico, registrado_por)
      VALUES ($1, $2, COALESCE($3, NOW()), $4, $5, $6, $7, $8, $9, $10, $11, FALSE, $12)
      RETURNING *
    `, [
      id_alumno, tipo, fecha || null, descripcionFinal,
      monto, nuevo_saldo,
      instructor || null, avion || null,
      horasVuelo, horasTotales,
      nota || null,
      req.user?.id_usuario || null
    ]);

    // Si trae número de factura manual, asociarlo (búsqueda best-effort)
    if (factura_no) {
      const f = await client.query(
        `SELECT id FROM factura WHERE numero_correlativo = $1 LIMIT 1`,
        [factura_no]
      );
      if (f.rows.length > 0) {
        await client.query(
          `UPDATE movimiento_cuenta SET id_factura = $2 WHERE id = $1`,
          [mov.rows[0].id, f.rows[0].id]
        );
      }
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("cuenta_alumno_movimiento", { id_alumno: Number(id_alumno), saldo: nuevo_saldo });

    res.json({ ok: true, data: mov.rows[0], saldo: nuevo_saldo });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

/**
 * Aplica un cobro de un concepto del catálogo (concepto_cobro) a la cuenta del
 * alumno: debita el saldo prepagado (movimiento CARGO_OTRO) y enlaza el concepto
 * para poder reportar ingresos por concepto. Ej: "Reposición de examen" $60.
 */
exports.cobrarConcepto = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_alumno } = req.params;
    const { id_concepto, monto_usd, fecha, descripcion } = req.body;

    const cRes = await client.query(`SELECT * FROM concepto_cobro WHERE id = $1 AND activo = true`, [id_concepto]);
    if (!cRes.rows.length) return res.status(404).json({ ok: false, message: "Concepto de cobro no encontrado" });
    const concepto = cRes.rows[0];
    const monto = Number(monto_usd != null && monto_usd !== '' ? monto_usd : concepto.monto_usd);
    if (!(monto > 0)) return res.status(400).json({ ok: false, message: "El monto debe ser mayor a 0" });

    await client.query("BEGIN");
    let cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    if (cuenta.rows.length === 0) {
      await client.query(`INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd) VALUES ($1, 0)`, [id_alumno]);
      cuenta = await client.query(`SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [id_alumno]);
    }
    const nuevo_saldo = Number(cuenta.rows[0].saldo_actual_usd) - monto;
    await client.query(`UPDATE cuenta_corriente_alumno SET saldo_actual_usd = $2, ultimo_movimiento_en = NOW() WHERE id_alumno = $1`, [id_alumno, nuevo_saldo]);

    const desc = (descripcion && descripcion.trim()) || concepto.nombre;
    const mov = await client.query(`
      INSERT INTO movimiento_cuenta
        (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
         id_concepto_cobro, generado_automatico, registrado_por)
      VALUES ($1, 'CARGO_OTRO', COALESCE($2, NOW()), $3, $4, $5, $6, FALSE, $7)
      RETURNING *
    `, [id_alumno, fecha || null, desc, -monto, nuevo_saldo, id_concepto, req.user?.id_usuario || null]);

    await client.query("COMMIT");
    const io = req.app.get("io");
    if (io) io.emit("cuenta_alumno_movimiento", { id_alumno: Number(id_alumno), saldo: nuevo_saldo });
    res.json({ ok: true, data: mov.rows[0], saldo: nuevo_saldo });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

/**
 * Edición de un movimiento existente (auditoría / corrección).
 *
 * Permite a Administración corregir cualquier campo visible de un movimiento.
 * Si cambia el monto, recalcula la cadena de saldos posteriores del alumno.
 * Queda registrado en `editado_en`, `editado_por`, `motivo_edicion`.
 */
exports.editarMovimiento = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const {
      fecha, instructor, factura_no, avion, h_v, h_t,
      debe, haber, descripcion, nota, motivo_edicion
    } = req.body;

    if (!motivo_edicion || motivo_edicion.trim().length < 3) {
      return res.status(400).json({ ok: false, message: "El motivo de edición es obligatorio (mínimo 3 caracteres)" });
    }

    await client.query("BEGIN");

    const movRes = await client.query(
      `SELECT * FROM movimiento_cuenta WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (movRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Movimiento no encontrado" });
    }
    const mov = movRes.rows[0];

    // Calcular nuevo monto si cambió DEBE/HABER
    const debeNum = debe != null && debe !== '' ? Number(debe) : null;
    const haberNum = haber != null && haber !== '' ? Number(haber) : null;
    let nuevoMonto = Number(mov.monto_usd);
    if (debeNum != null && debeNum > 0) nuevoMonto = -debeNum;
    else if (haberNum != null && haberNum > 0) nuevoMonto = haberNum;

    const diff = nuevoMonto - Number(mov.monto_usd);

    // Actualizar campos del movimiento
    await client.query(`
      UPDATE movimiento_cuenta SET
        fecha             = COALESCE($2, fecha),
        descripcion       = COALESCE($3, descripcion),
        monto_usd         = $4,
        instructor_nombre = COALESCE($5, instructor_nombre),
        avion_codigo      = COALESCE($6, avion_codigo),
        horas_vuelo       = COALESCE($7, horas_vuelo),
        horas_totales     = COALESCE($8, horas_totales),
        nota              = COALESCE($9, nota),
        editado_en        = NOW(),
        editado_por       = $10,
        motivo_edicion    = $11
      WHERE id = $1
    `, [
      id,
      fecha || null,
      descripcion || null,
      nuevoMonto,
      instructor || null,
      avion || null,
      h_v != null && h_v !== '' ? Number(h_v) : null,
      h_t != null && h_t !== '' ? Number(h_t) : null,
      nota || null,
      req.user?.id_usuario || null,
      motivo_edicion
    ]);

    // El saldo corrido por fila se calcula AL LEER (getExtracto), así que no hay
    // que parchear `saldo_resultante_usd` en cascada — cambiar monto o fecha se
    // refleja solo. Solo mantenemos el saldo TOTAL del alumno = suma de todos
    // sus movimientos (independiente del orden, así que basta re-sumar).
    if (diff !== 0) {
      await client.query(`SELECT 1 FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [mov.id_alumno]);
      await client.query(`
        UPDATE cuenta_corriente_alumno c
        SET saldo_actual_usd = (
          SELECT COALESCE(SUM(monto_usd), 0) FROM movimiento_cuenta
          WHERE id_alumno = $1
        ),
        ultimo_movimiento_en = NOW()
        WHERE c.id_alumno = $1
      `, [mov.id_alumno]);
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("cuenta_alumno_movimiento", { id_alumno: mov.id_alumno });

    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

/**
 * Borrar un movimiento — comportamiento tipo Excel: la fila DESAPARECE por
 * completo (no queda bandera `anulado` ni una fila de "Anulación"), y el saldo
 * corrido de las demás se recalcula solo al leer (getExtracto).
 *
 * `borrar_documento` (bool): si el movimiento tiene un recibo o factura ligado
 * y el usuario lo confirmó, se borra también ese documento (con sus detalles).
 * Si es false, el documento fiscal queda en su listado y solo se quita el
 * movimiento de la cuenta.
 */
exports.anularMovimiento = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const borrarDocumento = req.body?.borrar_documento === true;

    await client.query("BEGIN");
    const movRes = await client.query(
      `SELECT * FROM movimiento_cuenta WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (movRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Movimiento no encontrado" });
    }
    const mov = movRes.rows[0];

    // Borrar el movimiento de la cuenta.
    await client.query(`DELETE FROM movimiento_cuenta WHERE id = $1`, [id]);

    // Si se pidió, borrar también el documento fiscal ligado (primero sus
    // detalles hijos por las llaves foráneas).
    if (borrarDocumento) {
      if (mov.id_recibo) {
        await client.query(`DELETE FROM recibo_detalle WHERE id_recibo = $1`, [mov.id_recibo]);
        await client.query(`DELETE FROM recibo_pago WHERE id = $1`, [mov.id_recibo]);
      }
      if (mov.id_factura) {
        await client.query(`DELETE FROM factura_detalle WHERE id_factura = $1`, [mov.id_factura]);
        await client.query(`DELETE FROM factura WHERE id = $1`, [mov.id_factura]);
      }
    }

    // Recalcular el saldo total del alumno = suma de los movimientos que quedan.
    await client.query(`SELECT 1 FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE`, [mov.id_alumno]);
    const saldoRes = await client.query(`
      UPDATE cuenta_corriente_alumno c
      SET saldo_actual_usd = (SELECT COALESCE(SUM(monto_usd), 0) FROM movimiento_cuenta WHERE id_alumno = $1),
          ultimo_movimiento_en = NOW()
      WHERE c.id_alumno = $1
      RETURNING saldo_actual_usd
    `, [mov.id_alumno]);
    const nuevo_saldo = saldoRes.rows.length ? Number(saldoRes.rows[0].saldo_actual_usd) : 0;

    await client.query("COMMIT");
    const io = req.app.get("io");
    if (io) io.emit("cuenta_alumno_movimiento", { id_alumno: mov.id_alumno, saldo: nuevo_saldo });
    res.json({ ok: true, saldo: nuevo_saldo });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
