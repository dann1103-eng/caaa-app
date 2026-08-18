import { useSearchParams } from "react-router-dom";
import ListaOrdenes from "./ordenes/ListaOrdenes";
import FolderAvion from "./ordenes/FolderAvion";
import Prestamos from "./ordenes/Prestamos";
import "./inventario/inventario.css";
import "./ordenes/taller-tecnico.css";

/**
 * Trabajos del taller — la pantalla del jefe de taller.
 *
 * Dos maneras de llegar a lo mismo, que son las dos que pidió Daniel:
 * por trabajo (buscar una orden y ver TODO lo que le cuelga) y por avión
 * (el folder de la matrícula). Es el equivalente digital del archivo físico.
 */
const TABS = [
  { key: "ordenes", label: "Órdenes de trabajo", icon: "bi-clipboard2-check" },
  { key: "avion", label: "Por avión", icon: "bi-airplane" },
  { key: "prestamos", label: "Préstamos", icon: "bi-arrow-left-right" },
];

export default function OrdenesTrabajo() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "ordenes";

  return (
    <>
      <h2 className="adf-section-title"><i className="bi bi-clipboard2-check me-2"></i>Trabajos del taller</h2>
      <p className="adf-section-subtitle">
        Cada orden con todo su papeleo: reporte de inspección, requisiciones, solicitudes y retornos.
      </p>

      <nav className="inv-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`inv-tab ${tab === t.key ? "inv-tab--activa" : ""}`}
            onClick={() => setParams(t.key === "ordenes" ? {} : { tab: t.key })}
          >
            <i className={`bi ${t.icon}`}></i> {t.label}
          </button>
        ))}
      </nav>

      {tab === "ordenes" && <ListaOrdenes />}
      {tab === "avion" && <FolderAvion />}
      {tab === "prestamos" && <Prestamos />}
    </>
  );
}
