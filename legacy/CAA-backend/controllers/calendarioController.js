const db = require("../config/db");

exports.getCalendarioPublico = async (req, res) => {
  try {
    const semanaRes = await db.query(`
      SELECT id_semana
      FROM semana_vuelo
      WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
      LIMIT 1
    `);

    const idSemana = semanaRes.rows[0]?.id_semana;
    if (!idSemana) return res.json([]);

    const result = await db.query(
      `
      SELECT
        v.id_vuelo,
        v.dia_semana,
        v.id_bloque,
        b.hora_inicio,
        b.hora_fin,
        ae.codigo  AS aeronave_codigo,
        ae.modelo  AS aeronave_modelo,
        COALESCE(u_al.nombre || ' ' || u_al.apellido, 'Sin Alumno') AS alumno_nombre,
        COALESCE(u_ins.nombre || ' ' || u_ins.apellido, 'Sin Instructor') AS instructor_nombre,
        v.estado,
        v.categoria,
        v.tipo_vuelo,
        v.tipo_instruccion,
        v.nombre_externo,
        -- Licencia para el badge "Tipo" de Proyección: la propia del alumno
        -- (vuelos NORMAL → sigla PPL/IR/CPL/ME) y la efectivamente chequeada
        -- (vuelos CHEQUEO → "SIGLA/CHECK").
        lic_alumno.nombre AS alumno_licencia_nombre,
        lic_chequeo.nombre AS licencia_chequeo_nombre,
        -- registrado_en es "timestamp without time zone": la conexión fija la sesión
        -- en 'America/El_Salvador' (config/db.js), así que el valor guardado YA es
        -- hora local (no UTC). Sin este AT TIME ZONE, el driver de Node lo reinterpreta
        -- como si fuera UTC y, al convertir de vuelta a local en el navegador, la hora
        -- queda adelantada/atrasada 6 horas. AT TIME ZONE aquí reinterpreta el valor
        -- naive como local de El Salvador y lo pasa a timestamptz (instante correcto).
        (vet_salida.registrado_en AT TIME ZONE 'America/El_Salvador') AS salida_real
      FROM vuelo v
      JOIN bloque_horario b   ON b.id_bloque   = v.id_bloque
      JOIN aeronave ae        ON ae.id_aeronave = v.id_aeronave
      LEFT JOIN alumno al          ON al.id_alumno   = v.id_alumno
      LEFT JOIN usuario u_al       ON u_al.id_usuario = al.id_usuario
      LEFT JOIN instructor i       ON i.id_instructor = v.id_instructor
      LEFT JOIN usuario u_ins      ON u_ins.id_usuario = i.id_usuario
      LEFT JOIN licencia lic_alumno  ON lic_alumno.id_licencia  = al.id_licencia
      LEFT JOIN licencia lic_chequeo ON lic_chequeo.id_licencia = v.id_licencia_chequeo
      LEFT JOIN LATERAL (
        SELECT registrado_en
        FROM vuelo_estado_tiempo
        WHERE id_vuelo = v.id_vuelo AND estado = 'SALIDA_HANGAR'
        ORDER BY registrado_en DESC
        LIMIT 1
      ) vet_salida ON true
      WHERE v.id_semana = $1
      ORDER BY v.dia_semana, b.hora_inicio, ae.codigo
      `,
      [idSemana]
    );

    return res.json(result.rows);
  } catch (e) {
    console.error("Error getCalendarioPublico:", e);
    res.status(500).json({ message: "Error obtener calendario público" });
  }
};

exports.getAeronavesPublicas = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id_aeronave, codigo, modelo, tipo, estado,
             horas_acumuladas, horas_proxima_revision, tipo_proxima_revision,
             foto_url
      FROM aeronave
      ORDER BY codigo
    `);
    res.json(result.rows);
  } catch (e) {
    console.error("Error getAeronavesPublicas:", e);
    res.status(500).json({ message: "Error obtener aeronaves" });
  }
};

exports.getBloquesPublicos = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id_bloque, hora_inicio, hora_fin
      FROM bloque_horario
      ORDER BY hora_inicio
    `);
    res.json(result.rows);
  } catch (e) {
    console.error("Error getBloquesPublicos:", e);
    res.status(500).json({ message: "Error obtener bloques" });
  }
};
