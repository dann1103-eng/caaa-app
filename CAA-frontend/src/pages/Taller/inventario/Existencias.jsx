import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getItems, getCatalogosInventario } from "../../../services/tallerApi";
import KardexModal from "./KardexModal";
import ItemModal from "./ItemModal";
import DocumentoModal from "./DocumentoModal";
import { fmt, money } from "./formato";

/**
 * La hoja "INVENTARIO PARTES GASTABLES" del Excel, con los atajos que allá no
 * existían. "Sin movimiento" sale de la fecha del último movimiento, ya no se
 * teclea a mano.
 */
const ATAJOS = [
  { key: "bajo_minimo", label: "Bajo mínimo" },
  { key: "negativos", label: "En negativo" },
  { key: "sin_movimiento", label: "Sin movimiento" },
  { key: "sin_costo", label: "Sin costo" },
];

export default function Existencias() {
  const [items, setItems] = useState([]);
  const [totales, setTotales] = useState(null);
  // El backend recorta los precios para el mecanico: si no vinieron, la tabla
  // tampoco los pretende mostrar.
  const conPrecios = totales?.valor != null;
  const [cat, setCat] = useState({ categorias: [], ubicaciones: [], unidades: [] });
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState({ q: "", categoria: "", ubicacion: "" });
  const [atajos, setAtajos] = useState({});
  const [kardex, setKardex] = useState(null);
  const [editar, setEditar] = useState(null);
  const [ajustando, setAjustando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = { ...f };
      for (const [k, v] of Object.entries(atajos)) if (v) params[k] = "true";
      const r = await getItems(params);
      setItems(r.items);
      setTotales(r.totales);
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo cargar el inventario");
    } finally {
      setCargando(false);
    }
  }, [f, atajos]);

  useEffect(() => {
    // Debounce del buscador: no dispara una consulta por tecla.
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => { getCatalogosInventario().then(setCat).catch(() => {}); }, []);

  return (
    <>
      {totales && (
        <div className="inv-kpis">
          <Kpi label="Ítems" valor={fmt(totales.items, 0)} />
          {totales.valor != null && (
            <Kpi
              label="Valor del inventario"
              valor={money(totales.valor)}
              // El Excel metía los negativos dentro del total y el número mentía.
              nota={totales.valor_negativo < 0 ? `${money(totales.valor_negativo)} en existencias negativas` : null}
            />
          )}
          <Kpi label="Bajo mínimo" valor={fmt(totales.bajo_minimo, 0)} alerta={totales.bajo_minimo > 0} />
          <Kpi label="En negativo" valor={fmt(totales.negativos, 0)} alerta={totales.negativos > 0} />
          {totales.sin_costo != null && (
            <Kpi label="Sin costo" valor={fmt(totales.sin_costo, 0)} alerta={totales.sin_costo > 0} />
          )}
        </div>
      )}

      <div className="adf-card">
        <div className="inv-filtros">
          <div className="inv-buscador">
            <label>Buscar</label>
            <input
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
              placeholder="Código, descripción, n° de parte o serie"
            />
          </div>
          <div>
            <label>Clasificación</label>
            <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              <option value="">Todas</option>
              {cat.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>Ubicación</label>
            <select value={f.ubicacion} onChange={(e) => setF({ ...f, ubicacion: e.target.value })}>
              <option value="">Todas</option>
              {cat.ubicaciones.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className="adf-btn secondary small" onClick={() => setEditar({})}>
            <i className="bi bi-plus-lg"></i> Nuevo ítem
          </button>
          {/* El ajuste vive acá, que es donde se cuenta el estante. */}
          <button className="adf-btn secondary small" onClick={() => setAjustando(true)}>
            <i className="bi bi-sliders"></i> Ajustar por conteo
          </button>
        </div>

        <div className="inv-chips" style={{ marginBottom: "var(--sp-3)" }}>
          {ATAJOS.map((a) => (
            <button
              key={a.key}
              className={`inv-chip ${atajos[a.key] ? "inv-chip--on" : ""}`}
              onClick={() => setAtajos({ ...atajos, [a.key]: !atajos[a.key] })}
            >
              {a.label}
            </button>
          ))}
        </div>

        {cargando ? (
          <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>
            Ningún ítem coincide con el filtro.
          </p>
        ) : (
          <div className="adf-table-wrap">
            <table className="adf-table">
              <thead>
                <tr>
                  <th>Código</th><th>Descripción</th><th>N° parte</th><th>Ubic.</th>
                  <th>Clasificación</th>
                  <th className="amount">Existencia</th><th className="amount">Mín.</th>
                  {conPrecios && <th className="amount">Costo u.</th>}
                  {conPrecios && <th className="amount">Importe</th>}
                  <th>Últ. mov.</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id_repuesto}
                    className={`inv-clic ${r.en_negativo ? "inv-fila--negativo" : ""}`}
                    onClick={() => setKardex(r)}
                  >
                    <td className="inv-codigo">{r.codigo || "—"}</td>
                    <td>
                      {r.descripcion}
                      {r.serie_no && <span style={{ color: "var(--c-ink-4)" }}> · S/N {r.serie_no}</span>}
                    </td>
                    <td>{r.parte_no || "—"}</td>
                    <td>{r.ubicacion || "—"}</td>
                    <td>{r.categoria || "—"}</td>
                    <td className={`amount ${r.en_negativo ? "neg" : ""}`}>
                      {fmt(r.stock_actual, 0)} {r.unidad}
                      {r.stock_bajo && !r.en_negativo && <span className="adf-tag red" style={{ marginLeft: 6 }}>Bajo</span>}
                    </td>
                    <td className="amount">{fmt(r.stock_minimo, 0)}</td>
                    {conPrecios && (
                      <td className="amount">{r.sin_costo ? <span style={{ color: "var(--c-ink-4)" }}>—</span> : money(r.costo_unitario)}</td>
                    )}
                    {conPrecios && <td className="amount">{r.sin_costo ? "—" : money(r.importe)}</td>}
                    <td>{r.ultimo_movimiento_en ? String(r.ultimo_movimiento_en).slice(0, 10) : <span style={{ color: "var(--c-ink-4)" }}>sin movimiento</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="adf-icon-btn" title="Editar ficha" onClick={() => setEditar(r)}>
                        <i className="bi bi-pencil"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {kardex && <KardexModal item={kardex} onClose={() => setKardex(null)} />}
      {ajustando && (
        <DocumentoModal
          tipo="AJUSTE"
          onClose={() => setAjustando(false)}
          onGuardado={() => { setAjustando(false); cargar(); }}
        />
      )}
      {editar && (
        <ItemModal
          item={editar}
          unidades={cat.unidades}
          onClose={() => setEditar(null)}
          onGuardado={() => { setEditar(null); cargar(); }}
        />
      )}
    </>
  );
}

function Kpi({ label, valor, alerta, nota }) {
  return (
    <div className="inv-kpi">
      <div className="inv-kpi__label">{label}</div>
      <div className={`inv-kpi__valor ${alerta ? "inv-kpi__valor--alerta" : ""}`}>{valor}</div>
      {nota && <div className="inv-kpi__nota">{nota}</div>}
    </div>
  );
}
