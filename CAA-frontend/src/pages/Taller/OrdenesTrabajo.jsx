import { useSearchParams } from "react-router-dom";
import ListaOrdenes from "./ordenes/ListaOrdenes";
import FolderAvion from "./ordenes/FolderAvion";
import Libros from "./ordenes/Libros";
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
  // Lo operativo —qué se está haciendo, quién lo lleva, firmar— vive en "Mi
  // taller", que es la pantalla principal. Acá queda el archivo: buscar una orden
  // y ver el folder de cada avión.
  { key: "ordenes", label: "Historial de órdenes", icon: "bi-clipboard2-check" },
  // El libro por parte es el registro LEGAL que audita la AAC; "Por avión" es
  // el resumen operativo. Contestan cosas distintas, por eso van separados.
  { key: "libros", label: "Libros del avión", icon: "bi-journal-text" },
  { key: "avion", label: "Por avión", icon: "bi-airplane" },
  // Los préstamos se mudaron a Inventario: mueven la existencia, no el papeleo
  // de una orden, y siguen abiertos aunque la orden ya se haya cerrado.
];

export default function OrdenesTrabajo() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "ordenes";

  return (
    <>
      <h2 className="adf-section-title"><i className="bi bi-clipboard2-check me-2"></i>Trabajos del taller</h2>
      <p className="adf-section-subtitle">
        El archivo del taller: cada orden con todo su papeleo —reporte de inspección, requisiciones,
        solicitudes y retornos— y el folder de cada avión. Lo que se está haciendo ahora se opera
        desde <strong>Mi taller</strong>.
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
      {tab === "libros" && <Libros />}
      {tab === "avion" && <FolderAvion />}
    </>
  );
}
