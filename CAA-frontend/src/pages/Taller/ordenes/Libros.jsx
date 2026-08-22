import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getAeronavesBodega, getLibroAeronave, guardarParteAeronave,
  getPlantillasSticker, guardarPlantillaSticker,
  abrirStickersPDF, anularSticker, emitirStickersLibres,
} from "../../../services/tallerApi";
import OrdenDetalleModal from "./OrdenDetalleModal";
import { fmt, fecha as fFecha, hoy } from "../inventario/formato";

const PARTES = [
  { parte: "CELULA", etiqueta: "Célula", icono: "bi-airplane" },
  { parte: "MOTOR", etiqueta: "Motor", icono: "bi-fan" },
  { parte: "HELICE", etiqueta: "Hélice", icono: "bi-asterisk" },
];

const TIPOS_PLANTILLA = [
  ["25H", "Inspección de 25 h"], ["50H", "Inspección de 50 h"], ["100H", "Inspección de 100 h"],
  ["ANUAL", "Inspección anual"], ["NO_PROGRAMADO", "Trabajo no programado"],
  ["CIERRE", "Cierre de libro"], ["APERTURA", "Apertura de libro"],
];

const esJefe = () => {
  try { return ["TALLER", "ADMIN"].includes(JSON.parse(localStorage.getItem("user") || "{}")?.rol); }
  catch { return false; }
};

const h = (v) => (v === null || v === undefined || v === "" ? "N/A" : fmt(v));

/**
 * Los libros del avión.
 *
 * Es el espejo digital de los tres libros físicos que exige la AAC: la lista
 * cronológica de stickers de cada parte. Lo que el papel no puede dar es lo que
 * hay detrás de cada sticker — la orden completa con sus requisiciones,
 * solicitudes de bodega y partes reemplazadas — y eso sale de reusar entero el
 * detalle de la orden que ya existe.
 */
export default function Libros() {
  const [flota, setFlota] = useState([]);
  const [id, setId] = useState(null);
  const [parte, setParte] = useState("CELULA");
  const [d, setD] = useState(null);
  const [orden, setOrden] = useState(null);
  const [editando, setEditando] = useState(false);
  const [plantillas, setPlantillas] = useState(null);
  const [cierre, setCierre] = useState(false);
  const jefe = esJefe();

  useEffect(() => {
    getAeronavesBodega()
      .then((f) => {
        // El simulador no lleva libros: no tiene celula, motor ni helice que
        // certificar. Los de terceros si, que para eso existe la OMA.
        const con = (f || []).filter((a) => a.tipo !== "SIMULADOR");
        setFlota(con);
        const primero = con.find((a) => !a.es_externa) || con[0];
        if (primero) setId((v) => v ?? primero.id_aeronave);
      })
      .catch(() => {});
  }, []);

  const cargar = () => {
    if (!id) return;
    getLibroAeronave(id, parte).then(setD).catch((e) => {
      toast.error(e.response?.data?.message || "No se pudo cargar el libro");
    });
  };
  useEffect(() => { setD(null); cargar(); }, [id, parte]);

  // Los stickers de cierre y apertura son el borde entre volúmenes del libro
  // físico: no hace falta numerarlos a mano, el evento ya lo marca.
  const volumenes = useMemo(() => {
    const st = d?.stickers || [];
    const grupos = [];
    let actual = [];
    for (const s of st) {                       // vienen del más nuevo al más viejo
      actual.push(s);
      if (s.tipo === "APERTURA") { grupos.push(actual); actual = []; }
    }
    if (actual.length) grupos.push(actual);
    return grupos;
  }, [d]);

  const av = flota.find((a) => a.id_aeronave === id);
  const c = d?.componente;

  return (
    <div>
      <div className="inv-filtros" style={{ marginBottom: 14 }}>
        <label className="inv-campo">
          <span>Avión</span>
          <select value={id || ""} onChange={(e) => setId(Number(e.target.value))}>
            {flota.map((a) => <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo}{a.es_externa ? " (tercero)" : ""}</option>)}
          </select>
        </label>
      </div>

      <nav className="inv-tabs" style={{ marginBottom: 14 }}>
        {PARTES.map((p) => (
          <button key={p.parte} className={`inv-tab ${parte === p.parte ? "inv-tab--activa" : ""}`}
            onClick={() => setParte(p.parte)}>
            <i className={`bi ${p.icono} me-2`}></i>Libro de {p.etiqueta.toLowerCase()}
          </button>
        ))}
      </nav>

      {!d ? <p className="adf-section-subtitle">Cargando…</p> : (
        <>
          {/* ── Ficha de la parte: la cabecera que se imprime en cada sticker ── */}
          <div className="adf-card" style={{ padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 className="adf-section-title" style={{ margin: 0 }}>
                  {c?.marca || "Sin cargar"} {c?.modelo || ""}
                  {c && !c.activo && <span className="adf-tag" style={{ marginLeft: 8 }}>Fuera del avión</span>}
                </h3>
                <p className="adf-section-subtitle" style={{ margin: "4px 0 0" }}>
                  M/N {c?.parte_no || "—"} · S/N {c?.serie_no || "—"} · T.C. {c?.tipo_certificado || "—"}
                </p>
              </div>
              {jefe && (
                <button className="adf-btn secondary" onClick={() => setEditando(true)}>
                  <i className="bi bi-pencil"></i>Editar ficha y anclaje
                </button>
              )}
            </div>

            <div className="adf-kpi-grid" style={{ marginTop: 14 }}>
              <Kpi label="TAC del libro" valor={h(d.aeronave.tac_libro)}
                hint={Number(d.aeronave.tac_offset) ? `lectura ${fmt(d.aeronave.horas_acumuladas)} + ${fmt(d.aeronave.tac_offset)}` : null} />
              <Kpi label="T.T. hoy" valor={h(c?.tt)} hint={c && c.tt === null ? "sin anclaje" : null} />
              <Kpi label="TSO hoy" valor={h(c?.tso)} />
              <Kpi label="Stickers en el libro" valor={d.stickers.filter((s) => s.estado === "EMITIDO").length} />
            </div>

            {c && c.tt === null && (
              <p className="adf-note" style={{ marginTop: 12 }}>
                Esta parte no tiene anclaje de horas, así que el sistema no propone su T.T.
                {c.ancla_origen ? <> {c.ancla_origen}</> : null}
              </p>
            )}
            {c?.ancla_actualizado_en && c.tt !== null && (
              <p className="adf-section-subtitle" style={{ marginTop: 10 }}>
                Anclaje: {c.ancla_origen || "—"}
              </p>
            )}
          </div>

          {/* ── Lo que falta pegar ─────────────────────────────────────────── */}
          {d.sin_sticker?.length > 0 && (
            <div className="adf-card" style={{ padding: 16, marginBottom: 14 }}>
              <h3 className="adf-section-title" style={{ marginTop: 0 }}>
                <i className="bi bi-exclamation-triangle me-2"></i>
                Órdenes firmadas sin sticker en este libro ({d.sin_sticker.length})
              </h3>
              <div className="adf-table-wrap">
                <table className="adf-table">
                  <thead><tr><th>Orden</th><th>Fecha</th><th>Trabajo</th><th></th></tr></thead>
                  <tbody>
                    {d.sin_sticker.map((o) => (
                      <tr key={o.id_orden} className="inv-clic" onClick={() => setOrden(o.id_orden)}>
                        <td>{o.correlativo}</td>
                        <td>{fFecha(o.fecha)}</td>
                        <td style={{ maxWidth: 420 }}>{o.discrepancia}</td>
                        <td><span className="adf-tag">{o.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── El libro ───────────────────────────────────────────────────── */}
          <div className="adf-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h3 className="adf-section-title" style={{ margin: 0 }}>
                <i className="bi bi-journal-text me-2"></i>Registro del libro
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                {jefe && (
                  <button className="adf-btn secondary" onClick={() => {
                    getPlantillasSticker(id).then((p) => setPlantillas(p)).catch(() => toast.error("No se pudieron cargar"));
                  }}>
                    <i className="bi bi-card-text"></i>Textos de los stickers
                  </button>
                )}
                <button className="adf-btn secondary" onClick={() => setCierre(true)}>
                  <i className="bi bi-journal-bookmark"></i>Cerrar y abrir libro
                </button>
              </div>
            </div>

            {!d.stickers.length ? (
              <p className="adf-section-subtitle" style={{ marginTop: 12 }}>
                Todavía no se emitió ningún sticker para este libro. Se emiten desde la orden de trabajo.
              </p>
            ) : volumenes.map((vol, i) => (
              <div key={i} style={{ marginTop: 16 }}>
                <p className="adf-section-subtitle" style={{ margin: "0 0 6px" }}>
                  <strong>Libro {volumenes.length - i}</strong>{i === 0 ? " (en uso)" : ""}
                </p>
                <div className="adf-table-wrap">
                  <table className="adf-table">
                    <thead>
                      <tr><th>Fecha</th><th>Trabajo</th><th>TAC</th><th>T.T.</th><th>TSO</th><th>Orden</th><th>Mecánico</th><th></th></tr>
                    </thead>
                    <tbody>
                      {vol.map((s) => (
                        <tr key={s.id_sticker} style={s.estado === "ANULADO" ? { opacity: 0.5, textDecoration: "line-through" } : null}>
                          <td>{fFecha(s.fecha)}</td>
                          <td>{s.tipo_etiqueta}</td>
                          <td className="text-end">{fmt(s.tac)}</td>
                          <td className="text-end">{h(s.tt)}</td>
                          <td className="text-end">{h(s.tso)}</td>
                          <td>
                            {s.orden_trabajo_no
                              ? <button className="adf-btn secondary" style={{ padding: "2px 8px" }}
                                  onClick={() => setOrden(s.id_orden)}>{s.orden_trabajo_no}</button>
                              : "—"}
                          </td>
                          <td>{s.mecanico_nombre}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button className="adf-icon-btn" title="Re-imprimir tal como se emitió"
                              onClick={() => abrirStickersPDF(s.id_sticker)}><i className="bi bi-printer"></i></button>
                            {jefe && s.estado === "EMITIDO" && (
                              <button className="adf-icon-btn" title="Anular" onClick={async () => {
                                const motivo = window.prompt("¿Por qué se anula este sticker?");
                                if (!motivo) return;
                                try { await anularSticker(s.id_sticker, motivo); toast.success("Sticker anulado"); cargar(); }
                                catch (e) { toast.error(e.response?.data?.message || "No se pudo anular"); }
                              }}><i className="bi bi-x-circle"></i></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {orden && <OrdenDetalleModal id={orden} onClose={() => setOrden(null)} onCambio={() => { setOrden(null); cargar(); }} />}
      {editando && <FichaParteModal aeronave={av} parte={parte} componente={c} onClose={() => setEditando(false)}
        onGuardado={() => { setEditando(false); cargar(); }} />}
      {plantillas && <PlantillasModal id_aeronave={id} datos={plantillas} onClose={() => setPlantillas(null)} />}
      {cierre && <CierreLibroModal libro={d} parte={parte} onClose={() => setCierre(false)}
        onEmitido={() => { setCierre(false); cargar(); }} />}
    </div>
  );
}

function Kpi({ label, valor, hint }) {
  return (
    <div className="adf-kpi-card">
      <div className="adf-kpi-card__label">{label}</div>
      <div className="adf-kpi-card__value">{valor}</div>
      {hint && <div className="adf-kpi-card__hint">{hint}</div>}
    </div>
  );
}

// ── Ficha y anclaje de la parte (jefe de taller) ───────────────────────────
function FichaParteModal({ aeronave, parte, componente, onClose, onGuardado }) {
  const c = componente || {};
  const [f, setF] = useState({
    nombre: c.nombre || "", marca: c.marca || "", modelo: c.modelo || "",
    mn: c.parte_no || "", sn: c.serie_no || "", tc: c.tipo_certificado || "",
    activo: c.activo !== false,
    tac_ancla: c.horas_aeronave_instalacion ?? "",
    tt_ancla: c.horas_componente_instalacion ?? "",
    tso_ancla: c.tso_ancla ?? "",
    ancla_origen: "",
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarParteAeronave(aeronave.id_aeronave, parte, {
        ...f,
        tac_ancla: f.tac_ancla === "" ? null : f.tac_ancla,
        tt_ancla: f.tt_ancla === "" ? null : f.tt_ancla,
        tso_ancla: f.tso_ancla === "" ? null : f.tso_ancla,
      });
      toast.success("Ficha guardada");
      onGuardado();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo guardar");
    } finally { setGuardando(false); }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-gear"></i></span>
            Ficha del libro · {aeronave?.codigo}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando} onClick={guardar}><i className="bi bi-check"></i>Guardar</button>
            <button className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: 18, maxHeight: "70vh", overflowY: "auto" }}>
          <div className="adf-form-grid">
            <div className="adf-form-field"><label>Marca</label>
              <input value={f.marca} onChange={(e) => set("marca", e.target.value)} /></div>
            <div className="adf-form-field"><label>Modelo</label>
              <input value={f.modelo} onChange={(e) => set("modelo", e.target.value)} /></div>
            <div className="adf-form-field"><label>M/N</label>
              <input value={f.mn} onChange={(e) => set("mn", e.target.value)} /></div>
            <div className="adf-form-field"><label>S/N</label>
              <input value={f.sn} onChange={(e) => set("sn", e.target.value)} /></div>
            <div className="adf-form-field"><label>T.C.</label>
              <input value={f.tc} onChange={(e) => set("tc", e.target.value)} /></div>
            <div className="adf-form-field"><label>Instalada en el avión</label>
              <select value={f.activo ? "1" : "0"} onChange={(e) => set("activo", e.target.value === "1")}>
                <option value="1">Sí</option><option value="0">No, está fuera</option>
              </select></div>
          </div>

          <p className="adf-note" style={{ marginTop: 14 }}>
            <strong>Anclaje de horas.</strong> Se anota el T.T. y el TSO que dice el libro, y el TAC que
            marcaba el avión ese día — <em>tal como lo lee el sistema</em>, sin el corrimiento del
            tacómetro. De ahí en adelante los dos números salen calculados solos. Dejar el T.T. en blanco
            es válido: significa que todavía no se sabe, y el sistema no lo va a inventar.
          </p>
          <div className="adf-form-grid" style={{ marginTop: 10 }}>
            <div className="adf-form-field"><label>TAC del anclaje (lectura)</label>
              <input type="number" step="0.01" value={f.tac_ancla} onChange={(e) => set("tac_ancla", e.target.value)} /></div>
            <div className="adf-form-field"><label>T.T. en ese TAC</label>
              <input type="number" step="0.01" value={f.tt_ancla} onChange={(e) => set("tt_ancla", e.target.value)} /></div>
            <div className="adf-form-field"><label>TSO en ese TAC</label>
              <input type="number" step="0.01" value={f.tso_ancla} onChange={(e) => set("tso_ancla", e.target.value)} /></div>
          </div>
          <div className="adf-form-field" style={{ marginTop: 10 }}>
            <label>De dónde salió (queda anotado)</label>
            <input value={f.ancla_origen} placeholder="Ej: libro de motor, página 41, firmado el 10-ago-2026"
              onChange={(e) => set("ancla_origen", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Textos precargados (jefe de taller) ────────────────────────────────────
function PlantillasModal({ id_aeronave, datos, onClose }) {
  const inicial = {};
  for (const p of datos.plantillas || []) inicial[`${p.parte}|${p.tipo}`] = p.texto;
  const [parte, setParte] = useState("CELULA");
  const [textos, setTextos] = useState(inicial);
  const [guardando, setGuardando] = useState(false);

  const guardar = async (tipo) => {
    setGuardando(true);
    try {
      await guardarPlantillaSticker(id_aeronave, { parte, tipo, texto: textos[`${parte}|${tipo}`] || "" });
      toast.success("Texto guardado");
    } catch (e) { toast.error(e.response?.data?.message || "No se pudo guardar"); }
    finally { setGuardando(false); }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-card-text"></i></span>
            Textos precargados de los stickers
          </span>
          <button className="adf-btn secondary" onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ padding: 18, maxHeight: "70vh", overflowY: "auto" }}>
          <p className="adf-note">
            Es lo que aparece escrito al emitir un sticker; el mecánico lo edita libremente antes de
            firmar. <code>{"{orden}"}</code> se reemplaza por el número de la orden de trabajo y
            <code>{" {proxima}"}</code> por la próxima inspección.
          </p>
          <nav className="inv-tabs" style={{ margin: "14px 0" }}>
            {PARTES.map((p) => (
              <button key={p.parte} className={`inv-tab ${parte === p.parte ? "inv-tab--activa" : ""}`}
                onClick={() => setParte(p.parte)}>{p.etiqueta}</button>
            ))}
          </nav>
          {TIPOS_PLANTILLA.map(([tipo, etiqueta]) => (
            <div className="adf-form-field" key={tipo} style={{ marginTop: 12 }}>
              <label>{etiqueta}</label>
              <textarea rows={3} value={textos[`${parte}|${tipo}`] || ""}
                onChange={(e) => setTextos((p) => ({ ...p, [`${parte}|${tipo}`]: e.target.value }))} />
              <button className="adf-btn secondary" style={{ marginTop: 6 }} disabled={guardando}
                onClick={() => guardar(tipo)}><i className="bi bi-check"></i>Guardar este</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Cierre y apertura de libro ─────────────────────────────────────────────
// Van juntos y con el MISMO TAC y T.T.: son el par del mismo momento, uno se
// pega al final del libro viejo y el otro al principio del nuevo.
function CierreLibroModal({ libro, parte, onClose, onEmitido }) {
  const c = libro?.componente;
  const [f, setF] = useState({
    fecha: hoy(), lugar: "Ilopango",
    tac: libro?.aeronave?.tac_libro ?? "", tt: c?.tt ?? "", tso: c?.tso ?? "",
    texto_cierre: "En esta fecha se cierra libro de registro por términos de espacio para anotaciones.",
    texto_apertura: "En esta fecha se abre nuevo libro de registro para anotaciones.",
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const emitir = async () => {
    if (!f.tac) return toast.error("Falta el TAC");
    setGuardando(true);
    try {
      const comun = { parte, tac: f.tac, tt: f.tt === "" ? null : f.tt, tso: f.tso === "" ? null : f.tso };
      const cierre = await emitirStickersLibres({
        id_aeronave: libro.aeronave.id_aeronave, tipo: "CIERRE", fecha: f.fecha, lugar: f.lugar,
        partes: [{ ...comun, texto: f.texto_cierre }],
      });
      const apertura = await emitirStickersLibres({
        id_aeronave: libro.aeronave.id_aeronave, tipo: "APERTURA", fecha: f.fecha, lugar: f.lugar,
        partes: [{ ...comun, texto: f.texto_apertura }],
      });
      toast.success("Cierre y apertura emitidos");
      abrirStickersPDF([...cierre.ids, ...apertura.ids]);
      onEmitido();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudieron emitir");
    } finally { setGuardando(false); }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-journal-bookmark"></i></span>
            Cerrar y abrir libro
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando} onClick={emitir}>
              <i className="bi bi-printer"></i>{guardando ? "Emitiendo…" : "Emitir los dos"}
            </button>
            <button className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: 18, maxHeight: "70vh", overflowY: "auto" }}>
          <p className="adf-note">
            Se emiten los dos juntos y con el mismo TAC y T.T., como en el papel: uno se pega al final
            del libro que se acabó y el otro al principio del nuevo.
          </p>
          <div className="adf-form-grid" style={{ marginTop: 14 }}>
            <div className="adf-form-field"><label>Fecha</label>
              <input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} /></div>
            <div className="adf-form-field"><label>TAC</label>
              <input type="number" step="0.01" value={f.tac} onChange={(e) => set("tac", e.target.value)} /></div>
            <div className="adf-form-field"><label>T.T.</label>
              <input type="number" step="0.01" value={f.tt} onChange={(e) => set("tt", e.target.value)} /></div>
            <div className="adf-form-field"><label>TSO</label>
              <input type="number" step="0.01" value={f.tso} onChange={(e) => set("tso", e.target.value)} /></div>
          </div>
          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>Texto del cierre</label>
            <textarea rows={3} value={f.texto_cierre} onChange={(e) => set("texto_cierre", e.target.value)} />
          </div>
          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>Texto de la apertura</label>
            <textarea rows={3} value={f.texto_apertura} onChange={(e) => set("texto_apertura", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
