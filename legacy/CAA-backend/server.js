require("dotenv").config();
const http = require("http");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const path = require("path");
const { DateTime } = require("luxon");
const db = require("./config/db");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const alumnoRoutes = require("./routes/alumnoRoutes");
const agendarRoutes = require("./routes/agendarRoutes");
const programacionController = require("./routes/programacionRoutes");
const adminController = require("./routes/adminRoutes");
const usuarioController = require("./routes/usuarioRoutes");
const calendarioRoutes = require("./routes/calendarioRoutes");
const turnoRoutes = require("./routes/turnoRoutes");
const instructorRoutes = require("./routes/instructorRoutes");
const metarRoutes = require("./routes/metarRoutes");
const administracionRoutes = require("./routes/administracionRoutes");
const tallerRoutes = require("./routes/tallerRoutes");
const notificacionRoutes = require("./routes/notificacionRoutes");
const pushRoutes = require("./routes/pushRoutes");
const { startMetarPoller } = require("./services/metarService");
const { asegurarProximaSemanaDisponible } = require("./utils/adminHelpers");
const globalErrorHandler = require("./middlewares/errorMiddleware");

process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION! Apagando...");
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

const app = express();
app.set('trust proxy', 1);
const httpServer = http.createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
  ];

const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-proyeccion-key"],
};

const io = new Server(httpServer, { cors: corsOptions });
app.set("io", io);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // HSTS: fuerza HTTPS en el navegador por 180 días (defensa contra MITM /
  // SSL-stripping). El TLS lo terminan Railway/Vercel; esto lo refuerza en cliente.
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: false },
}));

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── Rate limiting global (anti-DDoS / fuerza bruta) ─────────────────────────
// Límite amplio por IP sobre toda la API. El login tiene un límite más estricto
// propio (routes/authRoutes.js). 'trust proxy' (arriba) hace que se use la IP
// real del cliente detrás del proxy de Railway, no la del proxy.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  // 1200 req/min por IP (~20/seg). Margen amplio: en la escuela muchos usuarios
  // comparten la misma IP pública (NAT), así que un límite bajo los bloquearía.
  // Subido de 600→1200 con más usuarios simultáneos (Proyección refresca cada
  // 20s + socket.io en modo polling por dispositivo); no protege autenticación
  // (eso lo hace authLimiter) así que subirlo no debilita la defensa contra
  // fuerza bruta, solo da margen de capacidad.
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas peticiones. Bajá el ritmo e intentá de nuevo en un momento." },
});
app.use("/api", globalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.get("/api/health", async (req, res) => {
  try {
    const r = await db.query("SELECT NOW() as now");
    res.json({ ok: true, db_time: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

db.query("SELECT NOW()")
  .then(res => console.log("Hora BD:", res.rows[0]))
  .catch(err => console.error("Error BD:", err.message));

app.use("/api/auth", authRoutes);
app.use("/api/alumno", alumnoRoutes);
app.use("/api/agendar", agendarRoutes);
app.use("/api/programacion", programacionController);
app.use("/api/admin", adminController);
app.use("/api/usuario", usuarioController);
app.use("/api/calendario", calendarioRoutes);
app.use("/api/turno", turnoRoutes);
app.use("/api/instructor", instructorRoutes);
app.use("/api/metar", metarRoutes);
app.use("/api/administracion", administracionRoutes);
app.use("/api/taller", tallerRoutes);
app.use("/api/notificaciones", notificacionRoutes);
app.use("/api/push", pushRoutes);

app.use(globalErrorHandler);

startMetarPoller();

// Garantiza que siempre exista una semana_vuelo futura para que el
// auto-agendamiento del alumno y el calendario de Programación nunca se
// queden sin "semana siguiente" — antes dependía de que alguien publicara
// una semana manualmente para que se creara la próxima como efecto
// secundario. Revisa al arrancar y luego una vez al día; no hace nada si ya
// existe una semana futura.
const UN_DIA_MS = 24 * 60 * 60 * 1000;
asegurarProximaSemanaDisponible().catch((e) =>
  console.error("Error asegurando semana futura (arranque):", e)
);
setInterval(() => {
  asegurarProximaSemanaDisponible().catch((e) =>
    console.error("Error asegurando semana futura:", e)
  );
}, UN_DIA_MS);

// Sincroniza activa/estado de la flota con los mantenimientos que cubren HOY:
// un avión sale de servicio cuando entra la ventana de su mantenimiento y vuelve
// cuando pasa (o al completarlo/eliminarlo). Así un mantenimiento futuro no
// bloquea el avión hoy ni en fechas fuera de su ventana. Al arrancar y 1×/día.
const { sincronizarEstadoFlota } = require("./utils/mantenimientoUtils");
sincronizarEstadoFlota().catch((e) =>
  console.error("Error sincronizando flota por mantenimiento (arranque):", e)
);
setInterval(() => {
  sincronizarEstadoFlota().catch((e) =>
    console.error("Error sincronizando flota por mantenimiento:", e)
  );
}, UN_DIA_MS);

// Lista de espera (stand-by): expira ofertas vencidas y ofrece al siguiente
// candidato. Cada 5 minutos (el plazo de respuesta es de horas, no hace falta más).
const { expirarOfertasVencidas } = require("./controllers/standbyController");
setInterval(() => {
  expirarOfertasVencidas(io).catch((e) => console.error("Error job stand-by:", e));
}, 5 * 60 * 1000);

setInterval(async () => {
  const nowSV = DateTime.now().setZone("America/El_Salvador");
  const horaActual = nowSV.toFormat("HH:mm:00");

  try {
    const result = await db.query(
      `SELECT id_bloque, hora_inicio FROM bloque_horario WHERE hora_inicio = $1::time`,
      [horaActual]
    );
    for (const bloque of result.rows) {
      io.emit("bloque_iniciado", { id_bloque: bloque.id_bloque, hora_inicio: bloque.hora_inicio });
    }
  } catch (e) {
    console.error("Error bloque_iniciado job:", e);
  }
}, 60000);

setInterval(async () => {
  try {
    const r = await db.query(`
      SELECT v.id_vuelo
      FROM vuelo v
      JOIN LATERAL (
        SELECT registrado_en
        FROM vuelo_estado_tiempo
        WHERE id_vuelo = v.id_vuelo AND estado = 'SALIDA_HANGAR'
        ORDER BY registrado_en DESC
        LIMIT 1
      ) vet ON true
      WHERE v.estado = 'SALIDA_HANGAR'
        AND vet.registrado_en <= NOW() - INTERVAL '15 minutes'
        AND v.dia_semana = EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'America/El_Salvador'))::int
        AND EXISTS (
          SELECT 1 FROM semana_vuelo sw
          WHERE sw.id_semana = v.id_semana
            AND (NOW() AT TIME ZONE 'America/El_Salvador')::date BETWEEN sw.fecha_inicio AND sw.fecha_fin
            AND sw.publicada = true
        )
    `);

    for (const row of r.rows) {
      const upd = await db.query(
        `UPDATE vuelo SET estado = 'EN_PROGRESO'
         WHERE id_vuelo = $1 AND estado = 'SALIDA_HANGAR'
         RETURNING id_vuelo`,
        [row.id_vuelo]
      );
      if (upd.rows.length === 0) continue;

      const ts = await db.query(
        `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
         VALUES ($1, 'EN_PROGRESO', NULL) RETURNING (registrado_en AT TIME ZONE 'America/El_Salvador') AS registrado_en`,
        [row.id_vuelo]
      );

      io.emit("vuelo_estado_changed", {
        id_vuelo: row.id_vuelo,
        estado: "EN_PROGRESO",
        registrado_en: ts.rows[0].registrado_en,
        auto: true,
      });
      console.log(`[auto] Vuelo #${row.id_vuelo}: SALIDA_HANGAR → EN_PROGRESO`);
    }
  } catch (e) {
    console.error("Error auto-avance SALIDA_HANGAR:", e);
  }
}, 60000);

const { logAuditoria } = require("./utils/auditoria");

// Verifica una sola vez al arrancar si el schema soporta el job de auto-reanudación
let _autoReanudacionEnabled = null;
async function checkAutoReanudacionEnabled() {
  if (_autoReanudacionEnabled !== null) return _autoReanudacionEnabled;
  try {
    const r = await db.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'estado_operaciones' AND column_name = 'bloques_suspendidos'
      LIMIT 1
    `);
    _autoReanudacionEnabled = r.rows.length > 0;
    if (!_autoReanudacionEnabled) {
      console.warn("[server] Job auto-reanudación deshabilitado: falta columna estado_operaciones.bloques_suspendidos");
    }
  } catch {
    _autoReanudacionEnabled = false;
  }
  return _autoReanudacionEnabled;
}

setInterval(async () => {
  if (!(await checkAutoReanudacionEnabled())) return;
  try {
    const opsRes = await db.query(`
      SELECT estado_general, bloques_suspendidos
      FROM estado_operaciones
      WHERE estado_general = 'INACTIVO'
      LIMIT 1
    `);

    if (opsRes.rows.length === 0) return;

    const { bloques_suspendidos } = opsRes.rows[0];
    if (!bloques_suspendidos || (Array.isArray(bloques_suspendidos) && bloques_suspendidos.length === 0)) return;

    const ids = typeof bloques_suspendidos === 'string' ? JSON.parse(bloques_suspendidos) : bloques_suspendidos;
    if (!Array.isArray(ids) || ids.length === 0) return;

    const maxFinRes = await db.query(
      `SELECT MAX(hora_fin) as max_fin FROM bloque_horario WHERE id_bloque = ANY($1)`,
      [ids.map(Number)]
    );

    const maxFin = maxFinRes.rows[0].max_fin;
    if (!maxFin) return;

    const nowSV = DateTime.now().setZone("America/El_Salvador");
    const nowTime = nowSV.toFormat("HH:mm:ss");

    if (nowTime > maxFin) {
      console.log(`[auto-ops] Reanudando operaciones automáticamente: ${nowTime} > ${maxFin}`);

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        await client.query(`
          UPDATE estado_operaciones 
          SET estado_general = 'ACTIVO', 
              motivo_inactivo = NULL, 
              bloques_suspendidos = '[]',
              temperatura = NULL,
              explicacion_detallada = NULL
        `);

        await client.query(`
          UPDATE mensaje_turno 
          SET activo = false 
          WHERE tipo = 'TURNO' AND contenido LIKE 'OPERACIONES SUSPENDIDAS%'
        `);

        await logAuditoria(client, {
          accion: 'OTRO',
          entidad: 'operaciones',
          descripcion: `REANUDACIÓN AUTOMÁTICA: Las operaciones se han reanudado automáticamente al finalizar el bloque programado (${maxFin}).`,
          actor: { id_usuario: null, rol: 'SYSTEM' },
          origen: 'SYSTEM_JOB'
        });

        await client.query("COMMIT");

        const payload = {
          estado_general: "ACTIVO",
          motivo_inactivo: null,
          bloques_suspendidos: [],
          temperatura: null,
          explicacion_detallada: null
        };
        io.emit("estado_operaciones_changed", payload);
        io.emit("nuevo_ticker", { action: 'clear_all' });

      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
  } catch (e) {
    console.error("Error en job de auto-reanudación de operaciones:", e);
  }
}, 60000);

const PORT = process.env.PORT || 5000;
const server = httpServer.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
);

process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION!");
  console.error(err?.name, err?.message);

  // Errores transitorios de conexión a la BD (p.ej. el pooler de Supabase
  // recicla conexiones: FATAL 57P01 "terminating connection due to
  // administrator command", o cortes de red). El pool se recupera solo;
  // apagar el proceso por esto dejaba la API caída en producción.
  const code = err?.code;
  const msg = String(err?.message || "");
  const esTransitorioDB =
    code === "57P01" || code === "ECONNRESET" || code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" || /terminating connection|Connection terminated/i.test(msg);
  if (esTransitorioDB) {
    console.error("(Error transitorio de BD — el servidor sigue corriendo)");
    return;
  }

  console.error("Apagando suavemente...");
  server.close(() => {
    process.exit(1);
  });
  // server.close() espera a que cierren TODOS los sockets (socket.io los
  // mantiene vivos) → sin este límite el proceso quedaba zombie: ni servía
  // peticiones ni salía, y Railway no lo reiniciaba (502 permanente).
  setTimeout(() => {
    console.error("Cierre forzado tras 10s (sockets aún abiertos).");
    process.exit(1);
  }, 10000).unref();
});

