const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { syncProximaRevisionAeronave } = require("../../utils/aeronaveUtils");

// Umbrales para marcar una tarea como PROXIMA (a punto de vencer).
const UMBRAL_HORAS = 10;   // horas restantes
const UMBRAL_DIAS = 30;    // días restantes

/**
 * Deriva horas/días restantes y el estado (VIGENTE/PROXIMO/VENCIDO/N_A) de una
 * tarea contra las horas actuales de su aeronave. El estado es el "peor" de las
 * dimensiones aplicables (la que está más vencida o más próxima).
 */
function calcularEstado(t) {
  const horasAeronave = parseFloat(t.aeronave_horas) || 0;
  let horas_restantes = null;
  let dias_restantes = null;

  if (t.proxima_horas != null) {
    horas_restantes = Math.round((parseFloat(t.proxima_horas) - horasAeronave) * 100) / 100;
  }
  if (t.proxima_fecha != null) {
    const hoy = new Date();
    const prox = new Date(t.proxima_fecha);
    dias_restantes = Math.round((prox - hoy) / (1000 * 60 * 60 * 24));
  }

  let estado = "N_A";
  const dims = [];
  if (horas_restantes != null) dims.push({ rest: horas_restantes, prox: horas_restantes <= UMBRAL_HORAS });
  if (dias_restantes != null) dims.push({ rest: dias_restantes, prox: dias_restantes <= UMBRAL_DIAS });

  if (dims.length) {
    if (dims.some((d) => d.rest <= 0)) estado = "VENCIDO";
    else if (dims.some((d) => d.prox)) estado = "PROXIMO";
    else estado = "VIGENTE";
  }
  return { horas_restantes, dias_restantes, estado };
}

// ── Listar tareas programadas (opcionalmente por aeronave) ────────────────
exports.listTareas = catchAsync(async (req, res) => {
  const { id_aeronave, solo_alertas } = req.query;
  const params = [];
  const where = ["t.activo = true"];
  if (id_aeronave) { params.push(id_aeronave); where.push(`t.id_aeronave = $${params.length}`); }

  const r = await db.query(`
    SELECT t.*,
           a.codigo AS aeronave_codigo,
           COALESCE(a.horas_acumuladas, 0) AS aeronave_horas,
           c.nombre AS componente_nombre, c.tipo AS componente_tipo
    FROM taller_tarea_programada t
    JOIN aeronave a ON a.id_aeronave = t.id_aeronave
    LEFT JOIN taller_componente c ON c.id_componente = t.id_componente
    WHERE ${where.join(" AND ")}
    ORDER BY a.codigo, t.nombre
  `, params);

  let rows = r.rows.map((t) => ({ ...t, ...calcularEstado(t) }));
  if (solo_alertas === "true") {
    rows = rows.filter((t) => t.estado === "VENCIDO" || t.estado === "PROXIMO");
  }
  // Ordenar por urgencia: vencidos primero, luego próximos por menos restante.
  const peso = { VENCIDO: 0, PROXIMO: 1, VIGENTE: 2, N_A: 3 };
  rows.sort((a, b) => (peso[a.estado] - peso[b.estado])
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
  const aRes = await db.query(`SELECT COALESCE(horas_acumuladas,0) AS h FROM aeronave WHERE id_aeronave = $1`, [id_aeronave]);
  const horasActuales = aRes.rows.length ? parseFloat(aRes.rows[0].h) : 0;
  let baseHoras;
  if (ultima_horas != null) {
    baseHoras = ultima_horas;
  } else if (proxima_horas != null && intervalo_horas != null) {
    baseHoras = Number(proxima_horas) - Number(intervalo_horas);
  } else {
    baseHoras = horasActuales;
  }
  const baseFecha = ultima_fecha || new Date().toISOString().slice(0, 10);
  const esRec = recurrente !== false;

  const prox = proximos({
    recurrente: esRec, intervalo_horas, intervalo_dias, intervalo_ciclos,
    ultima_horas: baseHoras, ultima_fecha: baseFecha, ultima_ciclos,
  });

  const r = await db.query(`
    INSERT INTO taller_tarea_programada
      (id_aeronave, id_componente, nombre, descripcion, tipo, referencia, recurrente,
       intervalo_horas, intervalo_ciclos, intervalo_dias,
       ultima_fecha, ultima_horas, ultima_ciclos,
       proxima_fecha, proxima_horas, proxima_ciclos)
    VALUES ($1,$2,$3,$4,COALESCE($5,'INSPECCION'),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *
  `, [
    id_aeronave, id_componente || null, nombre, descripcion || null, tipo, referencia || null, esRec,
    intervalo_horas ?? null, intervalo_ciclos ?? null, intervalo_dias ?? null,
    baseFecha, baseHoras, ultima_ciclos ?? null,
    prox.proxima_fecha, prox.proxima_horas, prox.proxima_ciclos,
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
  } = req.body;

  const cur = await db.query(`SELECT * FROM taller_tarea_programada WHERE id_tarea = $1`, [id]);
  if (!cur.rows.length) return res.status(404).json({ message: "Tarea no encontrada" });
  const t = cur.rows[0];

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
      activo = COALESCE($15, activo)
    WHERE id_tarea = $1
    RETURNING *
  `, [
    id, nombre, descripcion || null, tipo, referencia || null, merged.recurrente,
    merged.intervalo_horas, merged.intervalo_ciclos, merged.intervalo_dias,
    merged.ultima_horas, merged.ultima_fecha,
    prox.proxima_fecha, prox.proxima_horas, prox.proxima_ciclos, activo,
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
