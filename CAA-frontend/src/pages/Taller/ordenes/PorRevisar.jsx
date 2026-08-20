import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getOrdenes, getColaTrabajo, getPersonalTaller, asignarOrden, getDocumentos } from "../../../services/tallerApi";
import RevisarOrdenModal from "./RevisarOrdenModal";
import TrabajosEnCurso from "./TrabajosEnCurso";
import OrdenDetalleModal from "./OrdenDetalleModal";
import FirmarEntregaModal from "../inventario/FirmarEntregaModal";
import EstimadoModal from "./EstimadoModal";
import { fecha } from "../inventario/formato";

/**
 * La bandeja del jefe de taller: lo que hay que revisar y lo que hay en el hangar.
 *
 * Dos cosas en una pantalla porque son las dos que mira al empezar el día: qué
 * trabajo terminó el mecánico y le toca aprobar, y qué aviones tiene adentro con
 * quién en cada uno.
 */
// Reasignar es del jefe. El mecánico ve quién trabaja cada avión, pero no lo
// edita: si ya lo tomó él, la pantalla lo dice y no se toca.
const esJefe = () => {
  try { return ["TALLER", "ADMIN"].includes(JSON.parse(localStorage.getItem("user") || "{}")?.rol); }
  catch { return false; }
};

export default function PorRevisar() {
  const puedeAsignar = esJefe();
  const [ordenes, setOrdenes] = useState([]);
  const [enCurso, setEnCurso] = useState([]);
  const [viendo, setViendo] = useState(null);   // detalle de un trabajo en curso
  const [entregando, setEntregando] = useState(null);  // solicitud de material a firmar
  const [pendientes, setPendientes] = useState({});    // por id de orden
  const [cola, setCola] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [revisando, setRevisando] = useState(null);
  const [estimando, setEstimando] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // Lo que espera su firma, lo que se está haciendo ahora, y el hangar.
      // Y el material pedido y sin entregar, para colgarlo del trabajo que lo
      // pidió: el jefe lo despacha desde la misma tarjeta, sin ir a Inventario.
      // Una sola consulta para las dos secciones: "abiertas" trae ABIERTA y
      // FIRMADA, que son los trabajos vivos del taller.
      const [vivas, c, docs] = await Promise.all([
        getOrdenes({ abiertas: "true" }),
        getColaTrabajo(),
        // El mecánico no despacha, y para él esto responde 403: sin pendientes.
        getDocumentos({ sin_despachar: "true" }).catch(() => []),
      ]);
      setPendientes(
        (Array.isArray(docs) ? docs : []).reduce((acc, d) => {
          if (d.id_orden_trabajo) (acc[d.id_orden_trabajo] ||= []).push(d);
          return acc;
        }, {})
      );
      setOrdenes(vivas.filter((x) => x.estado === "FIRMADA"));
      // El avión sigue en el taller hasta que el jefe aprueba, así que lo firmado
      // aparece acá también — con el reloj detenido, que es lo que lo distingue.
      // Primero lo que se trabaja ahora, y dentro de cada grupo el que lleva más
      // tiempo adentro: es el que suele necesitar que alguien pregunte cómo va.
      setEnCurso(
        vivas.slice().sort(
          (a, b) =>
            (a.estado === b.estado ? 0 : a.estado === "ABIERTA" ? -1 : 1) ||
            (b.segundos_trabajo ?? 0) - (a.segundos_trabajo ?? 0)
        )
      );
      setCola(c);
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo cargar");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { getPersonalTaller().then(setPersonal).catch(() => {}); }, []);

  const asignar = async (id_orden, id_mecanico) => {
    try {
      await asignarOrden(id_orden, id_mecanico ? Number(id_mecanico) : null);
      toast.success(id_mecanico ? "Trabajo asignado" : "Asignación quitada");
      cargar();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo asignar");
    }
  };

  return (
    <>
      {/* Lo primero: lo que espera su firma. */}
      <h3 className="adf-section-title" style={{ fontSize: "1rem" }}>
        <i className="bi bi-pen me-2"></i>Esperando tu firma
      </h3>
      {cargando ? (
        <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
      ) : ordenes.length === 0 ? (
        <p className="adf-note">No hay trabajos terminados esperando revisión.</p>
      ) : (
        <div className="adf-card">
          <div className="adf-table-wrap">
            <table className="adf-table">
              <thead>
                <tr><th>N°</th><th>Avión</th><th>Trabajo</th><th>Firmó</th><th>Fecha</th><th></th></tr>
              </thead>
              <tbody>
                {ordenes.map((o) => (
                  <tr key={o.id_orden}>
                    <td className="inv-codigo">{o.correlativo}</td>
                    <td>{o.aeronave_codigo}</td>
                    <td>
                      {o.discrepancia}
                      {o.devoluciones > 0 && (
                        <span className="adf-tag amber" style={{ marginLeft: 6 }}>
                          devuelta {o.devoluciones}×
                        </span>
                      )}
                    </td>
                    <td>{o.mecanico_nombre}{o.licencia_tma ? ` · ${o.licencia_tma}` : ""}</td>
                    <td>{fecha(o.fecha_firma)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="adf-btn small" onClick={() => setRevisando(o)}>Revisar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lo segundo: qué se está haciendo ahora mismo, con quién y hace cuánto. */}
      <h3 className="adf-section-title" style={{ fontSize: "1rem", marginTop: "var(--sp-5)" }}>
        <i className="bi bi-hourglass-split me-2"></i>Trabajos en curso
        {enCurso.length > 0 && <span className="adf-tag" style={{ marginLeft: 8 }}>{enCurso.length}</span>}
      </h3>
      {!cargando && (
        <TrabajosEnCurso
          ordenes={enCurso}
          pendientes={pendientes}
          onVer={(o) => (o.estado === "FIRMADA" ? setRevisando(o) : setViendo(o.id_orden))}
          onEntregar={(d) => setEntregando(d)}
        />
      )}

      {/* Y lo tercero: qué hay adentro del hangar y quién está en qué. */}
      <h3 className="adf-section-title" style={{ fontSize: "1rem", marginTop: "var(--sp-5)" }}>
        <i className="bi bi-airplane-engines me-2"></i>Aviones en el taller
      </h3>
      <p className="inv-ayuda">
        Los que Operaciones mandó a mantenimiento.
        {puedeAsignar
          ? " Podés asignarle el trabajo a un mecánico y mover la fecha en que lo tenés listo."
          : " Podés mover la fecha en que lo tenés listo; reasignar quién lo trabaja es del jefe de taller."}
      </p>

      {!cargando && cola.length === 0 && (
        <p className="adf-note">Ningún avión en mantenimiento ahora mismo.</p>
      )}

      {cola.map((m) => (
        <div key={m.id_mantenimiento} className="adf-card" style={{ marginBottom: "var(--sp-3)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <strong style={{ fontSize: "1.05rem" }}>{m.aeronave_codigo}</strong>
              <span style={{ color: "var(--c-ink-3)" }}> · {m.tipo} {m.descripcion ? `— ${m.descripcion}` : ""}</span>
              <div style={{ fontSize: "0.85rem", color: "var(--c-ink-3)", marginTop: 4 }}>
                Desde el {fecha(m.fecha_inicio)} · listo estimado <strong>{fecha(m.fecha_fin)}</strong>
                {m.fecha_fin_original && (
                  <span className="adf-tag amber" style={{ marginLeft: 6 }}>
                    movido por el Taller (Operaciones: {fecha(m.fecha_fin_original)})
                  </span>
                )}
              </div>
              {m.motivo_estimado && (
                <div style={{ fontSize: "0.82rem", color: "var(--c-ink-4)", marginTop: 2 }}>{m.motivo_estimado}</div>
              )}
            </div>
            <button className="adf-btn secondary small" onClick={() => setEstimando(m)}>
              <i className="bi bi-calendar-event"></i>¿Cuándo está listo?
            </button>
          </div>

          {m.trabajos.length === 0 ? (
            <p className="adf-note" style={{ marginTop: 10 }}>
              Todavía nadie abrió trabajo para este avión.
            </p>
          ) : (
            <div className="adf-table-wrap" style={{ marginTop: 10 }}>
              <table className="adf-table">
                <thead><tr><th>N°</th><th>Trabajo</th><th>Estado</th><th style={{ width: 220 }}>Quién lo trabaja</th></tr></thead>
                <tbody>
                  {m.trabajos.map((t) => (
                    <tr key={t.id_orden}>
                      <td className="inv-codigo">{t.correlativo}</td>
                      <td>{t.discrepancia}</td>
                      <td><span className="adf-tag">{t.estado}</span></td>
                      <td>
                        {puedeAsignar && t.estado === "ABIERTA" ? (
                          <select value={t.id_mecanico_asignado || ""} onChange={(e) => asignar(t.id_orden, e.target.value)}>
                            <option value="">Sin asignar</option>
                            {personal.map((p) => (
                              <option key={p.id_usuario} value={p.id_usuario}>{p.nombre}</option>
                            ))}
                          </select>
                        ) : (
                          t.asignado_nombre || <span style={{ color: "var(--c-ink-4)" }}>sin asignar</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {revisando && (
        <RevisarOrdenModal
          orden={revisando}
          onClose={() => setRevisando(null)}
          onResuelta={() => { setRevisando(null); cargar(); }}
        />
      )}
      {entregando && (
        <FirmarEntregaModal
          solicitud={entregando}
          onClose={() => setEntregando(null)}
          onFirmada={() => { setEntregando(null); cargar(); }}
        />
      )}
      {viendo && (
        <OrdenDetalleModal
          id={viendo}
          onClose={() => setViendo(null)}
          onCambio={() => { setViendo(null); cargar(); }}
        />
      )}
      {estimando && (
        <EstimadoModal
          item={estimando}
          onClose={() => setEstimando(null)}
          onGuardado={() => { setEstimando(null); cargar(); }}
        />
      )}
    </>
  );
}
