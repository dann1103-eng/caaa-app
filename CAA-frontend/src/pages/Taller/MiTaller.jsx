import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getOrdenes, getColaTrabajo } from "../../services/tallerApi";
import DocumentoModal from "./inventario/DocumentoModal";
import EntregarAceiteModal from "./inventario/EntregarAceiteModal";
import FirmarOrdenModal from "./ordenes/FirmarOrdenModal";
import AbrirTrabajoModal from "./ordenes/AbrirTrabajoModal";
import EstimadoModal from "./ordenes/EstimadoModal";
import "./inventario/inventario.css";
import "./ordenes/taller-tecnico.css";

/**
 * "Mi taller" — la pantalla del técnico.
 *
 * Pensada para trabajar de pie, con guantes y el celular en una mano: botones
 * grandes en verbo, sin tablas ni filtros ni jerga de documentos.
 *
 * La idea que la ordena: **el trabajo en curso es el contexto**. Si el técnico
 * tiene una orden abierta, pedir material ya sabe el avión y el tacómetro y no
 * los vuelve a preguntar. Eso es lo que hoy obliga a escribir el tacómetro tres
 * veces en tres papeles distintos.
 */
/** "3 h 20 min" — desde que se tomó el trabajo hasta que se firmó. */
const duracion = (min) => {
  if (min == null) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  if (min < 60) return `${m} min`;
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m} min`;
};

// Quién soy: es lo que distingue "asignado a vos" de un avión que tomó otro.
const miUid = () => {
  try { return JSON.parse(localStorage.getItem("user") || "{}")?.id_usuario || null; } catch { return null; }
};

export default function MiTaller() {
  const uid = miUid();
  const [ordenes, setOrdenes] = useState([]);
  const [cola, setCola] = useState([]);
  const [estimando, setEstimando] = useState(null);
  const [desdeCola, setDesdeCola] = useState(null);   // avión elegido de la cola
  const [cargando, setCargando] = useState(true);
  const [activa, setActiva] = useState(null);   // el trabajo en curso elegido
  const [accion, setAccion] = useState(null);   // 'abrir' | 'material' | 'aceite' | 'firmar'
  const [aceites, setAceites] = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // "Abiertas" incluye las que ya firmó y están esperando al jefe: siguen
      // siendo su trabajo hasta que se aprueben.
      const [r, c] = await Promise.all([getOrdenes({ abiertas: "true" }), getColaTrabajo()]);
      setOrdenes(r);
      setCola(c);
      // Si hay un solo trabajo abierto, se elige solo: es el caso normal.
      setActiva((prev) => (prev ? r.find((x) => x.id_orden === prev.id_orden) || null : r.length === 1 ? r[0] : null));
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudieron cargar los trabajos");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Los aceites para el modal de mostrador; se piden una vez.
  useEffect(() => {
    import("../../services/tallerApi").then(({ getItems }) =>
      getItems({ categoria: "ACEITE" }).then((r) => setAceites(r.items)).catch(() => {})
    );
  }, []);

  // Antes esto solo hacía `setActiva(...)`. Si ese trabajo YA era el activo
  // —el caso normal cuando hay uno solo— el valor no cambiaba y la pantalla se
  // quedaba igual: el botón parecía roto. Ahora además sube la vista a la
  // tarjeta del trabajo, que es lo que uno espera que pase.
  const irAMiTrabajo = (mio) => {
    const o = ordenes.find((x) => x.id_orden === mio.id_orden);
    if (o) setActiva(o);
    requestAnimationFrame(() => {
      document.querySelector(".tec-activo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const conTrabajo = (fn) => () => {
    if (!activa) return toast.error("Elegí primero en qué trabajo estás, o abrí uno nuevo");
    fn();
  };

  return (
    <>
      <h2 className="adf-section-title"><i className="bi bi-tools me-2"></i>Mi taller</h2>

      {/* Qué trabajo está en curso: el contexto de todo lo demás. */}
      {activa ? (
        <div className="tec-activo">
          <div className="tec-activo__label">Estás trabajando en</div>
          <div className="tec-activo__ot">{activa.correlativo}</div>
          <div className="tec-activo__avion">
            {activa.aeronave_codigo}
            {activa.tacometro ? ` · TAC ${Number(activa.tacometro).toFixed(2)}` : ""}
          </div>
          <div className="tec-activo__disc">{activa.discrepancia}</div>
          {activa.minutos_trabajo != null && (
            <div className="tec-activo__tiempo">
              <i className="bi bi-clock"></i> {duracion(activa.minutos_trabajo)}
              {activa.estado === "FIRMADA" ? " trabajadas" : " desde que lo tomaste"}
            </div>
          )}
          {activa.estado === "FIRMADA" && (
            <div className="tec-activo__aviso">Esperando la revisión del jefe de taller.</div>
          )}
          {activa.nota_revision && activa.estado === "ABIERTA" && (
            <div className="tec-activo__aviso tec-activo__aviso--alerta">
              El jefe la devolvió: {activa.nota_revision}
            </div>
          )}
          {ordenes.length > 1 && (
            <button className="tec-cambiar" onClick={() => setActiva(null)}>Cambiar de trabajo</button>
          )}
        </div>
      ) : (
        <div className="tec-activo tec-activo--vacio">
          <div className="tec-activo__label">
            {cargando ? "Cargando…" : ordenes.length ? "Elegí en qué trabajo estás" : "No tenés ningún trabajo abierto"}
          </div>
          {ordenes.map((o) => (
            <button key={o.id_orden} className="tec-elegir" onClick={() => setActiva(o)}>
              <strong>{o.correlativo}</strong>
              <span>{o.aeronave_codigo} · {o.discrepancia}</span>
            </button>
          ))}
        </div>
      )}

      {/* Los aviones que Operaciones mandó al taller. Es la lista de espera:
          tocar uno abre el trabajo ya enlazado a ese mantenimiento. */}
      {cola.length > 0 && (
        <div className="tec-cola">
          <div className="tec-cola__titulo">
            <i className="bi bi-airplane-engines"></i> Aviones esperando trabajo
          </div>
          {cola.map((m) => {
            // Cuenta también lo ya firmado: mientras el jefe no lo apruebe sigue
            // siendo mi trabajo, y ofrecer "tomar" otra vez invita a abrir una
            // orden duplicada sobre el mismo avión.
            const mio = m.trabajos.find(
              (t) => ["ABIERTA", "FIRMADA"].includes(t.estado) && t.id_mecanico_asignado === uid
            );
            return (
              <div key={m.id_mantenimiento} className="tec-cola__item">
                <div className="tec-cola__info">
                  <strong>{m.aeronave_codigo}</strong>
                  <span>{m.tipo}{m.descripcion ? ` — ${m.descripcion}` : ""}</span>
                  <small>
                    Listo estimado: {String(m.fecha_fin || "").slice(0, 10) || "sin fecha"}
                    {m.pendientes > 0 ? ` · ${m.pendientes} trabajo(s) en curso` : " · nadie lo tomó"}
                  </small>
                </div>
                <div className="tec-cola__acciones">
                  {mio && (
                    <span className={`adf-tag ${mio.estado === "FIRMADA" ? "amber" : "green"}`}>
                      {mio.estado === "FIRMADA" ? "Esperando al jefe" : "Asignado a vos"}
                    </span>
                  )}
                  {mio ? (
                    <button className="adf-btn small secondary" onClick={() => irAMiTrabajo(mio)}>
                      Ir a mi trabajo
                    </button>
                  ) : (
                    <button className="adf-btn small" onClick={() => { setDesdeCola(m); setAccion("abrir"); }}>
                      Tomar este avión
                    </button>
                  )}
                  <button className="adf-icon-btn" title="¿Cuándo está listo?" onClick={() => setEstimando(m)}>
                    <i className="bi bi-calendar-event"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="tec-botones">
        <button className="tec-btn tec-btn--principal" onClick={() => { setDesdeCola(null); setAccion("abrir"); }}>
          <i className="bi bi-play-circle"></i>
          <span>Iniciar un mantenimiento</span>
        </button>

        <button className="tec-btn" disabled={!activa} onClick={conTrabajo(() => setAccion("material"))}>
          <i className="bi bi-clipboard-plus"></i>
          <span>Pedir material</span>
          <small>{activa ? `para ${activa.aeronave_codigo}` : "elegí un trabajo primero"}</small>
        </button>

        <button className="tec-btn" onClick={() => setAccion("aceite")}>
          <i className="bi bi-droplet-half"></i>
          <span>Sacar aceite</span>
          <small>sin orden de trabajo</small>
        </button>

        <button className="tec-btn tec-btn--cerrar" disabled={!activa || activa.estado === "FIRMADA"}
          onClick={conTrabajo(() => setAccion("firmar"))}>
          <i className="bi bi-pen"></i>
          <span>Terminé — mandar a revisión</span>
          <small>
            {!activa ? "elegí un trabajo primero"
              : activa.estado === "FIRMADA" ? "ya la mandaste; espera al jefe"
              : `firmás ${activa.correlativo} y la revisa el jefe`}
          </small>
        </button>
      </div>

      {activa && activa.documentos > 0 && (
        <p className="inv-ayuda" style={{ marginTop: "var(--sp-3)" }}>
          Este trabajo ya tiene <strong>{activa.documentos}</strong> documento(s) de bodega.
        </p>
      )}

      {accion === "abrir" && (
        <AbrirTrabajoModal
          desdeCola={desdeCola}
          onClose={() => { setAccion(null); setDesdeCola(null); }}
          onCreada={(o) => { setAccion(null); setDesdeCola(null); setActiva(o); cargar(); }}
        />
      )}

      {estimando && (
        <EstimadoModal
          item={estimando}
          onClose={() => setEstimando(null)}
          onGuardado={() => { setEstimando(null); cargar(); }}
        />
      )}

      {accion === "material" && activa && (
        // La requisición nace con el avión, el tacómetro y la orden ya puestos:
        // el técnico solo agrega los renglones.
        <DocumentoModal
          tipo="REQUISICION"
          contexto={{
            id_orden_trabajo: activa.id_orden,
            orden_trabajo_no: activa.correlativo,
            id_aeronave: activa.id_aeronave,
            tacometro: activa.tacometro,
            motivo: activa.discrepancia,
          }}
          onClose={() => setAccion(null)}
          onGuardado={() => { setAccion(null); cargar(); }}
        />
      )}

      {accion === "aceite" && (
        <EntregarAceiteModal
          aceites={aceites}
          onClose={() => setAccion(null)}
          onGuardado={() => setAccion(null)}
        />
      )}

      {accion === "firmar" && activa && (
        <FirmarOrdenModal
          orden={activa}
          onClose={() => setAccion(null)}
          onFirmada={() => { setAccion(null); setActiva(null); cargar(); }}
        />
      )}
    </>
  );
}
