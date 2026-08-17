/**
 * Paso 2 de la carga del inventario de la bodega OMA: JSON -> Supabase.
 *
 *   node cargar.js [--dry-run] [--limpiar-demo] [json]
 *
 * Se puede correr desde cualquier carpeta: toma el .env y las dependencias de
 * legacy/CAA-backend por ruta absoluta.
 *
 * Es RE-EJECUTABLE: lo cargado queda marcado origen='EXCEL_2026' y se borra al
 * empezar, así que correrlo dos veces no duplica nada. Con --dry-run hace todo
 * el trabajo, imprime el reporte y hace ROLLBACK.
 *
 * El stock NO se importa: sale de sumar los movimientos. Por eso al final el
 * reporte compara contra lo que decía el Excel — y las diferencias NO se
 * corrigen solas: se listan para que el mecánico cuente y las cierre con un
 * documento de ajuste.
 *
 * Spec: docs/superpowers/specs/2026-08-17-inventario-taller-design.md
 */
const fs = require("fs");
const path = require("path");

// Este script vive fuera del árbol de node_modules del backend, así que sus
// dependencias y su .env se resuelven por ruta absoluta. Así corre igual desde
// la raíz del repo, desde supabase/dump o desde legacy/CAA-backend.
const BACKEND = path.resolve(__dirname, "../../../legacy/CAA-backend");
module.paths.push(path.join(BACKEND, "node_modules"));
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const { Pool } = require(path.join(BACKEND, "node_modules", "pg"));

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const LIMPIAR_DEMO = args.includes("--limpiar-demo");
const JSON_PATH = args.find((a) => !a.startsWith("--"))
  || path.join(__dirname, "inventario_oma.json");

const ORIGEN = "EXCEL_2026";
const PREFIJO = { ENTRADA: "FA", SALIDA: "REQ", AJUSTE: "AJ" };
const DIGITOS = { ENTRADA: 5, SALIDA: 3, AJUSTE: 3 };

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const n2 = (v) => (v == null ? "—" : Number(v).toFixed(2));

(async () => {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
  const client = await pool.connect();
  const reporte = { diferencias: [], negativos: [], sinMovimiento: 0, demoBorrado: [] };

  try {
    await client.query("BEGIN");

    // ── 0 · Limpieza ──────────────────────────────────────────────────────
    // Lo cargado antes por este mismo script.
    const prev = await client.query(
      `DELETE FROM taller_movimiento_inventario m
        USING taller_documento_inventario d
        WHERE d.id_documento = m.id_documento AND d.origen = $1`, [ORIGEN]);
    const prevDoc = await client.query(
      "DELETE FROM taller_documento_inventario WHERE origen = $1", [ORIGEN]);
    if (prevDoc.rowCount) {
      console.log(`Recarga: se borraron ${prevDoc.rowCount} documentos y ${prev.rowCount} renglones de una carga anterior.`);
    }

    if (LIMPIAR_DEMO) {
      const demo = await client.query(
        `SELECT r.id_repuesto, r.descripcion FROM taller_repuesto r WHERE r.codigo IS NULL`);
      reporte.demoBorrado = demo.rows.map((x) => x.descripcion);
      if (demo.rows.length) {
        const ids = demo.rows.map((x) => x.id_repuesto);
        await client.query(
          `DELETE FROM taller_movimiento_inventario WHERE id_repuesto = ANY($1::int[])`, [ids]);
        await client.query(
          `DELETE FROM taller_documento_inventario d
            WHERE NOT EXISTS (SELECT 1 FROM taller_movimiento_inventario m WHERE m.id_documento = d.id_documento)
              AND d.origen = 'PRE_DOCUMENTO'`);
        await client.query(`DELETE FROM taller_repuesto WHERE id_repuesto = ANY($1::int[])`, [ids]);
      }
    }

    // ── 1 · Aeronaves de terceros ─────────────────────────────────────────
    const aeronaves = new Map();
    for (const cod of data.externas) {
      const ex = await client.query("SELECT id_aeronave FROM aeronave WHERE codigo = $1", [cod]);
      if (ex.rows.length) {
        await client.query("UPDATE aeronave SET es_externa = true WHERE id_aeronave = $1", [ex.rows[0].id_aeronave]);
        aeronaves.set(cod, ex.rows[0].id_aeronave);
      } else {
        // activa=false para que ni siquiera por accidente entre a un selector;
        // el filtro real es es_externa, esto es cinturón y tirantes.
        const r = await client.query(
          `INSERT INTO aeronave (codigo, modelo, tipo, activa, estado, es_externa, horas_acumuladas)
           VALUES ($1, 'EXTERNA', 'AVION', false, 'ACTIVO', true, 0) RETURNING id_aeronave`, [cod]);
        aeronaves.set(cod, r.rows[0].id_aeronave);
        console.log(`Aeronave de tercero dada de alta: ${cod}`);
      }
    }
    const flota = await client.query("SELECT id_aeronave, codigo FROM aeronave");
    for (const a of flota.rows) if (!aeronaves.has(a.codigo)) aeronaves.set(a.codigo, a.id_aeronave);

    // ── 2 · Catálogo ──────────────────────────────────────────────────────
    const idPorCodigo = new Map();
    for (const it of data.items) {
      const r = await client.query(
        `INSERT INTO taller_repuesto
           (codigo, descripcion, parte_no, ubicacion, categoria, unidad,
            stock_actual, stock_minimo, costo_unitario, serie_no, es_serializado)
         -- $7 va casteado: sin el ::numeric, el COALESCE con el literal 0 hace
         -- que Postgres infiera integer y reviente con un costo como 8.009.
         VALUES ($1,$2,$3,$4,$5,$6, 0, 0, COALESCE($7::numeric,0), $8, $9)
         -- El índice único de codigo es PARCIAL (WHERE codigo IS NOT NULL), así
         -- que hay que repetirle el predicado para que ON CONFLICT lo infiera.
         ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
           descripcion    = EXCLUDED.descripcion,
           parte_no       = EXCLUDED.parte_no,
           ubicacion      = EXCLUDED.ubicacion,
           categoria      = EXCLUDED.categoria,
           unidad         = EXCLUDED.unidad,
           costo_unitario = EXCLUDED.costo_unitario,
           serie_no       = EXCLUDED.serie_no,
           es_serializado = EXCLUDED.es_serializado
         RETURNING id_repuesto`,
        [it.codigo, it.descripcion, it.parte_no, it.ubicacion, it.categoria,
         it.unidad, it.costo_unitario, it.serie_no, it.es_serializado]
      );
      idPorCodigo.set(it.codigo, r.rows[0].id_repuesto);
    }

    // ── 3 · Documentos ────────────────────────────────────────────────────
    let renglones = 0;
    for (const [ix, d] of data.documentos.entries()) {
      const correlativo = `${PREFIJO[d.tipo]}-${String(d.numero).padStart(DIGITOS[d.tipo], "0")}-${d.anio}`;
      const idAero = d.matricula ? aeronaves.get(d.matricula) ?? null : null;
      if (d.matricula && !idAero) {
        console.log(`  ⚠ matrícula sin aeronave en la BD: ${d.matricula} (${correlativo}) — queda sin aeronave`);
      }
      const cab = await client.query(
        `INSERT INTO taller_documento_inventario
           (tipo, anio, numero, correlativo, fecha, id_aeronave, motivo, nota, origen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_documento`,
        [d.tipo, d.anio, d.numero, correlativo, d.fecha, idAero, d.motivo, d.nota, ORIGEN]
      );
      const idDoc = cab.rows[0].id_documento;

      // Los renglones del documento van en UN solo INSERT multi-fila: de a uno
      // eran ~930 viajes a Supabase y la carga tardaba minutos.
      const vals = [];
      const ph = [];
      for (const l of d.renglones) {
        const idRep = idPorCodigo.get(l.codigo);
        if (!idRep) throw new Error(`Renglón de ${correlativo} con código desconocido: ${l.codigo}`);
        // Signo: la entrada suma, la salida resta.
        const cantidad = d.tipo === "ENTRADA" ? l.cantidad : -l.cantidad;
        const i = vals.length;
        ph.push(`($1, $${i + 2}, $${i + 3}, $${i + 4})`);
        vals.push(idRep, cantidad, l.nota);
        renglones++;
      }
      if (ph.length) {
        await client.query(
          `INSERT INTO taller_movimiento_inventario (id_documento, id_repuesto, cantidad, nota)
           VALUES ${ph.join(",")}`,
          [idDoc, ...vals]
        );
      }
      if (ix % 25 === 0) process.stdout.write(`  … ${ix}/${data.documentos.length} documentos\r`);
    }
    process.stdout.write(" ".repeat(60) + "\r");

    // ── 4 · Stock derivado de los movimientos ─────────────────────────────
    await client.query(
      `UPDATE taller_repuesto r SET
         stock_actual = COALESCE((
           SELECT SUM(m.cantidad) FROM taller_movimiento_inventario m
             JOIN taller_documento_inventario d ON d.id_documento = m.id_documento
            WHERE m.id_repuesto = r.id_repuesto AND d.estado = 'VIGENTE'), 0),
         ultimo_movimiento_en = (
           SELECT MAX(d.fecha) FROM taller_movimiento_inventario m
             JOIN taller_documento_inventario d ON d.id_documento = m.id_documento
            WHERE m.id_repuesto = r.id_repuesto AND d.estado = 'VIGENTE'),
         ultima_entrada_en = (
           SELECT MAX(d.fecha) FROM taller_movimiento_inventario m
             JOIN taller_documento_inventario d ON d.id_documento = m.id_documento
            WHERE m.id_repuesto = r.id_repuesto AND d.estado = 'VIGENTE' AND d.tipo = 'ENTRADA')`
    );

    // ── 5 · Reporte de diferencias ────────────────────────────────────────
    const stock = await client.query(
      `SELECT codigo, descripcion, stock_actual, ultimo_movimiento_en
         FROM taller_repuesto WHERE codigo IS NOT NULL`);
    const porCodigo = new Map(stock.rows.map((x) => [x.codigo, x]));

    for (const it of data.items) {
      const fila = porCodigo.get(it.codigo);
      if (!fila) continue;
      const sistema = Number(fila.stock_actual);
      if (sistema < 0) reporte.negativos.push({ ...it, sistema });
      if (it.stock_excel != null && Math.abs(Number(it.stock_excel) - sistema) > 0.001) {
        reporte.diferencias.push({ ...it, sistema, excel: Number(it.stock_excel) });
      }
      if (!fila.ultimo_movimiento_en) reporte.sinMovimiento++;
    }

    if (DRY) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    // ── Salida ────────────────────────────────────────────────────────────
    const linea = "─".repeat(78);
    console.log(`\n${linea}\nCARGA DEL INVENTARIO OMA ${DRY ? "(DRY RUN — se revirtió todo)" : "(APLICADA)"}\n${linea}`);
    console.log(`Ítems en catálogo:      ${data.items.length}`);
    console.log(`Documentos:             ${data.documentos.length} (${data.documentos.filter((d) => d.tipo === "ENTRADA").length} entradas, ${data.documentos.filter((d) => d.tipo === "SALIDA").length} salidas)`);
    console.log(`Renglones:              ${renglones}`);
    console.log(`Aeronaves de terceros:  ${data.externas.join(", ")}`);
    if (reporte.demoBorrado.length) console.log(`Demo borrado:           ${reporte.demoBorrado.join(", ")}`);
    console.log(`Ítems sin movimiento:   ${reporte.sinMovimiento}  (candidatos a depurar)`);

    console.log(`\n▸ EXISTENCIAS EN NEGATIVO (${reporte.negativos.length}) — se cierran con un ajuste tras contar en bodega`);
    for (const x of reporte.negativos.sort((a, b) => a.sistema - b.sistema)) {
      console.log(`   ${x.codigo}  ${String(x.descripcion).slice(0, 44).padEnd(44)} ${n2(x.sistema).padStart(9)}`);
    }

    console.log(`\n▸ DIFERENCIAS CONTRA EL EXCEL (${reporte.diferencias.length}) — el Excel cruzaba por texto; el sistema, por código`);
    console.log(`   ${"código".padEnd(8)}${"descripción".padEnd(46)}${"Excel".padStart(9)}${"sistema".padStart(10)}`);
    for (const x of reporte.diferencias.sort((a, b) => Math.abs(b.excel - b.sistema) - Math.abs(a.excel - a.sistema))) {
      console.log(`   ${x.codigo.padEnd(8)}${String(x.descripcion).slice(0, 44).padEnd(46)}${n2(x.excel).padStart(9)}${n2(x.sistema).padStart(10)}`);
    }

    const porTipo = {};
    for (const p of data.problemas) porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
    console.log(`\n▸ AVISOS DE LA EXTRACCIÓN (${data.problemas.length})`);
    for (const [t, c] of Object.entries(porTipo).sort()) console.log(`   ${t.padEnd(30)} ${c}`);
    console.log(`   (el detalle completo está en ${path.basename(JSON_PATH)} → "problemas")`);
    console.log(linea);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Error, se revirtió todo:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
