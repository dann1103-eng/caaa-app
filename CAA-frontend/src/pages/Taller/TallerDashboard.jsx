import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getDashboardTaller } from "../../services/tallerApi";

function num(v, d = 1) {
  const n = parseFloat(v);
  return isNaN(n) ? "—" : n.toFixed(d);
}

function EstadoTag({ estado }) {
  const map = {
    VENCIDO: { cls: "red", txt: "Vencido" },
    PROXIMO: { cls: "amber", txt: "Próximo" },
    VIGENTE: { cls: "green", txt: "Vigente" },
    N_A: { cls: "gray", txt: "N/A" },
  };
  const m = map[estado] || map.N_A;
  return <span className={`adf-tag ${m.cls}`}>{m.txt}</span>;
}

export default function TallerDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    try {
      setData(await getDashboardTaller());
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al cargar el tablero");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) return <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>;
  if (!data) return null;

  const { kpis, aeronaves, vencimientos, repuestos_bajos } = data;

  return (
    <>
      <h2 className="adf-section-title"><i className="bi bi-speedometer2 me-2"></i>Tablero del Taller</h2>
      <p className="adf-section-subtitle">Estado de aeronavegabilidad de la flota, vencimientos e inventario.</p>

      {/* KPIs */}
      <div className="adf-kpi-grid" style={{ marginBottom: "var(--sp-5)" }}>
        <div className="adf-kpi-card">
          <div className="adf-kpi-card__label">Aeronaves</div>
          <div className="adf-kpi-card__value">{kpis.aeronaves_total}</div>
          <div className="adf-kpi-card__hint">{kpis.aeronaves_en_mantenimiento} en mantenimiento</div>
        </div>
        <div className="adf-kpi-card">
          <div className="adf-kpi-card__label">Tareas vencidas</div>
          <div className="adf-kpi-card__value" style={{ color: kpis.vencimientos_vencidos ? "var(--c-danger-600, #b42318)" : undefined }}>{kpis.vencimientos_vencidos}</div>
          <div className="adf-kpi-card__hint">requieren acción</div>
        </div>
        <div className="adf-kpi-card">
          <div className="adf-kpi-card__label">Próximas a vencer</div>
          <div className="adf-kpi-card__value">{kpis.vencimientos_proximos}</div>
          <div className="adf-kpi-card__hint">dentro de 10h / 30 días</div>
        </div>
        <div className="adf-kpi-card">
          <div className="adf-kpi-card__label">Repuestos bajo mínimo</div>
          <div className="adf-kpi-card__value">{kpis.repuestos_bajos}</div>
          <div className="adf-kpi-card__hint">reabastecer</div>
        </div>
      </div>

      {/* Estado de flota */}
      <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
        <h3 className="adf-section-title" style={{ fontSize: "1.05rem" }}>Estado de flota</h3>
        <table className="adf-table">
          <thead>
            <tr>
              <th>Aeronave</th><th>Modelo</th><th>Estado</th>
              <th className="amount">Horas acum.</th>
              <th className="amount">Próx. revisión</th>
              <th className="amount">Restantes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {aeronaves.map((a) => {
              const rest = parseFloat(a.horas_restantes);
              return (
                <tr key={a.id_aeronave}>
                  <td style={{ fontWeight: 700 }}>{a.codigo}</td>
                  <td>{a.modelo}</td>
                  <td>
                    {a.requiere_mantenimiento && <span className="adf-tag red" style={{ marginRight: 6 }}>Requiere mant.</span>}
                    <span className={`adf-tag ${a.estado === "MANTENIMIENTO" ? "amber" : "green"}`}>
                      {a.estado === "MANTENIMIENTO" ? "En mantenimiento" : "Operativa"}
                    </span>
                  </td>
                  <td className="amount">{num(a.horas_acumuladas)}h</td>
                  <td className="amount">{num(a.horas_proxima_revision)}h</td>
                  <td className={`amount ${rest <= 5 ? "neg" : ""}`}>{num(rest)}h</td>
                  <td>
                    <button className="adf-btn small secondary" onClick={() => navigate(`/taller/aeronavegabilidad?aeronave=${a.id_aeronave}`)}>
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "var(--sp-5)" }}>
        {/* Vencimientos */}
        <div className="adf-card">
          <h3 className="adf-section-title" style={{ fontSize: "1.05rem" }}>Vencimientos próximos / vencidos</h3>
          {vencimientos.length === 0 ? (
            <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Sin vencimientos pendientes. ✔</p>
          ) : (
            <table className="adf-table">
              <thead>
                <tr><th>Aeronave</th><th>Tarea</th><th>Estado</th><th className="amount">Restan</th></tr>
              </thead>
              <tbody>
                {vencimientos.map((v) => (
                  <tr key={v.id_tarea}>
                    <td style={{ fontWeight: 700 }}>{v.aeronave_codigo}</td>
                    <td>{v.nombre}{v.referencia ? ` (${v.referencia})` : ""}</td>
                    <td><EstadoTag estado={v.estado} /></td>
                    <td className="amount">
                      {v.horas_restantes != null ? `${num(v.horas_restantes)}h` : v.dias_restantes != null ? `${v.dias_restantes}d` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Repuestos bajos */}
        <div className="adf-card">
          <h3 className="adf-section-title" style={{ fontSize: "1.05rem" }}>Repuestos bajo mínimo</h3>
          {repuestos_bajos.length === 0 ? (
            <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Inventario por encima del mínimo. ✔</p>
          ) : (
            <table className="adf-table">
              <thead>
                <tr><th>Repuesto</th><th>Parte N°</th><th className="amount">Stock</th><th className="amount">Mínimo</th></tr>
              </thead>
              <tbody>
                {repuestos_bajos.map((r) => (
                  <tr key={r.id_repuesto}>
                    <td>{r.descripcion}</td>
                    <td>{r.parte_no || "—"}</td>
                    <td className="amount neg">{num(r.stock_actual, 0)} {r.unidad}</td>
                    <td className="amount">{num(r.stock_minimo, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
