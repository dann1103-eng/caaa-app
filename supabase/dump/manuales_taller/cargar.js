/**
 * Paso 3 de 3: registra en la base los manuales ya subidos y los paquetes
 * sugeridos (spec 2026-09-20 §11).
 *
 *   node cargar.js --dry-run    no escribe nada, solo el reporte
 *   node cargar.js              carga de verdad
 *
 * Re-ejecutable: un manual con la misma huella no se vuelve a insertar, y un
 * paquete sugerido solo se crea si el avión todavía no tiene ese paquete (nunca
 * pisa lo que el jefe ya armó).
 */
const fs = require("fs");
const path = require("path");

// Mismo patrón que aeronavegabilidad/cargar.js: dependencias y .env por ruta
// absoluta al backend (require() resuelve contra la carpeta DEL SCRIPT).
const BACKEND = path.join(__dirname, "..", "..", "..", "legacy", "CAA-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({ path: path.join(BACKEND, ".env"), quiet: true });
const { Pool } = require(path.join(BACKEND, "node_modules", "pg"));

const DRY = process.argv.includes("--dry-run");
const ORIGEN = "ZIP_2026-09-20";
const NOTA = "Asignación deducida por el sistema leyendo la portada. Confirmala o corregila.";

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function main() {
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogo.json"), "utf8"));
  const sub = JSON.parse(fs.readFileSync(path.join(__dirname, "subidos.json"), "utf8"));
  const rep = { insertados: [], ya_estaban: [], sin_subir: [], paquetes: [], paquetes_omitidos: [] };
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const av = await c.query("SELECT id_aeronave, codigo FROM aeronave");
    const idAvion = new Map(av.rows.map((a) => [a.codigo, a.id_aeronave]));
    const unico = new Map(); // clave → {id, paginas} de los manuales que NO se partieron en tomos

    for (const m of cat.manuales) {
      const partes = Object.keys(sub).filter((k) => k === m.clave || k.startsWith(`${m.clave}-tomo-`)).sort();
      if (!partes.length) { rep.sin_subir.push(m.clave); continue; }
      for (const [i, k] of partes.entries()) {
        const s = sub[k];
        const titulo = partes.length > 1 ? `${m.titulo} (Tomo ${i + 1} de ${partes.length})` : m.titulo;
        const ya = await c.query("SELECT id_manual FROM taller_manual WHERE sha256 = $1", [s.sha256]);
        let id;
        if (ya.rows.length) {
          id = ya.rows[0].id_manual;
          rep.ya_estaban.push(k);
        } else {
          const r = await c.query(
            `INSERT INTO taller_manual (titulo, categoria, fabricante, numero_parte, revision, paginas, tamano_bytes,
                                        sha256, archivo_path, es_general, necesita_confirmacion, nota_confirmacion, origen)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12) RETURNING id_manual`,
            [titulo, m.categoria, m.fabricante || null, m.numero_parte || null, m.revision || null, s.paginas,
             s.tamano_bytes, s.sha256, s.archivo_path, !!m.es_general, m.nota || NOTA, ORIGEN]
          );
          id = r.rows[0].id_manual;
          rep.insertados.push(k);
          for (const cod of m.aeronaves || []) {
            if (!idAvion.has(cod)) throw new Error(`${m.clave}: no existe el avión ${cod}`);
            await c.query(
              "INSERT INTO taller_manual_aeronave (id_manual, id_aeronave) VALUES ($1,$2) ON CONFLICT DO NOTHING",
              [id, idAvion.get(cod)]
            );
          }
        }
        if (partes.length === 1) unico.set(m.clave, { id, paginas: s.paginas });
      }
    }

    for (const p of cat.paquetes_sugeridos) {
      const idA = idAvion.get(p.aeronave);
      if (!idA) throw new Error(`Paquete sugerido: no existe el avión ${p.aeronave}`);
      const existe = await c.query(
        "SELECT 1 FROM taller_paquete_manual WHERE id_aeronave = $1 AND tipo_mantenimiento = $2", [idA, p.tipo]
      );
      if (existe.rows.length) { rep.paquetes_omitidos.push(`${p.aeronave} ${p.tipo}`); continue; }
      const pq = await c.query(
        "INSERT INTO taller_paquete_manual (id_aeronave, tipo_mantenimiento, estado) VALUES ($1,$2,'BORRADOR') RETURNING id_paquete",
        [idA, p.tipo]
      );
      for (const [i, e] of p.extractos.entries()) {
        const m = unico.get(e.clave);
        if (!m) throw new Error(`Paquete ${p.aeronave} ${p.tipo}: el manual ${e.clave} no está cargado (o está en tomos)`);
        if (!(e.desde >= 1 && e.hasta >= e.desde && e.hasta <= m.paginas)) {
          throw new Error(`Paquete ${p.aeronave} ${p.tipo}: rango ${e.desde}-${e.hasta} inválido para ${e.clave} (${m.paginas} págs.)`);
        }
        await c.query(
          `INSERT INTO taller_paquete_extracto (id_paquete, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen)
           VALUES ($1,$2,$3,$4,$5,$6,'SUGERIDO')`,
          [pq.rows[0].id_paquete, m.id, e.desde, e.hasta, e.titulo, i]
        );
      }
      rep.paquetes.push(`${p.aeronave} ${p.tipo}`);
    }

    await c.query(DRY ? "ROLLBACK" : "COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
  fs.writeFileSync(path.join(__dirname, "reporte.json"), JSON.stringify(rep, null, 1));
  console.log(`${DRY ? "[DRY-RUN] " : ""}manuales nuevos ${rep.insertados.length} · ya estaban ${rep.ya_estaban.length} · ` +
    `sin subir ${rep.sin_subir.length} · paquetes ${rep.paquetes.length} · omitidos ${rep.paquetes_omitidos.length}`);
  if (rep.sin_subir.length) console.log("Sin subir:", rep.sin_subir.join(", "));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
