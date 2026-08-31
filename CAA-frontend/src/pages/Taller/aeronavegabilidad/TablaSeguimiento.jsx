import { useState, useMemo } from "react";
import { ESTADOS, LIBROS, horas, fecha, restante, renglonesDe } from "./vencimientos";

/**
 * La tabla de ADs y la de vida límite. Es la misma tabla con distinto
 * encabezado, así que vive una sola vez.
 *
 * Dos cosas la gobiernan, y las dos vienen del papel:
 *
 *  · Los ADs vienen en TRES hojas (avión / motor / hélice) y por eso se agrupan
 *    por libro. La vida límite es UNA sola lista para todo el avión, así que va
 *    corrida y en el orden en que está escrita.
 *
 *  · Un ítem con doble base (2,000 h Y 12 años) se muestra como DOS renglones,
 *    uno por base — igual que el papel. Se guarda uno solo, así se cumple una
 *    vez y alerta una vez.
 */
export default function TablaSeguimiento({
  tareas, aeronave, agruparPorLibro, esJefe, onEditar, onCumplir, onConfirmar,
}) {
  const [filtro, setFiltro] = useState("aplican");
  const [busca, setBusca] = useState("");
  const [cerrados, setCerrados] = useState(() => new Set());
  // El offset se toma del RENGLÓN, no del avión seleccionado: listTareas lo
  // devuelve por fila, así que no puede desincronizarse. El prop es solo el
  // respaldo para la lista vacía. (La versión que dependía solo del prop mostraba
  // la última del YS-334-PE como 0.03 en vez de 10,000.03, porque el selector
  // sale del dashboard y ese query no traía tac_offset.)
  const offset = Number(tareas[0]?.tac_offset ?? aeronave?.tac_offset ?? 0);

  const conteos = useMemo(() => ({
    aplican: tareas.filter((t) => t.aplica !== false).length,
    recurrentes: tareas.filter((t) => t.recurrente && t.aplica !== false).length,
    noaplican: tareas.filter((t) => t.aplica === false).length,
    todos: tareas.length,
  }), [tareas]);

  const visibles = useMemo(() => {
    let r = tareas;
    if (filtro === "aplican") r = r.filter((t) => t.aplica !== false);
    else if (filtro === "recurrentes") r = r.filter((t) => t.recurrente && t.aplica !== false);
    else if (filtro === "noaplican") r = r.filter((t) => t.aplica === false);
    const q = busca.trim().toLowerCase();
    if (q) r = r.filter((t) => `${t.referencia || ""} ${t.nombre} ${t.observaciones || ""}`.toLowerCase().includes(q));
    return r;
  }, [tareas, filtro, busca]);

  const grupos = useMemo(() => {
    if (!agruparPorLibro) return [{ clave: "unico", titulo: null, filas: visibles }];
    const porLibro = LIBROS.map((l) => ({
      clave: l.v, titulo: l.t,
      filas: visibles.filter((t) => t.componente_tipo === l.v),
    }));
    const sueltos = visibles.filter((t) => !LIBROS.some((l) => l.v === t.componente_tipo));
    if (sueltos.length) porLibro.push({ clave: "otros", titulo: "Sin libro asignado", filas: sueltos });
    return porLibro.filter((g) => g.filas.length);
  }, [visibles, agruparPorLibro]);

  const alternar = (clave) => setCerrados((prev) => {
    const s = new Set(prev);
    s.has(clave) ? s.delete(clave) : s.add(clave);
    return s;
  });

  if (!tareas.length) {
    return (
      <div className="adf-note">
        Este avión todavía no tiene renglones cargados. Se cargan con el importador
        (<code>supabase/dump/aeronavegabilidad</code>) o uno por uno con «Nueva tarea».
      </div>
    );
  }

  return (
    <>
      <div className="seg-filtros">
        {[
          ["aplican", "Aplican", conteos.aplican],
          ["recurrentes", "Recurrentes", conteos.recurrentes],
          ["noaplican", "No aplican", conteos.noaplican],
          ["todos", "Todos", conteos.todos],
        ].map(([k, t, n]) => (
          <button key={k} type="button"
            className={`seg-chip ${filtro === k ? "seg-chip--activo" : ""}`}
            onClick={() => setFiltro(k)}>
            {t} <span className="seg-chip__n">{n}</span>
          </button>
        ))}
        <input className="inv-campo seg-busca" placeholder="Buscar AD, descripción…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button type="button" className="adf-btn secondary small" onClick={() => window.print()}>
          <i className="bi bi-printer" aria-hidden="true"></i> Imprimir
        </button>
      </div>

      {!visibles.length && (
        <div className="adf-note">Ningún renglón coincide con el filtro.</div>
      )}

      {grupos.map((g) => {
        const cerrado = cerrados.has(g.clave);
        const alertas = g.filas.filter((t) => t.estado === "VENCIDO" || t.estado === "PROXIMO").length;
        return (
          <section key={g.clave} className="seg-grupo">
            {g.titulo && (
              <button type="button" className="seg-grupo__head" onClick={() => alternar(g.clave)}>
                <i className={`bi bi-chevron-${cerrado ? "right" : "down"}`} aria-hidden="true"></i>
                <strong>{g.titulo}</strong>
                <span className="seg-grupo__n">{g.filas.length} renglones</span>
                {alertas > 0 && <span className="seg-grupo__alerta">{alertas} por atender</span>}
              </button>
            )}
            {!cerrado && (
              <div className="adf-table-wrap">
                <table className="adf-table seg-tabla">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>N° AD</th>
                      <th>N° S.B</th>
                      <th>Descripción</th>
                      <th>Observaciones</th>
                      <th className="amount">Última</th>
                      <th>Recurrente</th>
                      <th className="amount">Próxima</th>
                      <th className="amount">Restan</th>
                      <th aria-label="acciones"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.filas.flatMap(renglonesDe).map((t, i) => {
                      const meta = ESTADOS[t.estado] || ESTADOS.N_A;
                      const noAplica = t.aplica === false;
                      return (
                        <tr key={`${t.id_tarea}-${i}`}
                          className={[
                            noAplica ? "seg-fila--noaplica" : "",
                            t.estado === "VENCIDO" ? "seg-fila--vencido" : "",
                            t.necesita_confirmacion ? "seg-fila--conflicto" : "",
                            t._continuacion ? "seg-fila--cont" : "",
                          ].join(" ")}>
                          <td>{!t._continuacion && <span className={`seg-badge ${meta.clase}`}>{meta.t}</span>}</td>
                          <td className="mono">{t.referencia || "—"}</td>
                          <td className="mono">{t.sb || "—"}</td>
                          <td>
                            {/* El nombre guardado lleva el prefijo "REF — " para que se
                                lea solo en el dashboard y en la franja. Acá el número ya
                                tiene su columna, así que se recorta. */}
                            {t.referencia && t.nombre.startsWith(`${t.referencia} — `)
                              ? t.nombre.slice(t.referencia.length + 3)
                              : t.nombre}
                            {t.necesita_confirmacion && !t._continuacion && (
                              <details className="seg-conflicto">
                                <summary>
                                  <i className="bi bi-exclamation-diamond" aria-hidden="true"></i>
                                  {" "}El papel se contradice
                                </summary>
                                <p>{t.nota_confirmacion}</p>
                                {esJefe && (
                                  <button type="button" className="adf-btn small" onClick={() => onConfirmar(t)}>
                                    Resolver
                                  </button>
                                )}
                              </details>
                            )}
                          </td>
                          <td className="seg-obs">{t.observaciones || "—"}</td>
                          <td className="amount mono seg-vieja" title="Referencia: manda la próxima">
                            {horas(t.ultima_horas, offset)}
                            <div className="seg-sub">{fecha(t.ultima_fecha)}</div>
                          </td>
                          <td className="mono">{t._base.etiqueta}</td>
                          <td className="amount mono">{horas(t.proxima_horas, offset)}</td>
                          <td className="amount mono">{noAplica ? "—" : restante(t)}</td>
                          <td>
                            {!t._continuacion && (
                              <div className="seg-acciones">
                                <button type="button" className="adf-icon-btn" title="Registrar cumplimiento"
                                  onClick={() => onCumplir(t)}>
                                  <i className="bi bi-check2-circle" aria-hidden="true"></i>
                                </button>
                                {esJefe && (
                                  <button type="button" className="adf-icon-btn" title="Editar"
                                    onClick={() => onEditar(t)}>
                                    <i className="bi bi-pencil" aria-hidden="true"></i>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
