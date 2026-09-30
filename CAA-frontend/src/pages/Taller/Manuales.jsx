import { useEffect, useState } from "react";
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

const AVISO_SUCIO = "Hay cambios sin guardar en el paquete. ¿Salir igual?";

export default function Manuales() {
  const [params, setParams] = useSearchParams();
  // El editor de un paquete avisa acá si tiene cambios sin guardar: cambiar de
  // pestaña, recargar o irse por el menú lo desmonta y los pierde.
  const [sucio, setSucio] = useState(false);
  const jefe = esJefeTaller();
  const tabs = TABS.filter((t) => !t.soloJefe || jefe);
  const pedida = params.get("tab");
  const tab = tabs.some((t) => t.key === pedida) ? pedida : "biblioteca";

  useEffect(() => {
    if (!sucio) return undefined;
    const alRecargar = (e) => { e.preventDefault(); e.returnValue = ""; };
    // BrowserRouter no tiene useBlocker: los enlaces internos (el menú lateral)
    // se atajan en fase de captura, antes de que el <Link> navegue.
    const alNavegar = (e) => {
      const enlace = e.target.closest?.("a[href]");
      if (!enlace || enlace.target === "_blank" || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // abre otra pestaña
      if (!window.confirm(AVISO_SUCIO)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", alRecargar);
    window.addEventListener("click", alNavegar, true);
    return () => {
      window.removeEventListener("beforeunload", alRecargar);
      window.removeEventListener("click", alNavegar, true);
    };
  }, [sucio]);

  const irA = (key) => {
    if (key === tab) return;
    if (sucio && !window.confirm(AVISO_SUCIO)) return;
    setSucio(false);
    setParams(key === "biblioteca" ? {} : { tab: key });
  };

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
                  aria-pressed={tab === t.key} onClick={() => irA(t.key)}>
                  <i className={`bi ${t.icon}`}></i> {t.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}
      {tab === "biblioteca" && <Biblioteca />}
      {tab === "paquetes" && <Paquetes onSucio={setSucio} />}
    </>
  );
}
