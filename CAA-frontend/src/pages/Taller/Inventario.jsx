import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Existencias from "./inventario/Existencias";
import Documentos from "./inventario/Documentos";
import ConsumoAeronave from "./inventario/ConsumoAeronave";
import CostosPendientes from "./inventario/CostosPendientes";
import EntregaAceites from "./inventario/EntregaAceites";
import "./inventario/inventario.css";

/**
 * Inventario de la bodega OMA.
 *
 * El stock no se edita en ningún lado: se mueve con documentos, y cada sección
 * abre con el botón de la acción que le toca.
 */
// Las secciones hablan el idioma del almacén (entra / sale), no el del papel.
// "Entradas" y "Salidas" son además los nombres de las dos hojas del Excel que
// esta pantalla reemplaza, así que ya es vocabulario de ellos.
const TABS = [
  { key: "existencias", label: "Existencias", icon: "bi-boxes" },
  { key: "entradas", label: "Entradas", icon: "bi-box-arrow-in-down" },
  { key: "salidas", label: "Salidas", icon: "bi-box-arrow-up" },
  { key: "aceites", label: "Aceites", icon: "bi-droplet-half" },
  { key: "consumo", label: "Consumo por avión", icon: "bi-airplane" },
  { key: "costos", label: "Costos pendientes", icon: "bi-cash-coin" },
];

export default function Inventario() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "existencias";
  const [refresco] = useState(0);

  const irA = (key) => setParams(key === "existencias" ? {} : { tab: key });

  return (
    <>
      <div className="inv-head">
        <div>
          <h2 className="adf-section-title"><i className="bi bi-box-seam me-2"></i>Inventario · Bodega OMA</h2>
          <p className="adf-section-subtitle">
            Qué hay, qué entró, qué salió y el kardex de cada ítem.
          </p>
        </div>
        {/* Los botones de acción viven DENTRO de su sección, en verbo. Cuando
            estaban todos juntos acá arriba con el nombre del documento
            (Entrada, Solicitud, Requisición, Ajuste), nadie los ubicaba. */}
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

      {tab === "entradas" && (
        <Documentos
          key={`en${refresco}`}
          tipos={["ENTRADA", "RETORNO"]}
          accion={{ tipo: "ENTRADA", icono: "bi-box-arrow-in-down", label: "Registrar entrada de material" }}
          ayuda="Lo que suma a la bodega: compras a proveedor y sobrantes que vuelven de un trabajo."
        />
      )}

      {tab === "salidas" && (
        <Documentos
          key={`sa${refresco}`}
          tipos={["SALIDA", "REQUISICION"]}
          accion={{ tipo: "SALIDA", icono: "bi-box-arrow-up", label: "Entregar material" }}
          mostrarPendientes
          ayuda="Lo que sale de la bodega. Arriba, lo que el técnico pidió y todavía no se le entrega."
        />
      )}

      {tab === "aceites" && <EntregaAceites key={`a${refresco}`} />}
      {tab === "consumo" && <ConsumoAeronave key={`c${refresco}`} />}
      {tab === "costos" && <CostosPendientes key={`p${refresco}`} />}
    </>
  );
}
