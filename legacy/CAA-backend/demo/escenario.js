/**
 * El escenario del demo: lo que ve un prospecto al entrar, y el punto al que
 * vuelve el botón de reinicio.
 *
 * ⚠️ TODO va con FECHAS RELATIVAS A HOY. Sembrar fechas fijas es la trampa que
 * este proyecto ya pagó tres veces: obligó a crear
 * supabase/dump/reubicar_vuelos_semana_actual.sql y a re-ejecutarlo sesión tras
 * sesión (CLAUDE.md §8). Acá se resetea en marzo y funciona igual que en agosto.
 *
 * Qué queda montado:
 *   · 3 instructores, 20 alumnos (uno de ellos de sobrecargo, que no vuela)
 *   · un mes de vuelos ya cerrados, con su vouchera y su cargo a cuenta
 *   · solicitudes de la semana próxima PENDIENTES de aprobar
 *   · vuelos de HOY en distintas etapas, para mostrar el ciclo del día y el
 *     llenado de la vouchera
 *
 * NO toca el catálogo (flota, cursos, licencias, bloques, config fiscal): eso es
 * el punto de partida y lo arma el runbook una sola vez.
 */
const bcrypt = require("bcrypt");

// ── Fechas relativas ──────────────────────────────────────────────────────
const DIA = 86400000;
const soloFecha = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Lunes de la semana de `ref` (lunes = 1). */
function lunesDe(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const desplazamiento = (d.getDay() + 6) % 7; // domingo=0 -> 6
  return new Date(d.getTime() - desplazamiento * DIA);
}
const sumarDias = (d, n) => new Date(d.getTime() + n * DIA);

// ── Personas ──────────────────────────────────────────────────────────────
const INSTRUCTORES = [
  { u: "r.flores",  n: "Ricardo",  a: "Flores"   },
  { u: "m.aguilar", n: "Mariana",  a: "Aguilar"  },
  { u: "j.portillo",n: "Joaquín",  a: "Portillo" },
];

const ALUMNOS = [
  ["a.zavala","Angeline","Zavala"], ["g.mena","Gisell","Mena"],
  ["s.cruz","Santiago","Cruz"],     ["f.guillen","Francisco","Guillén"],
  ["l.vanegas","Lucía","Vanegas"],  ["k.castaneda","Karla","Castañeda"],
  ["g.mijangos","Gabriel","Mijangos"], ["s.flores","Samuel","Flores"],
  ["v.perez","Víctor","Pérez"],     ["d.rivas","Daniela","Rivas"],
  ["e.molina","Ernesto","Molina"],  ["p.orellana","Paola","Orellana"],
  ["h.campos","Hugo","Campos"],     ["n.serrano","Natalia","Serrano"],
  ["r.echeverria","Rodrigo","Echeverría"], ["c.bonilla","Camila","Bonilla"],
  ["t.andrade","Tomás","Andrade"],  ["i.quintanilla","Isabel","Quintanilla"],
  ["b.navarro","Bruno","Navarro"],
];
const ALUMNA_TIERRA = ["a.reyes", "Andrea", "Reyes"]; // sobrecargo: no vuela

const PASS = "demo123";

// ── Helpers de escritura ──────────────────────────────────────────────────
async function crearUsuario(c, { u, n, a, rol }, sufijo = "") {
  const hash = await bcrypt.hash(PASS, 10);
  u = u + sufijo;
  const r = await c.query(
    `INSERT INTO usuario (username, password_hash, nombre, apellido, correo, rol,
                          activo, datos_confirmados, must_change_password, must_set_email)
     VALUES ($1,$2,$3,$4,$5,$6,true,true,false,false) RETURNING id_usuario`,
    [u, hash, n, a, `${u}@demo.local`, rol]
  );
  return r.rows[0].id_usuario;
}

/** Saldo pseudo-aleatorio pero ESTABLE: el mismo alumno siempre trae lo mismo. */
const saldoDe = (i) => Math.round(((i * 7919) % 2400) + 120);

/**
 * @param {object} opciones
 * @param {string} [opciones.sufijo] - Se pega a cada username. El sembrador
 *   asume una base VACÍA, que es lo que garantiza el reinicio; el sufijo existe
 *   para poder probarlo contra una base que ya tiene gente, sin colisionar.
 */
async function sembrar(c, log = () => {}, { sufijo = "" } = {}) {
  const hoy = new Date();
  const lunes = lunesDe(hoy);
  const diaHoy = ((hoy.getDay() + 6) % 7) + 1; // 1=lunes … 7=domingo

  // ── Catálogo que el escenario necesita leer ────────────────────────────
  const aeronaves = (await c.query(
    `SELECT id_aeronave, codigo, tipo FROM aeronave
      WHERE activa = true AND NOT COALESCE(es_externa,false) AND tipo <> 'SIMULADOR'
      ORDER BY id_aeronave`
  )).rows;
  if (!aeronaves.length) throw new Error("El catálogo no tiene aeronaves: corré primero el alta de flota del runbook.");

  const bloques = (await c.query(
    `SELECT id_bloque FROM bloque_horario ORDER BY id_bloque LIMIT 6`
  )).rows.map((b) => b.id_bloque);
  if (!bloques.length) throw new Error("El catálogo no tiene bloques horarios.");

  const licVuelo = (await c.query(
    `SELECT id_licencia FROM licencia WHERE vuela = true ORDER BY nivel LIMIT 1`
  )).rows[0]?.id_licencia;
  const licTierra = (await c.query(
    `SELECT id_licencia FROM licencia WHERE vuela = false ORDER BY id_licencia LIMIT 1`
  )).rows[0]?.id_licencia;
  if (!licVuelo) throw new Error("El catálogo no tiene ninguna licencia que vuele.");

  // ── Staff ──────────────────────────────────────────────────────────────
  log("staff");
  await crearUsuario(c, { u: "admin",   n: "Ana",   a: "Directora", rol: "ADMIN" }, sufijo);
  await crearUsuario(c, { u: "turno",   n: "Óscar", a: "Turno",     rol: "TURNO" }, sufijo);
  await crearUsuario(c, { u: "conta",   n: "Rosa",  a: "Contreras", rol: "ADMINISTRACION" }, sufijo);
  await crearUsuario(c, { u: "taller",  n: "José",  a: "Mecánico",  rol: "TALLER" }, sufijo);

  const idsInstructor = [];
  for (const i of INSTRUCTORES) {
    const idU = await crearUsuario(c, { ...i, rol: "INSTRUCTOR" }, sufijo);
    const r = await c.query(
      `INSERT INTO instructor (id_usuario, activo, es_instructor_vuelo, es_instructor_teoria, puede_programar)
       VALUES ($1, true, true, true, $2) RETURNING id_instructor`,
      [idU, i.u === "r.flores"]
    );
    idsInstructor.push(r.rows[0].id_instructor);
  }

  // ── Alumnos ────────────────────────────────────────────────────────────
  log("alumnos");
  const idsAlumno = [];
  for (let i = 0; i < ALUMNOS.length; i++) {
    const [u, n, a] = ALUMNOS[i];
    const idU = await crearUsuario(c, { u, n, a, rol: "ALUMNO" }, sufijo);
    const r = await c.query(
      `INSERT INTO alumno (id_usuario, id_instructor, id_licencia, activo, horas_acumuladas)
       VALUES ($1,$2,$3,true,$4) RETURNING id_alumno`,
      [idU, idsInstructor[i % idsInstructor.length], licVuelo, (i * 13) % 180]
    );
    const idA = r.rows[0].id_alumno;
    idsAlumno.push(idA);
    const saldo = saldoDe(i);
    await c.query(
      `INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd) VALUES ($1,$2)`, [idA, saldo]
    );
    await c.query(
      `INSERT INTO movimiento_cuenta (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, fecha)
       VALUES ($1,'AJUSTE_HABER','Saldo inicial',$2,$2,$3)`,
      [idA, saldo, soloFecha(sumarDias(lunes, -30))]
    );
  }

  // El alumno de tierra: sin instructor y con un programa que no vuela.
  if (licTierra) {
    const [u, n, a] = ALUMNA_TIERRA;
    const idU = await crearUsuario(c, { u, n, a, rol: "ALUMNO" }, sufijo);
    const r = await c.query(
      `INSERT INTO alumno (id_usuario, id_licencia, activo) VALUES ($1,$2,true) RETURNING id_alumno`,
      [idU, licTierra]
    );
    await c.query(`INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd) VALUES ($1, 640)`,
      [r.rows[0].id_alumno]);
  }

  // ── Semanas ────────────────────────────────────────────────────────────
  log("semanas y vuelos");
  const semanas = {};
  for (const off of [-4, -3, -2, -1, 0, 1]) {
    const ini = sumarDias(lunes, off * 7);
    const r = await c.query(
      `INSERT INTO semana_vuelo (fecha_inicio, fecha_fin, publicada, fecha_publicacion)
       VALUES ($1,$2,$3,$4) RETURNING id_semana`,
      [soloFecha(ini), soloFecha(sumarDias(ini, 6)), off <= 0, off <= 0 ? soloFecha(sumarDias(ini, -2)) : null]
    );
    semanas[off] = r.rows[0].id_semana;
  }

  // ── Un mes de vuelos CERRADOS, con vouchera y cargo ────────────────────
  let tac = 1200, cerrados = 0;
  for (const off of [-4, -3, -2, -1]) {
    for (let k = 0; k < 12; k++) {
      const idA = idsAlumno[(k * 3 + Math.abs(off)) % idsAlumno.length];
      const idI = idsInstructor[k % idsInstructor.length];
      const av = aeronaves[k % aeronaves.length];
      const dia = (k % 5) + 1;
      const bl = bloques[k % bloques.length];
      const v = await c.query(
        `INSERT INTO vuelo (id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque,
                            estado, creado_por, fecha_vuelo, categoria)
         VALUES ($1,$2,$3,$4,$5,$6,'COMPLETADO','PROGRAMACION',$7,'NORMAL') RETURNING id_vuelo`,
        [semanas[off], idA, idI, av.id_aeronave, dia, bl, soloFecha(sumarDias(lunes, off * 7 + dia - 1))]
      );
      const idV = v.rows[0].id_vuelo;
      const horas = 1 + ((k % 3) * 0.3);
      tac += horas;
      await c.query(
        `INSERT INTO reporte_vuelo (id_vuelo, tacometro_salida, tacometro_llegada, horas_cobradas,
                                    tipo_vuelo, estado, observaciones)
         VALUES ($1,$2,$3,$4,'LOCAL','COMPLETADO','Vuelo de instrucción sin novedad.')`,
        [idV, tac - horas, tac, horas]
      );
      const monto = -Math.round(horas * 150 * 100) / 100;
      await c.query(
        `INSERT INTO movimiento_cuenta (id_alumno, tipo, descripcion, monto_usd, saldo_resultante_usd, fecha, id_vuelo)
         VALUES ($1,'CARGO_VUELO',$2,$3,0,$4,$5)`,
        [idA, `Vuelo ${av.codigo} · ${horas.toFixed(1)} h`, monto,
         soloFecha(sumarDias(lunes, off * 7 + dia - 1)), idV]
      );
      cerrados++;
    }
  }

  // ── HOY: el ciclo del día en distintas etapas ──────────────────────────
  const etapas = ["PUBLICADO", "SALIDA_HANGAR", "EN_PROGRESO", "REGRESO_HANGAR"];
  let enCurso = 0;
  for (let k = 0; k < etapas.length && k < aeronaves.length; k++) {
    await c.query(
      `INSERT INTO vuelo (id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque,
                          estado, creado_por, fecha_vuelo, categoria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PROGRAMACION',$8,'NORMAL')`,
      [semanas[0], idsAlumno[k], idsInstructor[k % idsInstructor.length], aeronaves[k].id_aeronave,
       diaHoy, bloques[k % bloques.length], etapas[k], soloFecha(hoy)]
    );
    enCurso++;
  }

  // ── Semana próxima: solicitudes PENDIENTES de aprobar ──────────────────
  let pendientes = 0;
  for (let k = 0; k < 8; k++) {
    const idA = idsAlumno[k];
    const s = await c.query(
      `INSERT INTO solicitud_semana (id_semana, id_alumno, estado, comentario_alumno)
       VALUES ($1,$2,'EN_REVISION',$3) RETURNING id_solicitud`,
      [semanas[1], idA, "Necesito completar horas antes del chequeo."]
    );
    await c.query(
      `INSERT INTO solicitud_vuelo (id_solicitud, id_aeronave, dia_semana, id_semana, id_bloque,
                                    id_instructor, estado, tipo_vuelo, categoria)
       VALUES ($1,$2,$3,$4,$5,$6,'PENDIENTE','LOCAL','NORMAL')`,
      [s.rows[0].id_solicitud, aeronaves[k % aeronaves.length].id_aeronave, (k % 5) + 1,
       semanas[1], bloques[k % bloques.length], idsInstructor[k % idsInstructor.length]]
    );
    pendientes++;
  }

  return {
    instructores: idsInstructor.length,
    alumnos: idsAlumno.length + (licTierra ? 1 : 0),
    vuelos_cerrados: cerrados,
    vuelos_en_curso: enCurso,
    solicitudes_pendientes: pendientes,
    semana_del: soloFecha(lunes),
  };
}

module.exports = { sembrar, PASS, lunesDe };
