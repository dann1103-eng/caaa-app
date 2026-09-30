// legacy/CAA-backend/controllers/taller/manualController.js
/**
 * Biblioteca de manuales del taller.
 *
 * La subida NO pasa por el backend: el navegador sube directo a Storage con un
 * permiso temporal (70 MB no cruzan Railway). Después el backend baja el
 * archivo UNA vez para sacar su huella y sus páginas: no se confía en lo que
 * diga el navegador.
 *
 * 🚨 La app nunca borra ni pisa un objeto del bucket (spec §5). Borrar un manual
 * quita la fila; una revisión nueva es otro archivo. Es lo que impide que la
 * cuenta de demostraciones, que comparte el bucket, toque un manual de CAAA.
 *
 * Las filas que se responden pasan por publico(): la ruta en el bucket y la
 * huella son internas. El visor pide su URL por GET /manuales/:id/url.
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md
 */
const crypto = require("crypto");
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const AppError = require("../../utils/appError");
const storage = require("../../utils/storage");
const { CATEGORIAS, esArchivoFaltante } = require("../../utils/manualesReglas");
const { validarRango, analizarPdf, enCola } = require("../../utils/pdfExtractos");
const { pdfDeExtractos, manualesPorId, BUCKET } = require("../../services/manualesService");

const txt = (v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const RUTA_VALIDA = /^manuales\/[0-9a-f-]{36}\.pdf$/;
// Tope de INTEGER de Postgres: un id más grande daría un 500 en vez de un 400.
const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 2147483647;
/** La fila sin lo interno de Storage (ruta en el bucket y huella). */
const publico = ({ archivo_path: _archivoPath, sha256: _sha256, ...m }) => m;

const SELECT_MANUAL = `
  SELECT m.*,
         COALESCE(json_agg(json_build_object('id_aeronave', a.id_aeronave, 'codigo', a.codigo) ORDER BY a.codigo)
                  FILTER (WHERE a.id_aeronave IS NOT NULL), '[]') AS aeronaves,
         (SELECT COUNT(*) FROM taller_paquete_extracto x WHERE x.id_manual = m.id_manual)::int AS usos_paquetes,
         (SELECT COUNT(*) FROM taller_orden_extracto x WHERE x.id_manual = m.id_manual)::int AS usos_ordenes,
         r.titulo AS reemplazado_por_titulo, r.revision AS reemplazado_por_revision
    FROM taller_manual m
    LEFT JOIN taller_manual_aeronave ma ON ma.id_manual = m.id_manual
    LEFT JOIN aeronave a ON a.id_aeronave = ma.id_aeronave
    LEFT JOIN taller_manual r ON r.id_manual = m.id_reemplazado_por`;
const AGRUPAR = " GROUP BY m.id_manual, r.titulo, r.revision";

exports.listar = catchAsync(async (req, res) => {
  const { q, aeronave, incluir_reemplazados } = req.query;
  const cond = [];
  const params = [];
  const p = (v) => `$${params.push(v)}`;
  if (incluir_reemplazados !== "true") cond.push("m.estado = 'VIGENTE'");
  if (aeronave && !idValido(aeronave)) return res.status(400).json({ message: "Avión inválido" });
  if (aeronave) {
    cond.push(`(m.es_general OR EXISTS (SELECT 1 FROM taller_manual_aeronave z
                 WHERE z.id_manual = m.id_manual AND z.id_aeronave = ${p(Number(aeronave))}))`);
  }
  if (q) {
    const ph = p(`%${String(q)}%`);
    cond.push(`(m.titulo ILIKE ${ph} OR m.numero_parte ILIKE ${ph} OR m.fabricante ILIKE ${ph})`);
  }
  const r = await db.query(
    `${SELECT_MANUAL}${cond.length ? ` WHERE ${cond.join(" AND ")}` : ""}${AGRUPAR} ORDER BY m.titulo, m.id_manual`,
    params
  );
  res.json(r.rows.map(publico));
});

exports.detalle = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const id = Number(req.params.id);
  const r = await db.query(`${SELECT_MANUAL} WHERE m.id_manual = $1${AGRUPAR}`, [id]);
  if (!r.rows.length) return res.status(404).json({ message: "Manual no encontrado" });
  // Las revisiones anteriores, de la más reciente a la más vieja.
  const ant = await db.query(
    `WITH RECURSIVE ant AS (
       SELECT id_manual, titulo, revision, estado, 1 AS nivel
         FROM taller_manual WHERE id_reemplazado_por = $1
       UNION ALL
       SELECT m.id_manual, m.titulo, m.revision, m.estado, ant.nivel + 1
         FROM taller_manual m JOIN ant ON m.id_reemplazado_por = ant.id_manual
        WHERE ant.nivel < 50)
     SELECT id_manual, titulo, revision, estado FROM ant ORDER BY nivel`,
    [id]
  );
  res.json({ ...publico(r.rows[0]), revisiones_anteriores: ant.rows });
});

exports.url = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const r = await db.query(
    "SELECT archivo_path, tamano_bytes, paginas FROM taller_manual WHERE id_manual = $1", [Number(req.params.id)]
  );
  if (!r.rows.length) return res.status(404).json({ message: "Manual no encontrado" });
  const url = await storage.urlFirmada(BUCKET, r.rows[0].archivo_path, 3600);
  res.json({ url, tamano_bytes: Number(r.rows[0].tamano_bytes), paginas: r.rows[0].paginas });
});

/** Reserva una ruta con UUID (no con id_manual: todavía no hay fila, y el demo repetiría ids). */
exports.reservarSubida = catchAsync(async (req, res) => {
  const ruta = `manuales/${crypto.randomUUID()}.pdf`;
  const s = await storage.urlSubidaFirmada(BUCKET, ruta);
  res.json({ ruta, signedUrl: s.signedUrl });
});

/** Datos del formulario, normalizados. Devuelve {error} o {datos}. */
function leerDatos(body, { exigirRuta }) {
  const d = {
    titulo: txt(body.titulo),
    categoria: txt(body.categoria),
    fabricante: txt(body.fabricante),
    numero_parte: txt(body.numero_parte),
    revision: txt(body.revision),
    // Solo true (o "true") es true: !!"false" daría true.
    es_general: body.es_general === undefined ? undefined : body.es_general === true || body.es_general === "true",
    aeronaves: Array.isArray(body.aeronaves) ? [...new Set(body.aeronaves.map(Number))] : undefined,
    ruta: body.ruta,
  };
  if (exigirRuta && !RUTA_VALIDA.test(String(body.ruta || ""))) return { error: "Falta el archivo subido" };
  // Un id mal armado es un error, no se descarta: en editar, descartarlo en
  // silencio le sacaría al manual los aviones que tenía.
  if (d.aeronaves && !d.aeronaves.every(idValido)) return { error: "Uno de los aviones elegidos no existe" };
  if (d.titulo && d.titulo.length > 200) return { error: "El título es demasiado largo (máximo 200)" };
  if (d.categoria && !CATEGORIAS.includes(d.categoria)) return { error: "Tipo de manual inválido" };
  for (const k of ["fabricante", "numero_parte", "revision"]) {
    const max = k === "fabricante" ? 80 : k === "numero_parte" ? 40 : 80;
    if (d[k] && d[k].length > max) return { error: `El campo ${k.replace("_", " ")} es demasiado largo` };
  }
  return { datos: d };
}

/**
 * 400 si alguno de los aviones no existe. Sin esto el FK daría un 500 con el
 * detalle de Postgres. `ids` ya viene sin repetidos (leerDatos).
 */
async function validarAeronaves(ids) {
  if (!ids?.length) return;
  const r = await db.query("SELECT id_aeronave FROM aeronave WHERE id_aeronave = ANY($1::int[])", [ids]);
  if (r.rows.length < ids.length) throw new AppError("Uno de los aviones elegidos no existe", 400);
}

/**
 * Baja lo recién subido y saca huella y páginas. La bajada va DENTRO de la
 * cola: si fuera antes, N subidas simultáneas retendrían el PDF entero cada una
 * mientras esperan su turno.
 *
 * Solo un "no está" de Storage (400/404) se le devuelve al usuario como "volvé
 * a subirlo". Una caída o un corte de red sale como error nuestro (500): pedir
 * que vuelva a subir 70 MB no arreglaría nada.
 */
async function analizarSubida(ruta) {
  const a = await enCola(async () => {
    let bytes;
    try {
      bytes = await storage.descargarArchivo(BUCKET, ruta);
    } catch (err) {
      if (esArchivoFaltante(err)) return { error: "El archivo no llegó al almacenamiento. Volvé a subirlo." };
      throw err;
    }
    const r = await analizarPdf(bytes);
    return r.error ? r : { ...r, tamano_bytes: bytes.length };
  });
  if (a.error) throw new AppError(a.error, 400);
  return { sha256: a.sha256, paginas: a.paginas, tamano_bytes: a.tamano_bytes };
}

async function insertarManual(client, d, uid) {
  const dup = await client.query("SELECT titulo FROM taller_manual WHERE sha256 = $1", [d.sha256]);
  if (dup.rows.length) {
    throw new AppError(`Ese archivo ya está en la biblioteca como «${dup.rows[0].titulo}».`, 409);
  }
  let r;
  try {
    r = await client.query(
      `INSERT INTO taller_manual (titulo, categoria, fabricante, numero_parte, revision, paginas,
                                  tamano_bytes, sha256, archivo_path, es_general, origen, subido_por,
                                  necesita_confirmacion, nota_confirmacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SUBIDA',$11,$12,$13) RETURNING *`,
      [d.titulo, d.categoria, d.fabricante, d.numero_parte, d.revision, d.paginas,
       d.tamano_bytes, d.sha256, d.ruta, !!d.es_general, uid,
       !!d.necesita_confirmacion, d.nota_confirmacion ?? null]
    );
  } catch (e) {
    // Dos registros del mismo archivo a la vez (doble clic): el segundo choca
    // con el UNIQUE de sha256 después de pasar el chequeo de arriba.
    if (e.code === "23505") throw new AppError("Ese archivo ya está en la biblioteca.", 409);
    throw e;
  }
  const m = r.rows[0];
  if (d.aeronaves?.length) {
    await client.query(
      `INSERT INTO taller_manual_aeronave (id_manual, id_aeronave)
       SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
      [m.id_manual, d.aeronaves]
    );
  }
  return m;
}

exports.registrar = catchAsync(async (req, res) => {
  const { error, datos } = leerDatos(req.body, { exigirRuta: true });
  if (error) return res.status(400).json({ message: error });
  if (!datos.titulo) return res.status(400).json({ message: "Escribí el título del manual" });
  if (!datos.categoria) return res.status(400).json({ message: "Elegí el tipo de manual" });
  await validarAeronaves(datos.aeronaves);

  const a = await analizarSubida(datos.ruta); // antes de abrir la transacción: puede tardar
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const m = await insertarManual(client, { ...datos, ...a }, req.user.id_usuario);
    await client.query("COMMIT");
    res.status(201).json(publico(m));
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.subirRevision = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const { error, datos } = leerDatos(req.body, { exigirRuta: true });
  if (error) return res.status(400).json({ message: error });
  if (!datos.revision) {
    return res.status(400).json({ message: "Escribí qué revisión es (ej. «Rev. 12, marzo 2026»)" });
  }
  const id = Number(req.params.id);
  const noVigente = (estado) =>
    new AppError(`Solo se le sube revisión a un manual vigente: este está ${estado.toLowerCase()}.`, 409);

  // Chequeo barato ANTES de bajar y analizar el archivo (puede tardar). El que
  // manda es el de adentro de la transacción, con la fila bloqueada.
  const pre = await db.query("SELECT estado FROM taller_manual WHERE id_manual = $1", [id]);
  if (!pre.rows.length) return res.status(404).json({ message: "Manual no encontrado" });
  if (pre.rows[0].estado !== "VIGENTE") throw noVigente(pre.rows[0].estado);
  await validarAeronaves(datos.aeronaves);

  const a = await analizarSubida(datos.ruta);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query("SELECT * FROM taller_manual WHERE id_manual = $1 FOR UPDATE", [id]);
    if (!v.rows.length) throw new AppError("Manual no encontrado", 404);
    const viejo = v.rows[0];
    if (viejo.estado !== "VIGENTE") throw noVigente(viejo.estado);
    // Una asignación sin confirmar sigue sin confirmar: subir una revisión no la
    // confirma sola. Solo el jefe, marcándolo en el mismo pedido, la da por buena.
    const confirma = req.body.confirmar_asignacion === true;
    // La revisión nueva HEREDA lo que el formulario no mande (spec §8).
    const aviones = datos.aeronaves ?? (await client.query(
      "SELECT id_aeronave FROM taller_manual_aeronave WHERE id_manual = $1", [viejo.id_manual]
    )).rows.map((x) => x.id_aeronave);
    const nuevo = await insertarManual(client, {
      titulo: datos.titulo ?? viejo.titulo,
      categoria: datos.categoria ?? viejo.categoria,
      fabricante: datos.fabricante ?? viejo.fabricante,
      numero_parte: datos.numero_parte ?? viejo.numero_parte,
      revision: datos.revision,
      es_general: datos.es_general ?? viejo.es_general,
      aeronaves: aviones,
      necesita_confirmacion: confirma ? false : viejo.necesita_confirmacion,
      nota_confirmacion: confirma ? null : viejo.nota_confirmacion,
      ruta: datos.ruta,
      ...a,
    }, req.user.id_usuario);
    await client.query(
      "UPDATE taller_manual SET estado = 'REEMPLAZADO', id_reemplazado_por = $2 WHERE id_manual = $1",
      [viejo.id_manual, nuevo.id_manual]
    );
    await client.query("COMMIT");
    res.status(201).json(publico(nuevo));
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

/**
 * Edita datos, aviones, confirma la asignación o archiva. El SET se arma con las
 * claves que llegan (lección de §31: un SET fijo nulificaba campos).
 */
exports.editar = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const { error, datos } = leerDatos(req.body, { exigirRuta: false });
  if (error) return res.status(400).json({ message: error });

  const sets = [];
  const params = [Number(req.params.id)];
  const p = (v) => `$${params.push(v)}`;
  for (const k of ["titulo", "categoria", "fabricante", "numero_parte", "revision"]) {
    if (!(k in req.body)) continue;
    if (k === "titulo" && !datos.titulo) return res.status(400).json({ message: "El título no puede quedar vacío" });
    if (k === "categoria" && !datos.categoria) return res.status(400).json({ message: "Elegí el tipo de manual" });
    sets.push(`${k} = ${p(datos[k])}`);
  }
  if ("es_general" in req.body) sets.push(`es_general = ${p(datos.es_general)}`);
  if (req.body.confirmar_asignacion === true) sets.push("necesita_confirmacion = false");
  await validarAeronaves(datos.aeronaves);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query("SELECT estado FROM taller_manual WHERE id_manual = $1 FOR UPDATE", [params[0]]);
    if (!v.rows.length) throw new AppError("Manual no encontrado", 404);
    if (req.body.archivar === true) {
      if (v.rows[0].estado !== "VIGENTE") throw new AppError(`Ya está ${v.rows[0].estado.toLowerCase()}.`, 409);
      sets.push("estado = 'ARCHIVADO'");
    }
    if (sets.length) {
      await client.query(`UPDATE taller_manual SET ${sets.join(", ")} WHERE id_manual = $1`, params);
    }
    if (datos.aeronaves) {
      await client.query("DELETE FROM taller_manual_aeronave WHERE id_manual = $1", [params[0]]);
      if (datos.aeronaves.length) {
        await client.query(
          "INSERT INTO taller_manual_aeronave (id_manual, id_aeronave) SELECT $1, unnest($2::int[])",
          [params[0], datos.aeronaves]
        );
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  const r = await db.query(`${SELECT_MANUAL} WHERE m.id_manual = $1${AGRUPAR}`, [params[0]]);
  if (!r.rows.length) return res.status(404).json({ message: "Manual no encontrado" });
  res.json(publico(r.rows[0]));
});

exports.eliminar = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const id = Number(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query("SELECT titulo FROM taller_manual WHERE id_manual = $1 FOR UPDATE", [id]);
    if (!v.rows.length) throw new AppError("Manual no encontrado", 404);
    const u = await client.query(
      `SELECT (SELECT COUNT(*) FROM taller_paquete_extracto WHERE id_manual = $1)::int AS paquetes,
              (SELECT COUNT(*) FROM taller_orden_extracto   WHERE id_manual = $1)::int AS ordenes`,
      [id]
    );
    const { paquetes, ordenes } = u.rows[0];
    if (paquetes || ordenes) {
      throw new AppError(
        `No se puede borrar: lo usan ${paquetes} rango(s) de paquetes y ${ordenes} de órdenes. Archivalo en su lugar.`,
        409
      );
    }
    const s = await client.query(
      "SELECT titulo, revision FROM taller_manual WHERE id_reemplazado_por = $1 LIMIT 1", [id]
    );
    if (s.rows.length) {
      const x = s.rows[0];
      throw new AppError(
        `No se puede borrar: es la revisión que reemplazó a «${x.titulo}${x.revision ? ` · ${x.revision}` : ""}». Archivalo en su lugar.`,
        409
      );
    }
    // Los aviones caen en cascada. El archivo QUEDA en el bucket (spec §5).
    await client.query("DELETE FROM taller_manual WHERE id_manual = $1", [id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

/** Imprimir páginas sueltas desde la biblioteca. */
exports.pdfLibre = catchAsync(async (req, res) => {
  const pedidos = Array.isArray(req.body.extractos) ? req.body.extractos : [];
  if (!pedidos.length) return res.status(400).json({ message: "Elegí qué páginas imprimir" });
  if (pedidos.length > 50) return res.status(400).json({ message: "Demasiados rangos para un solo PDF" });
  // Un id que no es un número es un pedido mal armado (400), no un manual que
  // se borró (404).
  if (!pedidos.every((e) => e && typeof e === "object" && idValido(e.id_manual))) {
    return res.status(400).json({ message: "Manual inválido" });
  }
  const manuales = await manualesPorId([...new Set(pedidos.map((e) => Number(e.id_manual)))]);
  const extractos = [];
  for (const e of pedidos) {
    const m = manuales.get(Number(e.id_manual));
    if (!m) return res.status(404).json({ message: "Uno de los manuales ya no existe" });
    const err = validarRango(e.pagina_desde, e.pagina_hasta, m.paginas);
    if (err) return res.status(400).json({ message: `${m.titulo}: ${err}` });
    extractos.push({
      sha256: m.sha256, archivo_path: m.archivo_path,
      pagina_desde: Number(e.pagina_desde), pagina_hasta: Number(e.pagina_hasta),
    });
  }
  res.json(await pdfDeExtractos(extractos));
});
