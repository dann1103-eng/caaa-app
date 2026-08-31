const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { syncProximaRevisionAeronave } = require("../../utils/aeronaveUtils");
// Fuente única del cálculo de vencimiento (antes vivía acá duplicada con
// dashboardController). Ver utils/vencimientos.js para las dos escalas del TAC.
const { calcularEstado, PESO_ESTADO, ES_ALERTA } = require("../../utils/vencimientos");

// ── Listar tareas programadas (opcionalmente por aeronave) ────────────────
exports.listTareas = catchAsync(async (req, res) => {
  const { id_aeronave, solo_alertas, tipo } = req.query;
  const params = [];
  const where = ["t.activo = true"];
  if (id_aeronave) { params.push(id_aeronave); where.push(`t.id_aeronave = $${params.length}`); }

  // Filtro por tipo: "AD,SB" para la pestaña de ADs, "VIDA_LIMITE" para la suya,
  // "INSPECCION" para la de Tareas. SIN el filtro devuelve todo, como siempre —
  // hay consumidores viejos (el dashboard, el widget de mantenimiento) que
  // esperan la lista completa y no deben cambiar de comportamiento.
  if (tipo) {
    const tipos = String(tipo).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (tipos.length) { params.push(tipos); where.push(`t.tipo = ANY($${params.length})`); }
  }

  const r = await db.query(`
    SELECT t.*,
           a.codigo AS aeronave_codigo,
           COALESCE(a.horas_acumuladas, 0) AS aeronave_horas,
           -- El front convierte a escala de libro para mostrar; lo guardado es
           -- escala del sistema. Ver utils/vencimientos.js.
           COALESCE(a.tac_offset, 0) AS tac_offset,
           c.nombre AS componente_nombre, c.tipo AS componente_tipo
    FROM taller_tarea_programada t
    JOIN aeronave a ON a.id_aeronave = t.id_aeronave
    LEFT JOIN taller_componente c ON c.id_componente = t.id_componente
    WHERE ${where.join(" AND ")}
    ORDER BY a.codigo, t.nombre
  `, params);

  let rows = r.rows.map((t) => ({ ...t, ...calcularEstado(t) }));
  if (solo_alertas === "true") rows = rows.filter((t) => ES_ALERTA(t.estado));
  // Ordenar por urgencia: vencidos primero, luego próximos por menos restante.
  rows.sort((a, b) => (PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado])
    || ((a.horas_restantes ?? 1e9) - (b.horas_restantes ?? 1e9)));
  res.json(rows);
});

// Calcula proxima_* a partir de ultima_* + intervalo_* (recurrente).
function proximos({ recurrente, intervalo_horas, intervalo_dias, intervalo_ciclos,
  ultima_horas, ultima_fecha, ultima_ciclos }) {
  if (!recurrente) return { proxima_horas: null, proxima_fecha: null, proxima_ciclos: null };
  const proxima_horas = (intervalo_horas != null && ultima_horas != null)
    ? Number(ultima_horas) + Number(intervalo_horas) : null;
  let proxima_fecha = null;
  if (intervalo_dias != null && ultima_fecha) {
    const d = new Date(ultima_fecha);
    d.setDate(d.getDate() + Number(intervalo_dias));
    proxima_fecha = d.toISOString().slice(0, 10);
  }
  const proxima_ciclos = (intervalo_ciclos != null && ultima_ciclos != null)
    ? Number(ultima_ciclos) + Number(intervalo_ciclos) : null;
  return { proxima_horas, proxima_fecha, proxima_ciclos };
}

// Cupo único: como mucho una fila tipo='INSPECCION' activa por avión (25/50/
// 100h, Anual, Overhaul — el ciclo preventivo periódico). AD/SB/VIDA_LIMITE/OTRO
// no tienen este límite. Hay también un índice único parcial en BD
// (uq_taller_tarea_inspeccion_activa) como red de seguridad; este chequeo
// solo existe para devolver un 409 legible en vez de un error crudo de constraint.
async function hayInspeccionActiva(id_aeronave, excluirIdTarea) {
  const params = [id_aeronave];
  let excl = "";
  if (excluirIdTarea != null) { params.push(excluirIdTarea); excl = `AND id_tarea <> $${params.length}`; }
  const r = await db.query(
    `SELECT id_tarea FROM taller_tarea_programada
      WHERE id_aeronave = $1 AND tipo = 'INSPECCION' AND activo = true ${excl}
      LIMIT 1`,
    params
  );
  return r.rows.length > 0;
}

// ── Crear tarea programada ────────────────────────────────────────────────
exports.crearTarea = catchAsync(async (req, res) => {
  const {
    id_aeronave, id_componente, nombre, descripcion, tipo, referencia, recurrente,
    intervalo_horas, intervalo_ciclos, intervalo_dias,
    ultima_fecha, ultima_horas, ultima_ciclos, proxima_horas,
    aplica, observaciones, necesita_confirmacion, nota_confirmacion,
  } = req.body;

  if (!id_aeronave || !nombre) {
    return res.status(400).json({ message: "Aeronave y nombre son obligatorios" });
  }

  const tipoResuelto = tipo || "INSPECCION";
  if (tipoResuelto === "INSPECCION" && await hayInspeccionActiva(id_aeronave)) {
    return res.status(409).json({ message: "Esta aeronave ya tiene una inspección periódica activa. Editala o cumplila en vez de crear otra." });
  }

  // Baseline de horas: prioridad a "última realización" si se da explícita.
  // Si en cambio se conoce la PRÓXIMA revisión (y no cuándo se hizo la última —
  // caso típico de sembrar "en limpio" sin historial confiable), se deriva
  // ultima_horas hacia atrás con el intervalo. Sin ninguno de los dos, se usan
  // las horas actuales de la aeronave.
  //
  // ⚠️ Ese relleno vale para INSPECCION, donde se está sembrando el ciclo. Para
  // AD / SB / VIDA_LIMITE **no**: la última aplicación es la constancia de que
  // el trabajo se hizo, y va impresa en un registro que la AAC audita. Rellenarla
  // con la fecha de hoy porque el formulario vino vacío es fabricar un
  // cumplimiento que nunca ocurrió. Si no se sabe, queda NULL y el renglón sale
  // como SIN_INTERVALO o N_A hasta que alguien lo dicte del libro.
  const esPeriodica = (tipo || "INSPECCION") === "INSPECCION";
  const aRes = await db.query(`SELECT COALESCE(horas_acumuladas,0) AS h FROM aeronave WHERE id_aeronave = $1`, [id_aeronave]);
  const horasActuales = aRes.rows.length ? parseFloat(aRes.rows[0].h) : 0;
  let baseHoras;
  if (ultima_horas != null) {
    baseHoras = ultima_horas;
  } else if (proxima_horas != null && intervalo_horas != null) {
    baseHoras = Number(proxima_horas) - Number(intervalo_horas);
  } else {
    baseHoras = esPeriodica ? horasActuales : null;
  }
  const baseFecha = ultima_fecha || (esPeriodica ? new Date().toISOString().slice(0, 10) : null);
  const esRec = recurrente !== false;

  const prox = proximos({
    recurrente: esRec, intervalo_horas, intervalo_dias, intervalo_ciclos,
    ultima_horas: baseHoras, ultima_fecha: baseFecha, ultima_ciclos,
  });
  // Si vino proxima_horas explícito, manda siempre — con o sin intervalo_horas
  // (proximos() solo lo calcula cuando hay intervalo; sin esto, un cupo
  // periódico creado sin intervalo quedaba con proxima_horas NULL).
  if (proxima_horas != null) prox.proxima_horas = Number(proxima_horas);

  const r = await db.query(`
    INSERT INTO taller_tarea_programada
      (id_aeronave, id_componente, nombre, descripcion, tipo, referencia, recurrente,
       intervalo_horas, intervalo_ciclos, intervalo_dias,
       ultima_fecha, ultima_horas, ultima_ciclos,
       proxima_fecha, proxima_horas, proxima_ciclos,
       aplica, observaciones, necesita_confirmacion, nota_confirmacion, origen)
    VALUES ($1,$2,$3,$4,COALESCE($5,'INSPECCION'),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
            $17,$18,$19,$20,'MANUAL')
    RETURNING *
  `, [
    id_aeronave, id_componente || null, nombre, descripcion || null, tipo, referencia || null, esRec,
    intervalo_horas ?? null, intervalo_ciclos ?? null, intervalo_dias ?? null,
    baseFecha, baseHoras, ultima_ciclos ?? null,
    prox.proxima_fecha, prox.proxima_horas, prox.proxima_ciclos,
    aplica !== false, observaciones || null, necesita_confirmacion === true, nota_confirmacion || null,
  ]);
  // Mantener sincronizado el cache de próxima revisión de la aeronave (fuente única).
  await syncProximaRevisionAeronave(db, id_aeronave);
  res.json(r.rows[0]);
});

// ── Editar tarea programada ───────────────────────────────────────────────
exports.editarTarea = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    nombre, descripcion, tipo, referencia, recurrente,
    intervalo_horas, intervalo_ciclos, intervalo_dias, activo,
    ultima_horas, ultima_fecha, proxima_horas,
    aplica, observaciones, necesita_confirmacion, nota_confirmacion,
  } = req.body;

  const cur = await db.query(`SELECT * FROM taller_tarea_programada WHERE id_tarea = $1`, [id]);
  if (!cur.rows.length) return res.status(404).json({ message: "Tarea no encontrada" });
  const t = cur.rows[0];

  // Clave ausente en el body = no se toca. Clave presente en null o "" = se
  // borra a propósito. Antes `descripcion` y `referencia` iban al SET como
  // `$n` pelado con `|| null`, así que un body parcial las NULIFICABA — el
  // mismo bug que en la orden de trabajo dejó sin piloto los PDF (§31). Con
  // los campos nuevos importa más: la pantalla manda `{aplica}` solo.
  const opt = (clave, actual) => (clave in req.body ? req.body[clave] : actual);
  const optTexto = (clave, actual) => {
    if (!(clave in req.body)) return actual;
    const v = req.body[clave];
    return v == null || String(v).trim() === "" ? null : v;
  };

  const tipoResuelto = tipo != null ? tipo : t.tipo;
  const activoResuelto = activo != null ? activo : t.activo;
  if (tipoResuelto === "INSPECCION" && activoResuelto && await hayInspeccionActiva(t.id_aeronave, t.id_tarea)) {
    return res.status(409).json({ message: "Esta aeronave ya tiene otra inspección periódica activa." });
  }

  const nuevoIntervaloHoras = intervalo_horas != null ? intervalo_horas : t.intervalo_horas;

  // Base de horas: prioridad a lo que mande el cliente. `proxima_horas` deja
  // fijar directamente el próximo vencimiento sin saber cuándo se hizo la
  // última — reinicio "en limpio" de una tarea cuyo historial no es confiable.
  let nuevaUltimaHoras = t.ultima_horas;
  if (ultima_horas != null) {
    nuevaUltimaHoras = ultima_horas;
  } else if (proxima_horas != null && nuevoIntervaloHoras != null) {
    nuevaUltimaHoras = Number(proxima_horas) - Number(nuevoIntervaloHoras);
  }
  const nuevaUltimaFecha = ultima_fecha || t.ultima_fecha;

  const merged = {
    recurrente: recurrente != null ? recurrente : t.recurrente,
    intervalo_horas: nuevoIntervaloHoras,
    intervalo_dias: intervalo_dias != null ? intervalo_dias : t.intervalo_dias,
    intervalo_ciclos: intervalo_ciclos != null ? intervalo_ciclos : t.intervalo_ciclos,
    ultima_horas: nuevaUltimaHoras, ultima_fecha: nuevaUltimaFecha, ultima_ciclos: t.ultima_ciclos,
  };
  const prox = proximos(merged);
  // Mismo criterio que crearTarea: proxima_horas explícito manda siempre.
  if (proxima_horas != null) prox.proxima_horas = Number(proxima_horas);

  const r = await db.query(`
    UPDATE taller_tarea_programada SET
      nombre = COALESCE($2, nombre),
      descripcion = $3,
      tipo = COALESCE($4, tipo),
      referencia = $5,
      recurrente = $6,
      intervalo_horas = $7,
      intervalo_ciclos = $8,
      intervalo_dias = $9,
      ultima_horas = $10,
      ultima_fecha = $11,
      proxima_fecha = $12,
      proxima_horas = $13,
      proxima_ciclos = $14,
      activo = COALESCE($15, activo),
      aplica = $16,
      observaciones = $17,
      necesita_confirmacion = $18,
      nota_confirmacion = $19
    WHERE id_tarea = $1
    RETURNING *
  `, [
    id, nombre, optTexto("descripcion", t.descripcion), tipo, optTexto("referencia", t.referencia),
    merged.recurrente,
    merged.intervalo_horas, merged.intervalo_ciclos, merged.intervalo_dias,
    merged.ultima_horas, merged.ultima_fecha,
    prox.proxima_fecha, prox.proxima_horas, prox.proxima_ciclos, activo,
    opt("aplica", t.aplica) !== false,
    optTexto("observaciones", t.observaciones),
    opt("necesita_confirmacion", t.necesita_confirmacion) === true,
    optTexto("nota_confirmacion", t.nota_confirmacion),
  ]);
  await syncProximaRevisionAeronave(db, t.id_aeronave);
  res.json(r.rows[0]);
});

// ── Resolver un conflicto del papel (solo jefe de taller) ─────────────────
//
// Hay ADs que figuran en la lista de ADs y en la de vida límite del MISMO avión
// diciendo cosas distintas: el 82-27-08 del YS-334-PE es "cada 100 h" en una y
// "cada 5,000 h" en la otra. El importador deja una sola fila, precargada con la
// lista de ADs (que trae la fecha más nueva), marcada con las dos versiones en
// nota_confirmacion. Acá el jefe dicta cuál vale.
//
// La nota NO se borra: queda el rastro de que el papel se contradecía y de qué
// se eligió. Es el mismo criterio del re-anclaje de los stickers.
exports.confirmarTarea = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { intervalo_horas, intervalo_dias, ultima_horas, ultima_fecha, proxima_horas } = req.body;

  const cur = await db.query(`SELECT * FROM taller_tarea_programada WHERE id_tarea = $1`, [id]);
  if (!cur.rows.length) return res.status(404).json({ message: "Tarea no encontrada" });
  const t = cur.rows[0];
  if (!t.necesita_confirmacion) {
    return res.status(409).json({ message: "Esta tarea no tiene ningún conflicto pendiente de resolver" });
  }

  const val = (clave, actual) => (clave in req.body ? req.body[clave] : actual);
  const merged = {
    recurrente: t.recurrente,
    intervalo_horas: val("intervalo_horas", t.intervalo_horas),
    intervalo_dias: val("intervalo_dias", t.intervalo_dias),
    intervalo_ciclos: t.intervalo_ciclos,
    ultima_horas: val("ultima_horas", t.ultima_horas),
    ultima_fecha: val("ultima_fecha", t.ultima_fecha),
    ultima_ciclos: t.ultima_ciclos,
  };
  const prox = proximos(merged);
  // Igual que en crear y editar: una próxima explícita manda sobre el cálculo.
  // Es la regla de Daniel — la próxima es el dato bueno, la última es referencia.
  if (proxima_horas != null) prox.proxima_horas = Number(proxima_horas);
  else if (prox.proxima_horas == null) prox.proxima_horas = t.proxima_horas;

  const r = await db.query(`
    UPDATE taller_tarea_programada SET
      intervalo_horas = $2, intervalo_dias = $3,
      ultima_horas = $4, ultima_fecha = $5,
      proxima_horas = $6, proxima_fecha = $7,
      necesita_confirmacion = false
    WHERE id_tarea = $1
    RETURNING *
  `, [
    id, merged.intervalo_horas, merged.intervalo_dias,
    merged.ultima_horas, merged.ultima_fecha,
    prox.proxima_horas, prox.proxima_fecha ?? t.proxima_fecha,
  ]);
  await syncProximaRevisionAeronave(db, t.id_aeronave);
  res.json(r.rows[0]);
});

// ── Registrar cumplimiento (resetea el reloj de la tarea) ─────────────────
//
// Para tipo='INSPECCION' (el cupo único periódico) esto NO recalcula por
// intervalo: quien cumple define de una vez el próximo tipo (nombre_siguiente)
// y a qué TAC le toca (proxima_horas_siguiente) — así nunca hay que adivinar,
// y jamás quedan dos filas abiertas en paralelo. Para AD/SB/VIDA_LIMITE/OTRO
// el comportamiento es exactamente el de siempre (recompute por intervalo).
exports.registrarCumplimiento = catchAsync(async (req, res) => {
  const { id } = req.params; // id_tarea
  const { fecha, horas_aeronave, ciclos, descripcion, realizado_por, nombre_siguiente, proxima_horas_siguiente } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const tRes = await client.query(`SELECT * FROM taller_tarea_programada WHERE id_tarea = $1 FOR UPDATE`, [id]);
    if (!tRes.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Tarea no encontrada" }); }
    const t = tRes.rows[0];

    // Baseline de cumplimiento: horas actuales de la aeronave si no se especifica.
    const aRes = await client.query(`SELECT COALESCE(horas_acumuladas,0) AS h FROM aeronave WHERE id_aeronave = $1`, [t.id_aeronave]);
    const horasActuales = aRes.rows.length ? parseFloat(aRes.rows[0].h) : 0;
    const cumpHoras = horas_aeronave != null ? horas_aeronave : horasActuales;
    const cumpFecha = fecha || new Date().toISOString().slice(0, 10);

    if (t.tipo === "INSPECCION") {
      if (!nombre_siguiente || proxima_horas_siguiente == null) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Indicá el próximo tipo de inspección y a qué TAC le toca." });
      }
      if (Number(proxima_horas_siguiente) <= Number(cumpHoras)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El TAC de la próxima revisión debe ser mayor al TAC actual." });
      }

      await client.query(`
        INSERT INTO taller_cumplimiento
          (id_tarea, fecha, horas_aeronave, ciclos, descripcion, realizado_por, id_usuario)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [id, cumpFecha, cumpHoras, ciclos ?? null, descripcion || null, realizado_por || null, req.user?.id_usuario || null]);

      const upd = await client.query(`
        UPDATE taller_tarea_programada SET
          nombre = $2, ultima_fecha = $3, ultima_horas = $4, ultima_ciclos = $5,
          proxima_fecha = NULL, proxima_horas = $6, proxima_ciclos = NULL,
          activo = true
        WHERE id_tarea = $1
        RETURNING *
      `, [id, nombre_siguiente, cumpFecha, cumpHoras, ciclos ?? null, Number(proxima_horas_siguiente)]);

      await syncProximaRevisionAeronave(client, t.id_aeronave);
      await client.query("COMMIT");
      return res.json(upd.rows[0]);
    }

    // AD / SB / VIDA_LIMITE / OTRO: comportamiento sin cambios (recompute por intervalo).
    await client.query(`
      INSERT INTO taller_cumplimiento
        (id_tarea, fecha, horas_aeronave, ciclos, descripcion, realizado_por, id_usuario)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [id, cumpFecha, cumpHoras, ciclos ?? null, descripcion || null, realizado_por || null, req.user?.id_usuario || null]);

    const prox = proximos({
      recurrente: t.recurrente,
      intervalo_horas: t.intervalo_horas, intervalo_dias: t.intervalo_dias, intervalo_ciclos: t.intervalo_ciclos,
      ultima_horas: cumpHoras, ultima_fecha: cumpFecha, ultima_ciclos: ciclos,
    });

    const upd = await client.query(`
      UPDATE taller_tarea_programada SET
        ultima_fecha = $2, ultima_horas = $3, ultima_ciclos = $4,
        proxima_fecha = $5, proxima_horas = $6, proxima_ciclos = $7,
        activo = $8
      WHERE id_tarea = $1
      RETURNING *
    `, [
      id, cumpFecha, cumpHoras, ciclos ?? null,
      prox.proxima_fecha, prox.proxima_horas, prox.proxima_ciclos,
      t.recurrente, // las no recurrentes quedan cumplidas pero siguen visibles; el front las marca
    ]);

    // Fuente única: actualizar el cache de próxima revisión que lee /mantenimiento
    // y los widgets de Proyección, dentro de la misma transacción.
    await syncProximaRevisionAeronave(client, t.id_aeronave);

    await client.query("COMMIT");
    res.json(upd.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ── Historial de cumplimiento de una tarea ────────────────────────────────
exports.historialTarea = catchAsync(async (req, res) => {
  const { id } = req.params;
  const r = await db.query(`
    SELECT * FROM taller_cumplimiento WHERE id_tarea = $1 ORDER BY fecha DESC, id_cumplimiento DESC
  `, [id]);
  res.json(r.rows);
});

// ── Historial de mantenimientos de una aeronave (últimos cumplimientos) ────
exports.historialAeronave = catchAsync(async (req, res) => {
  const { id } = req.params; // id_aeronave
  const r = await db.query(`
    SELECT c.id_cumplimiento, c.fecha, c.horas_aeronave, c.ciclos,
           c.descripcion, c.realizado_por,
           t.id_tarea, t.nombre AS tarea_nombre, t.tipo AS tarea_tipo, t.referencia
    FROM taller_cumplimiento c
    JOIN taller_tarea_programada t ON t.id_tarea = c.id_tarea
    WHERE t.id_aeronave = $1
    ORDER BY c.fecha DESC, c.id_cumplimiento DESC
    LIMIT 100
  `, [id]);
  res.json(r.rows);
});
