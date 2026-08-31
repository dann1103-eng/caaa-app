import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  // Posición de la lista en coordenadas de ventana. Va en un portal con
  // `position: fixed` porque el desplegable vive dentro de modales y tablas con
  // overflow, y ahí un `position: absolute` SIEMPRE termina recortado: abrirlo
  // hacia arriba solo movía el problema de borde.
  const [pos, setPos] = useState(null);
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

  // Sigue al input: al abrir, al hacer scroll y al cambiar el tamaño.
  useEffect(() => {
    if (!abierto || !ops.length) { setPos(null); return; }
    const ubicar = () => {
      const el = caja.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const abajo = window.innerHeight - r.bottom;
      const alto = Math.min(280, Math.max(abajo, r.top) - 16);
      // Si no cabe abajo, se despliega hacia arriba; el portal ya no lo recorta.
      setPos(abajo >= alto + 8
        ? { left: r.left, top: r.bottom + 2, width: r.width, maxHeight: alto }
        : { left: r.left, top: Math.max(8, r.top - alto - 2), width: r.width, maxHeight: alto });
    };
    ubicar();
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [abierto, ops.length]);

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
      {abierto && ops.length > 0 && pos && createPortal(
        <div
          className="inv-picker__lista inv-picker__lista--flotante"
          style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
          // El clic-afuera del contenedor no ve el portal: se frena acá.
          onMouseDown={(e) => e.stopPropagation()}
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
