import { useRef, useState } from "react";
import { toast } from "sonner";
import SignaturePad from "../SignaturePad/SignaturePad";
import { firmarAsistenciaClase } from "../../services/alumnoApi";
import "./FirmarAsistenciaModal.css";

export default function FirmarAsistenciaModal({ clase, onClose, onFirmado }) {
  const firmaRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const handleFirmar = async () => {
    if (firmaRef.current?.isEmpty()) {
      toast.warning("Dibujá tu firma antes de confirmar.");
      return;
    }
    setSaving(true);
    try {
      await firmarAsistenciaClase(clase.id, firmaRef.current.toDataURL());
      toast.success("Asistencia firmada");
      onFirmado?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al firmar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fam-overlay" onClick={onClose}>
      <div className="fam-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Firmar asistencia</h3>
        <p className="fam-detalle">
          {clase.curso_codigo}{clase.unidad_nombre ? ` · ${clase.unidad_nombre}` : ""} —{" "}
          {new Date(clase.fecha).toLocaleDateString("es-SV", { timeZone: "UTC" })}
          {clase.salon_nombre ? ` · ${clase.salon_nombre}` : ""}
        </p>
        <SignaturePad ref={firmaRef} width={360} height={140} />
        <div className="fam-footer">
          <button className="fam-btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="fam-btn-primario" onClick={handleFirmar} disabled={saving}>
            {saving ? "Guardando…" : "Firmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
