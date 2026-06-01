import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAlumnosConSaldo } from "../../services/administracionApi";
import SaldoBadge from "../../components/SaldoBadge/SaldoBadge";

const MOCK = [
  { id_alumno: 1, username: "juan.oporto",   correo: "juan@caaa-sv.com",  saldo_actual_usd: 2486.34, ultimo_movimiento_en: "2025-09-17", numero_licencia: "PE-1024" },
  { id_alumno: 2, username: "maria.lopez",   correo: "maria@caaa-sv.com", saldo_actual_usd: 9450.00, ultimo_movimiento_en: "2026-05-15", numero_licencia: "PE-1138" },
  { id_alumno: 3, username: "carlos.solano", correo: "carlos@caaa-sv.com",saldo_actual_usd: -250.00, ultimo_movimiento_en: "2026-05-12", numero_licencia: "PE-1207" },
  { id_alumno: 4, username: "ana.morales",   correo: "ana@caaa-sv.com",   saldo_actual_usd: 10000.00,ultimo_movimiento_en: "2026-04-30", numero_licencia: "PE-1300" }
];

export default function Cuentas() {
  const [data, setData] = useState([]);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await getAlumnosConSaldo();
        if (r?.ok) setData(r.data);
        else { setData(MOCK); setUsingMock(true); }
      } catch {
        setData(MOCK); setUsingMock(true);
      }
    })();
  }, []);

  const filtrados = data.filter(a => {
    const matchQ = !q || (a.username || "").toLowerCase().includes(q.toLowerCase()) ||
                   (a.correo || "").toLowerCase().includes(q.toLowerCase()) ||
                   (a.numero_licencia || "").toLowerCase().includes(q.toLowerCase());
    if (!matchQ) return false;
    if (filtro === "saldo_bajo") return Number(a.saldo_actual_usd) < 200;
    if (filtro === "saldo_negativo") return Number(a.saldo_actual_usd) < 0;
    if (filtro === "saldo_alto") return Number(a.saldo_actual_usd) >= 1000;
    return true;
  });

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-people"></i>Alumnos</h1>
      <p className="adf-section-subtitle">
        Entrá a la ficha de cada alumno para ver y gestionar su perfil, documentos, contratos y cuenta corriente.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div className="adf-form-field" style={{ flex: "1 1 280px" }}>
            <label>Buscar</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, correo, licencia..." />
          </div>
          <div className="adf-form-field" style={{ flex: "0 0 200px" }}>
            <label>Filtro</label>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="saldo_bajo">Saldo bajo (&lt; $200)</option>
              <option value="saldo_negativo">Saldo negativo</option>
              <option value="saldo_alto">Saldo alto (&gt; $1000)</option>
            </select>
          </div>
          <div style={{ marginLeft: "auto", color: "var(--c-ink-3)", fontSize: "0.88rem" }}>
            <strong>{filtrados.length}</strong> alumnos
          </div>
        </div>
      </div>

      <table className="adf-table">
        <thead>
          <tr>
            <th>Alumno</th>
            <th>Licencia</th>
            <th>Correo</th>
            <th style={{ textAlign: "right" }}>Saldo</th>
            <th>Último movimiento</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map(a => (
            <tr key={a.id_alumno}>
              <td><i className="bi bi-person-circle me-2"></i><strong>{a.username}</strong></td>
              <td><code style={{ color: "var(--c-brand-700)" }}>{a.numero_licencia || "—"}</code></td>
              <td style={{ color: "var(--c-ink-3)" }}>{a.correo}</td>
              <td style={{ textAlign: "right" }}><SaldoBadge saldo={a.saldo_actual_usd} /></td>
              <td style={{ color: "var(--c-ink-3)", fontSize: "0.88rem" }}>
                {a.ultimo_movimiento_en ? new Date(a.ultimo_movimiento_en).toLocaleDateString("es-SV") : "—"}
              </td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <Link className="adf-btn small" to={`/administracion/alumnos/${a.id_alumno}`}>
                  <i className="bi bi-person-vcard"></i>Abrir ficha
                </Link>
              </td>
            </tr>
          ))}
          {filtrados.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--c-ink-4)" }}>
              Sin resultados.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
