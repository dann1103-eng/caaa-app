import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTareas } from "../../../services/tallerApi";
import { restante } from "./vencimientos";

/**
 * Lo que está por vencer, en Mi taller.
 *
 * La franja de Aeronavegabilidad solo la ve quien entra a esa pantalla, y si el
 * jefe tiene que acordarse de ir a mirar no es un aviso: es un reporte. Mi
 * taller es donde ya está parado todos los días.
 *
 * Se apoya en listTareas?solo_alertas=true, que ya existía — sin endpoint nuevo.
 * Si falla, la tarjeta simplemente no aparece: nunca puede romper Mi taller.
 */
export default function TarjetaVencimientos() {
  const [porAvion, setPorAvion] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let vivo = true;
    getTareas({ solo_alertas: "true" })
      .then((t) => {
        if (!vivo) return;
        const m = new Map();
        for (const x of t) {
          const k = x.aeronave_codigo;
          if (!m.has(k)) m.set(k, { codigo: k, id: x.id_aeronave, vencidos: [], proximos: [] });
          m.get(k)[x.estado === "VENCIDO" ? "vencidos" : "proximos"].push(x);
        }
        setPorAvion([...m.values()].sort((a, b) => b.vencidos.length - a.vencidos.length));
      })
      .catch(() => setPorAvion([]));
    return () => { vivo = false; };
  }, []);

  if (!porAvion || !porAvion.length) return null;
  const totalV = porAvion.reduce((n, a) => n + a.vencidos.length, 0);
  const totalP = porAvion.reduce((n, a) => n + a.proximos.length, 0);

  return (
    <section className="tec-venc">
      <div className="tec-venc__head">
        <i className="bi bi-clipboard2-pulse" aria-hidden="true"></i>
        <strong>Aeronavegabilidad</strong>
        <span className="tec-venc__resumen">
          {totalV > 0 && <span className="tec-venc__v">{totalV} vencidos</span>}
          {totalP > 0 && <span className="tec-venc__p">{totalP} por vencer</span>}
        </span>
      </div>
      <div className="tec-venc__aviones">
        {porAvion.map((a) => (
          <button key={a.codigo} type="button" className="tec-venc__avion"
            onClick={() => navigate(`/taller/aeronavegabilidad?aeronave=${a.id}&tab=ads`)}>
            <span className="tec-venc__mat">{a.codigo}</span>
            {a.vencidos.length > 0 && <span className="tec-venc__v">{a.vencidos.length} vencidos</span>}
            {a.proximos.length > 0 && <span className="tec-venc__p">{a.proximos.length} por vencer</span>}
            <span className="tec-venc__peor">
              {(a.vencidos[0] || a.proximos[0])?.nombre}
              {" · "}
              {restante(a.vencidos[0] || a.proximos[0])}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
