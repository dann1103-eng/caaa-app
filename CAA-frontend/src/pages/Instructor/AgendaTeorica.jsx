import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import AgendarClaseModal from "../../components/AgendarClaseModal/AgendarClaseModal";
import SalonesOcupacionWidget from "../../components/SalonesOcupacionWidget/SalonesOcupacionWidget";
import {
  getSesiones, crearSesion, cancelarSesionClase, iniciarSesionClase, cerrarSesionClase,
} from "../../services/administracionApi";
import { getBloquesHorario } from "../../services/programacionApi";
import { getAulaCursos } from "../../services/administracionApi";
import "./AgendaTeorica.css";

const hoySV = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

export default function AgendaTeorica() {
  const [fecha, setFecha] = useState(hoySV());
  const [sesiones, setSesiones] = useState([]);
  const [bloques, setBloques] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [sesionEditar, setSesionEditar] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [ses, blq, cur] = await Promise.all([
        getSesiones({ mias: 1 }),
        getBloquesHorario(),
        getAulaCursos(),
      ]);
      setSesiones((ses?.data || []).filter((s) => s.fecha?.slice(0, 10) === fecha));
      setBloques(Array.isArray(blq) ? blq : []);
      setCursos(cur?.data || []);
    } catch {
      toast.error("Error al cargar la agenda");
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (fn, id, mensajeOk) => {
    try {
      await fn(id);
      toast.success(mensajeOk);
      cargar();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error");
    }
  };

  return (
    <>
      <Header />
      <div className="agt__container">
        <div className="agt__header">
          <h2>Agenda de teoría</h2>
          <div className="agt__actions">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <button className="agt__btn-primario" onClick={() => { setSesionEditar(null); setModalAbierto(true); }}>
              + Agendar clase
            </button>
          </div>
        </div>

        <SalonesOcupacionWidget />

        <div className="agt__lista">
          {loading ? <p>Cargando…</p> : sesiones.length === 0 ? (
            <p className="agt__vacio">Sin clases agendadas ese día.</p>
          ) : sesiones.map((s) => (
            <div key={s.id} className="agt__card">
              <div className="agt__card-info">
                <strong>{s.curso_codigo}{s.unidad_numero ? ` · U${s.unidad_numero}` : ""}</strong>
                <span className="agt__card-estado">{s.estado}</span>
              </div>
              <div className="agt__card-acciones">
                {s.estado === "PROGRAMADA" && (
                  <>
                    <button onClick={() => accion(cancelarSesionClase, s.id, "Clase cancelada")}>Cancelar</button>
                    <button onClick={() => accion(iniciarSesionClase, s.id, "Clase iniciada")}>Iniciar clase</button>
                  </>
                )}
                {s.estado === "EN_CURSO" && (
                  <button onClick={() => accion(cerrarSesionClase, s.id, "Clase cerrada")}>Cerrar clase</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modalAbierto && (
        <AgendarClaseModal
          cursos={cursos} bloques={bloques}
          crearFn={crearSesion}
          sesion={sesionEditar}
          onClose={() => setModalAbierto(false)}
          onSaved={cargar}
        />
      )}
    </>
  );
}
