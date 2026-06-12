const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const transporter = require("../../utils/mailer");
const { puedeAccederVuelo } = require("../../utils/ownership");

exports.getWB = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const vRes = await db.query(`
    SELECT 
      v.*, 
      ae.codigo AS aeronave_codigo, 
      ae.id_wb_plantilla, 
      ae.modelo AS aeronave_modelo,
      u_al.nombre AS alumno_nombre,
      u_al.apellido AS alumno_apellido,
      u_ins.nombre AS instructor_nombre,
      u_ins.apellido AS instructor_apellido,
      i.licencia AS instructor_licencia,
      al.numero_licencia AS licencia_nombre,
      b.hora_inicio
    FROM vuelo v 
    JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
    JOIN alumno al ON al.id_alumno = v.id_alumno
    JOIN usuario u_al ON u_al.id_usuario = al.id_usuario
    LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
    LEFT JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario
    LEFT JOIN licencia l ON l.id_licencia = al.id_licencia
    JOIN bloque_horario b ON b.id_bloque = v.id_bloque
    WHERE v.id_vuelo = $1
  `, [id_vuelo]);

  if (vRes.rows.length === 0) return res.status(404).json({ message: "Vuelo no encontrado" });

  const idPlantilla = vRes.rows[0].id_wb_plantilla;
  let plantilla = null;
  if (idPlantilla) {
    const pRes = await db.query("SELECT * FROM wb_plantilla WHERE id_wb_plantilla = $1", [idPlantilla]);
    plantilla = pRes.rows[0] || null;
  }

  const wbRes = await db.query(`SELECT * FROM weight_balance WHERE id_vuelo = $1`, [id_vuelo]);
  
  // ACTIVAR MEMORIA: Recuperar loadsheet completo
  const lsRes = await db.query(`SELECT * FROM loadsheet WHERE id_vuelo = $1`, [id_vuelo]);
  const loadsheet = lsRes.rows[0] || null;

  let waypoints = [];
  if (loadsheet) {
    const wpRes = await db.query(`
      SELECT * FROM loadsheet_waypoint WHERE id_loadsheet = $1 ORDER BY orden ASC
    `, [loadsheet.id_loadsheet]);
    waypoints = wpRes.rows;
  }

  res.json({
    vuelo: vRes.rows[0],
    wb: wbRes.rows[0] ?? null,
    plantilla,
    aeronave_codigo: vRes.rows[0].aeronave_codigo,
    savedLoadsheet: loadsheet,
    savedWaypoints: waypoints,
    loadsheetEstado: loadsheet?.estado || 'PENDIENTE'
  });
});

exports.guardarWB = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const { pesos, tow, lw, cg, dentro_limite, galones, fuel_burn } = req.body;

  const vRes = await db.query(`
    SELECT ae.id_wb_plantilla 
    FROM vuelo v 
    JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave 
    WHERE v.id_vuelo = $1
  `, [id_vuelo]);

  if (vRes.rows.length === 0) return res.status(404).json({ message: "Vuelo no encontrado" });
  const idPlantilla = vRes.rows[0].id_wb_plantilla;

  await db.query(`
    INSERT INTO weight_balance (
      id_vuelo, id_wb_plantilla, pesos_ingresados, tow_calculado, lw_calculado, 
      cg_calculado, dentro_envelope, galones_combustible, fuel_burn, estado
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'BORRADOR')
    ON CONFLICT (id_vuelo) DO UPDATE SET 
      pesos_ingresados = EXCLUDED.pesos_ingresados,
      tow_calculado = EXCLUDED.tow_calculado,
      lw_calculado = EXCLUDED.lw_calculado,
      cg_calculado = EXCLUDED.cg_calculado,
      dentro_envelope = EXCLUDED.dentro_envelope,
      galones_combustible = EXCLUDED.galones_combustible,
      fuel_burn = EXCLUDED.fuel_burn,
      estado = CASE 
        WHEN weight_balance.estado = 'COMPLETADO' THEN 'COMPLETADO' 
        ELSE 'BORRADOR' 
      END,
      actualizado_en = NOW()
  `, [id_vuelo, idPlantilla, JSON.stringify(pesos), tow, lw, cg, dentro_limite, galones, fuel_burn]);

  res.json({ message: "Weight & Balance guardado" });
});

exports.completarWB = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  await db.query(`UPDATE weight_balance SET estado = 'COMPLETADO', actualizado_en = NOW() WHERE id_vuelo = $1`, [id_vuelo]);
  res.json({ message: "Weight & Balance completado" });
});

exports.getLoadsheet = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const vRes = await db.query(`SELECT v.*, ae.codigo AS aeronave_codigo FROM vuelo v JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave WHERE v.id_vuelo = $1`, [id_vuelo]);
  const lsRes = await db.query(`SELECT * FROM loadsheet WHERE id_vuelo = $1`, [id_vuelo]);
  res.json({ vuelo: vRes.rows[0], loadsheet: lsRes.rows[0] ?? null });
});

const toNum = (val) => {
  if (val === null || val === undefined || String(val).trim() === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
};

const toTime = (val) => {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === "") return null;
  // Aceptar solo horas válidas HH:MM o HH:MM:SS; cualquier otra cosa => null
  // (evita errores de Postgres tipo: invalid input syntax for type time: "10")
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), mn = Number(m[2]), sec = m[3] ? Number(m[3]) : 0;
  if (h > 23 || mn > 59 || sec > 59) return null;
  return s;
};

exports.guardarLoadsheet = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const {
    fuelData, navRows, identification, opsData, timesData, notes,
    depAtis, arrAtis
  } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // 1. Guardar o actualizar la cabecera
    const lsRes = await client.query(`
      INSERT INTO loadsheet (
        id_vuelo, power_setting, fuel_flow, dep_atis, arr_atis, 
        taxi_fuel, trip_fuel, reserve_rr, alt1_fuel, alt2_fuel, 
        final_reserve, min_req, extra, tfob, tod_min, ld_min, 
        etd, eta, eet, atd, ata, notas, 
        ops_data, identification_data, estado
      )
      VALUES (
        $1, $2, $3, $4, $5, 
        $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, 
        $17, $18, $19, $20, $21, $22, 
        $23, $24, 'BORRADOR'
      )
      ON CONFLICT (id_vuelo) DO UPDATE SET 
        power_setting = EXCLUDED.power_setting,
        fuel_flow = EXCLUDED.fuel_flow,
        dep_atis = EXCLUDED.dep_atis,
        arr_atis = EXCLUDED.arr_atis,
        taxi_fuel = EXCLUDED.taxi_fuel,
        trip_fuel = EXCLUDED.trip_fuel,
        reserve_rr = EXCLUDED.reserve_rr,
        alt1_fuel = EXCLUDED.alt1_fuel,
        alt2_fuel = EXCLUDED.alt2_fuel,
        final_reserve = EXCLUDED.final_reserve,
        min_req = EXCLUDED.min_req,
        extra = EXCLUDED.extra,
        tfob = EXCLUDED.tfob,
        tod_min = EXCLUDED.tod_min,
        ld_min = EXCLUDED.ld_min,
        etd = EXCLUDED.etd,
        eta = EXCLUDED.eta,
        eet = EXCLUDED.eet,
        atd = EXCLUDED.atd,
        ata = EXCLUDED.ata,
        notas = EXCLUDED.notas,
        ops_data = EXCLUDED.ops_data,
        identification_data = EXCLUDED.identification_data,
        estado = CASE WHEN loadsheet.estado = 'ENVIADO' THEN 'ENVIADO' ELSE 'BORRADOR' END,
        actualizado_en = NOW()
      RETURNING id_loadsheet
    `, [
      id_vuelo, fuelData?.power, toNum(fuelData?.flowGal), depAtis, arrAtis,
      toNum(fuelData?.taxiMin), toNum(fuelData?.tripMin), toNum(fuelData?.rarMin), toNum(fuelData?.alt1Min), toNum(fuelData?.alt2Min),
      toNum(fuelData?.reserveMin), toNum(fuelData?.minReqMin), toNum(fuelData?.extraMin || req.body.extra), toNum(fuelData?.tfobGal || req.body.tfob), toNum(timesData?.tod), toNum(timesData?.ld),
      toTime(timesData?.etd), toTime(timesData?.eta), toTime(timesData?.eet), toTime(timesData?.atd), toTime(timesData?.ata),
      notes, JSON.stringify(opsData || {}), JSON.stringify(identification || {}),
    ]);

    const idLoadsheet = lsRes.rows[0].id_loadsheet;

    // 2. Waypoints
    if (Array.isArray(navRows)) {
      await client.query("DELETE FROM loadsheet_waypoint WHERE id_loadsheet = $1", [idLoadsheet]);
      for (let i = 0; i < navRows.length; i++) {
        const wp = navRows[i];
        if (!wp.waypoint) continue;
        await client.query(`
          INSERT INTO loadsheet_waypoint (
            id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, 
            desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act, data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        `, [
          idLoadsheet, i + 1, wp.waypoint, wp.altfl || wp.alt_fl, wp.wv, wp.tc, wp.var, wp.mc, wp.wca, wp.mh, 
          wp.dev, wp.ch, wp.tas, wp.gs, toNum(wp.nm || wp.distancia_nm), 
          toTime(wp.eta || (wp['eta-h'] ? `${wp['eta-h']}:${wp['eta-m']}` : null)), 
          toTime(wp.ata || (wp['ata-h'] ? `${wp['ata-h']}:${wp['ata-m']}` : null)), 
          toNum(wp.fuel_req || wp['fuel-req']), toNum(wp.fuel_act || wp['fuel-act']), JSON.stringify(wp)
        ]);
      }
    }

    await client.query("COMMIT");
    res.json({ message: "Guardado correctamente", id_loadsheet: idLoadsheet });
  } catch (e) {
    if (client) await client.query("ROLLBACK");
    console.error("❌ Error en guardarLoadsheet:", e);
    res.status(500).json({ message: "Error al guardar", error: e.message });
  } finally {
    client.release();
  }
});

exports.enviarLoadsheetPDF = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const {
    pdfBase64, filename, student, date, aircraft,
    fuelData, navRows, identification, opsData, timesData, notes,
    depAtis, arrAtis
  } = req.body;

  // El PDF es opcional: el envío (marcar ENVIADO) no debe depender de generar el PDF.
  // Si no hay PDF, se guarda como ENVIADO igual y solo se omite el correo.

  const client = await db.connect();
  try {
    // --- BLOQUE 1: PERSISTENCIA EN BASE DE DATOS (CRÍTICO) ---
    await client.query("BEGIN");
    
    let idLoadsheet;
    const lsRes = await client.query(`
      INSERT INTO loadsheet (
        id_vuelo, power_setting, fuel_flow, dep_atis, arr_atis, 
        taxi_fuel, trip_fuel, reserve_rr, alt1_fuel, alt2_fuel, 
        final_reserve, min_req, extra, tfob, tod_min, ld_min, 
        etd, eta, eet, atd, ata, notas, 
        ops_data, identification_data, estado
      ) 
      VALUES (
        $1, $2, $3, $4, $5, 
        $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, 
        $17, $18, $19, $20, $21, $22, 
        $23, $24, 'ENVIADO'
      )
      ON CONFLICT (id_vuelo) DO UPDATE SET 
        power_setting = EXCLUDED.power_setting,
        fuel_flow = EXCLUDED.fuel_flow,
        dep_atis = EXCLUDED.dep_atis,
        arr_atis = EXCLUDED.arr_atis,
        taxi_fuel = EXCLUDED.taxi_fuel,
        trip_fuel = EXCLUDED.trip_fuel,
        reserve_rr = EXCLUDED.reserve_rr,
        alt1_fuel = EXCLUDED.alt1_fuel,
        alt2_fuel = EXCLUDED.alt2_fuel,
        final_reserve = EXCLUDED.final_reserve,
        min_req = EXCLUDED.min_req,
        extra = EXCLUDED.extra,
        tfob = EXCLUDED.tfob,
        tod_min = EXCLUDED.tod_min,
        ld_min = EXCLUDED.ld_min,
        etd = EXCLUDED.etd,
        eta = EXCLUDED.eta,
        eet = EXCLUDED.eet,
        atd = EXCLUDED.atd,
        ata = EXCLUDED.ata,
        notas = EXCLUDED.notas,
        ops_data = EXCLUDED.ops_data,
        identification_data = EXCLUDED.identification_data,
        estado = 'ENVIADO',
        actualizado_en = NOW()
      RETURNING id_loadsheet
    `, [
      id_vuelo, fuelData?.power, toNum(fuelData?.flowGal), depAtis, arrAtis,
      toNum(fuelData?.taxiMin), toNum(fuelData?.tripMin), toNum(fuelData?.rarMin), toNum(fuelData?.alt1Min), toNum(fuelData?.alt2Min),
      toNum(fuelData?.reserveMin), toNum(fuelData?.minReqMin), toNum(fuelData?.extraMin || req.body.extra), toNum(fuelData?.tfobGal || req.body.tfob), toNum(timesData?.tod), toNum(timesData?.ld),
      toTime(timesData?.etd), toTime(timesData?.eta), toTime(timesData?.eet), toTime(timesData?.atd), toTime(timesData?.ata),
      notes, JSON.stringify(opsData || {}), JSON.stringify(identification || {}),
    ]);
    idLoadsheet = lsRes.rows[0].id_loadsheet;

    if (Array.isArray(navRows)) {
      await client.query("DELETE FROM loadsheet_waypoint WHERE id_loadsheet = $1", [idLoadsheet]);
      for (let i = 0; i < navRows.length; i++) {
        const wp = navRows[i];
        if (!wp.waypoint) continue;
        await client.query(`
          INSERT INTO loadsheet_waypoint (
            id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, 
            desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act, data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        `, [
          idLoadsheet, i + 1, wp.waypoint, wp.altfl || wp.alt_fl, wp.wv, wp.tc, wp.var, wp.mc, wp.wca, wp.mh, 
          wp.dev, wp.ch, wp.tas, wp.gs, toNum(wp.nm || wp.distancia_nm), 
          toTime(wp.eta || (wp['eta-h'] ? `${wp['eta-h']}:${wp['eta-m']}` : null)), 
          toTime(wp.ata || (wp['ata-h'] ? `${wp['ata-h']}:${wp['ata-m']}` : null)), 
          toNum(wp.fuel_req || wp['fuel-req']), toNum(wp.fuel_act || wp['fuel-act']), JSON.stringify(wp)
        ]);
      }
    }

    // Actualizar Weight Balance a COMPLETADO
    await client.query(`UPDATE weight_balance SET estado = 'COMPLETADO', actualizado_en = NOW() WHERE id_vuelo = $1::integer`, [id_vuelo]);

    await client.query("COMMIT");
    client.release();

    // --- BLOQUE 2: ENVÍO DE CORREO (INDEPENDIENTE, solo si hay PDF) ---
    try {
      if (!pdfBase64) throw new Error("Sin PDF: se omite el correo");
      const recipient = process.env.RECIPIENT_EMAIL || process.env.MAIL_FROM_ADDRESS;
      await transporter.sendMail({
        from: `"CAAA Load Sheet" <${process.env.MAIL_USERNAME}>`,
        to: recipient,
        subject: `Load Sheet — ${student || 'Alumno'} — ${aircraft || ''} — ${date || ''}`,
        text: `Se adjunta el load sheet de ${student || 'el alumno'} para el vuelo del ${date || ''} en aeronave ${aircraft || ''}.`,
        attachments: [{
          filename: filename || `loadsheet_${id_vuelo}.pdf`,
          content: pdfBase64,
          encoding: 'base64',
          contentType: 'application/pdf',
        }],
      });
    } catch (emailErr) {
      console.error(`⚠️ Email falló:`, emailErr);
    }

    res.json({ ok: true, message: "Procesado correctamente", estado: "ENVIADO" });

  } catch (err) {
    if (client) { await client.query("ROLLBACK"); client.release(); }
    console.error('❌ Error crítico:', err);
    res.status(500).json({ message: "Error al procesar", error: err.message });
  }
});

exports.completarLoadsheet = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const archivo = req.file;
  // Actualizamos el estado y guardamos el nombre del archivo si se subió
  await db.query(`
    UPDATE loadsheet 
    SET estado = 'COMPLETADO', 
        archivo_pdf = $1, 
        actualizado_en = NOW() 
    WHERE id_vuelo = $2
  `, [archivo ? archivo.filename : null, id_vuelo]);

  res.json({ message: "Loadsheet completado correctamente" });
});

