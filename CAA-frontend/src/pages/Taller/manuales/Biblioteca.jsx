import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getManuales } from "../../../services/manualesApi";
import { esJefeTaller } from "../permisos";
import VisorManualModal from "./VisorManualModal";
import ManualFormModal from "./ManualFormModal";
import { CATEGORIA, pesoLegible, mensajeError } from "./formatoManual";

const FIJAS = ["todos", "generales", "sin"];

/** La biblioteca: todos los manuales, filtrables por avión. Todo el taller la ve. */
export default function Biblioteca() {
  const jefe = esJefeTaller();
  const [manuales, setManuales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("todos"); // 'todos' | 'generales' | 'sin' | matrícula
  const [q, setQ] = useState("");
  const [verReemplazados, setVerReemplazados] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [form, setForm] = useState(null);
  // Solo cuenta la respuesta del último pedido: con la casilla de reemplazados
  // marcada y desmarcada rápido, la vieja podía llegar después y pisarla.
  const pedido = useRef(0);

  const cargar = useCallback(() => {
    const n = ++pedido.current;
    setCargando(true);
    getManuales(verReemplazados ? { incluir_reemplazados: "true" } : {})
      .then((ms) => { if (n === pedido.current) setManuales(ms); })
      .catch((e) => { if (n === pedido.current) toast.error(mensajeError(e, "No se pudo cargar la biblioteca")); })
      .finally(() => { if (n === pedido.current) setCargando(false); });
  }, [verReemplazados]);
  useEffect(() => { cargar(); }, [cargar]);

  const aviones = useMemo(
    () => [...new Set(manuales.flatMap((m) => m.aeronaves.map((a) => a.codigo)))].sort(),
    [manuales]
  );
  const porConfirmar = manuales.filter((m) => m.necesita_confirmacion).length;

  // Si el avión elegido ya no está en la lista (se recargó), vuelve a "Todos"
  // en vez de mostrar una tabla vacía sin ninguna ficha marcada.
  const activo = FIJAS.includes(filtro) || aviones.includes(filtro) ? filtro : "todos";
  const texto = q.trim().toLowerCase();
  const visibles = manuales.filter((m) => {
    if (activo === "generales" && !m.es_general) return false;
    if (activo === "sin" && (m.es_general || m.aeronaves.length)) return false;
    // Un manual general es de todos los aviones (igual que en el backend y en
    // el editor de paquetes): sale también bajo la ficha de cada matrícula.
    if (!FIJAS.includes(activo) && !m.es_general && !m.aeronaves.some((a) => a.codigo === activo)) return false;
    if (texto && ![m.titulo, m.numero_parte, m.fabricante].some((x) => (x || "").toLowerCase().includes(texto))) return false;
    return true;
  });

  const fichas = [["todos", "Todos"], ...aviones.map((a) => [a, a]), ["generales", "Generales"], ["sin", "Sin asignar"]];

  return (
    <div className="adf-card">
      <div className="inv-filtros">
        <div className="inv-buscador">
          <label htmlFor="man-q">Buscar</label>
          <input id="man-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, número de parte, fabricante" />
        </div>
        <label className="man-check">
          <input type="checkbox" checked={verReemplazados} onChange={(e) => setVerReemplazados(e.target.checked)} />
          Mostrar reemplazados y archivados
        </label>
        {jefe && (
          <button type="button" className="adf-btn" style={{ marginLeft: "auto" }} onClick={() => setForm({ modo: "nuevo" })}>
            <i className="bi bi-upload"></i> Subir manual
          </button>
        )}
      </div>

      <div className="man-fichas">
        {fichas.map(([k, l]) => (
          <button type="button" key={k} className={`man-ficha ${activo === k ? "man-ficha--activa" : ""}`}
            aria-pressed={activo === k} onClick={() => setFiltro(k)}>{l}</button>
        ))}
      </div>

      {jefe && porConfirmar > 0 && (
        <p className="adf-note">
          <i className="bi bi-info-circle"></i>
          {porConfirmar} manual(es) tienen la asignación de aviones <strong>por confirmar</strong>: la dedujo el
          sistema leyendo la portada. Abrí «Editar» en cada uno para confirmarla o corregirla.
        </p>
      )}

      <div className="adf-table-wrap">
        <table className="adf-table">
          <thead>
            <tr>
              <th>Manual</th><th>Tipo</th><th>N° de parte</th><th>Revisión</th>
              <th className="man-num">Págs.</th><th>Aviones</th><th></th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={7} className="man-vacio">Cargando…</td></tr>}
            {!cargando && !visibles.length && <tr><td colSpan={7} className="man-vacio">No hay manuales con ese filtro.</td></tr>}
            {visibles.map((m) => (
              <tr key={m.id_manual}>
                <td>
                  <button type="button" className="man-link" onClick={() => setAbierto(m)}>{m.titulo}</button>
                  <div className="man-tags">
                    {m.necesita_confirmacion && <span className="adf-tag amber" title={m.nota_confirmacion || ""}>Por confirmar</span>}
                    {m.estado === "REEMPLAZADO" && (
                      <span className="adf-tag gray">Reemplazado por {m.reemplazado_por_revision || m.reemplazado_por_titulo}</span>
                    )}
                    {m.estado !== "VIGENTE" && m.usos_paquetes > 0 && (
                      <span className="adf-tag red">{m.usos_paquetes} rango(s) de paquetes todavía la usan</span>
                    )}
                    {m.estado === "ARCHIVADO" && <span className="adf-tag gray">Archivado</span>}
                  </div>
                </td>
                <td>{CATEGORIA[m.categoria] || m.categoria}</td>
                <td className="man-mono">{m.numero_parte || "—"}</td>
                <td>{m.revision || "—"}</td>
                <td className="man-num">{m.paginas} <small className="man-tenue">· {pesoLegible(m.tamano_bytes)}</small></td>
                <td>
                  {m.es_general
                    ? <span className="adf-tag blue">General</span>
                    : m.aeronaves.length ? m.aeronaves.map((a) => a.codigo).join(", ") : <span className="man-tenue">Sin asignar</span>}
                </td>
                <td className="man-acciones">
                  <button type="button" className="adf-icon-btn" title="Abrir" aria-label={`Abrir ${m.titulo}`}
                    onClick={() => setAbierto(m)}>
                    <i className="bi bi-eye"></i>
                  </button>
                  {jefe && m.estado === "VIGENTE" && (
                    <button type="button" className="adf-icon-btn" title="Subir revisión nueva"
                      aria-label={`Subir revisión nueva de ${m.titulo}`}
                      onClick={() => setForm({ modo: "revision", manual: m })}>
                      <i className="bi bi-arrow-repeat"></i>
                    </button>
                  )}
                  {jefe && (
                    <button type="button" className="adf-icon-btn" title="Editar" aria-label={`Editar ${m.titulo}`}
                      onClick={() => setForm({ modo: "editar", manual: m })}>
                      <i className="bi bi-pencil"></i>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierto && <VisorManualModal manual={abierto} onClose={() => setAbierto(null)} />}
      {form && (
        <ManualFormModal {...form} onClose={() => setForm(null)}
          onGuardado={() => { setForm(null); cargar(); }} />
      )}
    </div>
  );
}
