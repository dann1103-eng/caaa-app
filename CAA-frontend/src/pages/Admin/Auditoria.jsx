import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAuditoria, getAccionesAuditoria } from "../../services/adminApi";
import "./Auditoria.css";

const COLS = ["Fecha", "Usuario", "Rol", "Acción", "Entidad", "Descripción", "IP"];

function formatFechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function JsonBlock({ data, label }) {
  if (data == null) return null;
  return (
    <div className="aud-json-block">
      <div className="aud-json-label">{label}</div>
      <pre className="aud-json-pre">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

const FILTROS_VACIOS = {
  accion: "",
  usuario: "",
  entidad: "",
  fecha_desde: "",
  fecha_hasta: "",
};

export default function AuditoriaAdmin() {
  const navigate = useNavigate();

  const [acciones, setAcciones]     = useState([]);
  const [filtros, setFiltros]       = useState(FILTROS_VACIOS);
  const [aplicados, setAplicados]   = useState(FILTROS_VACIOS); // los filtros activos
  const [page, setPage]             = useState(1);
  const [data, setData]             = useState({ total: 0, paginas: 1, registros: [] });
  const [loading, setLoading]       = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // ── Cargar acciones del enum una sola vez ──────────────────────────────────
  useEffect(() => {
    getAccionesAuditoria().then(setAcciones).catch(() => {});
  }, []);

  // ── Cargar registros cuando cambian filtros aplicados o página ─────────────
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page };
      if (aplicados.accion)      params.accion      = aplicados.accion;
      if (aplicados.usuario)     params.usuario     = aplicados.usuario;
      if (aplicados.entidad)     params.entidad     = aplicados.entidad;
      if (aplicados.fecha_desde) params.fecha_desde = aplicados.fecha_desde;
      if (aplicados.fecha_hasta) params.fecha_hasta = aplicados.fecha_hasta;

      const res = await getAuditoria(params);
      setData(res);
    } catch {
      setData({ total: 0, paginas: 1, registros: [] });
    } finally {
      setLoading(false);
    }
  }, [aplicados, page]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const setFiltro = (key, val) => setFiltros((prev) => ({ ...prev, [key]: val }));

  const handleBuscar = (e) => {
    e.preventDefault();
    setPage(1);
    setExpandedId(null);
    setAplicados({ ...filtros });
  };

  const handleLimpiar = () => {
    setFiltros(FILTROS_VACIOS);
    setPage(1);
    setExpandedId(null);
    setAplicados(FILTROS_VACIOS);
  };

  const toggleExpand = (id) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <>

      <div className="aud">
        {/* ── Cabecera ──────────────────────────────────────────────────── */}
        <div className="aud__top">
          <div className="aud__top-left">
            <div>
              <p className="aud__eyebrow">Panel de administración</p>
              <h2 className="aud__title">Registro de auditoría</h2>
              <p className="aud__subtitle">Historial de eventos del sistema</p>
            </div>
          </div>
          <div className="aud__counter">
            {!loading && (
              <span>{data.total} registro{data.total !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <form className="aud__filters" onSubmit={handleBuscar}>
          <div className="aud__filter-group">
            <label className="aud__filter-label">Acción</label>
            <select
              className="aud__filter-input"
              value={filtros.accion}
              onChange={(e) => setFiltro("accion", e.target.value)}
            >
              <option value="">Todas</option>
              {acciones.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="aud__filter-group">
            <label className="aud__filter-label">Usuario</label>
            <input
              className="aud__filter-input"
              type="text"
              placeholder="Nombre o usuario…"
              value={filtros.usuario}
              onChange={(e) => setFiltro("usuario", e.target.value)}
            />
          </div>

          <div className="aud__filter-group">
            <label className="aud__filter-label">Entidad</label>
            <input
              className="aud__filter-input"
              type="text"
              placeholder="vuelo, alumno…"
              value={filtros.entidad}
              onChange={(e) => setFiltro("entidad", e.target.value)}
            />
          </div>

          <div className="aud__filter-group">
            <label className="aud__filter-label">Desde</label>
            <input
              className="aud__filter-input"
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => setFiltro("fecha_desde", e.target.value)}
            />
          </div>

          <div className="aud__filter-group">
            <label className="aud__filter-label">Hasta</label>
            <input
              className="aud__filter-input"
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => setFiltro("fecha_hasta", e.target.value)}
            />
          </div>

          <div className="aud__filter-actions">
            <button type="submit" className="aud__btn aud__btn--primary">
              Buscar
            </button>
            <button type="button" className="aud__btn" onClick={handleLimpiar}>
              Limpiar
            </button>
          </div>
        </form>

        {/* ── Tabla ─────────────────────────────────────────────────────── */}
        <div className="aud__table-wrapper">
          {loading ? (
            <p className="aud__loading">Cargando…</p>
          ) : data.registros.length === 0 ? (
            <p className="aud__empty">No hay registros que coincidan con los filtros.</p>
          ) : (
            <table className="aud__table">
              <thead>
                <tr>
                  {COLS.map((c) => <th key={c}>{c}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.registros.map((r) => {
                  const isExpanded = expandedId === r.id_evento;
                  const tieneDetalle = r.before_data != null || r.after_data != null || r.metadata != null;
                  return [
                    <tr
                      key={r.id_evento}
                      className={`aud__row ${isExpanded ? "aud__row--expanded" : ""} ${tieneDetalle ? "aud__row--clickable" : ""}`}
                      onClick={() => tieneDetalle && toggleExpand(r.id_evento)}
                    >
                      <td className="aud__td-fecha">{formatFechaHora(r.creado_en)}</td>
                      <td>
                        {r.actor_nombre
                          ? `${r.actor_nombre} ${r.actor_apellido ?? ""}`.trim()
                          : r.actor_username ?? "—"}
                      </td>
                      <td>
                        <span className={`aud__rol-badge aud__rol-badge--${(r.actor_rol ?? "").toLowerCase()}`}>
                          {r.actor_rol ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span className={`aud__accion-badge aud__accion-badge--${r.accion.toLowerCase()}`}>
                          {r.accion}
                        </span>
                      </td>
                      <td className="aud__td-entidad">{r.entidad ?? "—"}</td>
                      <td className="aud__td-desc">{r.descripcion ?? "—"}</td>
                      <td className="aud__td-ip">{r.ip ?? "—"}</td>
                      <td className="aud__td-expand">
                        {tieneDetalle && (
                          <span className="aud__chevron">{isExpanded ? "▲" : "▼"}</span>
                        )}
                      </td>
                    </tr>,

                    isExpanded && (
                      <tr key={`${r.id_evento}-detail`} className="aud__row-detail">
                        <td colSpan={8}>
                          <div className="aud__detail">
                            <JsonBlock data={r.before_data} label="before_data" />
                            <JsonBlock data={r.after_data}  label="after_data" />
                            {r.before_data == null && r.after_data == null && r.metadata && (
                              <JsonBlock data={r.metadata} label="metadata" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Paginación ────────────────────────────────────────────────── */}
        {!loading && data.paginas > 1 && (
          <div className="aud__pagination">
            <button
              className="aud__page-btn"
              disabled={page <= 1}
              onClick={() => { setPage((p) => p - 1); setExpandedId(null); }}
            >
              ← Anterior
            </button>
            <span className="aud__page-info">
              Página {page} de {data.paginas}
            </span>
            <button
              className="aud__page-btn"
              disabled={page >= data.paginas}
              onClick={() => { setPage((p) => p + 1); setExpandedId(null); }}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
