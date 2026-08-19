import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  crearOrden, getAeronavesBodega, getSugerenciaInspeccion, crearReporteInspeccion,
  getPersonalTaller,
} from "../../../services/tallerApi";
import { hoy } from "../inventario/formato";

/**
 * "Iniciar un mantenimiento" — abre la Orden de Trabajo.
 *
 * Pide lo mínimo y se apoya en lo que el sistema ya sabe: al elegir el avión
 * propone el tacómetro actual y qué inspección le toca, así el técnico casi solo
 * confirma. Opcionalmente registra de una vez el Reporte de Inspección, que es
 * la entrega del avión de Operaciones al Taller.
 *
 * `desdeCola` es el avión que el técnico tocó en la lista de espera: viene con
 * el avión ya elegido y el trabajo queda enlazado a ESE mantenimiento, que es lo
 * que después cierra el circuito con Operaciones.
 */
export default function AbrirTrabajoModal({ onClose, onCreada, desdeCola = null }) {
  const [aeronaves, setAeronaves] = useState([]);
  // En el taller casi nunca se trabaja solo: se elige al arrancar quién ayuda,
  // no al firmar, que es cuando ya nadie se acuerda.
  const [companeros, setCompaneros] = useState([]);
  const [sug, setSug] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState({
    id_aeronave: desdeCola?.id_aeronave ? String(desdeCola.id_aeronave) : "",
    fecha: hoy(), tacometro: "",
    discrepancia: desdeCola?.descripcion || "",
    piloto_operador: "", con_reporte: false,
    tipo_inspeccion: desdeCola?.tipo || "",
    id_aprendiz: "",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { getAeronavesBodega().then(setAeronaves).catch(() => {}); }, []);

  // Todo el personal del taller menos uno mismo: el que ayuda puede ser el
  // aprendiz o el otro mecánico.
  useEffect(() => {
    let yo = null;
    try { yo = JSON.parse(localStorage.getItem("user") || "{}")?.id_usuario; } catch { /* */ }
    getPersonalTaller().then((r) => setCompaneros(r.filter((x) => x.id_usuario !== yo))).catch(() => {});
  }, []);

  // Al elegir el avión, el sistema propone tacómetro e inspección próxima.
  useEffect(() => {
    if (!f.id_aeronave) { setSug(null); return; }
    getSugerenciaInspeccion(f.id_aeronave)
      .then((s) => {
        setSug(s);
        const proxima = s.tareas?.[0];
        setF((p) => ({
          ...p,
          tacometro: p.tacometro || Number(s.aeronave.horas_acumuladas || 0).toFixed(2),
          tipo_inspeccion: p.tipo_inspeccion || proxima?.nombre || "",
          discrepancia: p.discrepancia || (proxima ? `Efectuar ${proxima.nombre.toLowerCase()} al avión, motor y hélice` : ""),
        }));
      })
      .catch(() => setSug(null));
  }, [f.id_aeronave]);

  const guardar = async () => {
    if (!f.id_aeronave) return toast.error("Elegí el avión");
    if (!f.discrepancia.trim()) return toast.error("Escribí qué hay que hacer o cuál es la falla");
    setGuardando(true);
    try {
      let id_reporte = null;
      if (f.con_reporte) {
        if (!f.piloto_operador.trim()) {
          setGuardando(false);
          return toast.error("Anotá qué piloto entregó el avión");
        }
        const ri = await crearReporteInspeccion({
          id_aeronave: Number(f.id_aeronave), fecha: f.fecha,
          tacometro: f.tacometro === "" ? null : Number(f.tacometro),
          piloto_nombre: f.piloto_operador, tipo_inspeccion: f.tipo_inspeccion,
        });
        id_reporte = ri.id_reporte;
      }
      const o = await crearOrden({
        id_aeronave: Number(f.id_aeronave), fecha: f.fecha,
        tacometro: f.tacometro === "" ? null : Number(f.tacometro),
        piloto_operador: f.piloto_operador || null,
        discrepancia: f.discrepancia, id_reporte,
        id_aprendiz: f.id_aprendiz ? Number(f.id_aprendiz) : null,
        // Enlaza al mantenimiento que Operaciones abrió: es lo que hace que el
        // avión salga de la cola y que al aprobar se les avise a ellos.
        id_mantenimiento: desdeCola?.id_mantenimiento || null,
      });
      toast.success(`Trabajo abierto · ${o.correlativo}`);
      onCreada(o);
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo abrir el trabajo");
    } finally {
      setGuardando(false);
    }
  };

  const proxima = sug?.tareas?.[0];

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-play-circle"></i></span>
            Iniciar un mantenimiento
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando} onClick={guardar}><i className="bi bi-check"></i>Abrir</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <div className="adf-form-field">
            <label>¿Qué avión?</label>
            <select value={f.id_aeronave} onChange={(e) => set("id_aeronave", e.target.value)}>
              <option value="">— Elegir —</option>
              {aeronaves.map((a) => (
                <option key={a.id_aeronave} value={a.id_aeronave}>
                  {a.codigo}{a.es_externa ? " (tercero)" : ""}
                </option>
              ))}
            </select>
          </div>

          {proxima && (
            <p className="adf-note" style={{ marginTop: 10 }}>
              A este avión le toca <strong>{proxima.nombre}</strong>
              {proxima.proxima_horas ? ` a las ${Number(proxima.proxima_horas).toFixed(0)} h` : ""}.
              Lleva {Number(sug.aeronave.horas_acumuladas).toFixed(2)} h.
            </p>
          )}

          <div className="adf-form-grid" style={{ marginTop: 12 }}>
            <div className="adf-form-field">
              <label>Fecha</label>
              <input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>Tacómetro</label>
              <input type="number" step="0.01" value={f.tacometro} onChange={(e) => set("tacometro", e.target.value)} />
            </div>
          </div>

          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>¿Qué hay que hacer? / ¿Cuál es la falla?</label>
            <textarea rows={3} value={f.discrepancia} onChange={(e) => set("discrepancia", e.target.value)} />
          </div>

          {/* Quién acompaña. Va acá y no al firmar: en el taller casi siempre son
              dos —un mecánico y un aprendiz— y los dos van en el papel. */}
          {companeros.length > 0 && (
            <div className="adf-form-field" style={{ marginTop: 12 }}>
              <label>¿Quién te está ayudando? (opcional)</label>
              <select value={f.id_aprendiz} onChange={(e) => set("id_aprendiz", e.target.value)}>
                <option value="">Nadie, trabajo solo</option>
                {companeros.map((c) => (
                  <option key={c.id_usuario} value={c.id_usuario}>
                    {c.nombre}
                    {c.certificado_aprendiz ? ` · cert. ${c.certificado_aprendiz}` : c.licencia_tma ? ` · ${c.licencia_tma}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>¿Quién entregó el avión?</label>
            <input value={f.piloto_operador} onChange={(e) => set("piloto_operador", e.target.value)} placeholder="Piloto u operador" />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: "0.9rem", cursor: "pointer" }}>
            <input type="checkbox" checked={f.con_reporte} onChange={(e) => set("con_reporte", e.target.checked)} />
            Registrar también el reporte de inspección
          </label>
          <p className="adf-note" style={{ marginTop: 8 }}>
            El reporte es la entrega formal del avión de Operaciones al Taller. Si ya venía uno en
            papel, marcá esto para dejarlo registrado junto con el trabajo.
          </p>
        </div>
      </div>
    </div>
  );
}
