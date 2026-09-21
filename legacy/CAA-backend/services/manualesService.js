// legacy/CAA-backend/services/manualesService.js
/**
 * Manuales del taller: lo que cruza la base con Storage.
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md
 */
const db = require("../config/db");
const storage = require("../utils/storage");
const AppError = require("../utils/appError");
const {
  armarPdf, claveExtractos, enCola, paginasDe, MAX_PAGINAS, MAX_MANUALES,
} = require("../utils/pdfExtractos");
const { resolverInspeccion, esMecanicoDeOrden, esJefe } = require("../utils/manualesReglas");

const BUCKET = storage.BUCKETS.MANUALES;

/**
 * Un extracto con los datos de su manual. `tabla` es taller_paquete_extracto o
 * taller_orden_extracto.
 *
 * Trae sha256 y archivo_path porque el armado del PDF los necesita; al
 * responder JSON hay que pasar cada fila por sinInternos().
 */
const selectExtractos = (tabla) => `
  SELECT e.id_extracto, e.id_manual, e.pagina_desde, e.pagina_hasta, e.titulo, e.orden, e.origen,
         e.agregado_por,
         -- Solo formateado en SQL, sin el valor crudo: creado_en es timestamp SIN
         -- zona y pg lo leería en la zona del proceso (UTC en Railway): la hora
         -- saldría corrida 6 h (§40).
         to_char(e.creado_en, 'DD/MM/YYYY HH24:MI') AS creado_txt,
         NULLIF(TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')), '') AS agregado_por_nombre,
         mn.titulo AS manual_titulo, mn.revision AS manual_revision, mn.estado AS manual_estado,
         mn.paginas AS manual_paginas, mn.tamano_bytes AS manual_tamano_bytes,
         mn.sha256, mn.archivo_path,
         (e.pagina_hasta - e.pagina_desde + 1)::int AS paginas
    FROM ${tabla} e
    JOIN taller_manual mn ON mn.id_manual = e.id_manual
    LEFT JOIN usuario u ON u.id_usuario = e.agregado_por`;

/** Lo que decide qué páginas lleva una orden y quién se las toca. `q` = db o un client de transacción. */
async function contextoOrden(q, idOrden) {
  const r = await q.query(
    `SELECT o.id_orden, o.id_aeronave, o.estado, o.correlativo,
            o.creado_por, o.id_mecanico_asignado, o.id_aprendiz,
            a.codigo AS aeronave_codigo,
            m.tipo AS tipo_mantenimiento, t.nombre AS nombre_tarea,
            ri.tipo_inspeccion AS tipo_inspeccion_reporte
       FROM orden_trabajo o
       JOIN aeronave a ON a.id_aeronave = o.id_aeronave
       LEFT JOIN mantenimiento_aeronave m ON m.id_mantenimiento = o.id_mantenimiento
       LEFT JOIN taller_cumplimiento c ON c.id_cumplimiento = o.id_cumplimiento
       LEFT JOIN taller_tarea_programada t ON t.id_tarea = c.id_tarea
       LEFT JOIN reporte_inspeccion ri ON ri.id_reporte = o.id_reporte
      WHERE o.id_orden = $1`,
    [idOrden]
  );
  if (!r.rows.length) return null;
  const o = r.rows[0];
  return { ...o, inspeccion: resolverInspeccion(o) };
}

/** El paquete (avión, inspección) con sus extractos, o null. */
async function paqueteDe(q, idAeronave, tipo) {
  const p = await q.query(
    "SELECT * FROM taller_paquete_manual WHERE id_aeronave = $1 AND tipo_mantenimiento = $2",
    [idAeronave, tipo]
  );
  if (!p.rows.length) return null;
  const e = await q.query(
    `${selectExtractos("taller_paquete_extracto")} WHERE e.id_paquete = $1 ORDER BY e.orden, e.id_extracto`,
    [p.rows[0].id_paquete]
  );
  return { ...p.rows[0], extractos: e.rows };
}

/**
 * Lo que se muestra e imprime de una orden (spec §7).
 * - ABIERTA: el paquete CONFIRMADO en vivo + lo agregado a mano. Las copias
 *   'PAQUETE' de una firma anterior (antes de una devolución) no se muestran:
 *   la próxima firma las reemplaza.
 * - Cualquier otro estado: solo lo guardado en la orden.
 */
async function manualesDeOrden(idOrden, usuario) {
  const o = await contextoOrden(db, idOrden);
  if (!o) return null;
  const propias = (await db.query(
    `${selectExtractos("taller_orden_extracto")} WHERE e.id_orden = $1 ORDER BY e.orden, e.id_extracto`,
    [idOrden]
  )).rows;
  const abierta = o.estado === "ABIERTA";
  const paquete = o.inspeccion ? await paqueteDe(db, o.id_aeronave, o.inspeccion) : null;

  const delPaquete = abierta
    ? (paquete?.estado === "CONFIRMADO" ? paquete.extractos : [])
    : propias.filter((e) => e.origen === "PAQUETE");
  const agregadas = propias.filter((e) => e.origen === "MANUAL");

  return {
    orden: {
      id_orden: o.id_orden, correlativo: o.correlativo, estado: o.estado,
      id_aeronave: o.id_aeronave, aeronave_codigo: o.aeronave_codigo,
    },
    inspeccion: o.inspeccion,
    paquete_estado: paquete?.estado || null,
    congelado: !abierta,
    del_paquete: delPaquete,
    agregadas,
    puede_agregar: abierta && (esJefe(usuario?.rol) || esMecanicoDeOrden(o, usuario?.id_usuario)),
    es_jefe: esJefe(usuario?.rol),
    paginas: paginasDe([...delPaquete, ...agregadas]),
  };
}

/**
 * Copia el paquete confirmado a la orden, dentro de la transacción de
 * firmarOrden. Borrar antes de copiar hace que devolver y volver a firmar no
 * duplique las páginas.
 */
async function congelarPaqueteEnOrden(client, idOrden) {
  await client.query(
    "DELETE FROM taller_orden_extracto WHERE id_orden = $1 AND origen = 'PAQUETE'", [idOrden]
  );
  const o = await contextoOrden(client, idOrden);
  if (!o?.inspeccion) return 0;
  const r = await client.query(
    `INSERT INTO taller_orden_extracto (id_orden, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen)
     SELECT $1, e.id_manual, e.pagina_desde, e.pagina_hasta, e.titulo, e.orden, 'PAQUETE'
       FROM taller_paquete_extracto e
       JOIN taller_paquete_manual p ON p.id_paquete = e.id_paquete
      WHERE p.id_aeronave = $2 AND p.tipo_mantenimiento = $3 AND p.estado = 'CONFIRMADO'`,
    [idOrden, o.id_aeronave, o.inspeccion]
  );
  return r.rowCount;
}

/**
 * URL firmada (1 h) de un PDF con esas páginas. Si ya se armó antes con el mismo
 * contenido se reutiliza sin bajar nada.
 * @param extractos [{sha256, archivo_path, pagina_desde, pagina_hasta}] en orden
 */
async function pdfDeExtractos(extractos) {
  if (!extractos.length) throw new AppError("No hay páginas para imprimir.", 400);
  const paginas = paginasDe(extractos);
  if (paginas > MAX_PAGINAS) {
    throw new AppError(`Son ${paginas} páginas: el máximo por PDF es ${MAX_PAGINAS}. Partilo en dos.`, 400);
  }
  const caminoPorSha = new Map(extractos.map((e) => [e.sha256, e.archivo_path]));
  if (caminoPorSha.size > MAX_MANUALES) {
    throw new AppError(`Un PDF puede juntar páginas de hasta ${MAX_MANUALES} manuales distintos.`, 400);
  }
  const ruta = `extractos/${claveExtractos(extractos)}.pdf`;
  if (!(await storage.existeArchivo(BUCKET, ruta))) {
    await enCola(async () => {
      if (await storage.existeArchivo(BUCKET, ruta)) return; // lo armó otro mientras esperaba
      // Cada manual se baja recién cuando armarPdf lo pide, de a uno: nunca hay
      // dos manuales enteros en memoria a la vez.
      const bytes = await armarPdf(extractos, (sha) => storage.descargarArchivo(BUCKET, caminoPorSha.get(sha)));
      try {
        await storage.subirArchivo(BUCKET, ruta, Buffer.from(bytes), "application/pdf", { upsert: false });
      } catch (err) {
        if (err.statusCode === 409) return; // ya existe: mismo hash, mismo contenido
        if (err.statusCode === 413) {
          throw new AppError("El PDF armado pasa el tope de 50 MB del almacenamiento. Imprimilo en dos partes.", 400);
        }
        throw err;
      }
    });
  }
  return { url: await storage.urlFirmada(BUCKET, ruta, 3600), paginas };
}

/**
 * Copia de un extracto sin lo interno de Storage (sha256, archivo_path), para
 * las respuestas JSON. manualesDeOrden los conserva porque el armado del PDF
 * los necesita.
 */
function sinInternos(extracto) {
  const { sha256: _sha256, archivo_path: _archivoPath, ...resto } = extracto;
  return resto;
}

/** Manuales por id (Map id_manual → fila). */
async function manualesPorId(ids) {
  if (!ids.length) return new Map();
  const r = await db.query("SELECT * FROM taller_manual WHERE id_manual = ANY($1::int[])", [ids]);
  return new Map(r.rows.map((m) => [m.id_manual, m]));
}

module.exports = {
  BUCKET, selectExtractos, contextoOrden, paqueteDe, manualesDeOrden,
  congelarPaqueteEnOrden, pdfDeExtractos, manualesPorId, sinInternos,
};
