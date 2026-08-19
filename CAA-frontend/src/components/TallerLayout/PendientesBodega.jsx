import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDocumentos } from "../../services/tallerApi";

/**
 * Aviso en la barra: material pedido esperando que bodega lo entregue.
 *
 * El jefe no tiene por qué entrar a buscar si hay algo pendiente: si lo hay, se
 * lo dice la barra, y de un clic cae en la pantalla donde lo entrega.
 *
 * Solo para quien entrega (jefe y admin): el mecánico pide, no despacha, y para
 * él el backend ni siquiera devuelve estos documentos.
 */
export default function PendientesBodega() {
  const [n, setN] = useState(0);
  const navigate = useNavigate();

  const cargar = useCallback(async () => {
    try {
      const r = await getDocumentos({ sin_despachar: "true" });
      setN(Array.isArray(r) ? r.length : 0);
    } catch {
      setN(0);   // sin permiso o sin red: el aviso simplemente no aparece
    }
  }, []);

  useEffect(() => {
    cargar();
    // Se refresca solo: el mecánico pide desde otra pantalla y el jefe no
    // debería tener que recargar para enterarse.
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, [cargar]);

  if (!n) return null;

  return (
    <button
      className="adf-topbar__pendientes"
      onClick={() => navigate("/taller/inventario?tab=salidas")}
      title="Material pedido esperando que bodega lo entregue"
    >
      <i className="bi bi-box-seam"></i>
      <span className="adf-topbar__pendientes-num">{n}</span>
      <span className="adf-topbar__pendientes-txt">
        {n === 1 ? "solicitud por entregar" : "solicitudes por entregar"}
      </span>
    </button>
  );
}
