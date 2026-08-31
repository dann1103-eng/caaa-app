// Lógica compartida (Turno + Instructor) para vuelos que son tramos de una
// ruta con parada (vuelo.grupo_ruta != null). Máquina de estados por tramo:
//   Tramo 1:            PUBLICADO -> SALIDA_HANGAR -> EN_PROGRESO -> (aterrizaje) COMPLETADO
//   Tramos intermedios: EN_ESPERA_TRAMO -> EN_PROGRESO -> (aterrizaje) COMPLETADO
//   Tramo final:        EN_ESPERA_TRAMO -> EN_PROGRESO -> REGRESO_HANGAR -> FINALIZANDO -> COMPLETADO
// Los tramos NO finales se cierran solo por registrarAterrizajeTramo (mini-form
// TAC/HOBBS), nunca por el botón genérico de avanzar.
// Todas las funciones asumen que "client" es una conexión pg DENTRO de una transacción
// abierta por el caller (BEGIN/COMMIT/ROLLBACK son responsabilidad del controller).

const { construirTramos } = require("../utils/rutaTramos");

function esTramo(vuelo) {
  return vuelo && vuelo.grupo_ruta != null;
}

function esTramoFinal(vuelo) {
  return Number(vuelo.orden_tramo) >= Number(vuelo.total_tramos);
}

// Próximo estado para un tramo vía el botón genérico de avanzar. Devuelve
// undefined cuando la transición no existe (p.ej. EN_PROGRESO de un tramo no
// final: ahí el cierre es el mini-form de aterrizaje).
function nextEstadoTramo(vuelo) {
  const primero = Number(vuelo.orden_tramo) === 1;
  const final = esTramoFinal(vuelo);
  const mapa = {
    ...(primero
      ? { PUBLICADO: "SALIDA_HANGAR", PROGRAMADO: "SALIDA_HANGAR", SALIDA_HANGAR: "EN_PROGRESO" }
      : { EN_ESPERA_TRAMO: "EN_PROGRESO" }),
    ...(final
      ? { EN_PROGRESO: "REGRESO_HANGAR", REGRESO_HANGAR: "FINALIZANDO", FINALIZANDO: "COMPLETADO" }
      : {}),
  };
  return mapa[vuelo.estado];
}

// Guard: no se puede iniciar el tramo N si el N-1 no está COMPLETADO.
async function asegurarTramoAnteriorCerrado(client, vuelo) {
  if (Number(vuelo.orden_tramo) <= 1) return;
  const prev = await client.query(
    `SELECT estado FROM vuelo WHERE grupo_ruta = $1 AND orden_tramo = $2`,
    [vuelo.grupo_ruta, Number(vuelo.orden_tramo) - 1]
  );
  if (!prev.rows.length || prev.rows[0].estado !== "COMPLETADO") {
    throw Object.assign(
      new Error("El tramo anterior de la ruta todavía no está cerrado — registrá primero el aterrizaje."),
      { status: 409 }
    );
  }
}

// Mini-form de aterrizaje en destino: cierra el tramo actual y precarga las
// voucheras adyacentes. Escribe DIRECTO en reporte_vuelo (creando el borrador
// si no existe): llegada del tramo actual y salida del siguiente. Reabrible
// mientras el tramo siguiente siga EN_ESPERA_TRAMO.
// Devuelve { registrado_en, reabierto, id_vuelo_siguiente }.
async function registrarAterrizajeTramo(client, { vuelo, tacometro, hobbs, id_usuario }) {
  const tac = Number(tacometro);
  const hob = Number(hobbs);
  if (isNaN(tac) || tac <= 0 || isNaN(hob) || hob <= 0) {
    throw Object.assign(new Error("Registrá el TAC y el HOBBS de llegada (números mayores a 0)."), { status: 400 });
  }
  if (!esTramo(vuelo) || esTramoFinal(vuelo)) {
    throw Object.assign(
      new Error("Este vuelo no es un tramo intermedio de ruta — el tramo final se cierra con el flujo normal."),
      { status: 400 }
    );
  }

  const sig = await client.query(
    `SELECT id_vuelo, estado FROM vuelo WHERE grupo_ruta = $1 AND orden_tramo = $2`,
    [vuelo.grupo_ruta, Number(vuelo.orden_tramo) + 1]
  );
  const siguiente = sig.rows[0] || null;

  const reabierto = vuelo.estado === "COMPLETADO";
  if (vuelo.estado !== "EN_PROGRESO" && !reabierto) {
    throw Object.assign(new Error("El tramo tiene que estar en progreso para registrar el aterrizaje."), { status: 409 });
  }
  if (reabierto && (!siguiente || siguiente.estado !== "EN_ESPERA_TRAMO")) {
    throw Object.assign(
      new Error("El tramo siguiente ya inició — corregí los valores desde la vouchera."),
      { status: 409 }
    );
  }

  // TAC de llegada >= TAC de salida del propio tramo (si ya está precargado).
  const propio = await client.query(
    `SELECT tacometro_salida FROM reporte_vuelo WHERE id_vuelo = $1`,
    [vuelo.id_vuelo]
  );
  const rvPropio = propio.rows[0];
  if (rvPropio && rvPropio.tacometro_salida != null && tac < parseFloat(rvPropio.tacometro_salida)) {
    throw Object.assign(
      new Error(`El TAC de llegada (${tac}) no puede ser menor al de salida del tramo (${rvPropio.tacometro_salida}).`),
      { status: 400 }
    );
  }

  // Llegada del tramo actual (no pisa una vouchera ya firmada).
  const llegada = await client.query(
    `INSERT INTO reporte_vuelo (id_vuelo, tacometro_llegada, hobbs_llegada, estado)
     VALUES ($1, $2, $3, 'BORRADOR')
     ON CONFLICT (id_vuelo) DO UPDATE SET
       tacometro_llegada = EXCLUDED.tacometro_llegada,
       hobbs_llegada = EXCLUDED.hobbs_llegada,
       actualizado_en = NOW()
     WHERE reporte_vuelo.estado NOT IN ('PENDIENTE_ALUMNO', 'COMPLETADO')`,
    [vuelo.id_vuelo, tac, hob]
  );
  if (llegada.rowCount === 0) {
    throw Object.assign(
      new Error("La vouchera de este tramo ya está firmada — corregí los valores desde el flujo de editar vouchera."),
      { status: 409 }
    );
  }

  // Salida del tramo siguiente.
  if (siguiente) {
    const salida = await client.query(
      `INSERT INTO reporte_vuelo (id_vuelo, tacometro_salida, hobbs_salida, estado)
       VALUES ($1, $2, $3, 'BORRADOR')
       ON CONFLICT (id_vuelo) DO UPDATE SET
         tacometro_salida = EXCLUDED.tacometro_salida,
         hobbs_salida = EXCLUDED.hobbs_salida,
         actualizado_en = NOW()
       WHERE reporte_vuelo.estado NOT IN ('PENDIENTE_ALUMNO', 'COMPLETADO')`,
      [siguiente.id_vuelo, tac, hob]
    );
    if (salida.rowCount === 0) {
      throw Object.assign(
        new Error("La vouchera del tramo siguiente ya está firmada — no se puede precargar la salida."),
        { status: 409 }
      );
    }
  }

  let registrado_en = null;
  if (!reabierto) {
    const cierre = await client.query(
      `UPDATE vuelo SET estado = 'COMPLETADO' WHERE id_vuelo = $1 AND estado = 'EN_PROGRESO'`,
      [vuelo.id_vuelo]
    );
    if (cierre.rowCount === 0) {
      throw Object.assign(new Error("El tramo ya no está en progreso — recargá la pantalla."), { status: 409 });
    }
    const ts = await client.query(
      `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
       VALUES ($1, 'COMPLETADO', $2)
       RETURNING (registrado_en AT TIME ZONE 'America/El_Salvador') AS registrado_en`,
      [vuelo.id_vuelo, id_usuario ?? null]
    );
    registrado_en = ts.rows[0].registrado_en;
  }

  return { registrado_en, reabierto, id_vuelo_siguiente: siguiente ? siguiente.id_vuelo : null };
}

module.exports = { esTramo, esTramoFinal, nextEstadoTramo, asegurarTramoAnteriorCerrado, registrarAterrizajeTramo };

// ---------------------------------------------------------------------------
// Reconfiguración de la parada de una ruta YA agendada
// ---------------------------------------------------------------------------
// Caso real: se agendó una RUTA y se olvidó marcar "con parada" (o al revés, o
// hay que corregir el ICAO). Antes la única salida era cancelar y re-agendar.
//
// La fuente de verdad es solicitud_vuelo (día, bloques, aeronave, con_parada,
// tramos_ruta): el caller la actualiza y luego llama a sincronizarTramos, que
// deja las filas de `vuelo` calcadas a esa forma. Eso además elimina el desfase
// que existía al mover una ruta desde el popover, que solo alcanzaba al tramo 1
// (los hermanos llevan id_detalle NULL — ver uq_vuelo_detalle).
//
// ⚠️ Regla que sostiene todo esto: el TRAMO 1 SE REUTILIZA, NUNCA SE BORRA.
// De vuelo cuelgan con ON DELETE CASCADE reporte_vuelo, loadsheet,
// weight_balance, plan_vuelo y checklist_postvuelo ⇒ un DELETE se lleva en
// silencio la vouchera y el loadsheet del alumno. Al convertir una ruta simple
// en ruta con parada, el loadsheet que el alumno ya hizo queda en el tramo 1,
// que es justo donde corresponde.

const ESTADOS_SIN_EMPEZAR = ["PUBLICADO", "PROGRAMADO", "EN_ESPERA_TRAMO"];

// Guard: la ruta solo se reconfigura mientras NO haya pasado nada. Lanza un
// Error con .status=409 explicando qué lo impide. Se chequea el grupo COMPLETO:
// basta que un tramo haya salido del hangar para que reordenarlos sea mentira.
async function assertRutaReconfigurable(client, id_detalle) {
  const r = await client.query(
    `SELECT v.id_vuelo, v.estado, v.orden_tramo,
            EXISTS (SELECT 1 FROM reporte_vuelo rv WHERE rv.id_vuelo = v.id_vuelo) AS tiene_reporte,
            EXISTS (SELECT 1 FROM vuelo_estado_tiempo vt WHERE vt.id_vuelo = v.id_vuelo) AS tiene_estados
       FROM vuelo v
      WHERE v.id_detalle = $1 OR v.grupo_ruta = $1
      ORDER BY COALESCE(v.orden_tramo, 1)`,
    [id_detalle]
  );
  for (const v of r.rows) {
    const donde = v.orden_tramo ? `El tramo ${v.orden_tramo}` : "El vuelo";
    if (!ESTADOS_SIN_EMPEZAR.includes(v.estado)) {
      throw Object.assign(
        new Error(`${donde} ya está en ${v.estado}: la parada solo se puede cambiar mientras la ruta no haya empezado. Si ya se voló, hay que cancelarla y re-agendarla.`),
        { status: 409 }
      );
    }
    if (v.tiene_reporte || v.tiene_estados) {
      throw Object.assign(
        new Error(`${donde} ya tiene movimiento registrado (vouchera o cambios de estado). Cambiar la parada ahora dejaría esos datos colgando de un tramo que deja de existir.`),
        { status: 409 }
      );
    }
  }
  return r.rows;
}

// Los tramos que SOBRAN se borran, y el borrado arrastra en cascada el trabajo
// del alumno. Si tienen loadsheet, peso&balance o plan de vuelo, se frena.
async function assertTramosBorrables(client, ids) {
  if (!ids.length) return;
  const r = await client.query(
    `SELECT v.orden_tramo,
            EXISTS (SELECT 1 FROM loadsheet l WHERE l.id_vuelo = v.id_vuelo) AS ls,
            EXISTS (SELECT 1 FROM weight_balance w WHERE w.id_vuelo = v.id_vuelo) AS wb,
            EXISTS (SELECT 1 FROM plan_vuelo p WHERE p.id_vuelo = v.id_vuelo) AS pv
       FROM vuelo v WHERE v.id_vuelo = ANY($1::int[])`,
    [ids]
  );
  const conTrabajo = r.rows.filter((x) => x.ls || x.wb || x.pv).map((x) => x.orden_tramo);
  if (conTrabajo.length) {
    throw Object.assign(
      new Error(`El tramo ${conTrabajo.join(" y ")} ya tiene loadsheet o plan de vuelo cargado. Quitar ese tramo borraría ese trabajo — si igual hay que hacerlo, cancelá la ruta y re-agendala.`),
      { status: 409 }
    );
  }
}

// Deja las filas de `vuelo` calcadas a lo que dice solicitud_vuelo.
// Devuelve { aplicado, tramos } — aplicado=false cuando la semana todavía no
// está publicada (ahí no hay vuelos: los tramos nacen en publicarSemana).
async function sincronizarTramos(client, id_detalle) {
  const svRes = await client.query(
    `SELECT sv.id_detalle, sv.id_semana, sv.dia_semana, sv.id_bloque, sv.id_bloque_fin,
            sv.id_aeronave, sv.tipo_vuelo, sv.con_parada, sv.tramos_ruta,
            sv.es_extracurricular, sv.categoria, sv.tipo_instruccion, sv.nombre_externo,
            sv.id_licencia_chequeo, ss.id_alumno,
            COALESCE(sv.id_instructor, al.id_instructor) AS id_instructor,
            sw.fecha_inicio
       FROM solicitud_vuelo sv
       JOIN solicitud_semana ss ON ss.id_solicitud = sv.id_solicitud
       JOIN alumno al ON al.id_alumno = ss.id_alumno
       JOIN semana_vuelo sw ON sw.id_semana = sv.id_semana
      WHERE sv.id_detalle = $1`,
    [id_detalle]
  );
  if (!svRes.rows.length) {
    throw Object.assign(new Error("No se encontró la solicitud de ese vuelo."), { status: 404 });
  }
  const sv = svRes.rows[0];

  const existentes = await assertRutaReconfigurable(client, id_detalle);
  if (!existentes.length) return { aplicado: false, tramos: [] };

  // Forma deseada. Sin parada la ruta es UN vuelo plano: los campos de tramo
  // vuelven a NULL para que tramoBadge/nextEstadoTramo dejen de tratarlo como tramo.
  const conParada = sv.con_parada === true && sv.tipo_vuelo === "RUTA";
  const deseados = conParada
    ? construirTramos({
        paradas: Array.isArray(sv.tramos_ruta) ? sv.tramos_ruta : JSON.parse(sv.tramos_ruta || "[]"),
        id_bloque: sv.id_bloque,
        id_bloque_fin: sv.id_bloque_fin,
      })
    : [{
        orden_tramo: null, total_tramos: null, icao_origen: null, icao_destino: null,
        id_bloque: sv.id_bloque, id_bloque_fin: sv.id_bloque_fin || sv.id_bloque,
      }];

  const sobran = existentes.slice(deseados.length);
  await assertTramosBorrables(client, sobran.map((v) => v.id_vuelo));

  // 1) Reutilizar las filas que ya existen, en orden. La primera conserva
  //    SIEMPRE su id_vuelo y su id_detalle (uq_vuelo_detalle: los hermanos van
  //    con NULL), así que el loadsheet y los enlaces del alumno sobreviven.
  const tramos = [];
  for (let i = 0; i < Math.min(existentes.length, deseados.length); i++) {
    const v = existentes[i];
    const d = deseados[i];
    const primero = i === 0;
    // EN_ESPERA_TRAMO solo tiene sentido para un tramo 2..N; si esta fila pasa
    // a ser la primera (o deja de ser tramo), vuelve a PUBLICADO.
    const estado = primero
      ? (v.estado === "EN_ESPERA_TRAMO" ? "PUBLICADO" : v.estado)
      : "EN_ESPERA_TRAMO";
    await client.query(
      `UPDATE vuelo
          SET id_detalle = $2, dia_semana = $3, id_bloque = $4, id_bloque_fin = $5,
              id_aeronave = $6, tipo_vuelo = $7, estado = $8,
              fecha_vuelo = (SELECT fecha_inicio FROM semana_vuelo WHERE id_semana = $9) + ($3 - 1),
              grupo_ruta = $10, orden_tramo = $11, total_tramos = $12,
              icao_origen = $13, icao_destino = $14
        WHERE id_vuelo = $1`,
      [v.id_vuelo, primero ? id_detalle : null, sv.dia_semana, d.id_bloque, d.id_bloque_fin,
       sv.id_aeronave, sv.tipo_vuelo, estado, sv.id_semana,
       conParada ? id_detalle : null, d.orden_tramo, d.total_tramos, d.icao_origen, d.icao_destino]
    );
    tramos.push({ id_vuelo: v.id_vuelo, ...d });
  }

  // 2) Tramos que faltan (la ruta ganó paradas).
  for (let i = existentes.length; i < deseados.length; i++) {
    const d = deseados[i];
    const ins = await client.query(
      `INSERT INTO vuelo (id_detalle, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana,
                          id_bloque, tipo_vuelo, id_bloque_fin, es_extracurricular, tipo_instruccion,
                          categoria, nombre_externo, id_licencia_chequeo, estado, creado_por, fecha_vuelo,
                          grupo_ruta, orden_tramo, total_tramos, icao_origen, icao_destino)
       VALUES (NULL,$1,$2,$3,$4,$5,$6,'RUTA',$7,$8,$9,$10,$11,$12,'EN_ESPERA_TRAMO','PROGRAMACION',
               (SELECT fecha_inicio FROM semana_vuelo WHERE id_semana = $1) + ($5 - 1), $13,$14,$15,$16,$17)
       RETURNING id_vuelo`,
      [sv.id_semana, sv.id_alumno, sv.id_instructor, sv.id_aeronave, sv.dia_semana,
       d.id_bloque, d.id_bloque_fin, sv.es_extracurricular === true, sv.tipo_instruccion,
       sv.categoria, sv.nombre_externo, sv.id_licencia_chequeo,
       id_detalle, d.orden_tramo, d.total_tramos, d.icao_origen, d.icao_destino]
    );
    tramos.push({ id_vuelo: ins.rows[0].id_vuelo, ...d });
  }

  // 3) Tramos que sobran (la ruta perdió paradas). Ya verificados sin trabajo.
  if (sobran.length) {
    await client.query(`DELETE FROM vuelo WHERE id_vuelo = ANY($1::int[])`, [sobran.map((v) => v.id_vuelo)]);
  }

  return { aplicado: true, tramos };
}

module.exports.assertRutaReconfigurable = assertRutaReconfigurable;
module.exports.sincronizarTramos = sincronizarTramos;
