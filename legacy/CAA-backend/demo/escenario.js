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

/**
 * Siembra solicitudes de vuelo agrupadas como las agrupa el sistema real: UNA
 * `solicitud_semana` por alumno y semana, con tantas `solicitud_vuelo` colgando
 * como vuelos haya pedido. Un alumno que pide dos horas en la semana tiene una
 * sola solicitud con dos renglones, no dos solicitudes.
 *
 * `estado` es el de la solicitud_semana: PUBLICADO para las semanas que ya
 * salieron, EN_REVISION para la que Programación tiene sobre la mesa.
 *
 * Los ids se releen por (semana, alumno), que es la clave natural del grupo.
 * Ver el comentario de lotes.js sobre por qué no se usa el RETURNING.
 */
async function sembrarSolicitudes(c, pedidos, estado) {
  if (!pedidos.length) return;

  const grupos = [...new Set(pedidos.map((p) => `${p.semana}|${p.idA}`))]
    .map((k) => k.split("|").map(Number));

  await insertarMuchos(c, "solicitud_semana",
    ["id_semana", "id_alumno", "estado", "comentario_alumno"],
    grupos.map(([semana, idA]) => [semana, idA, estado,
      // El comentario del alumno es obligatorio al agendar (§18), así que la
      // solicitud lleva el del primer vuelo que pidió.
      pedidos.find((p) => p.semana === semana && p.idA === idA)?.comentario
        || "Necesito completar horas antes del chequeo."])
  );

  const idsSolicitud = new Map(
    (await c.query(
      `SELECT id_solicitud, id_semana, id_alumno FROM solicitud_semana
        WHERE id_semana = ANY($1::int[])`, [[...new Set(grupos.map((g) => g[0]))]]
    )).rows.map((r) => [`${r.id_semana}|${r.id_alumno}`, r.id_solicitud])
  );

  await insertarMuchos(c, "solicitud_vuelo",
    // Ojo: solicitud_vuelo NO lleva id_alumno — el alumno vive en la
    // solicitud_semana que la agrupa.
    ["id_solicitud", "id_semana", "id_aeronave", "dia_semana", "id_bloque",
     "id_instructor", "estado", "tipo_vuelo", "categoria"],
    pedidos.map((p) => [
      idsSolicitud.get(`${p.semana}|${p.idA}`), p.semana, p.aeronave, p.dia, p.bloque,
      p.idI,
      // NULL en las publicadas, PENDIENTE en las que esperan decisión: es como
      // quedan en producción (571 filas con NULL en semanas ya publicadas).
      estado === "PUBLICADO" ? null : "PENDIENTE",
      p.tipo || "LOCAL", "NORMAL",
    ])
  );
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
  const agendar = (off, k, dia) => {
    const horas = 1 + ((k % 3) * 0.3);
    tac += horas;
    plan.push({
      off, dia, bloque: bloques[k % bloques.length],
      idA: idsAlumno[(k * 3 + Math.abs(off)) % idsAlumno.length],
      idI: idsInstructor[k % idsInstructor.length],
      av: aeronaves[k % aeronaves.length],
      horas, tacSalida: r2(tac - horas), tacLlegada: r2(tac),
      fecha: soloFecha(sumarDias(lunes, off * 7 + dia - 1)),
    });
  };
  for (const off of [-4, -3, -2, -1]) {
    for (let k = 0; k < 12; k++) agendar(off, k, (k % 5) + 1);
  }

  // La SEMANA EN CURSO también se llena, de lunes a sábado. Sin esto quedaba
  // con los cuatro vuelos de hoy y nada más: si el demo se reinicia un lunes
  // —como pasó— la pantalla de Programación sale casi vacía y no se puede
  // mostrar cómo se ve una semana andando.
  //
  // Lo ya pasado se cierra con su vouchera; lo que viene queda PUBLICADO. El
  // corte es el día de HOY, así que la semana se ve coherente cualquier día en
  // que se reinicie.
  const enCursoDesde = plan.length;
  for (let dia = 1; dia <= 6; dia++) {
    if (dia === diaHoy) continue;              // hoy lo cubren las cuatro etapas
    for (let j = 0; j < 3; j++) {
      // El índice se corre por día para que (día, bloque, avión) no se repita
      // dentro de la semana: esa es la clave con la que después se enlaza cada
      // vuelo con su solicitud de respaldo.
      agendar(0, dia * 3 + j, dia);
    }
  }
  // Los de la semana en curso posteriores a hoy todavía no se volaron.
  const porVolar = new Set(
    plan.map((v, i) => (i >= enCursoDesde && v.dia > diaHoy ? i : -1)).filter((i) => i >= 0)
  );
  const yaVolado = (i) => !porVolar.has(i);

  await insertarMuchos(c, "vuelo",
    ["id_semana", "id_alumno", "id_instructor", "id_aeronave", "dia_semana", "id_bloque",
     "estado", "creado_por", "fecha_vuelo", "categoria"],
    plan.map((v, i) => [semanas[v.off], v.idA, v.idI, v.av.id_aeronave, v.dia, v.bloque,
                        yaVolado(i) ? "COMPLETADO" : "PUBLICADO",
                        "PROGRAMACION", v.fecha, "NORMAL"])
  );

  const idsVuelo = new Map(
    (await c.query(
      // Sin filtrar por estado: la semana en curso trae vuelos ya volados y
      // otros que todavía no.
      `SELECT id_vuelo, id_semana, dia_semana, id_bloque FROM vuelo`
    )).rows.map((r) => [`${r.id_semana}|${r.dia_semana}|${r.id_bloque}`, r.id_vuelo])
  );
  const idDe = (v) => idsVuelo.get(`${semanas[v.off]}|${v.dia}|${v.bloque}`);
  if (plan.some((v) => !idDe(v))) throw new Error("No pude reencontrar un vuelo sembrado por su día y bloque.");

  await insertarMuchos(c, "reporte_vuelo",
    ["id_vuelo", "tacometro_salida", "tacometro_llegada", "horas_cobradas",
     "tipo_vuelo", "estado", "observaciones"],
    // Solo los ya volados llevan vouchera: un vuelo del jueves todavía no tiene
    // tacómetro de llegada, y ponerle uno sería inventar un dato de bitácora.
    plan.filter((_, i) => yaVolado(i)).map((v) => [idDe(v), v.tacSalida, v.tacLlegada, v.horas,
                     "LOCAL", "COMPLETADO", "Vuelo de instrucción sin novedad."])
  );
  await insertarMuchos(c, "movimiento_cuenta",
    ["id_alumno", "tipo", "descripcion", "monto_usd", "saldo_resultante_usd", "fecha", "id_vuelo"],
    // Y solo los ya volados se cobran: el cargo nace al firmar la vouchera.
    plan.filter((_, i) => yaVolado(i)).map((v) => [v.idA, "CARGO_VUELO",
                     `Vuelo ${v.av.codigo} · ${v.horas.toFixed(1)} h`,
                     -Math.round(v.horas * 150 * 100) / 100, 0, v.fecha, idDe(v)])
  );
  const cerrados = plan.filter((_, i) => yaVolado(i)).length;
  const programados = plan.length - cerrados;

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

  // ── Las solicitudes que RESPALDAN los vuelos ya publicados ─────────────
  // 🚨 Sin esto la pantalla de Programación sale VACÍA aunque los vuelos existan.
  // Ese calendario se arma `FROM solicitud_vuelo LEFT JOIN vuelo`, no al revés:
  // un vuelo metido directo en la tabla `vuelo` se ve en Turno, en Proyección y
  // en el tablero del alumno, pero Programación no lo encuentra. Es el mismo
  // respaldo que crea el sistema real cuando el staff agenda a mano (§19.D).
  const respaldados = [
    ...plan.map((v) => ({ semana: semanas[v.off], idA: v.idA, idI: v.idI,
                          dia: v.dia, bloque: v.bloque, aeronave: v.av.id_aeronave })),
    ...deHoy.map((f) => ({ semana: f[0], idA: f[1], idI: f[2], aeronave: f[3],
                           dia: f[4], bloque: f[5] })),
  ];
  await sembrarSolicitudes(c, respaldados, "PUBLICADO");
  // Un solo UPDATE los enlaza por (semana, día, bloque, avión), que dentro de
  // una semana es único por construcción. Se limita a las semanas publicadas:
  // en la que está por publicarse hay choques a propósito, y ahí esa clave NO
  // es única — enlazar por ella emparejaría cualquier cosa.
  await c.query(
    `UPDATE vuelo v SET id_detalle = sv.id_detalle
       FROM solicitud_vuelo sv
      WHERE sv.id_semana = v.id_semana AND sv.dia_semana = v.dia_semana
        AND sv.id_bloque = v.id_bloque AND sv.id_aeronave = v.id_aeronave
        AND v.id_detalle IS NULL
        AND v.id_semana = ANY($1::int[])`,
    [[-4, -3, -2, -1, 0].map((o) => semanas[o])]
  );

  // ── Semana próxima: lo que Programación tiene que resolver ─────────────
  // Se siembra CARGADA y CON CHOQUES a propósito. Un calendario con ocho
  // solicitudes sueltas no muestra el trabajo real de programación, que es
  // justamente decidir quién se queda con la avioneta cuando dos la piden.
  //
  // El calendario marca en rojo dos clases de choque (AdminCalendar.conflictMap):
  //   · de AVIÓN     — mismo día + bloque + aeronave, alumnos distintos
  //   · de INSTRUCTOR — mismo día + bloque + instructor, alumnos distintos
  // y `publicarSemana` se NIEGA a publicar mientras queden sin resolver. Ese es
  // el recorrido para mostrar: intentar publicar → ver el rechazo → mover o
  // rechazar una de las dos → publicar.
  const prox = semanas[1];
  const av = (n) => aeronaves[n % aeronaves.length].id_aeronave;
  const al = (n) => idsAlumno[n % idsAlumno.length];
  // El instructor de cada alumno es el suyo, como en la vida real.
  const insDe = (n) => idsInstructor[(n % idsAlumno.length) % idsInstructor.length];

  const pedidos = [];
  const pedir = (n, dia, bloque, aeronave, extra = {}) => pedidos.push({
    idA: al(n), idI: extra.idI ?? insDe(n), dia, bloque: bloques[bloque % bloques.length],
    aeronave, tipo: extra.tipo || "LOCAL", comentario: extra.comentario,
  });

  // Semana normal: 16 pedidos repartidos de lunes a sábado.
  const AGENDA = [
    [0, 1, 0, 0], [1, 1, 2, 1], [2, 1, 4, 2],
    [3, 2, 0, 3], [4, 2, 3, 4], [5, 2, 5, 0],
    [6, 3, 1, 1], [7, 3, 4, 2], [8, 4, 0, 3],
    [9, 4, 2, 4], [10, 4, 5, 0], [11, 5, 1, 1],
    [12, 5, 3, 2], [13, 6, 0, 3], [14, 6, 2, 4], [15, 6, 4, 0],
  ];
  for (const [n, dia, bloque, aero] of AGENDA) pedir(n, dia, bloque, av(aero));

  // Dos vuelos de ruta, para que no todo sea local.
  pedir(16, 3, 0, av(2), { tipo: "RUTA", comentario: "Ruta a Comalapa, ida y vuelta." });
  pedir(17, 5, 4, av(3), { tipo: "RUTA", comentario: "Navegación a San Miguel." });

  // ── Los choques ────────────────────────────────────────────────────────
  // (a) Dos alumnos piden la MISMA avioneta el martes a la misma hora.
  pedir(18, 2, 1, av(1), { comentario: "Es el único día que puedo esta semana." });
  pedir(19, 2, 1, av(1), { comentario: "Necesito cerrar horas antes del chequeo." });

  // (b) Otro choque de avión, el jueves.
  pedir(4, 4, 3, av(2), { comentario: "Me quedó pendiente el vuelo de la semana pasada." });
  pedir(9, 4, 3, av(2), { comentario: "Puedo cualquier otro día si no se puede." });

  // (c) TRES alumnos por la misma avioneta el viernes: sirve para mostrar la
  //     lista de espera, donde Turno ordena a quién se le ofrece si se libera.
  pedir(2, 5, 0, av(0), { comentario: "Vuelo de chequeo, ya tengo las horas." });
  pedir(7, 5, 0, av(0), { comentario: "Me sirve cualquier hora de la mañana." });
  pedir(12, 5, 0, av(0), { comentario: "Última semana antes del examen." });

  // (d) Choque de INSTRUCTOR: dos alumnos del mismo instructor, a la misma hora,
  //     en aviones DISTINTOS. El avión está libre; el que no puede estar en dos
  //     lados es él. El calendario lo marca aparte del choque de avión.
  pedir(0, 3, 2, av(3), { idI: idsInstructor[0], comentario: "Prefiero temprano." });
  pedir(3, 3, 2, av(4), { idI: idsInstructor[0], comentario: "Coordinado con el instructor." });

  await sembrarSolicitudes(c, pedidos.map((p) => ({ ...p, semana: prox })), "EN_REVISION");
  const pendientes = pedidos.length;

  // ── Taller ─────────────────────────────────────────────────────────────
  // Al final: necesita la flota y el personal ya sembrados. Va en su propio
  // archivo porque es la otra mitad del sistema y no cabe legible acá.
  const taller = await sembrarTaller(c, log, { aeronaves, prefijo, pass: PASS });

  return {
    instructores: idsInstructor.length,
    alumnos: idsAlumno.length + (licTierra ? 1 : 0),
    vuelos_cerrados: cerrados,
    vuelos_programados: programados,
    vuelos_en_curso: enCurso,
    solicitudes_pendientes: pendientes,
    semana_del: soloFecha(lunes),
    taller,
  };
}

module.exports = { sembrar, PASS, lunesDe };
