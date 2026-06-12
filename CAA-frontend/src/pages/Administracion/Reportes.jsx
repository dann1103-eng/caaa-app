import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPyL, getIngresos, getEgresosReport, getMorosos } from "../../services/administracionApi";
import { abrirReporteVuelosDia } from "../../services/turnoApi";
import { fmtMes } from "../../utils/fechas";

const MOCK_PYL = { ingresos: 45230.00, egresos: 28600.50, facturado: 41200.00 };
const MOCK_INGRESOS = [
  { mes: "2026-05-01", total: 12450.00, num_recibos: 14 },
  { mes: "2026-04-01", total: 10880.00, num_recibos: 12 },
  { mes: "2026-03-01", total:  9700.00, num_recibos: 11 },
  { mes: "2026-02-01", total: 12200.00, num_recibos: 15 }
];
const MOCK_EGRESOS = [
  { categoria: "NOMINA",        total: 13600.00, num: 2 },
  { categoria: "COMBUSTIBLE",   total:  8500.00, num: 4 },
  { categoria: "MANTENIMIENTO", total:  4200.00, num: 6 },
  { categoria: "SERVICIOS",     total:   980.00, num: 4 },
  { categoria: "SUMINISTROS",   total:   320.50, num: 3 }
];

export default function Reportes() {
  const [pyl, setPyl] = useState(MOCK_PYL);
  const [ingresos, setIngresos] = useState(MOCK_INGRESOS);
  const [egresos, setEgresos] = useState(MOCK_EGRESOS);
  const [morosos, setMorosos] = useState([]);
  const [usingMock, setUsingMock] = useState(false);

  // Reporte operativo "Vuelos por avión" (cierre de ventas del día, mismo PDF de Turno)
  const hoyISO = new Date().toLocaleDateString("sv-SE", { timeZone: "America/El_Salvador" });
  const [vuelosFecha, setVuelosFecha] = useState(hoyISO);
  const [generandoVuelos, setGenerandoVuelos] = useState(false);

  const handleReporteVuelos = async () => {
    setGenerandoVuelos(true);
    try {
      await abrirReporteVuelosDia(vuelosFecha);
    } catch {
      toast.error("No se pudo generar el reporte de vuelos");
    } finally {
      setGenerandoVuelos(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [p, i, e, m] = await Promise.all([getPyL(), getIngresos(), getEgresosReport(), getMorosos()]);
        if (p?.ok && i?.ok && e?.ok) {
          setPyl(p.data); setIngresos(i.data); setEgresos(e.data); setMorosos(m?.data || []);
          setUsingMock(false);
        } else throw new Error();
      } catch {
        setUsingMock(true);
      }
    })();
  }, []);

  const maxIng = Math.max(...ingresos.map(i => Number(i.total)), 1);
  const maxEgr = Math.max(...egresos.map(e => Number(e.total)), 1);
  const margen = Number(pyl.ingresos) - Number(pyl.egresos);

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-bar-chart"></i>Reportes Financieros</h1>
      <p className="adf-section-subtitle">
        Análisis del periodo 2026. Ingresos, egresos, P&amp;L y alumnos morosos.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      {/* Reporte de vuelos del día (cierre de ventas) — mismo PDF que genera Turno */}
      <div className="adf-card" style={{ marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--c-brand-900)" }}>
            <i className="bi bi-file-earmark-pdf me-2" style={{ color: "var(--c-brand-700)" }}></i>
            Vuelos por avión (cierre del día)
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--c-ink-3)", marginTop: 4 }}>
            Vuelos completados de la fecha con tacómetro, hobbs y monto debitado — el reporte de ventas diario.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="date"
            value={vuelosFecha}
            max={hoyISO}
            onChange={(e) => setVuelosFecha(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--c-line-2)", fontSize: "0.85rem" }}
          />
          <button className="adf-btn" disabled={generandoVuelos} onClick={handleReporteVuelos}>
            <i className="bi bi-download"></i>
            {generandoVuelos ? "Generando…" : "Generar PDF"}
          </button>
        </div>
      </div>

      <div className="adf-kpi-grid" style={{ marginBottom: 22 }}>
        <div className="adf-kpi-card">
          <div className="adf-kpi-card__label">Ingresos acumulados</div>
          <div className="adf-kpi-card__value">${Number(pyl.ingresos).toLocaleString()}</div>
        </div>
        <div className="adf-kpi-card red">
          <div className="adf-kpi-card__label">Egresos acumulados</div>
          <div className="adf-kpi-card__value">${Number(pyl.egresos).toLocaleString()}</div>
        </div>
        <div className={`adf-kpi-card ${margen >= 0 ? '' : 'red'}`}>
          <div className="adf-kpi-card__label">Margen del periodo</div>
          <div className="adf-kpi-card__value">${margen.toLocaleString()}</div>
        </div>
        <div className="adf-kpi-card blue">
          <div className="adf-kpi-card__label">Total facturado</div>
          <div className="adf-kpi-card__value">${Number(pyl.facturado).toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <div className="adf-card">
          <h3><i className="bi bi-graph-up me-2"></i>Ingresos por mes</h3>
          {ingresos.map((row, idx) => {
            const pct = (Number(row.total) / maxIng) * 100;
            return (
              <div key={idx} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{fmtMes(row.mes)}</span>
                  <span style={{ color: "var(--c-ink-3)" }}>${Number(row.total).toLocaleString()} ({row.num_recibos} recibos)</span>
                </div>
                <div style={{ width: "100%", height: 14, background: "var(--c-accent-50)", borderRadius: 4 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--c-accent-500)", borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="adf-card">
          <h3><i className="bi bi-pie-chart me-2"></i>Egresos por categoría</h3>
          {egresos.map((row, idx) => {
            const pct = (Number(row.total) / maxEgr) * 100;
            return (
              <div key={idx} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{row.categoria}</span>
                  <span style={{ color: "var(--c-ink-3)" }}>${Number(row.total).toLocaleString()} ({row.num})</span>
                </div>
                <div style={{ width: "100%", height: 14, background: "var(--c-danger-50)", borderRadius: 4 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--c-danger-500)", borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="adf-card">
        <h3><i className="bi bi-download me-2"></i>Exportar reportes</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="adf-btn secondary"><i className="bi bi-file-earmark-excel"></i>Excel — Ingresos</button>
          <button className="adf-btn secondary"><i className="bi bi-file-earmark-excel"></i>Excel — Egresos</button>
          <button className="adf-btn secondary"><i className="bi bi-file-earmark-pdf"></i>PDF — P&amp;L</button>
          <button className="adf-btn secondary"><i className="bi bi-file-earmark-pdf"></i>PDF — Estado de cuentas alumnos</button>
        </div>
      </div>
    </div>
  );
}
