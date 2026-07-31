import { useState } from "react";
import { toast } from "sonner";
import "./AterrizajeTramoModal.css";

// Mini-form del aterrizaje en destino (rutas con parada): 2 campos, pensado
// para llenarse rápido desde el celular. Cierra el tramo actual y deja el
// TAC/HOBBS precargado en las voucheras de los tramos adyacentes.
export default function AterrizajeTramoModal({ vuelo, onSubmit, onClose }) {
  const [tac, setTac] = useState("");
  const [hobbs, setHobbs] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!tac || !hobbs || parseFloat(tac) <= 0 || parseFloat(hobbs) <= 0) {
      toast.warning("Registrá el TAC y el HOBBS de llegada.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ tacometro: tac, hobbs });
      toast.success(`Aterrizaje en ${vuelo.icao_destino} registrado — tramo cerrado.`);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo registrar el aterrizaje.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="atm-overlay" onClick={onClose}>
      <div className="atm-modal" onClick={(e) => e.stopPropagation()}>
        <h3><i className="bi bi-airplane-engines"></i> Aterrizamos en {vuelo.icao_destino}</h3>
        <p className="atm-sub">
          Tramo {vuelo.orden_tramo}/{vuelo.total_tramos} · {vuelo.icao_origen} → {vuelo.icao_destino}.
          Estos valores quedan como llegada de esta vouchera y salida de la siguiente.
        </p>
        <div className="atm-field">
          <label>TAC de llegada</label>
          <input type="number" inputMode="decimal" step="0.01" value={tac}
            onChange={(e) => setTac(e.target.value)} autoFocus />
        </div>
        <div className="atm-field">
          <label>HOBBS de llegada</label>
          <input type="number" inputMode="decimal" step="0.1" value={hobbs}
            onChange={(e) => setHobbs(e.target.value)} />
        </div>
        <div className="atm-actions">
          <button className="atm-btn-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="atm-btn-save" onClick={guardar} disabled={saving}>
            {saving ? "Registrando…" : "Registrar aterrizaje"}
          </button>
        </div>
      </div>
    </div>
  );
}
