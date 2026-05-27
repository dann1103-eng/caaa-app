import React from "react";

export default function AvanceCursoCard({ inscripcion }) {
  if (!inscripcion) return null;
  const componentes = inscripcion.avance || [];
  return (
    <div style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6c757d", letterSpacing: 0.5 }}>
            CURSO {inscripcion.curso_codigo}
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "1.1rem", color: "#0f5132", fontWeight: 800 }}>
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
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
                <span style={{ color: "#2c3e34", fontWeight: 600 }}>{c.tipo_aeronave}</span>
                <span style={{ color: "#6c757d", fontVariantNumeric: "tabular-nums" }}>
                  {Number(c.horas_acumuladas).toFixed(1)} / {c.horas_requeridas} h
                </span>
              </div>
              <div style={{ width: "100%", height: 8, background: "#e8f5ee", borderRadius: 999 }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: pct >= 100 ? "#157347" : "linear-gradient(90deg, #157347, #28a745)",
                  borderRadius: 999, transition: "width 0.3s"
                }} />
              </div>
            </div>
          );
        })}
        {componentes.length === 0 && (
          <p style={{ color: "#9aa5a0", fontSize: "0.85rem", margin: 0 }}>
            Sin componentes prácticos cargados aún.
          </p>
        )}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #f0f3f1",
                    display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
        <span style={{ color: "#6c757d" }}>Inversión total estimada</span>
        <span style={{ fontWeight: 700, color: "#0f5132" }}>
          ${Number(inscripcion.total_usd_estimado || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}
