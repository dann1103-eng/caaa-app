import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getKpisDashboard, getMorosos } from "../../services/administracionApi";

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MOCK_KPIS = {
  ingresos_mes: 12450.00, egresos_mes: 8920.50,
  alumnos_saldo_bajo: 3, saldo_total_alumnos: 245000.00,
  facturas_mes: 87, recibos_mes: 14
};

const TARIFAS_2026 = [
  { aero: "Cessna 152 / Tomahawk",  v: 135 },
  { aero: "Cherokee 180",           v: 200 },
  { aero: "Cherokee Arrow",         v: 220 },
  { aero: "Bimotor",                v: 600 },
  { aero: "Simulador BATD II",      v: 90  }
];
const CURSOS_2026 = [
  { codigo: "PP",    nombre: "Piloto Privado",               total: 7645 },
  { codigo: "IFR",   nombre: "Habilitación Instrumentos",    total: 7905 },
  { codigo: "CPL",   nombre: "Piloto Comercial",             total: 8745 },
  { codigo: "MULTI", nombre: "Bimotor",                      total: 4765 },
  { codigo: "INST",  nombre: "Piloto Instructor",            total: 4550 }
];

export default function Dashboard() {
  const [kpis, setKpis] = useState(MOCK_KPIS);
  const [morosos, setMorosos] = useState([]);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [k, m] = await Promise.all([getKpisDashboard(), getMorosos()]);
        if (k?.ok) setKpis(k.data);
        if (m?.ok) setMorosos(m.data || []);
      } catch {
        setUsingMock(true);
        setMorosos([
          { id_alumno: 1, username: "juan.oporto",   saldo:   45.00 },
          { id_alumno: 2, username: "maria.lopez",   saldo:  132.00 },
          { id_alumno: 3, username: "carlos.solano", saldo: -250.00 }
        ]);
      }
    })();
  }, []);

  const margen = Number(kpis.ingresos_mes || 0) - Number(kpis.egresos_mes || 0);
  const margenSigno = margen >= 0 ? "+" : "−";
  const ratioMargen = kpis.ingresos_mes > 0 ? (margen / kpis.ingresos_mes * 100) : 0;
  const totalInv = CURSOS_2026.reduce((s, c) => s + c.total, 0);

  return (
    <div>
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div className="u-label">CAAA · Administración</div>
          {usingMock && <span className="adf-tag amber">Datos demo</span>}
        </div>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginTop: 4, letterSpacing: "var(--tracking-tight)" }}>
          Resumen financiero
        </h1>
        <p style={{ color: "var(--c-ink-3)", fontSize: "var(--text-sm)", maxWidth: "70ch", marginTop: 4 }}>
          Mes en curso. Cifras agregadas de cuentas corrientes, facturación y egresos operativos.
        </p>
      </header>

      <div className="adf-kpi-grid" style={{ marginBottom: 28 }}>
        <KPI label="Ingresos del mes" tone="green" value={`$${fmt(kpis.ingresos_mes)}`}
             hint={`${kpis.recibos_mes || 0} recibos registrados`} />
        <KPI label="Egresos del mes" tone="red" value={`$${fmt(kpis.egresos_mes)}`}
             hint="Combustible · mantenimiento · nómina" />
        <KPI
          label="Margen del mes"
          tone={margen >= 0 ? "green" : "red"}
          value={`${margenSigno}$${fmt(Math.abs(margen))}`}
          hint={`${ratioMargen.toFixed(1)}% sobre ingresos`}
        />
        <KPI label="Saldo prepago alumnos" tone="blue" value={`$${fmt(kpis.saldo_total_alumnos)}`}
             hint="Pasivo total · depósitos pendientes de vuelo" />
        <KPI label="Alumnos saldo bajo" tone="amber" value={kpis.alumnos_saldo_bajo}
             hint="Saldo < $200 · revisar antes del próximo vuelo" />
        <KPI label="Facturas emitidas" tone="blue" value={kpis.facturas_mes || 0}
             hint="Mes actual · numeración correlativa única" />
      </div>

      <section style={{ marginBottom: 28 }}>
        <SectionTitle title="Alumnos con saldo bajo" hint="Saldo < $200 · prioridad de recordatorio" icon="bi-exclamation-triangle" />
        {morosos.length === 0 ? (
          <div className="adf-card" style={{ textAlign: "center", padding: 36, color: "var(--c-ink-3)" }}>
            <i className="bi bi-check-circle" style={{ fontSize: 24, color: "var(--c-accent-500)" }}></i>
            <p style={{ marginTop: 8 }}>Todos los alumnos están al día.</p>
          </div>
        ) : (
          <table className="adf-table">
            <thead>
              <tr>
                <th>Alumno</th>
                <th style={{ width: 140, textAlign: "right" }}>Saldo</th>
                <th style={{ width: 140, textAlign: "right" }}>Estado</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {morosos.map((m) => {
                const negativo = Number(m.saldo) < 0;
                return (
                  <tr key={m.id_alumno}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 24, height: 24, borderRadius: "var(--radius-pill)", background: "var(--c-surface-3)",
                                       color: "var(--c-ink-3)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>
                          {(m.username || "").slice(0, 2).toUpperCase()}
                        </span>
                        <span style={{ fontWeight: 500 }}>{m.username}</span>
                      </span>
                    </td>
                    <td className="u-mono" style={{ textAlign: "right", fontWeight: 600,
                                                    color: negativo ? "var(--c-danger-700)" : "var(--c-ink-1)" }}>
                      {negativo ? "−" : ""}${fmt(Math.abs(Number(m.saldo)))}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className={`adf-tag ${negativo ? "red" : "amber"}`}>
                        {negativo ? "Negativo" : "Bajo"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="adf-btn ghost small" to={`/administracion/cuentas/${m.id_alumno}`}>
                        Ver extracto <i className="bi bi-arrow-right"></i>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 18 }}>
        <div>
          <SectionTitle title="Tarifas vigentes" hint="CAAA 2026 · USD por hora" icon="bi-tag" />
          <div className="adf-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="adf-table" style={{ borderRadius: 0, border: "none" }}>
              <thead><tr><th>Aeronave / sim</th><th style={{ width: 110, textAlign: "right" }}>USD/h</th></tr></thead>
              <tbody>
                {TARIFAS_2026.map((t, i) => (
                  <tr key={i}>
                    <td>{t.aero}</td>
                    <td className="u-mono" style={{ textAlign: "right", fontWeight: 600 }}>${t.v.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionTitle title="Inversión por curso" hint="Carrera completa: $33,610 USD" icon="bi-mortarboard" />
          <div className="adf-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="adf-table" style={{ borderRadius: 0, border: "none" }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Cód</th>
                  <th>Curso</th>
                  <th style={{ width: 130, textAlign: "right" }}>Total USD</th>
                </tr>
              </thead>
              <tbody>
                {CURSOS_2026.map((c) => (
                  <tr key={c.codigo}>
                    <td className="u-mono" style={{ color: "var(--c-ink-2)" }}>{c.codigo}</td>
                    <td>{c.nombre}</td>
                    <td className="u-mono" style={{ textAlign: "right", fontWeight: 600 }}>
                      ${c.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--c-surface-2)" }}>
                  <td colSpan={2} style={{ fontWeight: 700, color: "var(--c-ink-1)" }}>Carrera completa</td>
                  <td className="u-mono" style={{ textAlign: "right", fontWeight: 700, color: "var(--c-brand-700)" }}>
                    ${totalInv.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function KPI({ label, value, hint, tone }) {
  return (
    <div className={`adf-kpi-card ${tone || ""}`}>
      <div className="adf-kpi-card__label">
        <span className="dot"></span>{label}
      </div>
      <div className="adf-kpi-card__value">{value}</div>
      {hint && <div className="adf-kpi-card__hint">{hint}</div>}
    </div>
  );
}

function SectionTitle({ title, hint, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
                  marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--c-line-1)" }}>
      <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <i className={`bi ${icon}`} style={{ color: "var(--c-brand-500)", fontSize: 16 }}></i>}
        {title}
      </h3>
      {hint && <div style={{ fontSize: 12, color: "var(--c-ink-3)" }}>{hint}</div>}
    </div>
  );
}
