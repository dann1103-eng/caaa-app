// Lógica compartida (Turno + Instructor) para vuelos que son tramos de una
// ruta con parada (vuelo.grupo_ruta != null). Máquina de estados por tramo:
//   Tramo 1:            PUBLICADO -> SALIDA_HANGAR -> EN_PROGRESO -> (aterrizaje) COMPLETADO
//   Tramos intermedios: EN_ESPERA_TRAMO -> EN_PROGRESO -> (aterrizaje) COMPLETADO
//   Tramo final:        EN_ESPERA_TRAMO -> EN_PROGRESO -> REGRESO_HANGAR -> FINALIZANDO -> COMPLETADO
// Los tramos NO finales se cierran solo por registrarAterrizajeTramo (mini-form
// TAC/HOBBS), nunca por el botón genérico de avanzar.
// Todas las funciones asumen que "client" es una conexión pg DENTRO de una transacción
// abierta por el caller (BEGIN/COMMIT/ROLLBACK son responsabilidad del controller).

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
