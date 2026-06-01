import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import { getMiAulaVirtual } from "../../services/alumnoApi";
import "./AulaVirtual.css";

const MOCK = {
  cursos: [
    { id_curso: 1, codigo: "PP", nombre: "Piloto Privado", fecha_inicio: "2026-02-10", estado_inscripcion: "ACTIVO" }
  ],
  unidades: [
    { id_unidad: 1,  numero: 1,  nombre: "Regulaciones aéreas",                 horas_estimadas: 4, curso_codigo: "PP", estado: "COMPLETADA", horas_acumuladas: 4 },
    { id_unidad: 2,  numero: 2,  nombre: "Conocimiento general de aeronaves",   horas_estimadas: 4, curso_codigo: "PP", estado: "COMPLETADA", horas_acumuladas: 4 },
    { id_unidad: 3,  numero: 3,  nombre: "Performance y planeamiento de vuelo", horas_estimadas: 4, curso_codigo: "PP", estado: "COMPLETADA", horas_acumuladas: 4 },
    { id_unidad: 4,  numero: 4,  nombre: "Capacidades humanas (Factores)",      horas_estimadas: 3, curso_codigo: "PP", estado: "EN_PROGRESO", horas_acumuladas: 2 },
    { id_unidad: 5,  numero: 5,  nombre: "Meteorología",                        horas_estimadas: 5, curso_codigo: "PP", estado: "NO_INICIADA", horas_acumuladas: 0 },
    { id_unidad: 6,  numero: 6,  nombre: "Navegación",                          horas_estimadas: 6, curso_codigo: "PP", estado: "NO_INICIADA", horas_acumuladas: 0 },
    { id_unidad: 7,  numero: 7,  nombre: "Procedimientos operacionales",        horas_estimadas: 3, curso_codigo: "PP", estado: "NO_INICIADA", horas_acumuladas: 0 },
    { id_unidad: 8,  numero: 8,  nombre: "Principios de vuelo",                 horas_estimadas: 4, curso_codigo: "PP", estado: "NO_INICIADA", horas_acumuladas: 0 },
    { id_unidad: 9,  numero: 9,  nombre: "Comunicaciones y radiotelefonía",     horas_estimadas: 3, curso_codigo: "PP", estado: "NO_INICIADA", horas_acumuladas: 0 },
    { id_unidad: 10, numero: 10, nombre: "Examen integrador AAC",               horas_estimadas: 4, curso_codigo: "PP", estado: "NO_INICIADA", horas_acumuladas: 0 }
  ],
  evaluaciones: [
    { id: 1, nombre: "Examen unidad 3 - Performance",  tipo: "EXAMEN", curso_codigo: "PP", unidad_numero: 3, fecha_programada: "2026-03-12", puntos_max: 100, nota_aprobacion: 70, estado: "CALIFICADA", nota: 88.5, calificado_en: "2026-03-12" },
    { id: 2, nombre: "Quiz factores humanos",          tipo: "QUIZ",   curso_codigo: "PP", unidad_numero: 4, fecha_programada: "2026-05-22", puntos_max: 20,  nota_aprobacion: 14, estado: "PENDIENTE",  nota: null },
    { id: 3, nombre: "Tarea principios de vuelo",      tipo: "TAREA",  curso_codigo: "PP", unidad_numero: 8, fecha_programada: "2026-06-01", puntos_max: 100, nota_aprobacion: 70, estado: "PENDIENTE",  nota: null },
    { id: 4, nombre: "Examen unidad 2 - Aeronaves",    tipo: "EXAMEN", curso_codigo: "PP", unidad_numero: 2, fecha_programada: "2026-03-01", puntos_max: 100, nota_aprobacion: 70, estado: "CALIFICADA", nota: 76.0, calificado_en: "2026-03-01" },
    { id: 5, nombre: "Examen unidad 1 - Regulaciones", tipo: "EXAMEN", curso_codigo: "PP", unidad_numero: 1, fecha_programada: "2026-02-20", puntos_max: 100, nota_aprobacion: 70, estado: "CALIFICADA", nota: 92.0, calificado_en: "2026-02-20" }
  ]
};

const ESTADO_INFO = {
  NO_INICIADA: { color: "#9ca3af", bg: "#f3f4f6", icon: "bi-circle",         label: "No iniciada" },
  EN_PROGRESO: { color: "#1d4ed8", bg: "#dbeafe", icon: "bi-arrow-clockwise", label: "En progreso" },
  COMPLETADA:  { color: "#065f46", bg: "#d1fae5", icon: "bi-check-circle-fill", label: "Completada" },
  REPROBADA:   { color: "#7f1d1d", bg: "#fee2e2", icon: "bi-x-circle-fill",  label: "Reprobada" }
};

const TIPO_INFO = {
  EXAMEN:    { icon: "bi-clipboard-check", color: "#1B365D" },
  QUIZ:      { icon: "bi-lightning",       color: "#0f5132" },
  TAREA:     { icon: "bi-pencil-square",   color: "#7c2d12" },
  PRACTICA:  { icon: "bi-airplane",        color: "#157347" },
  FINAL:     { icon: "bi-trophy",          color: "#b8860b" }
};

const fmtFecha = (f) => f ? new Date(f).toLocaleDateString("es-SV", { day:"2-digit", month:"short", year:"numeric" }) : "—";

export default function AulaVirtual() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [usingMock, setUsingMock] = useState(false);
  const [tab, setTab] = useState("unidades");

  useEffect(() => {
    (async () => {
      try {
        const r = await getMiAulaVirtual();
        if (r?.ok) { setData(r.data); setUsingMock(false); }
        else { setData(MOCK); setUsingMock(true); }
      } catch {
        setData(MOCK); setUsingMock(true);
      }
    })();
  }, []);

  if (!data) return <div><Header /><div style={{padding: 40}}>Cargando aula virtual...</div></div>;

  const cursoActivo = data.cursos?.[0];
  const unidades = data.unidades || [];
  const evaluaciones = data.evaluaciones || [];

  const totalUnidades = unidades.length;
  const completadas   = unidades.filter(u => u.estado === 'COMPLETADA').length;
  const enProgreso    = unidades.filter(u => u.estado === 'EN_PROGRESO').length;
  const pct           = totalUnidades > 0 ? Math.round((completadas / totalUnidades) * 100) : 0;

  const pendientes      = evaluaciones.filter(e => e.estado === 'PENDIENTE' || e.estado === 'PRESENTADA');
  const calificadas     = evaluaciones.filter(e => e.estado === 'CALIFICADA');
  const promedio        = calificadas.length > 0
                          ? (calificadas.reduce((s, e) => s + Number(e.nota || 0), 0) / calificadas.length).toFixed(1)
                          : null;
  const aprobadas       = calificadas.filter(e => Number(e.nota) >= Number(e.nota_aprobacion)).length;

  const horasTotalesEst    = unidades.reduce((s, u) => s + Number(u.horas_estimadas || 0), 0);
  const horasCompletadasA  = unidades.filter(u => u.estado === 'COMPLETADA')
                                    .reduce((s, u) => s + Number(u.horas_estimadas || 0), 0);

  return (
    <div className="av-container">
      <Header />

      <div className="av-content">
        <div className="av-header">
          <button onClick={() => navigate("/alumno/dashboard")} className="av-back">
            <i className="bi bi-arrow-left"></i> Volver al dashboard
          </button>
          <div>
            <h1>
              <i className="bi bi-mortarboard-fill" style={{ marginRight: 10, color: "#1B365D" }}></i>
              Aula Virtual
            </h1>
            <p className="av-subtitle">
              Progreso teórico del curso, calificaciones y evaluaciones.
              {usingMock && <span className="av-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
            </p>
          </div>
        </div>

        {/* Resumen del curso activo */}
        {cursoActivo && (
          <div className="av-curso-card">
            <div className="av-curso-info">
              <div className="av-curso-codigo">CURSO {cursoActivo.codigo}</div>
              <h2>{cursoActivo.nombre}</h2>
              <div className="av-curso-meta">
                <i className="bi bi-calendar-event me-2"></i>
                Inicio: {fmtFecha(cursoActivo.fecha_inicio)}
              </div>
            </div>
            <div className="av-progress-circle">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="10"/>
                <circle cx="60" cy="60" r="50" fill="none" stroke="#1B365D" strokeWidth="10"
                  strokeDasharray={`${(pct/100) * 2 * Math.PI * 50} ${2 * Math.PI * 50}`}
                  strokeDashoffset={`${0.25 * 2 * Math.PI * 50}`}
                  transform="rotate(-90 60 60)" strokeLinecap="round"/>
                <text x="60" y="65" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1B365D">{pct}%</text>
              </svg>
              <div className="av-progress-label">{completadas} / {totalUnidades} unidades</div>
            </div>
          </div>
        )}

        {/* Listo para comité con la AAC */}
        {cursoActivo?.listo_para_comite && (
          <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 12, padding: "16px 20px", margin: "16px 0", display: "flex", alignItems: "center", gap: 12 }}>
            <i className="bi bi-trophy-fill" style={{ fontSize: 24, color: "#157347" }}></i>
            <div>
              <strong style={{ color: "#065f46" }}>¡Aprobaste tu examen final interno!</strong>
              <div style={{ fontSize: "0.9rem", color: "#047857" }}>
                Ya estás listo para solicitar tu comité (chequeo) con la Autoridad de Aviación Civil (AAC). Coordiná con la escuela.
              </div>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="av-kpis">
          <div className="av-kpi blue">
            <div className="av-kpi-label">Unidades completadas</div>
            <div className="av-kpi-value">{completadas} <span className="av-kpi-sub">/ {totalUnidades}</span></div>
            <div className="av-kpi-hint">{horasCompletadasA} de {horasTotalesEst} horas</div>
          </div>
          <div className="av-kpi green">
            <div className="av-kpi-label">Promedio general</div>
            <div className="av-kpi-value">{promedio ?? "—"}</div>
            <div className="av-kpi-hint">{aprobadas} / {calificadas.length} evaluaciones aprobadas</div>
          </div>
          <div className="av-kpi amber">
            <div className="av-kpi-label">Evaluaciones pendientes</div>
            <div className="av-kpi-value">{pendientes.length}</div>
            <div className="av-kpi-hint">{pendientes.length > 0 ? "Próxima: " + (pendientes[0]?.nombre || "—") : "Sin pendientes"}</div>
          </div>
          <div className="av-kpi violet">
            <div className="av-kpi-label">En curso ahora</div>
            <div className="av-kpi-value">{enProgreso}</div>
            <div className="av-kpi-hint">{unidades.find(u => u.estado === 'EN_PROGRESO')?.nombre || "Ninguna unidad activa"}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="av-tabs">
          <button className={`av-tab ${tab === 'unidades' ? 'active' : ''}`} onClick={() => setTab('unidades')}>
            <i className="bi bi-book"></i>Unidades teóricas
          </button>
          <button className={`av-tab ${tab === 'eval' ? 'active' : ''}`} onClick={() => setTab('eval')}>
            <i className="bi bi-clipboard-check"></i>Evaluaciones y notas
          </button>
        </div>

        {tab === 'unidades' && (
          <div className="av-unidades-grid">
            {unidades.map((u) => {
              const info = ESTADO_INFO[u.estado] || ESTADO_INFO.NO_INICIADA;
              const pctU = u.horas_estimadas > 0
                          ? Math.min(100, (Number(u.horas_acumuladas || 0) / Number(u.horas_estimadas)) * 100)
                          : (u.estado === 'COMPLETADA' ? 100 : 0);
              return (
                <div key={u.id_unidad} className="av-unidad-card" style={{ borderLeft: `5px solid ${info.color}` }}>
                  <div className="av-unidad-header">
                    <div className="av-unidad-numero">UNIDAD {u.numero}</div>
                    <span className="av-unidad-tag" style={{ background: info.bg, color: info.color }}>
                      <i className={`bi ${info.icon}`}></i> {info.label}
                    </span>
                  </div>
                  <h3>{u.nombre}</h3>
                  {u.descripcion && <p className="av-unidad-desc">{u.descripcion}</p>}
                  <div className="av-unidad-progress">
                    <div className="av-progress-bar">
                      <div className="av-progress-fill"
                        style={{ width: `${pctU}%`, background: info.color }}></div>
                    </div>
                    <div className="av-progress-text">
                      {Number(u.horas_acumuladas || 0).toFixed(1)} / {u.horas_estimadas} h
                    </div>
                  </div>
                  {u.observaciones && (
                    <div className="av-observaciones">
                      <i className="bi bi-chat-square-quote me-1"></i>{u.observaciones}
                    </div>
                  )}
                </div>
              );
            })}
            {unidades.length === 0 && (
              <div className="av-empty">
                <i className="bi bi-info-circle" style={{ fontSize: "3rem", color: "#9ca3af" }}></i>
                <p>Aún no estás inscrito en ningún curso con unidades teóricas.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'eval' && (
          <>
            {pendientes.length > 0 && (
              <div className="av-section">
                <h2 className="av-section-title">
                  <i className="bi bi-clock-history" style={{ color: "#b8860b" }}></i>Pendientes
                </h2>
                <div className="av-evals">
                  {pendientes.map(e => {
                    const tipo = TIPO_INFO[e.tipo] || TIPO_INFO.EXAMEN;
                    return (
                      <div key={e.id} className="av-eval-card pendiente">
                        <div className="av-eval-icon" style={{ background: tipo.color }}>
                          <i className={`bi ${tipo.icon}`}></i>
                        </div>
                        <div className="av-eval-content">
                          <div className="av-eval-tipo">
                            {e.tipo} · {e.curso_codigo} {e.unidad_numero ? `· Unidad ${e.unidad_numero}` : ''}
                            {e.origen === 'AAC' && <span style={{ marginLeft: 6, fontSize: "0.7rem", fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 999 }}>AAC</span>}
                          </div>
                          <h4>{e.nombre}</h4>
                          <div className="av-eval-meta">
                            <span><i className="bi bi-calendar"></i> {fmtFecha(e.fecha_programada)}</span>
                            <span><i className="bi bi-bullseye"></i> Puntos máx: {e.puntos_max}</span>
                            <span><i className="bi bi-check-square"></i> Aprueba: {e.nota_aprobacion}</span>
                          </div>
                        </div>
                        <div className="av-eval-status pendiente">PENDIENTE</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {calificadas.length > 0 && (
              <div className="av-section">
                <h2 className="av-section-title">
                  <i className="bi bi-trophy-fill" style={{ color: "#157347" }}></i>Notas obtenidas
                </h2>
                <div className="av-evals">
                  {calificadas.map(e => {
                    const tipo = TIPO_INFO[e.tipo] || TIPO_INFO.EXAMEN;
                    const aprobada = Number(e.nota) >= Number(e.nota_aprobacion);
                    return (
                      <div key={e.id} className={`av-eval-card ${aprobada ? 'aprobada' : 'reprobada'}`}>
                        <div className="av-eval-icon" style={{ background: tipo.color }}>
                          <i className={`bi ${tipo.icon}`}></i>
                        </div>
                        <div className="av-eval-content">
                          <div className="av-eval-tipo">
                            {e.tipo} · {e.curso_codigo} {e.unidad_numero ? `· Unidad ${e.unidad_numero}` : ''}
                            {e.origen === 'AAC' && <span style={{ marginLeft: 6, fontSize: "0.7rem", fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 999 }}>AAC</span>}
                          </div>
                          <h4>{e.nombre}</h4>
                          <div className="av-eval-meta">
                            <span><i className="bi bi-calendar-check"></i> {fmtFecha(e.calificado_en || e.fecha_programada)}</span>
                            <span>Aprueba: {e.nota_aprobacion}</span>
                          </div>
                          {e.observaciones && <p className="av-eval-obs"><i className="bi bi-chat-left-text"></i> {e.observaciones}</p>}
                        </div>
                        <div className={`av-eval-nota ${aprobada ? 'pos' : 'neg'}`}>
                          <div className="av-eval-nota-value">{Number(e.nota).toFixed(1)}</div>
                          <div className="av-eval-nota-label">/ {e.puntos_max}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {evaluaciones.length === 0 && (
              <div className="av-empty">
                <i className="bi bi-clipboard" style={{ fontSize: "3rem", color: "#9ca3af" }}></i>
                <p>Aún no tienes evaluaciones asignadas.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
