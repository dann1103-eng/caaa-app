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

// El papeleo del taller lleva impreso el nombre del cliente. Sale de la marca
// del demo y no escrito a mano: si fuera el de CAAA, cada requisición que se
// imprima delante de un prospecto diría de quién es realmente el sistema.
const CLIENTE = `${MARCAS.demo.nombre} / OMA`;

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
  const idsRepuesto = {};
  for (const [codigo, desc, unidad, cat, ubi, costo, min] of REPUESTOS) {
    const r = await c.query(
      `INSERT INTO taller_repuesto (codigo, descripcion, unidad, categoria, ubicacion,
                                    costo_unitario, stock_minimo, stock_actual, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,true) RETURNING id_repuesto`,
      [codigo, desc, unidad, cat, ubi, costo, min]
    );
    idsRepuesto[codigo] = r.rows[0].id_repuesto;
  }

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
  const mover = (idDoc, codigo, cantidad, costo = null) => c.query(
    `INSERT INTO taller_movimiento_inventario (id_documento, id_repuesto, cantidad, costo_unitario)
     VALUES ($1,$2,$3,$4)`, [idDoc, idsRepuesto[codigo], cantidad, costo]
  );

  // Compra que llena la bodega, hace tres semanas.
  const fa = await doc("ENTRADA", 1, "FA", {
    fecha: soloFecha(sumarDias(hoy, -21)), proveedor: "Aeropartes del Istmo, S.A.", factura: "12045",
  });
  for (const [codigo, , , , , costo, min] of REPUESTOS) {
    await mover(fa, codigo, min * 3, costo);
  }

  // Consumos: dan movimiento al kardex y dejan a un par de ítems bajo mínimo,
  // que es lo que hace que la pantalla de Existencias tenga algo que mostrar.
  const sal1 = await doc("SALIDA", 1, "REQ", {
    fecha: soloFecha(sumarDias(hoy, -12)), aeronave: aeronaves[0].id_aeronave,
    cliente: CLIENTE, solicitante: "Luis Mecánico", tacometro: 3120.4,
  });
  await mover(sal1, "000101", -8);
  await mover(sal1, "000102", -1);
  await mover(sal1, "000103", -8);

  const sal2 = await doc("SALIDA", 2, "REQ", {
    fecha: soloFecha(sumarDias(hoy, -4)), aeronave: aeronaves[1].id_aeronave,
    cliente: CLIENTE, solicitante: "Luis Mecánico", tacometro: 2044.8,
  });
  await mover(sal2, "000107", -20);
  await mover(sal2, "000111", -110);

  // El stock se recalcula desde los movimientos, nunca se teclea.
  await c.query(
    `UPDATE taller_repuesto r
        SET stock_actual = COALESCE((SELECT SUM(m.cantidad)
                                       FROM taller_movimiento_inventario m
                                       JOIN taller_documento_inventario d ON d.id_documento = m.id_documento
                                      WHERE m.id_repuesto = r.id_repuesto AND d.estado = 'VIGENTE'), 0)`
  );

  // ── Aeronavegabilidad ───────────────────────────────────────────────────
  // Tres partes y sus inspecciones por avión. El anclaje del tiempo total es
  // inventado pero coherente: T.T. = tacómetro + un offset fijo por parte, que
  // es exactamente como funciona en los libros de verdad.
  log("aeronavegabilidad");
  let tareas = 0;
  for (let i = 0; i < aeronaves.length; i++) {
    const av = aeronaves[i];
    const tac = r2(1200 + i * 430.5);          // tacómetro de ese avión
    await c.query(`UPDATE aeronave SET horas_acumuladas = $1 WHERE id_aeronave = $2`, [tac, av.id_aeronave]);

    for (let p = 0; p < PARTES.length; p++) {
      const parte = PARTES[p];
      await c.query(
        `INSERT INTO taller_componente (id_aeronave, tipo, nombre, parte_no, serie_no, marca,
                                        tipo_certificado, horas_aeronave_instalacion, tso_ancla,
                                        fecha_instalacion, activo, ancla_origen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'Sembrado por el escenario de demostración')`,
        [av.id_aeronave, parte.tipo, parte.nombre,
         `PN-${1000 + i * 10 + p}`, `SN-${47200 + i * 31 + p}`, parte.marca, parte.tc,
         // El anclaje va en la escala CRUDA del sistema, como en producción.
         r2(tac - (p === 0 ? tac * 0.15 : p === 1 ? 620 : 310)),
         p === 0 ? null : r2(180 + i * 24 + p * 55),
         soloFecha(sumarDias(hoy, -(400 + i * 30)))]
      );
    }

    // ⚠️ UNA sola inspección activa por avión: hay un índice único parcial
    // (id_aeronave WHERE tipo='INSPECCION' AND activo) que lo impone, porque el
    // ciclo vigente es el que se cachea en aeronave.horas_proxima_revision.
    // Así está en producción — 1 inspección, 210 ADs, 52 de vida límite — y el
    // demo copia la FORMA aunque los números sean inventados.
    // La del primer avión queda a 4 horas de vencer, para que la franja de
    // atención del tablero tenga algo real que avisar.
    const cerca = i === 0;
    const ultima = r2(tac - (cerca ? 46 : 18 + i * 6));
    await c.query(
      `INSERT INTO taller_tarea_programada (id_aeronave, nombre, tipo, recurrente, intervalo_horas,
                                            ultima_horas, proxima_horas, ultima_fecha, activo, aplica, origen)
       VALUES ($1,'Inspección 50 horas','INSPECCION',true,50,$2,$3,$4,true,true,'DEMO')`,
      [av.id_aeronave, ultima, r2(ultima + 50), soloFecha(sumarDias(hoy, -(cerca ? 25 : 40 + i * 8)))]
    );
    tareas++;

    // Directivas de aeronavegabilidad: unas por calendario y otra por horas.
    // La primera del primer avión vence en pocos días.
    const ADS = [
      ["AD 2019-05-04 · Inspección de cinturones", "AD 2019-05-04", 365,
       "Inspección visual de anclajes y cinturones de seguridad."],
      ["AD 2011-10-09 · Tornillería del estabilizador", "AD 2011-10-09", 730,
       "Verificación de torque en la tornillería del estabilizador horizontal."],
      ["AD 2015-19-07 · Líneas de combustible", "AD 2015-19-07", 365,
       "Inspección de líneas flexibles de combustible por agrietamiento."],
    ];
    for (let k = 0; k < ADS.length; k++) {
      const [nombre, ref, dias, descripcion] = ADS[k];
      const vence = cerca && k === 0 ? 6 : 40 + k * 55 + i * 9;
      await c.query(
        `INSERT INTO taller_tarea_programada (id_aeronave, nombre, tipo, referencia, descripcion,
                                              recurrente, intervalo_dias, ultima_fecha, proxima_fecha,
                                              activo, aplica, origen)
         VALUES ($1,$2,'AD',$3,$4,true,$5,$6,$7,true,true,'DEMO')`,
        [av.id_aeronave, nombre, ref, descripcion, dias,
         soloFecha(sumarDias(hoy, vence - dias)), soloFecha(sumarDias(hoy, vence))]
      );
      tareas++;
    }

    // Partes con vida límite: NO son recurrentes — se cambian y se acabó.
    // Es la lista que el jefe de taller necesita ver venir con tiempo.
    const VIDA = [
      ["Manguera de combustible motor-carburador", 8, 1825],
      ["Cinturón de seguridad piloto", 12, 3650],
    ];
    for (let k = 0; k < VIDA.length; k++) {
      const [nombre, anios, dias] = VIDA[k];
      // La del segundo avión vence en 18 días: cae dentro de la ventana de
      // aviso (30) y es lo que hace visible la alerta de vida límite, que es
      // justo lo que el jefe de taller necesita ver venir con tiempo.
      const instalada = sumarDias(hoy, -(dias - (i === 1 ? 18 + k * 9 : 300 + i * 120 + k * 40)));
      await c.query(
        `INSERT INTO taller_tarea_programada (id_aeronave, nombre, tipo, descripcion, recurrente,
                                              intervalo_dias, ultima_fecha, proxima_fecha,
                                              activo, aplica, origen)
         VALUES ($1,$2,'VIDA_LIMITE',$3,false,$4,$5,$6,true,true,'DEMO')`,
        [av.id_aeronave, nombre, `Vida límite de ${anios} años.`, dias,
         soloFecha(instalada), soloFecha(sumarDias(instalada, dias))]
      );
      tareas++;
    }
  }

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
      `INSERT INTO orden_trabajo (anio, numero, correlativo, id_aeronave, fecha, tacometro,
                                  piloto_operador, discrepancia, accion_correctiva, estado,
                                  id_mantenimiento, id_mecanico_asignado, asignado_en, creado_por,
                                  id_mecanico, fecha_firma, firmado_en, id_aprobador, fecha_aprobacion,
                                  aprobado_en, toca_celula, toca_motor, toca_helice)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING id_orden`,
      [anio, n, `DEMO/${anio}-${String(n).padStart(4, "0")}`, campos.aeronave,
       campos.fecha, campos.tac, campos.piloto, campos.discrepancia, campos.accion || null,
       campos.estado, campos.mant || null, campos.asignado || null,
       campos.asignado ? campos.fecha : null, idJefe,
       campos.mecanico || null, campos.firma || null, campos.firma || null,
       campos.aprobador || null, campos.aprobacion || null, campos.aprobacion || null,
       campos.celula !== false, campos.motor !== false, campos.helice !== false]
    );
    return r.rows[0].id_orden;
  };

  // 1) En curso: es la que ve el técnico al entrar a "Mi taller".
  const otAbierta = await orden(1, {
    aeronave: enTaller.id_aeronave, fecha: soloFecha(sumarDias(hoy, -2)), tac: 1200,
    piloto: "Óscar Turno", discrepancia: "Inspección programada de 100 horas.",
    estado: "ABIERTA", mant: mant.rows[0].id_mantenimiento, asignado: idTecnico,
    helice: false,
  });
  // La requisición de material de ESE trabajo, para que la orden tenga papeleo colgando.
  const req = await doc("REQUISICION", 3, "REQ", {
    aeronave: enTaller.id_aeronave, cliente: CLIENTE, solicitante: "Luis Mecánico",
    tacometro: 1200, idOt: otAbierta, ot: `DEMO/${anio}-0001`,
  });
  await mover(req, "000101", 8);
  await mover(req, "000102", 1);

  // 2) Firmada por el mecánico, esperando al jefe: llena "Por revisar".
  await orden(2, {
    aeronave: aeronaves[1].id_aeronave, fecha: soloFecha(sumarDias(hoy, -5)), tac: 1630.5,
    piloto: "Ana Directora", discrepancia: "Ruido en el tren de nariz durante el taxeo.",
    accion: "Se revisó el conjunto del tren de nariz y se reemplazaron pastillas de freno.",
    estado: "FIRMADA", asignado: idTecnico, mecanico: idTecnico,
    firma: soloFecha(sumarDias(hoy, -1)), motor: false, helice: false,
  });

  // 3) Aprobada: historial, y lo que llena el folder por avión.
  await orden(3, {
    aeronave: aeronaves[0].id_aeronave, fecha: soloFecha(sumarDias(hoy, -18)), tac: 1154,
    piloto: "Óscar Turno", discrepancia: "Cambio de aceite y filtro por 50 horas.",
    accion: "Se realizó cambio de aceite y filtro conforme al manual de mantenimiento.",
    estado: "APROBADA", asignado: idTecnico, mecanico: idTecnico,
    firma: soloFecha(sumarDias(hoy, -17)), aprobador: idJefe,
    aprobacion: soloFecha(sumarDias(hoy, -16)), celula: false, helice: false,
  });

  return {
    repuestos: REPUESTOS.length,
    componentes: aeronaves.length * PARTES.length,
    tareas_programadas: tareas,
    ordenes_trabajo: 3,
    avion_en_taller: enTaller.codigo,
  };
}

module.exports = { sembrarTaller };
