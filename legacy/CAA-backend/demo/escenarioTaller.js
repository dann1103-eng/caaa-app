/**
 * El Taller del demo: bodega, aeronavegabilidad y órdenes de trabajo.
 *
 * Va aparte de escenario.js porque es otra mitad del sistema y mezclarlas dejaba
 * un archivo que no se puede leer de una sentada. Se llama al final del sembrado,
 * cuando ya existen la flota y el personal.
 *
 * Qué NO se copia de CAAA, a propósito: sus 642 repuestos reales traen costos y
 * proveedores, y sus componentes traen números de serie y tiempos totales que van
 * impresos en libros oficiales. Nada de eso se le enseña a otra escuela. Acá se
 * inventa una bodega chica y una flota con historia propia, suficiente para que
 * las pantallas tengan vida.
 *
 * Todo con fechas RELATIVAS al día de la corrida: el demo se reinicia cuando sea
 * y siempre queda "al día", nunca con un vencimiento de hace ocho meses.
 */
const bcrypt = require("bcrypt");
const { MARCAS } = require("../utils/marca");
const { insertarMuchos } = require("./lotes");

// El papeleo del taller lleva impreso el nombre del cliente. Sale de la marca
// del demo y no escrito a mano: si fuera el de CAAA, cada requisición que se
// imprima delante de un prospecto diría de quién es realmente el sistema.
const CLIENTE = `${MARCAS.demo.nombre} / OMA`;
// Misma sigla que usa el sistema al crear una orden en vivo: si el escenario
// sembrara otra, el prospecto vería dos formatos de correlativo conviviendo.
const SIGLA = MARCAS.demo.sigla || MARCAS.demo.nombre;

const DIA = 86400000;
const sumarDias = (d, n) => new Date(d.getTime() + n * DIA);
const soloFecha = (d) => d.toISOString().slice(0, 10);
const r2 = (n) => Math.round(n * 100) / 100;

/** Bodega inventada. Códigos y descripciones genéricos de mantenimiento. */
const REPUESTOS = [
  ["000101", "ACEITE AEROSHELL W100 PLUS", "QT", "LUBRICANTES", "A-1", 6.85, 24],
  ["000102", "FILTRO DE ACEITE CH48110-1", "UN", "FILTROS", "A-2", 28.40, 4],
  ["000103", "BUJIA REM40E", "UN", "IGNICION", "A-3", 31.20, 8],
  ["000104", "FILTRO DE AIRE BA-24", "UN", "FILTROS", "A-2", 42.00, 2],
  ["000105", "LLANTA 6.00-6 6PLY", "UN", "TREN", "B-1", 118.50, 2],
  ["000106", "NEUMATICO INTERIOR 6.00-6", "UN", "TREN", "B-1", 34.75, 2],
  ["000107", "PASTILLA DE FRENO 066-10500", "UN", "FRENOS", "B-2", 19.90, 8],
  ["000108", "LIQUIDO DE FRENO MIL-H-5606", "QT", "LUBRICANTES", "A-1", 22.00, 2],
  ["000109", "BATERIA G-35", "UN", "ELECTRICO", "C-1", 265.00, 1],
  ["000110", "FOCO DE NAVEGACION A-7079B-12", "UN", "ELECTRICO", "C-2", 24.30, 4],
  ["000111", "ARANDELA AN960-416", "UN", "FERRETERIA", "D-1", 0.35, 50],
  ["000112", "TORNILLO AN3-5A", "UN", "FERRETERIA", "D-1", 0.90, 40],
  ["000113", "MANGUERA DE COMBUSTIBLE 303-6", "FT", "COMBUSTIBLE", "C-3", 14.60, 6],
  ["000114", "EMPAQUE DE CARBURADOR", "UN", "MOTOR", "A-4", 9.75, 4],
];

/** Componentes por avión: los tres libros que exige la certificación. */
const PARTES = [
  { tipo: "CELULA",  nombre: "Célula",  marca: "PIPER",     tc: "A1EA" },
  { tipo: "MOTOR",   nombre: "Motor",   marca: "LYCOMING",  tc: "E-274" },
  { tipo: "HELICE",  nombre: "Hélice",  marca: "SENSENICH", tc: "P-920" },
];

/**
 * @param c            conexión ya dentro de la transacción del reinicio
 * @param ctx.aeronaves  flota propia (la que devolvió el escenario de vuelo)
 * @param ctx.idsAlumno  no se usa; se recibe por simetría
 */
async function sembrarTaller(c, log, ctx) {
  const { aeronaves, prefijo, pass } = ctx;
  const hoy = new Date();

  // ── Personal del taller ─────────────────────────────────────────────────
  // El jefe ya lo creó el escenario de vuelo (demo.taller). Se le carga la
  // licencia TMA — sin ella NADIE puede firmar una orden, es un 403 a propósito
  // — y se agrega un técnico, que es quien vive en la pantalla "Mi taller".
  const hash = await bcrypt.hash(pass, 10);
  await c.query(
    `UPDATE usuario SET licencia_tma = 'TMA 001' WHERE username = $1`, [`${prefijo}taller`]
  );
  const tec = await c.query(
    `INSERT INTO usuario (username, password_hash, nombre, apellido, correo, rol,
                          activo, datos_confirmados, must_change_password, must_set_email, licencia_tma)
     VALUES ($1,$2,'Luis','Mecánico',$3,'TECNICO',true,true,false,false,'TMA 002')
     RETURNING id_usuario`,
    [`${prefijo}tecnico`, hash, `${prefijo}tecnico@demo.local`]
  );
  const idTecnico = tec.rows[0].id_usuario;
  const idJefe = (await c.query(`SELECT id_usuario FROM usuario WHERE username = $1`,
    [`${prefijo}taller`])).rows[0].id_usuario;
  // Un aprendiz, para que el selector de "quién asistió" al firmar no salga vacío.
  await c.query(
    `INSERT INTO usuario (username, password_hash, nombre, apellido, correo, rol,
                          activo, datos_confirmados, must_change_password, must_set_email, certificado_aprendiz)
     VALUES ($1,$2,'Marta','Aprendiz',$3,'TECNICO',true,true,false,false,'CERT 1180')`,
    [`${prefijo}aprendiz`, hash, `${prefijo}aprendiz@demo.local`]
  );

  // ── Bodega ──────────────────────────────────────────────────────────────
  // El stock NO se escribe a mano: sale de los movimientos, igual que en el
  // sistema real. Se carga con una factura de entrada y después se consume.
  log("bodega");
  await insertarMuchos(c, "taller_repuesto",
    ["codigo", "descripcion", "unidad", "categoria", "ubicacion",
     "costo_unitario", "stock_minimo", "stock_actual", "activo"],
    REPUESTOS.map(([codigo, desc, unidad, cat, ubi, costo, min]) =>
      [codigo, desc, unidad, cat, ubi, costo, min, 0, true])
  );
  // Los ids se releen por CÓDIGO, que es la llave del inventario. Ver el
  // comentario de lotes.js sobre por qué no se usa el RETURNING.
  const idsRepuesto = Object.fromEntries(
    (await c.query(`SELECT id_repuesto, codigo FROM taller_repuesto`)).rows
      .map((r) => [r.codigo, r.id_repuesto])
  );

  const anio = hoy.getFullYear();
  const doc = async (tipo, numero, prefijoCorr, campos = {}) => {
    const r = await c.query(
      `INSERT INTO taller_documento_inventario
         (tipo, anio, numero, correlativo, fecha, estado, registrado_por,
          proveedor, factura_no, id_aeronave, cliente, solicitante, tacometro,
          orden_trabajo_no, motivo, id_orden_trabajo)
       VALUES ($1,$2,$3,$4,$5,'VIGENTE',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id_documento`,
      [tipo, anio, numero, `${prefijoCorr}-${String(numero).padStart(3, "0")}-${anio}`,
       campos.fecha || soloFecha(hoy), idJefe, campos.proveedor || null, campos.factura || null,
       campos.aeronave || null, campos.cliente || null, campos.solicitante || null,
       campos.tacometro || null, campos.ot || null, campos.motivo || null, campos.idOt || null]
    );
    return r.rows[0].id_documento;
  };
  // Los renglones se juntan y se insertan todos juntos al final: son 21 viajes
  // a la base que se vuelven uno.
  const renglones = [];
  const mover = (idDoc, codigo, cantidad, costo = null) => {
    renglones.push([idDoc, idsRepuesto[codigo], cantidad, costo]);
  };
  const volcarRenglones = () => insertarMuchos(c, "taller_movimiento_inventario",
    ["id_documento", "id_repuesto", "cantidad", "costo_unitario"], renglones.splice(0));

  // Compra que llena la bodega, hace tres semanas.
  const fa = await doc("ENTRADA", 1, "FA", {
    fecha: soloFecha(sumarDias(hoy, -21)), proveedor: "Aeropartes del Istmo, S.A.", factura: "12045",
  });
  for (const [codigo, , , , , costo, min] of REPUESTOS) {
    mover(fa, codigo, min * 3, costo);
  }

  // Consumos: dan movimiento al kardex y dejan a un par de ítems bajo mínimo,
  // que es lo que hace que la pantalla de Existencias tenga algo que mostrar.
  const sal1 = await doc("SALIDA", 1, "REQ", {
    fecha: soloFecha(sumarDias(hoy, -12)), aeronave: aeronaves[0].id_aeronave,
    cliente: CLIENTE, solicitante: "Luis Mecánico", tacometro: 3120.4,
  });
  mover(sal1, "000101", -8);
  mover(sal1, "000102", -1);
  mover(sal1, "000103", -8);

  const sal2 = await doc("SALIDA", 2, "REQ", {
    fecha: soloFecha(sumarDias(hoy, -4)), aeronave: aeronaves[1].id_aeronave,
    cliente: CLIENTE, solicitante: "Luis Mecánico", tacometro: 2044.8,
  });
  mover(sal2, "000107", -20);
  mover(sal2, "000111", -110);

  // ⚠️ VA ANTES del recálculo: el stock se calcula sumando estos renglones, así
  // que si siguieran en memoria la bodega quedaría entera en cero.
  await volcarRenglones();

  // El stock se recalcula desde los movimientos, nunca se teclea.
  //
  // Y con él las dos fechas de último movimiento. No son decorativas: la lista de
  // Existencias muestra esa columna, y sin llenarla los 14 ítems decían "sin
  // movimiento" al lado de un kardex lleno. Es la misma familia de descuido que
  // ya mordió dos veces en este módulo — una columna que la pantalla muestra y
  // ningún camino de escritura llena.
  await c.query(
    `UPDATE taller_repuesto r SET
        stock_actual         = COALESCE(x.total, 0),
        ultimo_movimiento_en = x.ultimo,
        ultima_entrada_en    = x.ultima_entrada
       FROM (SELECT m.id_repuesto,
                    SUM(m.cantidad)                                        AS total,
                    MAX(d.fecha)                                           AS ultimo,
                    MAX(d.fecha) FILTER (WHERE m.cantidad > 0)             AS ultima_entrada
               FROM taller_movimiento_inventario m
               JOIN taller_documento_inventario d ON d.id_documento = m.id_documento
              WHERE d.estado = 'VIGENTE'
              GROUP BY m.id_repuesto) x
      WHERE x.id_repuesto = r.id_repuesto`
  );

  // ── Aeronavegabilidad ───────────────────────────────────────────────────
  // Tres partes y sus inspecciones por avión. El anclaje del tiempo total es
  // inventado pero coherente: T.T. = tacómetro + un offset fijo por parte, que
  // es exactamente como funciona en los libros de verdad.
  log("aeronavegabilidad");
  // Se arma TODO en memoria y se insertan cuatro lotes al final. Con seis aviones
  // eran 60 viajes a la base; así son 4.
  const lecturas = [], componentes = [], programadas = [];

  for (let i = 0; i < aeronaves.length; i++) {
    const av = aeronaves[i];
    const tac = r2(1200 + i * 430.5);          // tacómetro de ese avión
    lecturas.push([av.id_aeronave, tac]);

    // Cada parte se ancla con DOS números, porque la fórmula del libro es
    //     T.T. = (lectura − horas_aeronave_instalacion) + horas_componente_instalacion
    // El primero dice con cuánto marcaba el avión cuando se instaló la parte; el
    // segundo, cuántas horas traía la parte encima en ese momento. Poner solo el
    // primero deja el segundo en cero y el libro de la célula sale con 180 horas
    // de tiempo total — imposible para un avión escuela.
    //
    // La historia que cuentan estos números: célula original (T.T. = tacómetro),
    // motor con ~2,600 h de las que ~620 son desde el último overhaul, y hélice
    // con ~1,250 h y ~310 desde su última reparación.
    const ANCLAJES = [
      // La célula lleva ahí desde el principio: se ancla en 0, y su T.T. es la
      // lectura entera. `null` = "todas las horas del avión", que no es lo mismo
      // que 0 horas desde que se instaló.
      { desdeTac: null, propias: 0, tso: null },
      { desdeTac: 620 + i * 55, propias: 1980 - i * 130, tso: 0 },   // motor
      { desdeTac: 310 + i * 38, propias: 940 - i * 70,   tso: 0 },   // hélice
    ];
    for (let p = 0; p < PARTES.length; p++) {
      const parte = PARTES[p], anc = ANCLAJES[p];
      componentes.push([
        av.id_aeronave, parte.tipo, parte.nombre,
        `PN-${1000 + i * 10 + p}`, `SN-${47200 + i * 31 + p}`, parte.marca, parte.tc,
        // ⚠️ El anclaje va en la escala CRUDA del sistema, igual que en producción:
        // T.T. y TSO son DIFERENCIAS, así que el offset del tacómetro se cancela
        // solo. Confundir las dos escalas son 10,000 horas en un documento legal.
        anc.desdeTac === null ? 0 : r2(tac - anc.desdeTac), anc.propias, anc.tso,
        soloFecha(sumarDias(hoy, -(400 + i * 30 + p * 60))), true,
        "Sembrado por el escenario de demostración",
      ]);
    }

    // ⚠️ UNA sola inspección activa por avión: hay un índice único parcial
    // (id_aeronave WHERE tipo='INSPECCION' AND activo) que lo impone, porque el
    // ciclo vigente es el que se cachea en aeronave.horas_proxima_revision. Así
    // está en producción — 1 inspección, 210 ADs, 52 de vida límite — y el demo
    // copia la FORMA aunque los números sean inventados.
    // La del primer avión queda a 4 horas de vencer, para que la franja de
    // atención del tablero tenga algo real que avisar.
    const cerca = i === 0;
    const ultima = r2(tac - (cerca ? 46 : 18 + i * 6));
    programadas.push([av.id_aeronave, "Inspección 50 horas", "INSPECCION", null, null, true,
                      50, null, ultima, r2(ultima + 50),
                      soloFecha(sumarDias(hoy, -(cerca ? 25 : 40 + i * 8))), null]);

    // Directivas de aeronavegabilidad: por calendario. La primera del primer
    // avión vence en pocos días.
    const ADS = [
      ["AD 2019-05-04 · Inspección de cinturones", "AD 2019-05-04", 365,
       "Inspección visual de anclajes y cinturones de seguridad."],
      ["AD 2011-10-09 · Tornillería del estabilizador", "AD 2011-10-09", 730,
       "Verificación de torque en la tornillería del estabilizador horizontal."],
      ["AD 2015-19-07 · Líneas de combustible", "AD 2015-19-07", 365,
       "Inspección de líneas flexibles de combustible por agrietamiento."],
    ];
    ADS.forEach(([nombre, ref, dias, descripcion], k) => {
      const vence = cerca && k === 0 ? 6 : 40 + k * 55 + i * 9;
      programadas.push([av.id_aeronave, nombre, "AD", ref, descripcion, true,
                        null, dias, null, null,
                        soloFecha(sumarDias(hoy, vence - dias)), soloFecha(sumarDias(hoy, vence))]);
    });

    // Partes con vida límite: NO son recurrentes — se cambian y se acabó. Es la
    // lista que el jefe de taller necesita ver venir con tiempo. La del segundo
    // avión vence dentro de la ventana de aviso, para que la alerta se vea.
    const VIDA = [
      ["Manguera de combustible motor-carburador", 8, 1825],
      ["Cinturón de seguridad piloto", 12, 3650],
    ];
    VIDA.forEach(([nombre, anios, dias], k) => {
      const instalada = sumarDias(hoy, -(dias - (i === 1 ? 18 + k * 9 : 300 + i * 120 + k * 40)));
      programadas.push([av.id_aeronave, nombre, "VIDA_LIMITE", null,
                        `Vida límite de ${anios} años.`, false,
                        null, dias, null, null,
                        soloFecha(instalada), soloFecha(sumarDias(instalada, dias))]);
    });
  }

  // Las lecturas del tacómetro, en una sola sentencia.
  await c.query(
    `UPDATE aeronave a SET horas_acumuladas = v.horas
       FROM (SELECT * FROM UNNEST($1::int[], $2::numeric[]) AS t(id, horas)) v
      WHERE a.id_aeronave = v.id`,
    [lecturas.map((l) => l[0]), lecturas.map((l) => l[1])]
  );
  await insertarMuchos(c, "taller_componente",
    ["id_aeronave", "tipo", "nombre", "parte_no", "serie_no", "marca", "tipo_certificado",
     "horas_aeronave_instalacion", "horas_componente_instalacion", "tso_ancla",
     "fecha_instalacion", "activo", "ancla_origen"], componentes);
  await insertarMuchos(c, "taller_tarea_programada",
    ["id_aeronave", "nombre", "tipo", "referencia", "descripcion", "recurrente",
     "intervalo_horas", "intervalo_dias", "ultima_horas", "proxima_horas",
     "ultima_fecha", "proxima_fecha", "activo", "aplica", "origen"],
    // `activo` y `aplica` van EXPLÍCITOS aunque el esquema los tenga por defecto:
    // `aplica` es lo que decide si la tarea entra en el seguimiento, y dejarla
    // librada a un DEFAULT es cómo una columna termina en NULL sin que nadie lo
    // note. `origen='DEMO'` deja marcado de dónde salió cada fila.
    programadas.map((t) => [...t, true, true, "DEMO"]));
  const tareas = programadas.length;

  // ── Un avión adentro del hangar y sus órdenes de trabajo ────────────────
  // Se elige el ÚLTIMO de la flota a propósito: los primeros cuatro tienen los
  // vuelos de hoy en curso, y un avión no puede estar volando y en el taller.
  log("órdenes de trabajo");
  const enTaller = aeronaves[aeronaves.length - 1];
  const mant = await c.query(
    `INSERT INTO mantenimiento_aeronave (id_aeronave, tipo, fecha_programada, fecha_inicio, fecha_fin,
                                         estado, completado, descripcion, horas_actuales)
     VALUES ($1,'100HR',$2,$3,$4,'EN_CURSO',false,$5,$6) RETURNING id_mantenimiento`,
    [enTaller.id_aeronave, soloFecha(sumarDias(hoy, -2)), soloFecha(sumarDias(hoy, -2)),
     soloFecha(sumarDias(hoy, 2)), "Inspección de 100 horas", 1200]
  );
  // El job que sincroniza la flota corre SIN contexto de esquema, así que solo
  // toca public: acá se deja el estado puesto a mano.
  await c.query(
    `UPDATE aeronave SET activa = false, estado = 'MANTENIMIENTO' WHERE id_aeronave = $1`,
    [enTaller.id_aeronave]
  );

  const orden = async (n, campos) => {
    const r = await c.query(
      // `creado_en` va explícito y no por DEFAULT: es lo que mide el cronómetro
      // del trabajo, y dejarlo en NOW() ponía a una orden que dice haber empezado
      // hace dos días marcando dos minutos. Con la zona FIJADA, no heredada de la
      // sesión — es el desfase de ±6 h que este proyecto ya pagó cinco veces.
      `INSERT INTO orden_trabajo (anio, numero, correlativo, id_aeronave, fecha, tacometro,
                                  piloto_operador, discrepancia, accion_correctiva, estado,
                                  id_mantenimiento, id_mecanico_asignado, asignado_en, creado_por,
                                  id_mecanico, fecha_firma, firmado_en, id_aprobador, fecha_aprobacion,
                                  aprobado_en, toca_celula, toca_motor, toca_helice, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
               (NOW() AT TIME ZONE 'America/El_Salvador') - ($24 || ' hours')::interval)
       RETURNING id_orden`,
      [anio, n, `${SIGLA}/${anio}-${String(n).padStart(4, "0")}`, campos.aeronave,
       campos.fecha, campos.tac, campos.piloto, campos.discrepancia, campos.accion || null,
       campos.estado, campos.mant || null, campos.asignado || null,
       campos.asignado ? campos.fecha : null, idJefe,
       campos.mecanico || null, campos.firma || null, campos.firma || null,
       campos.aprobador || null, campos.aprobacion || null, campos.aprobacion || null,
       campos.celula !== false, campos.motor !== false, campos.helice !== false,
       campos.horas]
    );
    return r.rows[0].id_orden;
  };

  // 1) En curso: es la que ve el técnico al entrar a "Mi taller".
  const otAbierta = await orden(1, {
    aeronave: enTaller.id_aeronave, fecha: soloFecha(sumarDias(hoy, -2)), tac: 1200,
    piloto: "Óscar Turno", discrepancia: "Inspección programada de 100 horas.",
    estado: "ABIERTA", mant: mant.rows[0].id_mantenimiento, asignado: idTecnico,
    helice: false, horas: 6,   // seis horas de trabajo encima: el cronómetro corriendo
  });
  // La requisición de material de ESE trabajo, para que la orden tenga papeleo colgando.
  const req = await doc("REQUISICION", 3, "REQ", {
    aeronave: enTaller.id_aeronave, cliente: CLIENTE, solicitante: "Luis Mecánico",
    tacometro: 1200, idOt: otAbierta, ot: `${SIGLA}/${anio}-0001`,
  });
  mover(req, "000101", 8);
  mover(req, "000102", 1);

  // 2) Firmada por el mecánico, esperando al jefe: llena "Por revisar".
  await orden(2, {
    aeronave: aeronaves[1].id_aeronave, fecha: soloFecha(sumarDias(hoy, -5)), tac: 1630.5,
    piloto: "Ana Directora", discrepancia: "Ruido en el tren de nariz durante el taxeo.",
    accion: "Se revisó el conjunto del tren de nariz y se reemplazaron pastillas de freno.",
    estado: "FIRMADA", asignado: idTecnico, mecanico: idTecnico,
    firma: soloFecha(sumarDias(hoy, -1)), motor: false, helice: false, horas: 5 * 24,
  });

  // 3) Aprobada: historial, y lo que llena el folder por avión.
  await orden(3, {
    aeronave: aeronaves[0].id_aeronave, fecha: soloFecha(sumarDias(hoy, -18)), tac: 1154,
    piloto: "Óscar Turno", discrepancia: "Cambio de aceite y filtro por 50 horas.",
    accion: "Se realizó cambio de aceite y filtro conforme al manual de mantenimiento.",
    estado: "APROBADA", asignado: idTecnico, mecanico: idTecnico,
    firma: soloFecha(sumarDias(hoy, -17)), aprobador: idJefe,
    aprobacion: soloFecha(sumarDias(hoy, -16)), celula: false, helice: false, horas: 18 * 24,
  });

  // ── Lo ya pegado en los libros del avión ────────────────────────────────
  // Un libro sin un solo sticker se ve como una función que nadie usa. Estos son
  // los trabajos que YA se certificaron: llevan congelados el TAC, el T.T. y el
  // TSO del momento en que se pegaron, igual que en el sistema real — una vez
  // pegado es un registro legal y re-imprimirlo no recalcula nada.
  log("libros del avión");
  const partesPorAvion = new Map();
  for (const r of (await c.query(
    `SELECT id_componente, id_aeronave, tipo, parte_no, serie_no, marca, tipo_certificado,
            horas_aeronave_instalacion, horas_componente_instalacion, tso_ancla
       FROM taller_componente ORDER BY id_aeronave, id_componente`
  )).rows) {
    if (!partesPorAvion.has(r.id_aeronave)) partesPorAvion.set(r.id_aeronave, []);
    partesPorAvion.get(r.id_aeronave).push(r);
  }

  const TEXTO = {
    CELULA: "Se efectuó inspección de 50 horas a la aeronave: inspección y lubricación de tren, " +
            "cables de control y pruebas operacionales de cabina, de acuerdo con el manual de " +
            "mantenimiento del fabricante.",
    MOTOR:  "Se efectuó cambio de aceite y filtro, inspección de bujías y compresión de cilindros, " +
            "de acuerdo con el manual de mantenimiento del motor.",
    HELICE: "Se efectuó inspección visual de palas y cono, verificación de torque de pernos y " +
            "lubricación del cubo, de acuerdo con el manual de la hélice.",
  };

  const stickers = [];
  for (const [idAeronave, partes] of partesPorAvion) {
    const av = aeronaves.find((a) => a.id_aeronave === idAeronave);
    if (!av) continue;
    const tacAv = Number((await c.query(
      `SELECT horas_acumuladas FROM aeronave WHERE id_aeronave = $1`, [idAeronave]
    )).rows[0]?.horas_acumuladas || 0);

    // Dos trabajos anteriores por avión: uno hace tres meses y otro hace uno.
    for (const atras of [3, 1]) {
      const tac = r2(tacAv - atras * 42);          // el TAC que marcaba entonces
      for (const p of partes) {
        const delta = tac - Number(p.horas_aeronave_instalacion || 0);
        stickers.push([
          idAeronave, p.id_componente, p.tipo, atras === 3 ? "100H" : "50H",
          soloFecha(sumarDias(hoy, -atras * 30)), "Ilopango", av.codigo,
          p.marca, p.parte_no, p.serie_no, p.tipo_certificado,
          tac,
          p.horas_componente_instalacion == null ? null : r2(delta + Number(p.horas_componente_instalacion)),
          p.tso_ancla == null ? null : r2(delta + Number(p.tso_ancla)),
          TEXTO[p.tipo], idTecnico, "Luis Mecánico", "TMA 002",
          r2(tac + 25), r2(tac + 50),
        ]);
      }
    }
  }
  await insertarMuchos(c, "taller_sticker",
    ["id_aeronave", "id_componente", "parte", "tipo", "fecha", "lugar", "matricula",
     "marca", "mn", "sn", "tc", "tac", "tt", "tso", "texto",
     "id_mecanico", "mecanico_nombre", "mecanico_tma", "proxima_25", "proxima_50"],
    stickers);

  // ── Inspecciones ya cumplidas ───────────────────────────────────────────
  // El historial que la pantalla de Aeronavegabilidad muestra bajo cada tarea:
  // sin esto, toda inspección parece no haberse hecho nunca.
  const inspecciones = (await c.query(
    `SELECT t.id_tarea, t.id_aeronave, t.ultima_horas, t.ultima_fecha
       FROM taller_tarea_programada t WHERE t.tipo = 'INSPECCION' AND t.activo`
  )).rows;
  await insertarMuchos(c, "taller_cumplimiento",
    ["id_tarea", "fecha", "horas_aeronave", "descripcion", "realizado_por", "id_usuario"],
    inspecciones.flatMap((t) => [
      [t.id_tarea, t.ultima_fecha, t.ultima_horas,
       "Inspección de 50 horas cumplida conforme al manual de mantenimiento.",
       "Luis Mecánico", idTecnico],
      [t.id_tarea, soloFecha(sumarDias(new Date(t.ultima_fecha), -45)),
       r2(Number(t.ultima_horas) - 50),
       "Inspección de 50 horas cumplida — ciclo anterior.", "Luis Mecánico", idTecnico],
    ])
  );

  // Segundo volcado: los renglones de la requisición de la orden abierta se
  // agregaron DESPUÉS del recálculo de stock, y es correcto que así sea — una
  // requisición es un borrador y no mueve existencia (§30). Pero hay que
  // insertarlos igual: son el papeleo que cuelga de la orden.
  await volcarRenglones();

  return {
    stickers: stickers.length,
    cumplimientos: inspecciones.length * 2,
    repuestos: REPUESTOS.length,
    componentes: aeronaves.length * PARTES.length,
    tareas_programadas: tareas,
    ordenes_trabajo: 3,
    avion_en_taller: enTaller.codigo,
  };
}

module.exports = { sembrarTaller };
