import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  reservarSubidaManual, registrarManual, subirRevisionManual, editarManual, borrarManual, getTablaPaquetes,
} from "../../../services/manualesApi";
import { CATEGORIA, pesoLegible, mensajeError } from "./formatoManual";
import { subirAStorage } from "./subirManual";

/**
 * Subir un manual, subir una revisión nueva, o editar sus datos.
 * El archivo va DIRECTO del navegador a Storage (spec §10); el backend después
 * lo lee para sacar la huella y las páginas.
 */
export default function ManualFormModal({ modo, manual, onClose, onGuardado }) {
  const base = manual || {};
  const [f, setF] = useState({
    titulo: base.titulo || "",
    categoria: base.categoria || "MANTENIMIENTO",
    fabricante: base.fabricante || "",
    numero_parte: base.numero_parte || "",
    revision: modo === "revision" ? "" : base.revision || "",
    es_general: !!base.es_general,
    aeronaves: (base.aeronaves || []).map((a) => a.id_aeronave),
    confirmar: false,
  });
  const [archivo, setArchivo] = useState(null);
  const [aviones, setAviones] = useState([]);
  const [progreso, setProgreso] = useState(null); // null | 0..1 | "leyendo"
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { getTablaPaquetes().then((t) => setAviones(t.aeronaves)).catch(() => {}); }, []);

  const toggleAvion = (id) =>
    set("aeronaves", f.aeronaves.includes(id) ? f.aeronaves.filter((x) => x !== id) : [...f.aeronaves, id]);

  // La asignación que dedujo el sistema se confirma al editar o al subir la
  // revisión nueva: el backend no la da por buena sola en ninguno de los dos.
  const pideConfirmar = modo !== "nuevo" && !!manual?.necesita_confirmacion;

  const datos = () => ({
    titulo: f.titulo, categoria: f.categoria, fabricante: f.fabricante, numero_parte: f.numero_parte,
    revision: f.revision, es_general: f.es_general, aeronaves: f.aeronaves,
    ...(pideConfirmar && f.confirmar ? { confirmar_asignacion: true } : {}),
  });

  const guardar = async () => {
    if (!f.titulo.trim()) return toast.error("Escribí el título del manual");
    if (modo === "revision" && !f.revision.trim()) return toast.error("Escribí qué revisión es");
    if (modo !== "editar") {
      if (!archivo) return toast.error("Elegí el PDF");
      if (!/\.pdf$/i.test(archivo.name) && archivo.type !== "application/pdf") return toast.error("Tiene que ser un PDF");
    }
    setGuardando(true);
    try {
      if (modo === "editar") {
        await editarManual(manual.id_manual, datos());
        toast.success("Manual actualizado");
      } else {
        const { ruta, signedUrl } = await reservarSubidaManual();
        setProgreso(0);
        await subirAStorage(signedUrl, archivo, setProgreso);
        setProgreso("leyendo");
        if (modo === "nuevo") await registrarManual({ ruta, ...datos() });
        else await subirRevisionManual(manual.id_manual, { ruta, ...datos() });
        toast.success(modo === "nuevo" ? "Manual agregado a la biblioteca" : "Revisión cargada; la anterior quedó reemplazada");
      }
      onGuardado();
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar"));
      setProgreso(null);
    } finally {
      setGuardando(false);
    }
  };

  const archivar = async () => {
    if (!window.confirm(`¿Archivar «${manual.titulo}»? Deja de aparecer en la biblioteca, pero los paquetes y órdenes que lo usan lo siguen viendo.`)) return;
    try {
      await editarManual(manual.id_manual, { archivar: true });
      toast.success("Manual archivado");
      onGuardado();
    } catch (e) { toast.error(mensajeError(e, "No se pudo archivar")); }
  };
  const borrar = async () => {
    if (!window.confirm(`¿Borrar «${manual.titulo}» de la biblioteca?`)) return;
    try {
      await borrarManual(manual.id_manual);
      toast.success("Manual borrado");
      onGuardado();
    } catch (e) { toast.error(mensajeError(e, "No se pudo borrar")); }
  };

  const titulo = { nuevo: "Subir manual", revision: "Subir revisión nueva", editar: "Editar manual" }[modo];
  const pct = typeof progreso === "number" ? Math.round(progreso * 100) : 100;

  return (
    <div className="adf-modal-backdrop" onClick={(e) => { e.stopPropagation(); if (!guardando) onClose(); }}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-book"></i></span>{titulo}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="adf-btn" disabled={guardando} onClick={guardar}>
              <i className="bi bi-check"></i>{guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="adf-btn secondary" disabled={guardando} onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "var(--sp-4)" }}>
          {modo === "revision" && (
            <p className="adf-note">
              <i className="bi bi-info-circle"></i>
              Reemplaza a <strong>{manual.titulo}{manual.revision ? ` · ${manual.revision}` : ""}</strong>. La anterior
              queda archivada y los paquetes siguen apuntando a ella hasta que los actualices.
            </p>
          )}
          {modo !== "editar" && (
            <div className="adf-form-field">
              <label htmlFor="man-archivo">Archivo PDF</label>
              <input id="man-archivo" type="file" accept="application/pdf,.pdf" disabled={guardando}
                onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
              {archivo && <small className="man-tenue">{archivo.name} · {pesoLegible(archivo.size)}</small>}
              {progreso !== null && (
                <div className="man-progreso" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${pct}%` }} />
                  <span>{progreso === "leyendo" ? "Revisando el PDF…" : `Subiendo ${pct}%`}</span>
                </div>
              )}
            </div>
          )}
          <div className="adf-form-grid" style={{ marginTop: 12 }}>
            <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="man-titulo">Título</label>
              <input id="man-titulo" value={f.titulo} maxLength={200} placeholder="PA-38-112 Airplane Maintenance Manual"
                onChange={(e) => set("titulo", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label htmlFor="man-cat">Tipo</label>
              <select id="man-cat" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
                {Object.entries(CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="adf-form-field">
              <label htmlFor="man-fab">Fabricante</label>
              <input id="man-fab" value={f.fabricante} maxLength={80} placeholder="Piper"
                onChange={(e) => set("fabricante", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label htmlFor="man-np">Número de parte</label>
              <input id="man-np" value={f.numero_parte} maxLength={40} placeholder="761-660"
                onChange={(e) => set("numero_parte", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label htmlFor="man-rev">Revisión</label>
              <input id="man-rev" value={f.revision} maxLength={80} placeholder="Oct 31, 2019"
                onChange={(e) => set("revision", e.target.value)} />
            </div>
          </div>
          <fieldset className="adf-form-field man-fieldset" style={{ marginTop: 12 }}>
            <legend>¿A qué aviones aplica?</legend>
            <label className="man-check">
              <input type="checkbox" checked={f.es_general} onChange={(e) => set("es_general", e.target.checked)} />
              A toda la flota (manual general: AC 43.13, Champion, Slick…)
            </label>
            {!f.es_general && (
              <div className="man-aviones">
                {aviones.map((a) => (
                  <label key={a.id_aeronave} className="man-check">
                    <input type="checkbox" checked={f.aeronaves.includes(a.id_aeronave)} onChange={() => toggleAvion(a.id_aeronave)} />
                    {a.codigo}{a.es_externa ? " (externo)" : ""}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          {pideConfirmar && (
            <div className="adf-note" style={{ marginTop: 12 }}>
              <i className="bi bi-exclamation-circle"></i>
              {manual.nota_confirmacion || "Esta asignación la dedujo el sistema."}
              <label className="man-check" style={{ display: "flex", marginTop: 8 }}>
                <input type="checkbox" checked={f.confirmar} onChange={(e) => set("confirmar", e.target.checked)} />
                Revisé los datos y los aviones: confirmar
              </label>
            </div>
          )}
          {modo === "editar" && (
            <div className="man-peligro">
              {manual.estado === "VIGENTE" && (
                <button type="button" className="adf-btn secondary small" onClick={archivar}>
                  <i className="bi bi-archive"></i> Archivar
                </button>
              )}
              <button type="button" className="adf-btn danger small" onClick={borrar}>
                <i className="bi bi-trash"></i> Borrar
              </button>
              <small>Borrar solo se puede si ningún paquete ni orden lo usa. El archivo no se elimina del almacenamiento.</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
