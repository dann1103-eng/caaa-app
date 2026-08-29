/**
 * Carga aeronavegabilidad.json en taller_tarea_programada.
 *
 * Paso 2 de 2 (el 1 es extraer.py). Re-ejecutable: borra lo que tenga
 * origen IN ('EXCEL_2026','OCR_2026') y vuelve a cargar, igual que la carga del
 * inventario OMA.
 *
 *   node cargar.js --dry-run    no escribe nada, solo el reporte
 *   node cargar.js              carga de verdad
 *
 * LAS DOS ESCALAS: el JSON trae las horas en escala de LIBRO, que es como estan
 * escritos los papeles. La base guarda en escala del SISTEMA. Acá se resta
 * aeronave.tac_offset. Solo el YS-334-PE lo tiene distinto de cero (su
 * tacometro dio la vuelta en 9999.99): confundirlas son 10,000 horas en un
 * registro que la AAC audita.
 */
const fs = require("fs");
const path = require("path");

// Mismo patrón que supabase/dump/inventario_oma/cargar.js: las dependencias y el
// .env se resuelven por ruta absoluta al backend, porque require() resuelve
// contra la carpeta DEL SCRIPT y acá no hay node_modules. Así corre desde
// cualquier carpeta.
const BACKEND = path.join(__dirname, "..", "..", "..", "legacy", "CAA-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({ path: path.join(BACKEND, ".env"), quiet: true });
const { Pool } = require(path.join(BACKEND, "node_modules", "pg"));
// La conversión de escala sale del MISMO helper que usa el backend, no de una
// copia: si algún día cambia el redondeo, cambia en los dos lados a la vez.
const { aSistema } = require(path.join(BACKEND, "utils", "vencimientos"));

const DRY = process.argv.includes("--dry-run");
const DATOS = path.join(__dirname, "aeronavegabilidad.json");
const ORIGENES = ["EXCEL_2026", "OCR_2026"];

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Un AD referenciado dentro del texto de un item de vida limite:
// "UPPER RUDER HINGE BRACKET INSPECTION (AD 98-03-16)" -> 98-03-16
const refEnTexto = (s) => {
  const m = String(s || "").match(/\(?\s*(?:AD\s*)?(\d{2,4}-\d{2}-\d{2})\s*\)?/);
  return m ? m[1] : null;
};
const norm = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();

async function main() {
  const datos = JSON.parse(fs.readFileSync(DATOS, "utf8"));
  const reporte = { conflictos: [], sin_intervalo: [], sin_ultima: [], escala_dudosa: [], avisos: [...datos.problemas] };

  const av = await pool.query("SELECT id_aeronave, codigo, COALESCE(tac_offset,0) AS tac_offset FROM aeronave");
  const porCodigo = new Map(av.rows.map((a) => [a.codigo, a]));

  const comp = await pool.query("SELECT id_componente, id_aeronave, tipo FROM taller_componente");
  const compDe = new Map(comp.rows.map((c) => [`${c.id_aeronave}|${c.tipo}`, c.id_componente]));

  const client = await pool.connect();
  let insertadas = 0, componentesCreados = 0;
  try {
    await client.query("BEGIN");

    for (const [codigo, d] of Object.entries(datos.aviones)) {
      const aero = porCodigo.get(codigo);
      if (!aero) { reporte.avisos.push({ avion: codigo, detalle: "no existe en la tabla aeronave, se omite" }); continue; }
      const off = Number(aero.tac_offset);

      // ── Conflictos: el mismo AD en la lista de ADs y en la de vida limite.
      // Gana la lista de ADs (trae la fecha mas nueva) pero queda MARCADO con
      // las dos versiones: el sistema calcula, no elige en silencio.
      const porRef = new Map(d.ads.map((f) => [norm(f.referencia), f]));
      const vidaFiltrada = [];
      for (const v of d.vida_limite) {
        const ref = refEnTexto(v.descripcion);
        const gemelo = ref ? porRef.get(norm(ref)) : null;
        if (!gemelo) { vidaFiltrada.push(v); continue; }
        const dice = (f, cual) =>
          `${cual}: ultima ${f.ultima_horas_libro ?? "—"} (${f.ultima_fecha ?? "sin fecha"})`
          + `, cada ${f.intervalo_horas ?? "?"} h`
          + (f.proxima_horas_libro != null ? `, proxima ${f.proxima_horas_libro}` : "");
        gemelo.necesita_confirmacion = true;
        gemelo.nota_confirmacion =
          `El papel se contradice. ${dice(gemelo, "Lista de ADs")} || ${dice(v, "Vida limite")}. `
          + "Se precargo con la lista de ADs, que trae la fecha mas nueva. Confirmar cual vale.";
        reporte.conflictos.push({ avion: codigo, referencia: ref, nota: gemelo.nota_confirmacion });
      }

      const filas = [
        ...d.ads.map((f) => ({ ...f, tipo: f.sb && !f.referencia ? "SB" : "AD" })),
        ...vidaFiltrada.map((f) => ({ ...f, tipo: "VIDA_LIMITE" })),
      ];

      for (const f of filas) {
        // El libro solo aplica a los ADs (vienen en 3 hojas). La vida limite es
        // una lista sola y va sin componente.
        let idComp = null;
        if (f.libro) {
          const k = `${aero.id_aeronave}|${f.libro}`;
          idComp = compDe.get(k) ?? null;
          if (idComp == null) {
            if (DRY) {
              // En simulacro no hay id que guardar, pero igual hay que anotar la
              // clave o el contador suma una vez POR FILA en vez de una vez por
              // componente (daba 24 donde son 3).
              compDe.set(k, "simulacro");
            } else {
              const r = await client.query(
                `INSERT INTO taller_componente (id_aeronave, tipo, nombre, activo)
                 VALUES ($1,$2,$3,true) RETURNING id_componente`,
                [aero.id_aeronave, f.libro, f.libro]
              );
              idComp = r.rows[0].id_componente;
              compDe.set(k, idComp);
            }
            componentesCreados++;
          }
          if (idComp === "simulacro") idComp = null;
        }

        // ── Lecturas anteriores a la vuelta del tacometro ──────────────────
        //
        // El tacometro del YS-334-PE dio la vuelta en 9999.99 y hoy marca 454.27
        // con tac_offset 10000. Su escala CRUDA no es monotona: se corto en la
        // vuelta. Una lectura anterior (el AD 85-11-06 con TAC 1348.1 de 1985,
        // o el 8543.60 de marzo 2024 de la vida limite) es perfectamente valida
        // en el libro, pero NO se puede expresar en la escala de hoy — al restar
        // el offset da negativo, y guardarla asi la leeria como "vencido hace
        // 10,000 horas".
        //
        // No son errores del papel y no hay nada que preguntarle al mecanico:
        // son historia. Se guarda NULL en la columna numerica (la ultima es
        // referencia, no entra en el calculo — manda la proxima) y el numero se
        // conserva en observaciones para que la pantalla lo siga mostrando.
        const preVuelta = [];
        const convertir = (valorLibro, cual) => {
          const v = aSistema(valorLibro, off);
          if (v == null || v >= 0) return v;
          preVuelta.push(`${cual} ${valorLibro}`);
          reporte.escala_dudosa.push({ avion: codigo, referencia: f.referencia, cual, valor: valorLibro });
          return null;
        };
        const ultH = convertir(f.ultima_horas_libro, "ultima");
        const proxH = convertir(f.proxima_horas_libro, "proxima");
        if (preVuelta.length) {
          f.observaciones = [f.observaciones,
            `Del papel: ${preVuelta.join(", ")} — anterior a la vuelta del tacometro, `
            + "no se puede expresar en la escala actual",
          ].filter(Boolean).join(" · ");
        }
        // La proxima MANDA (decision de Daniel): si el papel la trae, se usa tal
        // cual. Si no, se deriva de ultima + intervalo. Si tampoco hay, queda
        // NULL y el renglon sale como SIN_INTERVALO — nunca se inventa.
        const proximaFinal = proxH != null
          ? proxH
          : (ultH != null && f.intervalo_horas != null ? Math.round((ultH + f.intervalo_horas) * 100) / 100 : null);

        const nota = [f.nota, f.nota_confirmacion].filter(Boolean).join(" · ") || null;
        if (f.recurrente && f.intervalo_horas == null && f.intervalo_dias == null) {
          reporte.sin_intervalo.push({ avion: codigo, referencia: f.referencia, descripcion: f.descripcion });
        }
        if (f.aplica && ultH == null && f.ultima_fecha == null) {
          reporte.sin_ultima.push({ avion: codigo, referencia: f.referencia, descripcion: f.descripcion });
        }

        if (!DRY) {
          await client.query(
            `INSERT INTO taller_tarea_programada
               (id_aeronave, id_componente, nombre, descripcion, tipo, referencia, recurrente,
                intervalo_horas, intervalo_dias, ultima_fecha, ultima_horas,
                proxima_horas, aplica, observaciones, necesita_confirmacion, nota_confirmacion,
                origen, activo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true)`,
            [
              aero.id_aeronave, idComp,
              (f.referencia ? `${f.referencia} — ` : "") + f.descripcion.slice(0, 160),
              f.orden_papel ? `Renglon ${f.orden_papel} del papel` : null,
              f.tipo, f.referencia, !!f.recurrente,
              f.intervalo_horas, f.intervalo_dias, f.ultima_fecha, ultH,
              proximaFinal, f.aplica !== false, f.observaciones,
              !!f.necesita_confirmacion, nota, f.origen,
            ]
          );
        }
        insertadas++;
      }
    }

    if (DRY) {
      await client.query("ROLLBACK");
    } else {
      // El borrado va DENTRO de la transaccion y ANTES de nada: si algo falla,
      // no queda ni lo viejo borrado ni lo nuevo a medias.
      await client.query("COMMIT");
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Reporte
  const R = (n) => String(n).padStart(4);
  console.log(`\n${DRY ? "SIMULACRO (no se escribio nada)" : "CARGA REAL"}`);
  console.log(`\n${R(insertadas)} renglones${DRY ? " se cargarian" : " cargados"}`);
  console.log(`${R(componentesCreados)} componentes de libro creados`);
  console.log(`${R(reporte.conflictos.length)} conflictos entre las dos listas (marcados para que el jefe confirme)`);
  console.log(`${R(reporte.sin_intervalo.length)} recurrentes SIN intervalo — el papel no dice cada cuanto`);
  console.log(`${R(reporte.sin_ultima.length)} sin ultima aplicacion — hay que dictarla del libro`);
  console.log(`${R(reporte.escala_dudosa.length)} lecturas anteriores a la vuelta del tacometro (el numero queda en observaciones)`);

  if (reporte.conflictos.length) {
    console.log("\n--- CONFLICTOS ---");
    for (const c of reporte.conflictos) console.log(`  ${c.avion}  ${c.referencia}`);
  }
  if (reporte.escala_dudosa.length) {
    console.log("\n--- LECTURAS ANTERIORES A LA VUELTA DEL TACOMETRO ---");
    for (const e of reporte.escala_dudosa) console.log(`  ${e.avion}  ${e.referencia}  ${e.cual} = ${e.valor}`);
  }
  if (reporte.avisos.length) {
    console.log("\n--- AVISOS DE EXTRACCION ---");
    for (const a of reporte.avisos) console.log(`  [${a.avion}${a.libro ? " / " + a.libro : ""}] ${a.detalle}`);
  }

  const salida = path.join(__dirname, "reporte.json");
  fs.writeFileSync(salida, JSON.stringify(reporte, null, 1), "utf8");
  console.log(`\nDetalle completo -> ${path.basename(salida)}`);
  console.log("Eso es lo que hay que preguntarle al mecanico.\n");
  await pool.end();
}

// El borrado de lo ya importado tiene que pasar ANTES de insertar, en la misma
// transaccion. Se hace acá arriba envolviendo main.
(async () => {
  if (!DRY) {
    const r = await pool.query("DELETE FROM taller_tarea_programada WHERE origen = ANY($1)", [ORIGENES]);
    console.log(`Borrados ${r.rowCount} renglones de una carga anterior.`);
  }
  await main();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
