import { useState } from "react";
import FirmarAsistenciaModal from "../FirmarAsistenciaModal/FirmarAsistenciaModal";
import "./MisClasesList.css";

function formatHora12(hora24) {
  const hhmm = (hora24 || "").slice(0, 5);
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function MisClasesList({ clases = [], loading, onRefresh }) {
  const [firmar, setFirmar] = useState(null);

  if (loading) return <div className="mcl__state">Cargando clases…</div>;
  if (clases.length === 0) return <div className="mcl__state mcl__state--empty">Sin clases agendadas.</div>;

  return (
    <div className="mcl">
      {firmar && (
        <FirmarAsistenciaModal clase={firmar} onClose={() => setFirmar(null)} onFirmado={onRefresh} />
      )}
      {clases.map((c) => (
        <div key={c.id} className="mcl__clase">
          <div className="mcl__row">
            <span className="mcl__hora">{formatHora12(c.hora_inicio)}</span>
            <span className="mcl__curso">{c.curso_codigo}{c.unidad_nombre ? ` · ${c.unidad_nombre}` : ""}</span>
            {c.examen && <span className="mcl__badge mcl__badge--examen">Examen</span>}
          </div>
          <div className="mcl__sub">
            {c.salon_nombre || "Sin salón"} · {c.instructor_nombre || "—"} ·{" "}
            {new Date(c.fecha).toLocaleDateString("es-SV", { day: "2-digit", month: "short", timeZone: "UTC" })}
          </div>
          {c.estado_sesion === "CERRADA" && c.mi_asistencia !== "AUSENTE" && (
            c.ya_firme ? (
              <span className="mcl__badge mcl__badge--firmada">Firmada</span>
            ) : (
              <button className="mcl__btn-firmar" onClick={() => setFirmar(c)}>Firma pendiente</button>
            )
          )}
          {c.estado_sesion === "EN_CURSO" && <span className="mcl__badge mcl__badge--curso">En curso</span>}
        </div>
      ))}
    </div>
  );
}
