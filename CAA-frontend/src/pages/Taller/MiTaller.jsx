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
/** "2:14:07" — el contador corre a la vista, como un cronómetro. */
const reloj = (seg) => {
  if (seg == null) return "—";
  const s = Math.max(0, Math.floor(seg));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return d > 0 ? `${d} d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
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
  // El cronómetro se ancla a lo que calculó el SERVIDOR y desde ahí cuenta acá.
  //
  // Antes restaba `Date.now() - creado_en` en el navegador, y como `creado_en` es
  // un timestamp SIN zona guardado en hora de El Salvador, el navegador lo leía
  // como UTC: el contador arrancaba en 6 horas. Anclando al transcurrido que
  // manda el servidor, la zona de nadie importa.
  const [tic, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Cada recarga de datos reinicia el tic: el ancla vuelve a ser el servidor.
  useEffect(() => { setTic(0); }, [activa?.id_orden, activa?.segundos_trabajo]);

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

  // El mantenimiento del avión en el que se está trabajando: es lo que permite
  // prolongar la fecha desde la misma tarjeta.
  const mantDeActiva = activa
    ? cola.find((m) => m.trabajos.some((t) => t.id_orden === activa.id_orden)) ||
      cola.find((m) => m.aeronave_codigo === activa.aeronave_codigo)
    : null;

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
          {/* El cronómetro, corriendo. */}
          <div className="tec-reloj">
            <span className="tec-reloj__num">
              {reloj(activa.estado === "FIRMADA"
                ? (activa.segundos_trabajo ?? 0)
                : (activa.segundos_trabajo ?? 0) + tic)}
            </span>
            <span className="tec-reloj__et">
              {activa.estado === "FIRMADA" ? "trabajadas" : "desde que lo tomaste"}
            </span>
          </div>

          {activa.estado === "FIRMADA" && (
            <div className="tec-activo__aviso">Esperando la revisión del jefe de taller.</div>
          )}
          {activa.nota_revision && activa.estado === "ABIERTA" && (
            <div className="tec-activo__aviso tec-activo__aviso--alerta">
              El jefe la devolvió: {activa.nota_revision}
            </div>
          )}

          {/* Todo lo que se hace SOBRE este trabajo vive acá adentro: si está
              atado a la orden, no puede estar suelto en la pantalla. */}
          <div className="tec-acciones">
            <button className="tec-btn" onClick={() => setAccion("material")}>
              <i className="bi bi-clipboard-plus"></i>
              <span>Pedir material</span>
              <small>para {activa.aeronave_codigo}</small>
            </button>

            {mantDeActiva && (
              <button className="tec-btn" onClick={() => setEstimando(mantDeActiva)}>
                <i className="bi bi-calendar-event"></i>
                <span>¿Cuándo está listo?</span>
                <small>
                  {mantDeActiva.fecha_fin
                    ? `hoy dice ${String(mantDeActiva.fecha_fin).slice(0, 10)}`
                    : "sin fecha todavía"}
                </small>
              </button>
            )}

            <button className="tec-btn tec-btn--cerrar" disabled={activa.estado === "FIRMADA"}
              onClick={() => setAccion("firmar")}>
              <i className="bi bi-pen"></i>
              <span>Terminé — mandar a revisión</span>
              <small>
                {activa.estado === "FIRMADA" ? "ya la mandaste; espera al jefe" : "firmás y la revisa el jefe"}
              </small>
            </button>
          </div>

          {activa.documentos > 0 && (
            <div className="tec-activo__aviso">
              Este trabajo ya tiene {activa.documentos} documento(s) de bodega.
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

      {/* Acá abajo SOLO lo que no depende de un trabajo abierto. */}
      <div className="tec-botones">
        <button className="tec-btn tec-btn--principal" onClick={() => { setDesdeCola(null); setAccion("abrir"); }}>
          <i className="bi bi-play-circle"></i>
          <span>Iniciar un mantenimiento</span>
        </button>

        <button className="tec-btn" onClick={() => setAccion("aceite")}>
          <i className="bi bi-droplet-half"></i>
          <span>Sacar aceite</span>
          <small>sin orden de trabajo</small>
        </button>
      </div>



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
