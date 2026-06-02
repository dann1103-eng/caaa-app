import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Recibos from "./Recibos";
import Facturas from "./Facturas";
import Egresos from "./Egresos";
import Nomina from "./Nomina";
import Tarifas from "./Tarifas";

const TABS = [
  { key: "ingresos", label: "Ingresos", icon: "bi-arrow-down-circle" },
  { key: "egresos",  label: "Egresos",  icon: "bi-arrow-up-circle" },
  { key: "nomina",   label: "Nómina",   icon: "bi-people-fill" },
  { key: "tarifas",  label: "Tarifas",  icon: "bi-tag" },
];

const VALID_TABS = TABS.map(t => t.key);

export default function Contabilidad() {
  const [params, setParams] = useSearchParams();
  const initial = VALID_TABS.includes(params.get("tab")) ? params.get("tab") : "ingresos";
  const [tab, setTab] = useState(initial);
  const [ingresosSub, setIngresosSub] = useState(
    params.get("sub") === "facturas" ? "facturas" : "recibos"
  );

  const changeTab = (key) => {
    setTab(key);
    const next = new URLSearchParams(params);
    next.set("tab", key);
    next.delete("sub");
    setParams(next, { replace: true });
  };

  const changeSub = (sub) => {
    setIngresosSub(sub);
    const next = new URLSearchParams(params);
    next.set("tab", "ingresos");
    next.set("sub", sub);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-cash-coin"></i>Contabilidad</h1>
      <p className="adf-section-subtitle">
        Centro contable: ingresos (recibos y facturas), egresos, nómina y tarifas en una sola vista.
      </p>

      {/* Sub-pestañas principales */}
      <div className="adf-card" style={{ display: "flex", gap: 10, padding: "12px 16px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key}
            className={`adf-btn ${tab === t.key ? "" : "secondary"}`}
            onClick={() => changeTab(t.key)}>
            <i className={`bi ${t.icon}`}></i>{t.label}
          </button>
        ))}
      </div>

      {/* Panel activo */}
      {tab === "ingresos" && (
        <>
          <div style={{ display: "flex", gap: 8, margin: "4px 0 14px" }}>
            <button className={`adf-btn small ${ingresosSub === "recibos" ? "" : "secondary"}`}
              onClick={() => changeSub("recibos")}>
              <i className="bi bi-receipt"></i>Recibos
            </button>
            <button className={`adf-btn small ${ingresosSub === "facturas" ? "" : "secondary"}`}
              onClick={() => changeSub("facturas")}>
              <i className="bi bi-file-earmark-text"></i>Facturas
            </button>
          </div>
          {ingresosSub === "recibos" ? <Recibos /> : <Facturas />}
        </>
      )}

      {tab === "egresos" && <Egresos />}
      {tab === "nomina"  && <Nomina />}
      {tab === "tarifas" && <Tarifas />}
    </div>
  );
}
