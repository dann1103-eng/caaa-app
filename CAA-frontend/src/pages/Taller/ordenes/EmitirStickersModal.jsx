import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getPrecargaStickers, emitirStickers, abrirStickersPDF } from "../../../services/tallerApi";
import { hoy } from "../inventario/formato";

const ETIQUETA = { CELULA: "la célula", MOTOR: "el motor", HELICE: "la hélice" };

const TIPOS = [
  { tipo: "25H", etiqueta: "Inspección de 25 h" },
  { tipo: "50H", etiqueta: "Inspección de 50 h" },
  { tipo: "100H", etiqueta: "Inspección de 100 h" },
  { tipo: "ANUAL", etiqueta: "Inspección anual" },
  { tipo: "NO_PROGRAMADO", etiqueta: "Trabajo no programado" },
];

const n = (v) => (v === null || v === undefined || v === "" ? "" : String(v));

// La licencia se guarda como la escribe Administración y suele venir ya con el
// prefijo ("TMA 090"): anteponerle "TMA #" mostraba "TMA #TMA 090".
const tma = (v) => `TMA #${String(v || "").replace(/^tma/i, "").replace(/^[\s#.:-]+/, "")}`;

/**
 * Emitir los stickers que se pegan en los libros físicos del avión.
 *
 * Los números salen calculados del anclaje de cada parte, pero quedan
 * editables: el mecánico lee el instrumento en el momento y el acumulado del
 * sistema puede haber derivado. Si corrige uno, el servidor re-ancla la parte,
 * así que corregir un sticker arregla también el siguiente.
 */
export default function EmitirStickersModal({ orden, onClose, onEmitidos }) {
  const [datos, setDatos] = useState(null);
  const [tipo, setTipo] = useState("100H");
  const [fecha, setFecha] = useState(hoy());
  const [lugar, setLugar] = useState("Ilopango");
  const [filas, setFilas] = useState({});     // parte -> { marcada, texto, tac, tt, tso }
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getPrecargaStickers(orden.id_orden)
      .then((d) => {
        setDatos(d);
        setTipo(d.tipo_sugerido || "100H");
        if (d.orden?.fecha) setFecha(String(d.orden.fecha).slice(0, 10));
        const ini = {};
        for (const p of d.partes) {
          ini[p.parte] = {
            // Viene marcado lo que la orden declaró al abrirse. Es un default:
            // un trabajo descubre trabajo, así que se puede agregar o quitar.
            marcada: p.existe && p.instalada && p.declarada !== false,
            texto: p.textos?.[d.tipo_sugerido] || "",
            tac: n(p.tac), tt: n(p.tt), tso: n(p.tso),
          };
        }
        setFilas(ini);
      })
      .catch((e) => { toast.error(e.response?.data?.message || "No se pudo cargar"); onClose(); });
  }, [orden.id_orden]);

  // Cambiar el tipo recarga el texto estándar, pero solo si el mecánico todavía
  // no escribió nada propio: pisarle lo que ya redactó sería perderle el trabajo.
  const cambiarTipo = (t) => {
    setTipo(t);
    setFilas((prev) => {
      const sig = { ...prev };
      for (const p of datos?.partes || []) {
        const actual = sig[p.parte];
        const eraPlantilla = !actual?.texto || Object.values(p.textos || {}).includes(actual.texto);
        if (eraPlantilla) sig[p.parte] = { ...actual, texto: p.textos?.[t] || "" };
      }
      return sig;
    });
  };

  const set = (parte, k, v) => setFilas((p) => ({ ...p, [parte]: { ...p[parte], [k]: v } }));

  const elegidas = useMemo(
    () => (datos?.partes || []).filter((p) => filas[p.parte]?.marcada),
    [datos, filas]
  );

  const guardar = async () => {
    if (!elegidas.length) return toast.error("Elegí al menos un libro");
    for (const p of elegidas) {
      const f = filas[p.parte];
      if (!f.texto?.trim()) return toast.error(`Escribí el texto del sticker de ${p.etiqueta}`);
      if (!f.tac) return toast.error(`Falta el TAC del sticker de ${p.etiqueta}`);
    }
    setGuardando(true);
    try {
      const r = await emitirStickers(orden.id_orden, {
        tipo, fecha, lugar,
        id_aprendiz: datos.aprendiz?.id_usuario || null,
        partes: elegidas.map((p) => ({
          parte: p.parte,
          texto: filas[p.parte].texto,
          tac: filas[p.parte].tac,
          tt: filas[p.parte].tt === "" ? null : filas[p.parte].tt,
          tso: filas[p.parte].tso === "" ? null : filas[p.parte].tso,
        })),
      });
      toast.success(
        r.reanclados?.length
          ? `${r.ids.length} sticker(s) emitidos. Se actualizó el anclaje de ${r.reanclados.map((x) => ETIQUETA[x] || x).join(" y ")}.`
          : `${r.ids.length} sticker(s) emitidos.`
      );
      abrirStickersPDF(r.ids);
      onEmitidos?.(r);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudieron emitir");
    } finally {
      setGuardando(false);
    }
  };

  if (!datos) return null;

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-stickies"></i></span>
            Stickers para los libros · {datos.orden.matricula}
          </span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="adf-btn" disabled={guardando || !elegidas.length} onClick={guardar}>
              <i className="bi bi-printer"></i>{guardando ? "Emitiendo…" : `Emitir e imprimir (${elegidas.length})`}
            </button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: 18, maxHeight: "70vh", overflowY: "auto" }}>
          <p className="adf-note">
            Se imprimen en papel adhesivo carta con línea de corte. Los números salen del anclaje de
            cada parte: si corregís uno, el sistema lo toma como el bueno de ahí en adelante.
          </p>

          <div className="adf-form-grid" style={{ marginTop: 14 }}>
            <div className="adf-form-field">
              <label>Tipo de trabajo</label>
              <select value={tipo} onChange={(e) => cambiarTipo(e.target.value)}>
                {TIPOS.map((t) => <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>)}
              </select>
            </div>
            <div className="adf-form-field">
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>Lugar</label>
              <input value={lugar} onChange={(e) => setLugar(e.target.value)} />
            </div>
          </div>

          <p className="adf-section-subtitle" style={{ marginTop: 10 }}>
            Firma <strong>{datos.mecanico?.nombre || "—"}</strong>
            {datos.mecanico?.licencia_tma ? ` · ${tma(datos.mecanico.licencia_tma)}` : ""}
            {datos.aprendiz ? ` · con ${datos.aprendiz.nombre} (aprendiz #${datos.aprendiz.certificado})` : ""}
            {datos.orden.correlativo ? ` · orden ${datos.orden.correlativo}` : ""}
          </p>

          {datos.partes.map((p) => {
            const f = filas[p.parte] || {};
            const ya = datos.ya_emitidos?.filter((s) => s.parte === p.parte).length || 0;
            return (
              <div key={p.parte} className="adf-card" style={{ marginTop: 12, padding: 14, opacity: p.existe ? 1 : 0.65 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, flexWrap: "wrap" }}>
                  <input type="checkbox" checked={!!f.marcada} disabled={!p.existe}
                    onChange={(e) => set(p.parte, "marcada", e.target.checked)} />
                  Libro de {p.etiqueta}
                  {p.marca && <span className="adf-tag">{p.marca} {p.modelo || ""}</span>}
                  {!p.existe && <span className="adf-tag">Sin cargar</span>}
                  {p.existe && !p.instalada && <span className="adf-tag">Fuera del avión</span>}
                  {ya > 0 && <span className="adf-tag">Ya se emitió {ya}</span>}
                </label>

                {!p.existe && (
                  <p className="adf-section-subtitle" style={{ margin: "8px 0 0" }}>
                    {/* Se nombra el LIBRO y no la parte: "el célula" y "el hélice" no concuerdan. */}
                    El libro de {p.etiqueta} de este avión todavía no tiene su ficha cargada. Se carga
                    desde la pestaña <strong>Libros</strong>.
                  </p>
                )}

                {p.existe && f.marcada && (
                  <>
                    {!p.tiene_ancla && (
                      <p className="adf-note" style={{ marginTop: 10 }}>
                        Esta parte no tiene anclaje de horas: escribí el T.T. —y el TSO si lleva— leyéndolo
                        del libro. Con eso el sistema los calcula solo de acá en adelante.
                      </p>
                    )}
                    <div className="adf-form-grid" style={{ marginTop: 10 }}>
                      <div className="adf-form-field">
                        <label>TAC</label>
                        <input type="number" step="0.01" value={f.tac} onChange={(e) => set(p.parte, "tac", e.target.value)} />
                      </div>
                      <div className="adf-form-field">
                        <label>T.T.</label>
                        <input type="number" step="0.01" value={f.tt} placeholder="del libro"
                          onChange={(e) => set(p.parte, "tt", e.target.value)} />
                      </div>
                      <div className="adf-form-field">
                        <label>TSO</label>
                        <input type="number" step="0.01" value={f.tso} placeholder="N/A"
                          onChange={(e) => set(p.parte, "tso", e.target.value)} />
                      </div>
                    </div>
                    <div className="adf-form-field" style={{ marginTop: 10 }}>
                      <label>Qué se hizo</label>
                      <textarea rows={5} value={f.texto}
                        placeholder="Qué se hizo, con qué manual y bajo qué orden."
                        onChange={(e) => set(p.parte, "texto", e.target.value)} />
                    </div>
                    <p className="adf-section-subtitle" style={{ margin: "6px 0 0" }}>
                      M/N {p.mn || "—"} · S/N {p.sn || "—"} · T.C. {p.tc || "—"}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
