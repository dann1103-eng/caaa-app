import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getOrdenes, crearOrden, getAeronavesBodega, getSugerenciaInspeccion,
} from "../../services/tallerApi";
import DocumentoModal from "./inventario/DocumentoModal";
import EntregarAceiteModal from "./inventario/EntregarAceiteModal";
import FirmarOrdenModal from "./ordenes/FirmarOrdenModal";
import AbrirTrabajoModal from "./ordenes/AbrirTrabajoModal";
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
export default function MiTaller() {
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [activa, setActiva] = useState(null);   // el trabajo en curso elegido
  const [accion, setAccion] = useState(null);   // 'abrir' | 'material' | 'aceite' | 'firmar'
  const [aceites, setAceites] = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await getOrdenes({ estado: "ABIERTA" });
      setOrdenes(r);
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

      <div className="tec-botones">
        <button className="tec-btn tec-btn--principal" onClick={() => setAccion("abrir")}>
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

        <button className="tec-btn tec-btn--cerrar" disabled={!activa} onClick={conTrabajo(() => setAccion("firmar"))}>
          <i className="bi bi-pen"></i>
          <span>Firmar mi trabajo</span>
          <small>{activa ? `cierra ${activa.correlativo}` : "elegí un trabajo primero"}</small>
        </button>
      </div>

      {activa && activa.documentos > 0 && (
        <p className="inv-ayuda" style={{ marginTop: "var(--sp-3)" }}>
          Este trabajo ya tiene <strong>{activa.documentos}</strong> documento(s) de bodega.
        </p>
      )}

      {accion === "abrir" && (
        <AbrirTrabajoModal
          onClose={() => setAccion(null)}
          onCreada={(o) => { setAccion(null); setActiva(o); cargar(); }}
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
