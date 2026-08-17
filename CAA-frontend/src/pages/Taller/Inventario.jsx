import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Existencias from "./inventario/Existencias";
import Documentos from "./inventario/Documentos";
import ConsumoAeronave from "./inventario/ConsumoAeronave";
import CostosPendientes from "./inventario/CostosPendientes";
import EntregaAceites from "./inventario/EntregaAceites";
import DocumentoModal from "./inventario/DocumentoModal";
import "./inventario/inventario.css";

/**
 * Inventario de la bodega OMA.
 *
 * Réplica del Excel de la bodega, con sub-navegación en vez de tres hojas:
 * Existencias (la hoja de inventario) · Documentos (ENTRADAS y SALIDAS) ·
 * Consumo por aeronave · Costos pendientes.
 *
 * El stock no se edita en ningún lado: se mueve con documentos.
 */
const TABS = [
  { key: "existencias", label: "Existencias", icon: "bi-boxes" },
  { key: "documentos", label: "Documentos", icon: "bi-file-earmark-text" },
  { key: "aceites", label: "Entrega de aceites", icon: "bi-droplet-half" },
  { key: "consumo", label: "Consumo por aeronave", icon: "bi-airplane" },
  { key: "costos", label: "Costos pendientes", icon: "bi-cash-coin" },
];

export default function Inventario() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "existencias";
  const [nuevoDoc, setNuevoDoc] = useState(null); // 'ENTRADA' | 'SALIDA' | 'AJUSTE'
  const [refresco, setRefresco] = useState(0);

  const irA = (key) => setParams(key === "existencias" ? {} : { tab: key });

  return (
    <>
      <div className="inv-head">
        <div>
          <h2 className="adf-section-title"><i className="bi bi-box-seam me-2"></i>Inventario · Bodega OMA</h2>
          <p className="adf-section-subtitle">
            Existencias, documentos de entrada y salida, y kardex por ítem.
          </p>
        </div>
        <div className="inv-head__acciones">
          <button className="adf-btn secondary" onClick={() => setNuevoDoc("REQUISICION")}>
            <i className="bi bi-pencil-square"></i> Requisición
          </button>
          <button className="adf-btn" onClick={() => setNuevoDoc("ENTRADA")}>
            <i className="bi bi-box-arrow-in-down"></i> Entrada
          </button>
          <button className="adf-btn" onClick={() => setNuevoDoc("SALIDA")}>
            <i className="bi bi-box-arrow-up"></i> Solicitud
          </button>
          <button className="adf-btn secondary" onClick={() => setNuevoDoc("AJUSTE")}>
            <i className="bi bi-sliders"></i> Ajuste
          </button>
        </div>
      </div>

      <nav className="inv-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`inv-tab ${tab === t.key ? "inv-tab--activa" : ""}`}
            onClick={() => irA(t.key)}
          >
            <i className={`bi ${t.icon}`}></i> {t.label}
          </button>
        ))}
      </nav>

      {tab === "existencias" && <Existencias key={`e${refresco}`} />}
      {tab === "documentos" && <Documentos key={`d${refresco}`} />}
      {tab === "aceites" && <EntregaAceites key={`a${refresco}`} />}
      {tab === "consumo" && <ConsumoAeronave key={`c${refresco}`} />}
      {tab === "costos" && <CostosPendientes key={`p${refresco}`} />}

      {nuevoDoc && (
        <DocumentoModal
          tipo={nuevoDoc}
          onClose={() => setNuevoDoc(null)}
          onGuardado={() => {
            setNuevoDoc(null);
            // Remonta la pestaña activa para que relea del servidor.
            setRefresco((r) => r + 1);
          }}
        />
      )}
    </>
  );
}
