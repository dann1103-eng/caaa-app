import React from "react";

export default function AvanceCursoCard({ inscripcion }) {
  if (!inscripcion) return null;
  const componentes = inscripcion.avance || [];
  return (
    <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-line-1)", borderRadius: "var(--radius-md)", padding: 18, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-ink-3)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
            CURSO {inscripcion.curso_codigo}
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "var(--text-lg)", color: "var(--c-ink-1)", fontWeight: 700 }}>
            {inscripcion.curso_nombre}
          </h3>
        </div>
        <span className={`adf-tag ${inscripcion.estado === 'COMPLETADO' ? 'green' : 'blue'}`}>
          {inscripcion.estado}
        </span>
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {componentes.map((c, i) => {
          const pct = Math.min(100, (Number(c.horas_acumuladas) / Number(c.horas_requeridas)) * 100);
          return (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", marginBottom: 4 }}>
                <span style={{ color: "var(--c-ink-1)", fontWeight: 600 }}>{c.tipo_aeronave}</span>
                <span style={{ color: "var(--c-ink-3)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  {Number(c.horas_acumuladas).toFixed(1)} / {c.horas_requeridas} h
                </span>
              </div>
              <div style={{ width: "100%", height: 8, background: "var(--c-success-50)", borderRadius: "var(--radius-pill)" }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: pct >= 100 ? "var(--c-success-700)" : "var(--c-success-500)",
                  borderRadius: "var(--radius-pill)", transition: "width var(--dur-slow)"
                }} />
              </div>
            </div>
          );
        })}
        {componentes.length === 0 && (
          <p style={{ color: "var(--c-ink-4)", fontSize: "var(--text-sm)", margin: 0 }}>
            Sin componentes prácticos cargados aún.
          </p>
        )}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--c-line-1)",
                    display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
        <span style={{ color: "var(--c-ink-3)" }}>Inversión total estimada</span>
        <span style={{ fontWeight: 700, color: "var(--c-ink-1)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          ${Number(inscripcion.total_usd_estimado || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}
