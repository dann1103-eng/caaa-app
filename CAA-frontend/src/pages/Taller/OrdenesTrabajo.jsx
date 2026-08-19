import { useSearchParams } from "react-router-dom";
import PorRevisar from "./ordenes/PorRevisar";
import ListaOrdenes from "./ordenes/ListaOrdenes";
import FolderAvion from "./ordenes/FolderAvion";
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
  // Primero lo que el jefe mira al llegar: qué espera su firma y qué hay en el hangar.
  { key: "revisar", label: "Por revisar", icon: "bi-pen" },
  { key: "ordenes", label: "Órdenes de trabajo", icon: "bi-clipboard2-check" },
  { key: "avion", label: "Por avión", icon: "bi-airplane" },
  // Los préstamos se mudaron a Inventario: mueven la existencia, no el papeleo
  // de una orden, y siguen abiertos aunque la orden ya se haya cerrado.
];

export default function OrdenesTrabajo() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "revisar";

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
            onClick={() => setParams(t.key === "revisar" ? {} : { tab: t.key })}
          >
            <i className={`bi ${t.icon}`}></i> {t.label}
          </button>
        ))}
      </nav>

      {tab === "revisar" && <PorRevisar />}
      {tab === "ordenes" && <ListaOrdenes />}
      {tab === "avion" && <FolderAvion />}
    </>
  );
}
