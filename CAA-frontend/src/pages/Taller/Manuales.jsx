import { useSearchParams } from "react-router-dom";
import Biblioteca from "./manuales/Biblioteca";
import Paquetes from "./manuales/Paquetes";
import { esJefeTaller } from "./permisos";
import "./inventario/inventario.css";
import "./manuales/manuales.css";

/**
 * Manuales del avión (spec 2026-09-20).
 * Biblioteca: todo el taller ve e imprime. Paquetes: el jefe arma qué páginas
 * acompañan cada inspección.
 */
const TABS = [
  { key: "biblioteca", label: "Biblioteca", icon: "bi-book" },
  { key: "paquetes", label: "Paquetes por inspección", icon: "bi-collection", soloJefe: true },
];

export default function Manuales() {
  const [params, setParams] = useSearchParams();
  const jefe = esJefeTaller();
  const tabs = TABS.filter((t) => !t.soloJefe || jefe);
  const pedida = params.get("tab");
  const tab = tabs.some((t) => t.key === pedida) ? pedida : "biblioteca";

  return (
    <>
      <div className="inv-head">
        <div>
          <h2 className="adf-section-title"><i className="bi bi-book me-2"></i>Manuales</h2>
          <p className="adf-section-subtitle">Los manuales de cada avión, y qué páginas acompañan cada inspección.</p>
        </div>
      </div>
      {tabs.length > 1 && (
        <nav className="inv-nav">
          <div className="inv-grupo">
            <div className="inv-tabs">
              {tabs.map((t) => (
                <button type="button" key={t.key} className={`inv-tab ${tab === t.key ? "inv-tab--activa" : ""}`}
                  aria-pressed={tab === t.key}
                  onClick={() => setParams(t.key === "biblioteca" ? {} : { tab: t.key })}>
                  <i className={`bi ${t.icon}`}></i> {t.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}
      {tab === "biblioteca" && <Biblioteca />}
      {tab === "paquetes" && <Paquetes />}
    </>
  );
}
