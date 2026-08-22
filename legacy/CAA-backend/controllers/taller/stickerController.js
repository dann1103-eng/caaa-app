/**
 * Stickers de constancia para los libros físicos del avión.
 *
 * Cada avión lleva tres libros exigidos por la AAC — célula, motor y hélice — y
 * cada trabajo se acredita pegando un sticker impreso. Este controller los
 * precarga, los emite (congelados), sirve el libro por parte y deja que el jefe
 * de taller mantenga las plantillas de texto y los anclajes de horas.
 *
 * LAS DOS ESCALAS DEL TAC — lo más fácil de romper acá:
 *   · el sistema guarda la LECTURA CRUDA del instrumento (lo que teclea el
 *     instructor en la vouchera y lo que acumula aeronave.horas_acumuladas);
 *   · los libros llevan el TAC con `aeronave.tac_offset` sumado, porque el
 *     tacómetro de algún avión dio la vuelta (el del YS-334-PE pasó de 9999.99
 *     a 0000.03 entre sep-2025 y feb-2026, y los mecánicos le suman 10,000).
 * El anclaje se guarda en escala CRUDA, así T.T. y TSO son diferencias y el
 * offset se cancela solo. Confundirlas es un error de 10,000 horas impreso en
 * un documento legal.
 *
 * Spec: docs/superpowers/specs/2026-08-22-stickers-libros-aeronave-design.md
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const { generarStickersPDF } = require("../../utils/pdfTaller");

const PARTES = ["CELULA", "MOTOR", "HELICE"];
const TIPOS = ["25H", "50H", "100H", "ANUAL", "NO_PROGRAMADO", "CIERRE", "APERTURA"];

const ETIQUETA_PARTE = { CELULA: "célula", MOTOR: "motor", HELICE: "hélice" };
const ETIQUETA_TIPO = {
  "25H": "Inspección de 25 h", "50H": "Inspección de 50 h", "100H": "Inspección de 100 h",
  ANUAL: "Inspección anual", NO_PROGRAMADO: "No programado",
  CIERRE: "Cierre de libro", APERTURA: "Apertura de libro",
};

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const r2 = (v) => (v === null || Number.isNaN(v) ? null : Math.round(v * 100) / 100);
const txt = (v) => (typeof v === "string" ? v.trim() : v || "");

/**
 * T.T. y TSO de una parte para una lectura dada.
 * `lectura` va en escala cruda; el TAC que devuelve ya lleva el offset.
 * Sin anclaje devuelve null: el sistema NO inventa un número para un libro.
 */
function calcular(lectura, comp, offset) {
  const ancla = num(comp?.horas_aeronave_instalacion);
  const ttA = num(comp?.horas_componente_instalacion);
  const tsoA = num(comp?.tso_ancla);
  const delta = ancla === null ? null : lectura - ancla;
  return {
    tac: r2(lectura + Number(offset || 0)),
    tt: delta === null || ttA === null ? null : r2(delta + ttA),
    tso: delta === null || tsoA === null ? null : r2(delta + tsoA),
  };
}

// El tipo de inspección que le toca según el ciclo que ya lleva el Taller.
function tipoSugerido(aeronave) {
  const t = String(aeronave?.tipo_proxima_revision || "").toUpperCase();
  if (t.includes("100")) return "100H";
  if (t.includes("50")) return "50H";
  if (t.includes("25")) return "25H";
  return "NO_PROGRAMADO";
}

async function partesDe(conn, id_aeronave) {
  const r = await conn.query(
    `SELECT * FROM taller_componente
      WHERE id_aeronave = $1 AND tipo = ANY($2::varchar[])
      ORDER BY CASE tipo WHEN 'CELULA' THEN 1 WHEN 'MOTOR' THEN 2 ELSE 3 END, id_componente`,
    [id_aeronave, PARTES]
  );
  // Una parte puede tener más de una fila histórica: vale la instalada.
  const porTipo = {};
  for (const c of r.rows) if (!porTipo[c.tipo] || (c.activo && !porTipo[c.tipo].activo)) porTipo[c.tipo] = c;
  return porTipo;
}

async function plantillasDe(conn, id_aeronave) {
  const r = await conn.query(
    "SELECT parte, tipo, texto FROM taller_sticker_plantilla WHERE id_aeronave = $1",
    [id_aeronave]
  );
  const m = {};
  for (const p of r.rows) { m[p.parte] = m[p.parte] || {}; m[p.parte][p.tipo] = p.texto; }
  return m;
}

// {orden} y {proxima} se sustituyen al precargar para que el mecánico no tenga
// que copiar a mano el correlativo ni el TAC de la próxima inspección.
function resolver(texto, { orden, proxima }) {
  return String(texto || "")
    .replace(/\{orden\}/g, orden || "____")
    .replace(/\{proxima\}/g, proxima || "____");
}

function textoProxima(aeronave, offset) {
  const h = num(aeronave?.horas_proxima_revision);
  if (h === null) return null;
  const tipo = String(aeronave?.tipo_proxima_revision || "").replace(/HR$/i, " horas");
  return `${tipo || "inspección"} con TAC: ${r2(h + Number(offset || 0))}`;
}

async function firmantes(conn, id_mecanico, id_aprendiz) {
  const ids = [id_mecanico, id_aprendiz].filter(Boolean);
  if (!ids.length) return {};
  const r = await conn.query(
    "SELECT id_usuario, nombre, apellido, licencia_tma, certificado_aprendiz FROM usuario WHERE id_usuario = ANY($1::int[])",
    [ids]
  );
  const m = {};
  for (const u of r.rows) m[u.id_usuario] = u;
  return m;
}

// ── Precarga del modal de emisión ──────────────────────────────────────────
exports.precargaOrden = catchAsync(async (req, res) => {
  const { id } = req.params;
  const o = await db.query(`
    SELECT o.*, a.codigo, a.tac_offset, a.horas_acumuladas,
           a.horas_proxima_revision, a.tipo_proxima_revision
      FROM orden_trabajo o JOIN aeronave a ON a.id_aeronave = o.id_aeronave
     WHERE o.id_orden = $1`, [id]);
  if (!o.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
  const orden = o.rows[0];

  // La lectura del instrumento la tecleó quien abrió el trabajo; si no la hay,
  // se cae al acumulado del sistema (que puede haber derivado, por eso el campo
  // queda editable en la pantalla).
  const lectura = num(orden.tacometro) ?? num(orden.horas_acumuladas) ?? 0;
  const offset = Number(orden.tac_offset || 0);

  const partes = await partesDe(db, orden.id_aeronave);
  const plantillas = await plantillasDe(db, orden.id_aeronave);
  const users = await firmantes(db, orden.id_mecanico || orden.id_mecanico_asignado, orden.id_aprendiz);
  const mec = users[orden.id_mecanico || orden.id_mecanico_asignado];
  const apr = users[orden.id_aprendiz];
  const proxima = textoProxima(orden, offset);

  const yaEmitidos = await db.query(
    "SELECT parte, tipo, id_sticker FROM taller_sticker WHERE id_orden = $1 AND estado = 'EMITIDO'", [id]
  );

  res.json({
    orden: {
      id_orden: orden.id_orden, correlativo: orden.correlativo, estado: orden.estado,
      fecha: orden.fecha, matricula: orden.codigo, tac_offset: offset,
      lectura, tac_sugerido: r2(lectura + offset),
    },
    tipo_sugerido: tipoSugerido(orden),
    mecanico: mec ? { id_usuario: mec.id_usuario, nombre: `${mec.nombre} ${mec.apellido}`.trim(), licencia_tma: mec.licencia_tma } : null,
    aprendiz: apr ? { id_usuario: apr.id_usuario, nombre: `${apr.nombre} ${apr.apellido}`.trim(), certificado: apr.certificado_aprendiz } : null,
    proxima_texto: proxima,
    ya_emitidos: yaEmitidos.rows,
    partes: PARTES.map((parte) => {
      const c = partes[parte];
      const calc = c ? calcular(lectura, c, offset) : { tac: r2(lectura + offset), tt: null, tso: null };
      return {
        parte,
        etiqueta: ETIQUETA_PARTE[parte],
        existe: !!c,
        instalada: c ? c.activo : false,
        id_componente: c?.id_componente || null,
        marca: c?.marca || null, modelo: c?.modelo || null,
        mn: c?.parte_no || null, sn: c?.serie_no || null, tc: c?.tipo_certificado || null,
        tiene_ancla: !!c && c.horas_aeronave_instalacion !== null,
        ancla_origen: c?.ancla_origen || null,
        ...calc,
        textos: Object.fromEntries(
          TIPOS.map((t) => [t, resolver(plantillas[parte]?.[t] ?? "", { orden: orden.correlativo, proxima })])
        ),
      };
    }),
  });
});

// ── Emitir stickers ────────────────────────────────────────────────────────
// El sticker queda CONGELADO: guarda lo que se imprimió, no una referencia que
// mañana se recalcule. Una vez pegado en el libro es un registro legal.
exports.emitir = catchAsync(async (req, res) => {
  const { id } = req.params;                       // id_orden ('libre' para cierre/apertura)
  const { id_aeronave, tipo, fecha, lugar, id_aprendiz, partes } = req.body;

  if (!TIPOS.includes(tipo)) return res.status(400).json({ message: "Tipo de sticker inválido" });
  if (!Array.isArray(partes) || !partes.length) {
    return res.status(400).json({ message: "Elegí al menos un libro (célula, motor o hélice)" });
  }
  for (const p of partes) {
    if (!PARTES.includes(p.parte)) return res.status(400).json({ message: `Libro inválido: ${p.parte}` });
    if (!txt(p.texto)) return res.status(400).json({ message: `Escribí el texto del sticker de ${ETIQUETA_PARTE[p.parte]}` });
    if (num(p.tac) === null) return res.status(400).json({ message: `Falta el TAC del sticker de ${ETIQUETA_PARTE[p.parte]}` });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    let orden = null;
    if (id && id !== "libre") {
      const o = await client.query("SELECT * FROM orden_trabajo WHERE id_orden = $1", [id]);
      if (!o.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Orden no encontrada" }); }
      orden = o.rows[0];
    }

    const idAv = orden ? orden.id_aeronave : Number(id_aeronave);
    const av = await client.query(
      "SELECT id_aeronave, codigo, tac_offset FROM aeronave WHERE id_aeronave = $1", [idAv]
    );
    if (!av.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Aeronave no encontrada" }); }
    const aeronave = av.rows[0];
    const offset = Number(aeronave.tac_offset || 0);

    // Quien firma tiene que tener licencia TMA: va impresa en el sticker y es
    // lo que respalda la anotación en el libro. Mismo gate que la orden.
    const uid = req.user?.id_usuario || 0;
    const u = await client.query(
      "SELECT id_usuario, nombre, apellido, licencia_tma FROM usuario WHERE id_usuario = $1", [uid]
    );
    const mec = u.rows[0];
    if (!mec?.licencia_tma) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Tu usuario no tiene número de licencia TMA cargado, y va impreso en el sticker del libro. Pedile a Administración que lo agregue a tu ficha.",
      });
    }

    let apr = null;
    if (id_aprendiz) {
      const a = await client.query(
        "SELECT id_usuario, nombre, apellido, certificado_aprendiz FROM usuario WHERE id_usuario = $1", [id_aprendiz]
      );
      apr = a.rows[0] || null;
    }

    const comps = await partesDe(client, idAv);
    const creados = [];
    const reanclados = [];

    for (const p of partes) {
      const comp = comps[p.parte] || null;
      const tacLibro = r2(num(p.tac));
      const lectura = r2(tacLibro - offset);          // vuelta a escala cruda
      const tt = num(p.tt);
      const tso = num(p.tso);

      const ins = await client.query(`
        INSERT INTO taller_sticker
          (id_aeronave, id_orden, id_componente, parte, tipo, fecha, lugar,
           matricula, marca, modelo, mn, sn, tc, tac, tt, tso, texto, orden_trabajo_no,
           id_mecanico, mecanico_nombre, mecanico_tma,
           id_aprendiz, aprendiz_nombre, aprendiz_certificado,
           proxima_25, proxima_50, creado_por)
        VALUES ($1,$2,$3,$4,$5, COALESCE($6::date, CURRENT_DATE), COALESCE($7,'Ilopango'),
                $8,$9,$10,$11,$12,$13,$14::numeric,$15::numeric,$16::numeric,$17,$18,
                $19,$20,$21,
                $22::int,$23,$24,
                $25::numeric,$26::numeric,$27)
        RETURNING id_sticker`, [
        idAv, orden?.id_orden || null, comp?.id_componente || null, p.parte, tipo,
        fecha || null, txt(lugar) || null,
        aeronave.codigo, comp?.marca || null, comp?.modelo || null,
        comp?.parte_no || null, comp?.serie_no || null, comp?.tipo_certificado || null,
        tacLibro, tt, tso, txt(p.texto), orden?.correlativo || null,
        mec.id_usuario, `${mec.nombre} ${mec.apellido}`.trim(), mec.licencia_tma,
        apr?.id_usuario || null, apr ? `${apr.nombre} ${apr.apellido}`.trim() : null,
        apr?.certificado_aprendiz || null,
        // Cierre y apertura no llevan los mini de próxima inspección: su línea
        // "efectuar próxima inspección" va dentro del texto, como en el papel.
        tipo === "CIERRE" || tipo === "APERTURA" ? null : r2(tacLibro + 25),
        tipo === "CIERRE" || tipo === "APERTURA" ? null : r2(tacLibro + 50),
        uid,
      ]);
      creados.push(ins.rows[0].id_sticker);

      // ── La red de seguridad: re-anclar ──────────────────────────────────
      // Si el mecánico corrigió el número, ese valor ya quedó impreso y firmado
      // en un libro oficial: es la realidad legal. Seguir calculando desde otro
      // solo garantiza que el próximo sticker salga mal. Re-ancla aunque no sea
      // jefe; lo que NO puede es quedar en silencio, por eso queda el rastro.
      if (comp && (tt !== null || tso !== null)) {
        const antes = calcular(lectura, comp, offset);
        const cambio =
          (tt !== null && (antes.tt === null || Math.abs(antes.tt - tt) > 0.001)) ||
          (tso !== null && (antes.tso === null || Math.abs(antes.tso - tso) > 0.001));
        if (cambio) {
          await client.query(`
            UPDATE taller_componente SET
              horas_aeronave_instalacion   = $2::numeric,
              horas_componente_instalacion = COALESCE($3::numeric, horas_componente_instalacion),
              tso_ancla                    = COALESCE($4::numeric, tso_ancla),
              ancla_actualizado_en  = NOW() AT TIME ZONE 'America/El_Salvador',
              ancla_actualizado_por = $5,
              ancla_origen = $6
            WHERE id_componente = $1`, [
            comp.id_componente, lectura, tt, tso, uid,
            `Anclado por ${mec.nombre} ${mec.apellido} desde el sticker ${ETIQUETA_TIPO[tipo]}${orden ? ` de la orden ${orden.correlativo}` : ""}`,
          ]);
          reanclados.push(p.parte);
        }
      }
    }

    await client.query("COMMIT");
    await logAuditoria(db, {
      accion: "OTRO", entidad: "taller_sticker", id_entidad: creados[0], actor: req.user, req,
      descripcion: `Emitió ${creados.length} sticker(s) ${ETIQUETA_TIPO[tipo]} de ${aeronave.codigo}${orden ? ` (orden ${orden.correlativo})` : ""}`,
    }).catch(() => {});

    res.json({ ids: creados, reanclados });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});

// ── El libro de una parte ──────────────────────────────────────────────────
// Es el índice del libro físico: los stickers en orden, partidos en volúmenes
// por los eventos de cierre/apertura, más las órdenes firmadas a las que
// todavía no se les pegó nada.
exports.getLibro = catchAsync(async (req, res) => {
  const { id, parte } = req.params;
  if (!PARTES.includes(parte)) return res.status(400).json({ message: "Libro inválido" });

  const av = await db.query(
    "SELECT id_aeronave, codigo, modelo, tac_offset, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision FROM aeronave WHERE id_aeronave = $1",
    [id]
  );
  if (!av.rows.length) return res.status(404).json({ message: "Aeronave no encontrada" });
  const aeronave = av.rows[0];
  const offset = Number(aeronave.tac_offset || 0);
  const lectura = num(aeronave.horas_acumuladas) ?? 0;

  const comps = await partesDe(db, id);
  const comp = comps[parte] || null;

  const st = await db.query(`
    SELECT s.*, o.correlativo AS orden_correlativo, o.estado AS orden_estado
      FROM taller_sticker s
      LEFT JOIN orden_trabajo o ON o.id_orden = s.id_orden
     WHERE s.id_aeronave = $1 AND s.parte = $2
     ORDER BY s.fecha DESC, s.id_sticker DESC`, [id, parte]);

  // Órdenes ya firmadas de este avión que no tienen sticker de esta parte:
  // es lo que falta pegar en el libro.
  const pend = await db.query(`
    SELECT o.id_orden, o.correlativo, o.fecha, o.estado, o.tacometro, o.discrepancia
      FROM orden_trabajo o
     WHERE o.id_aeronave = $1
       AND o.estado IN ('FIRMADA','APROBADA','CERRADA')
       AND NOT EXISTS (
         SELECT 1 FROM taller_sticker s
          WHERE s.id_orden = o.id_orden AND s.parte = $2 AND s.estado = 'EMITIDO')
     ORDER BY o.fecha DESC, o.id_orden DESC
     LIMIT 30`, [id, parte]);

  res.json({
    aeronave: { ...aeronave, tac_libro: r2(lectura + offset) },
    parte,
    etiqueta: ETIQUETA_PARTE[parte],
    componente: comp ? { ...comp, ...calcular(lectura, comp, offset) } : null,
    stickers: st.rows.map((s) => ({ ...s, tipo_etiqueta: ETIQUETA_TIPO[s.tipo] || s.tipo })),
    sin_sticker: pend.rows,
  });
});

// ── Ficha y anclaje de una parte (jefe de taller) ──────────────────────────
exports.guardarComponente = catchAsync(async (req, res) => {
  const { id, parte } = req.params;
  if (!PARTES.includes(parte)) return res.status(400).json({ message: "Libro inválido" });

  const body = req.body || {};
  const campos = {
    nombre: "nombre", marca: "marca", modelo: "modelo",
    mn: "parte_no", sn: "serie_no", tc: "tipo_certificado",
    activo: "activo",
    tac_ancla: "horas_aeronave_instalacion",
    tt_ancla: "horas_componente_instalacion",
    tso_ancla: "tso_ancla",
  };

  // SET dinámico con las claves realmente presentes: un SET fijo nulificaría lo
  // que el body no traiga, que es la trampa que ya mordió en PATCH /ordenes/:id.
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(campos)) {
    if (!(k in body)) continue;
    let v = body[k];
    if (["tac_ancla", "tt_ancla", "tso_ancla"].includes(k)) v = num(v);
    else if (k === "activo") v = !!v;
    else v = txt(v) || null;
    vals.push(v);
    sets.push(`${col} = $${vals.length + 1}${["tac_ancla", "tt_ancla", "tso_ancla"].includes(k) ? "::numeric" : k === "activo" ? "::boolean" : ""}`);
  }
  if (!sets.length) return res.status(400).json({ message: "No mandaste nada que cambiar" });

  const tocaAncla = ["tac_ancla", "tt_ancla", "tso_ancla"].some((k) => k in body);
  if (tocaAncla) {
    vals.push(req.user?.id_usuario || null);
    sets.push(`ancla_actualizado_por = $${vals.length + 1}`);
    sets.push("ancla_actualizado_en = NOW() AT TIME ZONE 'America/El_Salvador'");
    vals.push(txt(body.ancla_origen) || "Cargado a mano por el jefe de taller");
    sets.push(`ancla_origen = $${vals.length + 1}`);
  }

  const ex = await db.query(
    "SELECT id_componente FROM taller_componente WHERE id_aeronave = $1 AND tipo = $2 ORDER BY activo DESC, id_componente LIMIT 1",
    [id, parte]
  );

  let row;
  if (ex.rows.length) {
    const r = await db.query(
      `UPDATE taller_componente SET ${sets.join(", ")} WHERE id_componente = $1 RETURNING *`,
      [ex.rows[0].id_componente, ...vals]
    );
    row = r.rows[0];
  } else {
    const r = await db.query(`
      INSERT INTO taller_componente
        (id_aeronave, tipo, nombre, marca, modelo, parte_no, serie_no, tipo_certificado,
         horas_aeronave_instalacion, horas_componente_instalacion, tso_ancla, activo,
         ancla_origen, ancla_actualizado_por, ancla_actualizado_en)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10::numeric,$11::numeric,$12::boolean,$13,$14,
              NOW() AT TIME ZONE 'America/El_Salvador')
      RETURNING *`, [
      id, parte, txt(body.nombre) || ETIQUETA_PARTE[parte], txt(body.marca) || null,
      txt(body.modelo) || null, txt(body.mn) || null, txt(body.sn) || null, txt(body.tc) || null,
      num(body.tac_ancla), num(body.tt_ancla), num(body.tso_ancla),
      body.activo === false ? false : true,
      txt(body.ancla_origen) || "Cargado a mano por el jefe de taller", req.user?.id_usuario || null,
    ]);
    row = r.rows[0];
  }

  await logAuditoria(db, {
    accion: "OTRO", entidad: "taller_componente", id_entidad: row.id_componente, actor: req.user, req,
    descripcion: `Editó la ficha del ${ETIQUETA_PARTE[parte]}${tocaAncla ? " y su anclaje de horas" : ""}`,
  }).catch(() => {});
  res.json(row);
});

// ── Plantillas de texto (jefe de taller) ───────────────────────────────────
exports.listPlantillas = catchAsync(async (req, res) => {
  const r = await db.query(
    "SELECT * FROM taller_sticker_plantilla WHERE id_aeronave = $1 ORDER BY parte, tipo", [req.params.id]
  );
  res.json({ tipos: TIPOS.map((t) => ({ tipo: t, etiqueta: ETIQUETA_TIPO[t] })), plantillas: r.rows });
});

exports.guardarPlantilla = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { parte, tipo, texto } = req.body || {};
  if (!PARTES.includes(parte)) return res.status(400).json({ message: "Libro inválido" });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ message: "Tipo de sticker inválido" });

  const r = await db.query(`
    INSERT INTO taller_sticker_plantilla (id_aeronave, parte, tipo, texto, actualizado_por)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (id_aeronave, parte, tipo) DO UPDATE SET
      texto = EXCLUDED.texto,
      actualizado_por = EXCLUDED.actualizado_por,
      actualizado_en = NOW() AT TIME ZONE 'America/El_Salvador'
    RETURNING *`, [id, parte, tipo, String(texto ?? ""), req.user?.id_usuario || null]);
  res.json(r.rows[0]);
});

// ── Anular (jefe de taller) ────────────────────────────────────────────────
exports.anular = catchAsync(async (req, res) => {
  const { id } = req.params;
  const motivo = txt(req.body?.motivo);
  if (!motivo) return res.status(400).json({ message: "Escribí por qué se anula el sticker" });

  const r = await db.query(`
    UPDATE taller_sticker SET
      estado = 'ANULADO', motivo_anulacion = $2,
      anulado_en = NOW() AT TIME ZONE 'America/El_Salvador', anulado_por = $3
    WHERE id_sticker = $1 AND estado = 'EMITIDO'
    RETURNING id_sticker, parte, tipo`, [id, motivo, req.user?.id_usuario || null]);

  if (!r.rows.length) {
    const ex = await db.query("SELECT estado FROM taller_sticker WHERE id_sticker = $1", [id]);
    if (!ex.rows.length) return res.status(404).json({ message: "Sticker no encontrado" });
    return res.status(409).json({ message: "Ese sticker ya está anulado." });
  }

  await logAuditoria(db, {
    accion: "OTRO", entidad: "taller_sticker", id_entidad: id, actor: req.user, req,
    descripcion: `Anuló el sticker de ${ETIQUETA_PARTE[r.rows[0].parte]}: ${motivo}`,
  }).catch(() => {});
  res.json({ ok: true });
});

// ── PDF ────────────────────────────────────────────────────────────────────
// Acepta un lote (?ids=1,2,3) para imprimir de una los tres libros, y sirve
// igual para re-imprimir uno solo tal como salió: se lee lo congelado, nunca
// se recalcula.
exports.imprimir = catchAsync(async (req, res) => {
  const ids = String(req.query.ids || req.params.id || "")
    .split(",").map((s) => parseInt(s, 10)).filter(Boolean);
  if (!ids.length) return res.status(400).json({ message: "No indicaste qué sticker imprimir" });

  const r = await db.query(
    `SELECT * FROM taller_sticker WHERE id_sticker = ANY($1::int[]) ORDER BY
       CASE parte WHEN 'CELULA' THEN 1 WHEN 'MOTOR' THEN 2 ELSE 3 END, id_sticker`,
    [ids]
  );
  if (!r.rows.length) return res.status(404).json({ message: "Sticker no encontrado" });

  const f = await db.query("SELECT * FROM taller_formulario WHERE clave = 'STICKER'");
  const doc = generarStickersPDF({ stickers: r.rows, formulario: f.rows[0] || null });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="stickers-${r.rows[0].matricula}.pdf"`);
  doc.pipe(res);
  doc.end();
});

module.exports.PARTES = PARTES;
module.exports.TIPOS = TIPOS;
