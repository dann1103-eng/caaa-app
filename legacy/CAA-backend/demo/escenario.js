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
 *   · el Taller: bodega con kardex, los tres libros de cada avión con sus
 *     inspecciones, un avión adentro del hangar y sus órdenes de trabajo
 *     (ver escenarioTaller.js)
 *
 * NO toca el catálogo (flota, cursos, licencias, bloques, config fiscal): eso es
 * el punto de partida y lo arma el runbook una sola vez.
 */
const bcrypt = require("bcrypt");
const { sembrarTaller } = require("./escenarioTaller");
const { insertarMuchos } = require("./lotes");

// ── Fechas relativas ──────────────────────────────────────────────────────
const DIA = 86400000;
const r2 = (n) => Math.round(n * 100) / 100;
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
// Todos los usuarios del demo comparten contraseña, así que el hash se calcula
// UNA vez y se reusa. bcrypt con coste 10 tarda ~70 ms; hacerlo 27 veces eran
// casi dos segundos de puro CPU en un botón que se aprieta delante de un cliente.
let hashCache = null;
const hashDemo = async () => (hashCache ||= await bcrypt.hash(PASS, 10));

async function crearUsuario(c, { u, n, a, rol }, prefijo = "") {
  const hash = await hashDemo();
  u = prefijo + u;
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
 * ⚠️ TODOS los usuarios del demo llevan el prefijo `demo.`, y no es cosmético.
 *
 * El ruteo de esquema se resuelve por NOMBRE DE USUARIO (public.demo_cuenta es
 * la única pieza compartida entre los dos esquemas). Si el demo sembrara un
 * nombre que ya existe en CAAA -- `r.flores`, por ejemplo, que es una persona
 * real -- ese usuario quedaría ruteado al esquema demo y perdería el acceso a
 * sus propios datos. El prefijo hace la colisión imposible, y de paso deja a la
 * vista quién es de demostración.
 *
 * @param {object} opciones
 * @param {string} [opciones.prefijo="demo."]
 */
async function sembrar(c, log = () => {}, { prefijo = "demo." } = {}) {
  const hoy = new Date();
  const lunes = lunesDe(hoy);
  const diaHoy = ((hoy.getDay() + 6) % 7) + 1; // 1=lunes … 7=domingo

  // ── La flota vuelve a estar entera ─────────────────────────────────────
  // 🚨 VA ANTES de leer la flota, y no es un detalle: el escenario manda un avión
  // al hangar (activa=false), y el catálogo SOBREVIVE al reinicio. Sin esto, cada
  // reinicio arrancaba con un avión menos que el anterior — la flota se iba
  // encogiendo sola y el "punto de partida" no era siempre el mismo punto.
  // Lo destapó correr el reinicio dos veces seguidas y comparar los números.
  await c.query(
    `UPDATE aeronave SET activa = true, estado = 'ACTIVO' WHERE NOT COALESCE(es_externa, false)`
  );

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
  await crearUsuario(c, { u: "admin",   n: "Ana",   a: "Directora", rol: "ADMIN" }, prefijo);
  await crearUsuario(c, { u: "turno",   n: "Óscar", a: "Turno",     rol: "TURNO" }, prefijo);
  await crearUsuario(c, { u: "conta",   n: "Rosa",  a: "Contreras", rol: "ADMINISTRACION" }, prefijo);
  await crearUsuario(c, { u: "taller",  n: "José",  a: "Mecánico",  rol: "TALLER" }, prefijo);

  const idsInstructor = [];
  for (const i of INSTRUCTORES) {
    const idU = await crearUsuario(c, { ...i, rol: "INSTRUCTOR" }, prefijo);
    const r = await c.query(
      `INSERT INTO instructor (id_usuario, activo, es_instructor_vuelo, es_instructor_teoria, puede_programar)
       VALUES ($1, true, true, true, $2) RETURNING id_instructor`,
      [idU, i.u === "r.flores"]
    );
    idsInstructor.push(r.rows[0].id_instructor);
  }

  // ── Alumnos ────────────────────────────────────────────────────────────
  // Por lotes, y los ids se releen por USERNAME. No se usa el RETURNING del
  // INSERT multifila: su orden no está garantizado y emparejar mal a un alumno
  // con su saldo sería un error que nadie ve hasta que el cliente pregunta.
  log("alumnos");
  const hash = await hashDemo();
  const todos = ALUMNOS.map(([u, n, a]) => [u, n, a]);
  if (licTierra) todos.push(ALUMNA_TIERRA);   // la de sobrecargo: no vuela

  await insertarMuchos(c, "usuario",
    ["username", "password_hash", "nombre", "apellido", "correo", "rol",
     "activo", "datos_confirmados", "must_change_password", "must_set_email"],
    todos.map(([u, n, a]) => [prefijo + u, hash, n, a, `${prefijo}${u}@demo.local`,
                              "ALUMNO", true, true, false, false])
  );
  const idsUsuario = new Map(
    (await c.query(`SELECT id_usuario, username FROM usuario WHERE username = ANY($1::text[])`,
      [todos.map(([u]) => prefijo + u)])).rows.map((r) => [r.username, r.id_usuario])
  );

  await insertarMuchos(c, "alumno",
    ["id_usuario", "id_instructor", "id_licencia", "activo", "horas_acumuladas"],
    ALUMNOS.map(([u], i) => [idsUsuario.get(prefijo + u), idsInstructor[i % idsInstructor.length],
                             licVuelo, true, (i * 13) % 180])
  );
  if (licTierra) {
    // Sin instructor: su programa es de tierra. Es la fila que demuestra que el
    // sistema sabe de alumnos que no vuelan.
    await c.query(`INSERT INTO alumno (id_usuario, id_licencia, activo) VALUES ($1,$2,true)`,
      [idsUsuario.get(prefijo + ALUMNA_TIERRA[0]), licTierra]);
  }

  const fichas = (await c.query(
    `SELECT a.id_alumno, u.username FROM alumno a JOIN usuario u USING (id_usuario)
      WHERE u.username = ANY($1::text[])`, [todos.map(([u]) => prefijo + u)]
  )).rows;
  const idPorUsuario = new Map(fichas.map((r) => [r.username, r.id_alumno]));
  const idsAlumno = ALUMNOS.map(([u]) => idPorUsuario.get(prefijo + u));

  const saldos = ALUMNOS.map((_, i) => saldoDe(i));
  await insertarMuchos(c, "cuenta_corriente_alumno", ["id_alumno", "saldo_actual_usd"],
    idsAlumno.map((id, i) => [id, saldos[i]])
      .concat(licTierra ? [[idPorUsuario.get(prefijo + ALUMNA_TIERRA[0]), 640]] : [])
  );
  await insertarMuchos(c, "movimiento_cuenta",
    ["id_alumno", "tipo", "descripcion", "monto_usd", "saldo_resultante_usd", "fecha"],
    idsAlumno.map((id, i) => [id, "AJUSTE_HABER", "Saldo inicial", saldos[i], saldos[i],
                              soloFecha(sumarDias(lunes, -30))])
  );

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
  // Se arma todo en memoria y se insertan tres lotes: vuelos, voucheras y
  // cargos. Los ids de vuelo se releen por (semana, día, bloque), que dentro de
  // una semana es único acá — y no por el orden del RETURNING, que no está
  // garantizado: emparejar una vouchera con el vuelo equivocado sería un error
  // invisible hasta que alguien mire el tacómetro.
  let tac = 1200;
  const plan = [];
  for (const off of [-4, -3, -2, -1]) {
    for (let k = 0; k < 12; k++) {
      const horas = 1 + ((k % 3) * 0.3);
      tac += horas;
      plan.push({
        off, dia: (k % 5) + 1, bloque: bloques[k % bloques.length],
        idA: idsAlumno[(k * 3 + Math.abs(off)) % idsAlumno.length],
        idI: idsInstructor[k % idsInstructor.length],
        av: aeronaves[k % aeronaves.length],
        horas, tacSalida: r2(tac - horas), tacLlegada: r2(tac),
        fecha: soloFecha(sumarDias(lunes, off * 7 + (k % 5))),
      });
    }
  }

  await insertarMuchos(c, "vuelo",
    ["id_semana", "id_alumno", "id_instructor", "id_aeronave", "dia_semana", "id_bloque",
     "estado", "creado_por", "fecha_vuelo", "categoria"],
    plan.map((v) => [semanas[v.off], v.idA, v.idI, v.av.id_aeronave, v.dia, v.bloque,
                     "COMPLETADO", "PROGRAMACION", v.fecha, "NORMAL"])
  );

  const idsVuelo = new Map(
    (await c.query(
      `SELECT id_vuelo, id_semana, dia_semana, id_bloque FROM vuelo WHERE estado = 'COMPLETADO'`
    )).rows.map((r) => [`${r.id_semana}|${r.dia_semana}|${r.id_bloque}`, r.id_vuelo])
  );
  const idDe = (v) => idsVuelo.get(`${semanas[v.off]}|${v.dia}|${v.bloque}`);
  if (plan.some((v) => !idDe(v))) throw new Error("No pude reencontrar un vuelo sembrado por su día y bloque.");

  await insertarMuchos(c, "reporte_vuelo",
    ["id_vuelo", "tacometro_salida", "tacometro_llegada", "horas_cobradas",
     "tipo_vuelo", "estado", "observaciones"],
    plan.map((v) => [idDe(v), v.tacSalida, v.tacLlegada, v.horas,
                     "LOCAL", "COMPLETADO", "Vuelo de instrucción sin novedad."])
  );
  await insertarMuchos(c, "movimiento_cuenta",
    ["id_alumno", "tipo", "descripcion", "monto_usd", "saldo_resultante_usd", "fecha", "id_vuelo"],
    plan.map((v) => [v.idA, "CARGO_VUELO", `Vuelo ${v.av.codigo} · ${v.horas.toFixed(1)} h`,
                     -Math.round(v.horas * 150 * 100) / 100, 0, v.fecha, idDe(v)])
  );
  const cerrados = plan.length;

  // ── HOY: el ciclo del día en distintas etapas ──────────────────────────
  const etapas = ["PUBLICADO", "SALIDA_HANGAR", "EN_PROGRESO", "REGRESO_HANGAR"];
  let enCurso;
  const deHoy = etapas.slice(0, Math.min(etapas.length, aeronaves.length)).map((estado, k) =>
    [semanas[0], idsAlumno[k], idsInstructor[k % idsInstructor.length], aeronaves[k].id_aeronave,
     diaHoy, bloques[k % bloques.length], estado, "PROGRAMACION", soloFecha(hoy), "NORMAL"]);
  await insertarMuchos(c, "vuelo",
    ["id_semana", "id_alumno", "id_instructor", "id_aeronave", "dia_semana", "id_bloque",
     "estado", "creado_por", "fecha_vuelo", "categoria"], deHoy);
  enCurso = deHoy.length;

  // ── Semana próxima: solicitudes PENDIENTES de aprobar ──────────────────
  const pedidos = Array.from({ length: 8 }, (_, k) => ({
    idA: idsAlumno[k],
    aeronave: aeronaves[k % aeronaves.length].id_aeronave,
    dia: (k % 5) + 1,
    bloque: bloques[k % bloques.length],
    idI: idsInstructor[k % idsInstructor.length],
  }));
  await insertarMuchos(c, "solicitud_semana",
    ["id_semana", "id_alumno", "estado", "comentario_alumno"],
    pedidos.map((p) => [semanas[1], p.idA, "EN_REVISION",
                        "Necesito completar horas antes del chequeo."])
  );
  // Se releen por alumno: dentro de una semana hay una solicitud por alumno.
  const idsSolicitud = new Map(
    (await c.query(`SELECT id_solicitud, id_alumno FROM solicitud_semana WHERE id_semana = $1`,
      [semanas[1]])).rows.map((r) => [r.id_alumno, r.id_solicitud])
  );
  await insertarMuchos(c, "solicitud_vuelo",
    ["id_solicitud", "id_aeronave", "dia_semana", "id_semana", "id_bloque",
     "id_instructor", "estado", "tipo_vuelo", "categoria"],
    pedidos.map((p) => [idsSolicitud.get(p.idA), p.aeronave, p.dia, semanas[1], p.bloque,
                        p.idI, "PENDIENTE", "LOCAL", "NORMAL"])
  );
  const pendientes = pedidos.length;

  // ── Taller ─────────────────────────────────────────────────────────────
  // Al final: necesita la flota y el personal ya sembrados. Va en su propio
  // archivo porque es la otra mitad del sistema y no cabe legible acá.
  const taller = await sembrarTaller(c, log, { aeronaves, prefijo, pass: PASS });

  return {
    instructores: idsInstructor.length,
    alumnos: idsAlumno.length + (licTierra ? 1 : 0),
    vuelos_cerrados: cerrados,
    vuelos_en_curso: enCurso,
    solicitudes_pendientes: pendientes,
    semana_del: soloFecha(lunes),
    taller,
  };
}

module.exports = { sembrar, PASS, lunesDe };
