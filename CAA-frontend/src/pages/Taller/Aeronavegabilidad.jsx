import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  getDashboardTaller, getComponentes, crearComponente,
  getTareas, crearTarea, actualizarTarea, registrarCumplimiento, getHistorialAeronave,
} from "../../services/tallerApi";

const TIPO_COMP = [
  { v: "CELULA", t: "Célula" }, { v: "MOTOR", t: "Motor" },
  { v: "HELICE", t: "Hélice" }, { v: "COMPONENTE", t: "Componente" },
];
const TIPO_TAREA = [
  { v: "INSPECCION", t: "Inspección" }, { v: "AD", t: "Directiva (AD)" },
  { v: "SB", t: "Boletín (SB)" }, { v: "VIDA_LIMITE", t: "Vida límite" }, { v: "OTRO", t: "Otro" },
];

function num(v, d = 1) { const n = parseFloat(v); return isNaN(n) ? "—" : n.toFixed(d); }

function EstadoTag({ estado }) {
  const map = {
    VENCIDO: ["red", "Vencido"], PROXIMO: ["amber", "Próximo"],
    VIGENTE: ["green", "Vigente"], N_A: ["gray", "N/A"],
  };
  const [cls, txt] = map[estado] || map.N_A;
  return <span className={`adf-tag ${cls}`}>{txt}</span>;
}

export default function Aeronavegabilidad() {
  const [params, setParams] = useSearchParams();
  const [aeronaves, setAeronaves] = useState([]);
  const [idAeronave, setIdAeronave] = useState(params.get("aeronave") || "");
  const [componentes, setComponentes] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modalComp, setModalComp] = useState(false);
  const [modalTarea, setModalTarea] = useState(false);
  const [editarTarea, setEditarTarea] = useState(null); // tarea a editar
  const [cumplir, setCumplir] = useState(null); // tarea a cumplir

  // Cargar flota una vez.
  useEffect(() => {
    (async () => {
      try {
        const d = await getDashboardTaller();
        setAeronaves(d.aeronaves);
        if (!idAeronave && d.aeronaves.length) {
          setIdAeronave(String(d.aeronaves[0].id_aeronave));
        }
      } catch (e) {
        toast.error(e.response?.data?.message || "Error al cargar la flota");
      }
    })();
  }, []); // eslint-disable-line

  const cargar = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const [comps, tks, hist] = await Promise.all([
        getComponentes(id), getTareas({ id_aeronave: id }), getHistorialAeronave(id),
      ]);
      setComponentes(comps);
      setTareas(tks);
      setHistorial(hist);
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (idAeronave) { cargar(idAeronave); setParams({ aeronave: idAeronave }, { replace: true }); }
  }, [idAeronave, cargar, setParams]);

  const aeronaveSel = aeronaves.find((a) => String(a.id_aeronave) === String(idAeronave));

  return (
    <>
      <h2 className="adf-section-title"><i className="bi bi-clipboard2-check me-2"></i>Aeronavegabilidad</h2>
      <p className="adf-section-subtitle">Componentes y seguimiento programado (inspecciones, AD, SB, vida límite).</p>

      <div className="adf-card" style={{ marginBottom: "var(--sp-5)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontWeight: 600 }}>Aeronave:</label>
        <select value={idAeronave} onChange={(e) => setIdAeronave(e.target.value)} style={{ minWidth: 240, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--c-line-2)" }}>
          {aeronaves.map((a) => (
            <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo} — {a.modelo}</option>
          ))}
        </select>
        {aeronaveSel && (
          <span style={{ color: "var(--c-ink-3)", fontFamily: "var(--font-mono, monospace)" }}>
            {num(aeronaveSel.horas_acumuladas)}h célula
          </span>
        )}
      </div>

      {loading ? <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p> : (
        <>
          {/* Componentes */}
          <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 className="adf-section-title" style={{ fontSize: "1.05rem", margin: 0 }}>Componentes</h3>
              <button className="adf-btn small" onClick={() => setModalComp(true)}><i className="bi bi-plus-lg"></i> Componente</button>
            </div>
            {componentes.length === 0 ? <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Sin componentes registrados.</p> : (
              <table className="adf-table">
                <thead><tr><th>Tipo</th><th>Nombre</th><th>Parte N°</th><th>Serie</th><th className="amount">Horas comp.</th></tr></thead>
                <tbody>
                  {componentes.map((c) => (
                    <tr key={c.id_componente}>
                      <td><span className="adf-tag blue">{TIPO_COMP.find(t => t.v === c.tipo)?.t || c.tipo}</span></td>
                      <td>{c.nombre}{c.posicion ? ` · ${c.posicion}` : ""}</td>
                      <td>{c.parte_no || "—"}</td>
                      <td>{c.serie_no || "—"}</td>
                      <td className="amount">{num(c.horas_componente)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Tareas programadas */}
          <div className="adf-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 className="adf-section-title" style={{ fontSize: "1.05rem", margin: 0 }}>Tareas programadas</h3>
              <button className="adf-btn small" onClick={() => setModalTarea(true)}><i className="bi bi-plus-lg"></i> Tarea</button>
            </div>
            {tareas.length === 0 ? <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Sin tareas programadas.</p> : (
              <table className="adf-table">
                <thead>
                  <tr><th>Estado</th><th>Tarea</th><th>Tipo</th><th className="amount">Próx. horas</th><th className="amount">Restan h</th><th>Próx. fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {tareas.map((t) => (
                    <tr key={t.id_tarea}>
                      <td><EstadoTag estado={t.estado} /></td>
                      <td>{t.nombre}{t.referencia ? <span style={{ color: "var(--c-ink-4)" }}> · {t.referencia}</span> : ""}{t.componente_nombre ? <div style={{ fontSize: "0.78rem", color: "var(--c-ink-4)" }}>{t.componente_nombre}</div> : null}</td>
                      <td><span className="adf-tag gray">{TIPO_TAREA.find(x => x.v === t.tipo)?.t || t.tipo}</span></td>
                      <td className="amount">{t.proxima_horas != null ? `${num(t.proxima_horas)}h` : "—"}</td>
                      <td className={`amount ${t.horas_restantes != null && t.horas_restantes <= 0 ? "neg" : ""}`}>{t.horas_restantes != null ? num(t.horas_restantes) : "—"}</td>
                      <td>{t.proxima_fecha ? new Date(t.proxima_fecha).toLocaleDateString("es-SV", { timeZone: "UTC" }) : "—"}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <button className="adf-btn small secondary" onClick={() => setEditarTarea(t)}>Editar</button>
                        <button className="adf-btn small secondary" onClick={() => setCumplir(t)}>Cumplir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Historial de mantenimientos (últimos cumplimientos de la aeronave) */}
          <div className="adf-card" style={{ marginTop: "var(--sp-5)" }}>
            <h3 className="adf-section-title" style={{ fontSize: "1.05rem", margin: "0 0 10px" }}>
              <i className="bi bi-clock-history me-2"></i>Últimos mantenimientos realizados
            </h3>
            {historial.length === 0 ? (
              <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Todavía no hay mantenimientos registrados para esta aeronave.</p>
            ) : (
              <table className="adf-table">
                <thead>
                  <tr><th>Fecha</th><th>Tarea</th><th>Tipo</th><th className="amount">Horas</th><th>Realizado por</th><th>Notas</th></tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id_cumplimiento}>
                      <td>{h.fecha ? new Date(h.fecha).toLocaleDateString("es-SV", { timeZone: "UTC" }) : "—"}</td>
                      <td>{h.tarea_nombre}{h.referencia ? <span style={{ color: "var(--c-ink-4)" }}> · {h.referencia}</span> : ""}</td>
                      <td><span className="adf-tag gray">{TIPO_TAREA.find(x => x.v === h.tarea_tipo)?.t || h.tarea_tipo}</span></td>
                      <td className="amount">{h.horas_aeronave != null ? `${num(h.horas_aeronave)}h` : "—"}</td>
                      <td>{h.realizado_por || "—"}</td>
                      <td style={{ color: "var(--c-ink-3)" }}>{h.descripcion || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {modalComp && (
        <ModalComponente
          idAeronave={idAeronave}
          onClose={() => setModalComp(false)}
          onSaved={() => { setModalComp(false); cargar(idAeronave); }}
        />
      )}
      {modalTarea && (
        <ModalTarea
          idAeronave={idAeronave}
          componentes={componentes}
          onClose={() => setModalTarea(false)}
          onSaved={() => { setModalTarea(false); cargar(idAeronave); }}
        />
      )}
      {editarTarea && (
        <ModalTarea
          idAeronave={idAeronave}
          componentes={componentes}
          tarea={editarTarea}
          onClose={() => setEditarTarea(null)}
          onSaved={() => { setEditarTarea(null); cargar(idAeronave); }}
        />
      )}
      {cumplir && (
        <ModalCumplir
          tarea={cumplir}
          onClose={() => setCumplir(null)}
          onSaved={() => { setCumplir(null); cargar(idAeronave); }}
        />
      )}
    </>
  );
}

// ── Modal: nuevo componente ────────────────────────────────────────────────
function ModalComponente({ idAeronave, onClose, onSaved }) {
  const [f, setF] = useState({ tipo: "MOTOR", nombre: "", parte_no: "", serie_no: "", posicion: "", fecha_instalacion: "", horas_aeronave_instalacion: "", horas_componente_instalacion: "", ciclos_instalacion: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });

  const guardar = async (e) => {
    e.preventDefault();
    if (!f.nombre.trim()) return toast.error("Ingresá un nombre");
    setSaving(true);
    try {
      await crearComponente({
        id_aeronave: Number(idAeronave), tipo: f.tipo, nombre: f.nombre,
        parte_no: f.parte_no, serie_no: f.serie_no, posicion: f.posicion,
        fecha_instalacion: f.fecha_instalacion || null,
        horas_aeronave_instalacion: f.horas_aeronave_instalacion === "" ? null : Number(f.horas_aeronave_instalacion),
        horas_componente_instalacion: f.horas_componente_instalacion === "" ? null : Number(f.horas_componente_instalacion),
        ciclos_instalacion: f.ciclos_instalacion === "" ? null : Number(f.ciclos_instalacion),
      });
      toast.success("Componente registrado");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally { setSaving(false); }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title"><span className="adf-edit-head__chip"><i className="bi bi-cpu"></i></span>Nuevo componente</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" form="formComp" className="adf-btn" disabled={saving}><i className="bi bi-check"></i>Guardar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <form id="formComp" onSubmit={guardar}>
            <div className="adf-form-grid">
              <div className="adf-form-field"><label>Tipo</label>
                <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{TIPO_COMP.map(t => <option key={t.v} value={t.v}>{t.t}</option>)}</select></div>
              <div className="adf-form-field"><label>Nombre</label><input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Lycoming O-235" /></div>
              <div className="adf-form-field"><label>N° de parte</label><input value={f.parte_no} onChange={(e) => set("parte_no", e.target.value)} /></div>
              <div className="adf-form-field"><label>N° de serie</label><input value={f.serie_no} onChange={(e) => set("serie_no", e.target.value)} /></div>
              <div className="adf-form-field"><label>Posición</label><input value={f.posicion} onChange={(e) => set("posicion", e.target.value)} placeholder="Ej. único / izq" /></div>
              <div className="adf-form-field"><label>Fecha instalación</label><input type="date" value={f.fecha_instalacion} onChange={(e) => set("fecha_instalacion", e.target.value)} /></div>
              <div className="adf-form-field"><label>Horas célula al instalar</label><input type="number" step="0.1" value={f.horas_aeronave_instalacion} onChange={(e) => set("horas_aeronave_instalacion", e.target.value)} placeholder="0" /></div>
              <div className="adf-form-field"><label>Horas del componente al instalar</label><input type="number" step="0.1" value={f.horas_componente_instalacion} onChange={(e) => set("horas_componente_instalacion", e.target.value)} placeholder="0 (nuevo)" /></div>
              <div className="adf-form-field"><label>Ciclos al instalar</label><input type="number" value={f.ciclos_instalacion} onChange={(e) => set("ciclos_instalacion", e.target.value)} placeholder="0" /></div>
            </div>
            <p className="adf-note" style={{ marginTop: 12 }}>Las horas actuales del componente se calculan como: horas de la célula − horas de la célula al instalar + horas del componente al instalar.</p>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Modal: nueva tarea programada / editar tarea existente ────────────────
// Sin `tarea` = crear; con `tarea` = editar. El modo "Próxima revisión
// (horas)" permite fijar directamente a qué horas vence, sin necesitar saber
// cuándo se hizo la última vez — útil para sembrar/corregir "en limpio"
// cuando no hay historial confiable de fechas.
function ModalTarea({ idAeronave, componentes, tarea, onClose, onSaved }) {
  const editando = !!tarea;
  const [f, setF] = useState(() => tarea ? {
    tipo: tarea.tipo, nombre: tarea.nombre || "", referencia: tarea.referencia || "",
    id_componente: tarea.id_componente || "", descripcion: tarea.descripcion || "",
    recurrente: tarea.recurrente,
    intervalo_horas: tarea.intervalo_horas ?? "", intervalo_dias: tarea.intervalo_dias ?? "", intervalo_ciclos: tarea.intervalo_ciclos ?? "",
    modoHoras: "proxima", horasCampo: tarea.proxima_horas ?? "", ultima_fecha: "",
  } : {
    tipo: "INSPECCION", nombre: "", referencia: "", id_componente: "", descripcion: "",
    recurrente: true, intervalo_horas: "", intervalo_dias: "", intervalo_ciclos: "",
    modoHoras: "proxima", horasCampo: "", ultima_fecha: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });

  const guardar = async (e) => {
    e.preventDefault();
    if (!f.nombre.trim()) return toast.error("Ingresá un nombre");
    if (f.intervalo_horas === "" && f.intervalo_dias === "" && f.intervalo_ciclos === "") {
      return toast.error("Definí al menos un intervalo (horas, días o ciclos)");
    }
    if (f.modoHoras === "proxima" && f.horasCampo !== "" && f.intervalo_horas === "") {
      return toast.error("Para indicar la próxima revisión en horas hace falta el intervalo en horas");
    }
    setSaving(true);
    const payload = {
      id_componente: f.id_componente ? Number(f.id_componente) : null,
      nombre: f.nombre, referencia: f.referencia, descripcion: f.descripcion,
      tipo: f.tipo, recurrente: f.recurrente,
      intervalo_horas: f.intervalo_horas === "" ? null : Number(f.intervalo_horas),
      intervalo_dias: f.intervalo_dias === "" ? null : Number(f.intervalo_dias),
      intervalo_ciclos: f.intervalo_ciclos === "" ? null : Number(f.intervalo_ciclos),
    };
    if (f.horasCampo !== "") {
      if (f.modoHoras === "proxima") payload.proxima_horas = Number(f.horasCampo);
      else payload.ultima_horas = Number(f.horasCampo);
    }
    if (f.ultima_fecha) payload.ultima_fecha = f.ultima_fecha;
    try {
      if (editando) {
        await actualizarTarea(tarea.id_tarea, payload);
        toast.success("Tarea actualizada");
      } else {
        await crearTarea({ id_aeronave: Number(idAeronave), ...payload });
        toast.success("Tarea programada creada");
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally { setSaving(false); }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title"><span className="adf-edit-head__chip"><i className="bi bi-clipboard-plus"></i></span>{editando ? `Editar tarea: ${tarea.nombre}` : "Nueva tarea programada"}</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" form="formTarea" className="adf-btn" disabled={saving}><i className="bi bi-check"></i>Guardar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <form id="formTarea" onSubmit={guardar}>
            <div className="adf-form-grid">
              <div className="adf-form-field"><label>Tipo</label>
                <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{TIPO_TAREA.map(t => <option key={t.v} value={t.v}>{t.t}</option>)}</select></div>
              <div className="adf-form-field"><label>Nombre</label><input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Inspección 100 horas" /></div>
              <div className="adf-form-field"><label>Referencia (AD/SB)</label><input value={f.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="Ej. AD 2020-12-05" /></div>
              <div className="adf-form-field"><label>Componente (opcional)</label>
                <select value={f.id_componente} onChange={(e) => set("id_componente", e.target.value)} disabled={editando} title={editando ? "El componente no se puede cambiar al editar" : undefined}>
                  <option value="">— Aeronave completa —</option>
                  {componentes.map(c => <option key={c.id_componente} value={c.id_componente}>{c.nombre}</option>)}
                </select></div>
              <div className="adf-form-field"><label>Intervalo (horas)</label><input type="number" step="0.1" value={f.intervalo_horas} onChange={(e) => set("intervalo_horas", e.target.value)} placeholder="Ej. 100" /></div>
              <div className="adf-form-field"><label>Intervalo (días)</label><input type="number" value={f.intervalo_dias} onChange={(e) => set("intervalo_dias", e.target.value)} placeholder="Ej. 365" /></div>
              <div className="adf-form-field"><label>Intervalo (ciclos)</label><input type="number" value={f.intervalo_ciclos} onChange={(e) => set("intervalo_ciclos", e.target.value)} /></div>
              <div className="adf-form-field"><label>¿Qué dato tenés?</label>
                <select value={f.modoHoras} onChange={(e) => set("modoHoras", e.target.value)}>
                  <option value="proxima">Próxima revisión (horas)</option>
                  <option value="ultima">Última realización (horas)</option>
                </select></div>
              <div className="adf-form-field">
                <label>{f.modoHoras === "proxima" ? "Próxima revisión (horas)" : "Última realización (horas)"}</label>
                <input
                  type="number" step="0.1" value={f.horasCampo}
                  onChange={(e) => set("horasCampo", e.target.value)}
                  placeholder={f.modoHoras === "proxima" ? "Ej. 150" : "Horas actuales si vacío"}
                />
              </div>
              <div className="adf-form-field"><label>Fecha de referencia (opcional)</label><input type="date" value={f.ultima_fecha} onChange={(e) => set("ultima_fecha", e.target.value)} /></div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer", marginTop: 10 }}>
              <input type="checkbox" checked={f.recurrente} onChange={(e) => set("recurrente", e.target.checked)} />
              Recurrente (vuelve a vencer tras cada cumplimiento)
            </label>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Modal: registrar cumplimiento ──────────────────────────────────────────
function ModalCumplir({ tarea, onClose, onSaved }) {
  const [f, setF] = useState({ fecha: new Date().toISOString().slice(0, 10), horas_aeronave: "", ciclos: "", realizado_por: "", descripcion: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });

  const guardar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const upd = await registrarCumplimiento(tarea.id_tarea, {
        fecha: f.fecha || null,
        horas_aeronave: f.horas_aeronave === "" ? null : Number(f.horas_aeronave),
        ciclos: f.ciclos === "" ? null : Number(f.ciclos),
        realizado_por: f.realizado_por, descripcion: f.descripcion,
      });
      // Mostrar el nuevo vencimiento para que el efecto del cumplimiento sea claro.
      const partes = [];
      if (upd?.proxima_horas != null) partes.push(`${num(upd.proxima_horas)}h`);
      if (upd?.proxima_fecha) partes.push(new Date(upd.proxima_fecha).toLocaleDateString("es-SV", { timeZone: "UTC" }));
      toast.success(partes.length ? `Cumplido. Próximo vencimiento: ${partes.join(" · ")}` : "Cumplimiento registrado — reloj reiniciado");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al registrar");
    } finally { setSaving(false); }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title"><span className="adf-edit-head__chip"><i className="bi bi-check2-circle"></i></span>Cumplir: {tarea.nombre}</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" form="formCump" className="adf-btn" disabled={saving}><i className="bi bi-check"></i>Registrar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <form id="formCump" onSubmit={guardar}>
            <div className="adf-form-grid">
              <div className="adf-form-field"><label>Fecha</label><input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} /></div>
              <div className="adf-form-field"><label>Horas de la aeronave</label><input type="number" step="0.1" value={f.horas_aeronave} onChange={(e) => set("horas_aeronave", e.target.value)} placeholder="Actuales si vacío" /></div>
              <div className="adf-form-field"><label>Ciclos</label><input type="number" value={f.ciclos} onChange={(e) => set("ciclos", e.target.value)} /></div>
              <div className="adf-form-field"><label>Realizado por (mecánico/licencia)</label><input value={f.realizado_por} onChange={(e) => set("realizado_por", e.target.value)} /></div>
            </div>
            <div className="adf-form-field" style={{ marginTop: 10 }}><label>Descripción / notas</label>
              <textarea rows={3} value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></div>
          </form>
        </div>
      </div>
    </div>
  );
}
