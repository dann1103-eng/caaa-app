import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import AgendarClaseModal from "../../components/AgendarClaseModal/AgendarClaseModal";
import SalonesOcupacionWidget from "../../components/SalonesOcupacionWidget/SalonesOcupacionWidget";
import {
  getSesiones, crearSesion, cancelarSesionClase, iniciarSesionClase, cerrarSesionClase,
  getAsistencia, registrarAsistencia,
} from "../../services/administracionApi";
import { getBloquesHorario } from "../../services/programacionApi";
import { getAulaCursos } from "../../services/administracionApi";
import "./AgendaTeorica.css";

const hoySV = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
const ESTADOS_ASIST = ["PRESENTE", "AUSENTE", "TARDE", "JUSTIFICADO"];

export default function AgendaTeorica() {
  const [fecha, setFecha] = useState(hoySV());
  const [sesiones, setSesiones] = useState([]);
  const [bloques, setBloques] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [sesionEditar, setSesionEditar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asistencia, setAsistencia] = useState(null); // { sesion, lista }

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

  const abrirAsistencia = async (s) => {
    try {
      const r = await getAsistencia(s.id);
      setAsistencia({ sesion: s, lista: r?.data || [] });
    } catch {
      toast.error("Error al cargar la asistencia");
    }
  };

  const marcarAsist = async (a, estado) => {
    try {
      await registrarAsistencia(asistencia.sesion.id, { id_alumno: a.id_alumno, estado, observacion: a.observacion });
      setAsistencia((prev) => ({
        ...prev,
        lista: prev.lista.map((x) => (x.id_alumno === a.id_alumno ? { ...x, estado } : x)),
      }));
    } catch {
      toast.error("Error al marcar asistencia");
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

        {asistencia && (
          <div className="agt__asistencia">
            <button className="agt__asistencia-volver" onClick={() => setAsistencia(null)}>
              <i className="bi bi-arrow-left"></i> Volver a la agenda
            </button>
            <h3>
              {asistencia.sesion.curso_codigo}
              {asistencia.sesion.tema ? ` · ${asistencia.sesion.tema}` : ""}
            </h3>
            {asistencia.lista.length === 0 ? (
              <p className="agt__vacio">No hay alumnos inscritos en esta clase.</p>
            ) : (
              asistencia.lista.map((a) => (
                <div key={a.id_alumno} className="agt__asistencia-fila">
                  <span>{a.alumno_username}</span>
                  <div className="agt__asistencia-botones">
                    {ESTADOS_ASIST.map((es) => (
                      <button
                        key={es}
                        className={`agt__asistencia-btn${a.estado === es ? ` agt__asistencia-btn--${es.toLowerCase()}` : ""}`}
                        onClick={() => marcarAsist(a, es)}
                      >
                        {es[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

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
                {(s.estado === "PROGRAMADA" || s.estado === "EN_CURSO") && (
                  <button onClick={() => abrirAsistencia(s)}>Pasar lista</button>
                )}
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
