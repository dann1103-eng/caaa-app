import { useEffect, useRef, useState } from "react";
import { getItems } from "../../../services/tallerApi";

/**
 * Combobox de búsqueda de ítem por código, descripción o n° de parte.
 *
 * Mismo patrón que el buscador de alumno al agendar: opciones mientras se
 * escribe, navegación con ↑/↓/Enter/Escape y clic-afuera-cierra. Busca contra
 * el servidor porque el catálogo son ~640 ítems y crece.
 */
export default function ItemPicker({ valor, onElegir, autoFocus }) {
  const [texto, setTexto] = useState("");
  const [ops, setOps] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [hl, setHl] = useState(0);
  const caja = useRef(null);

  useEffect(() => {
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  useEffect(() => {
    if (!texto.trim()) { setOps([]); return; }
    let vivo = true;
    const t = setTimeout(() => {
      getItems({ q: texto })
        .then((r) => { if (vivo) { setOps(r.items.slice(0, 30)); setHl(0); } })
        .catch(() => {});
    }, 200);
    return () => { vivo = false; clearTimeout(t); };
  }, [texto]);

  const elegir = (it) => {
    onElegir(it);
    setTexto("");
    setAbierto(false);
  };

  const teclas = (e) => {
    if (!abierto || !ops.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHl((h) => Math.min(h + 1, ops.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); elegir(ops[hl]); }
    else if (e.key === "Escape") setAbierto(false);
  };

  if (valor) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="inv-codigo">{valor.codigo}</span>
        <span style={{ fontSize: "0.85rem" }}>{valor.descripcion}</span>
        <button type="button" className="adf-icon-btn" title="Cambiar ítem" onClick={() => onElegir(null)}>
          <i className="bi bi-x"></i>
        </button>
      </div>
    );
  }

  return (
    <div className="inv-picker" ref={caja}>
      <input
        autoFocus={autoFocus}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={teclas}
        placeholder="Código, descripción o n° de parte…"
      />
      {abierto && ops.length > 0 && (
        <div className="inv-picker__lista">
          {ops.map((o, i) => (
            <div
              key={o.id_repuesto}
              className={`inv-picker__op ${i === hl ? "inv-picker__op--hl" : ""}`}
              onMouseEnter={() => setHl(i)}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }}
            >
              <span>
                <span className="inv-codigo">{o.codigo}</span> {o.descripcion}
                {o.parte_no && <span style={{ color: "var(--c-ink-4)" }}> · {o.parte_no}</span>}
              </span>
              <small>{Number(o.stock_actual).toFixed(0)} {o.unidad}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
