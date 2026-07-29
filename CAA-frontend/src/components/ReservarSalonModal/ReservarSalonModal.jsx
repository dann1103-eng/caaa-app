import { useState } from "react";
import { toast } from "sonner";
import { crearReservaSalon } from "../../services/administracionApi";
import "./ReservarSalonModal.css";

const MOTIVOS = [
  { value: "REUNION", label: "Reunión" },
  { value: "EVENTO", label: "Evento" },
  { value: "ADMINISTRATIVO", label: "Administrativo" },
  { value: "OTRO", label: "Otro" },
];

export default function ReservarSalonModal({ salones = [], bloques = [], onClose, onSaved }) {
  const [idSalon, setIdSalon] = useState(String(salones[0]?.id || ""));
  const [fecha, setFecha] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
  const [idBloque, setIdBloque] = useState(String(bloques[0]?.id_bloque || ""));
  const [idBloqueFin, setIdBloqueFin] = useState("");
  const [motivo, setMotivo] = useState("REUNION");
  const [descripcion, setDescripcion] = useState("");
  const [notificar, setNotificar] = useState("");
  const [saving, setSaving] = useState(false);

  const handleGuardar = async () => {
    setSaving(true);
    try {
      await crearReservaSalon({
        id_salon: Number(idSalon), fecha, id_bloque: Number(idBloque),
        id_bloque_fin: idBloqueFin ? Number(idBloqueFin) : null,
        motivo, descripcion: descripcion || null,
        notificar: notificar || null,
      });
      toast.success("Salón reservado");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al reservar el salón");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rsm-overlay" onClick={onClose}>
      <div className="rsm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rsm-header">
          <h3>Reservar salón (uso especial)</h3>
          <button className="rsm-close" onClick={onClose}>×</button>
        </div>

        <label className="rsm-field">
          <span>Salón</span>
          <select value={idSalon} onChange={(e) => setIdSalon(e.target.value)}>
            {salones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>

        <div className="rsm-row">
          <label className="rsm-field">
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="rsm-field">
            <span>Bloque inicio</span>
            <select value={idBloque} onChange={(e) => setIdBloque(e.target.value)}>
              {bloques.map((b) => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_inicio?.slice(0,5)}</option>)}
            </select>
          </label>
          <label className="rsm-field">
            <span>Bloque fin</span>
            <select value={idBloqueFin} onChange={(e) => setIdBloqueFin(e.target.value)}>
              <option value="">Igual al inicio</option>
              {bloques.filter((b) => Number(b.id_bloque) >= Number(idBloque)).map((b) => (
                <option key={b.id_bloque} value={b.id_bloque}>{b.hora_fin?.slice(0,5)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="rsm-field">
          <span>Motivo</span>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>

        <label className="rsm-field">
          <span>Descripción (opcional)</span>
          <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>

        <label className="rsm-field">
          <span>Notificar a los interesados</span>
          <select value={notificar} onChange={(e) => setNotificar(e.target.value)}>
            <option value="">No enviar notificación</option>
            <option value="INSTRUCTOR">A los instructores</option>
            <option value="STAFF">A todo el personal</option>
            <option value="TODOS">A todos (personal y alumnos)</option>
          </select>
        </label>

        <div className="rsm-footer">
          <button className="rsm-btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="rsm-btn-primario" onClick={handleGuardar} disabled={saving}>
            {saving ? "Guardando…" : "Reservar"}
          </button>
        </div>
      </div>
    </div>
  );
}
