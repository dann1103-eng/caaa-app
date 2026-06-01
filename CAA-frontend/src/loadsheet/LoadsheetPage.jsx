import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LoadSheetProvider } from "./context/LoadSheetContext";
import { AIRCRAFT } from "./data/aircraft";
import { getWBData } from "./loadsheetApi";
import LoadsheetWizard from "./LoadsheetWizard";
import "./loadsheet.css";

// Mapea la matricula de la aeronave (codigo en BD) a la plantilla de la calculadora.
function findAircraftKey(codigo) {
  if (!codigo) return null;
  const key = Object.keys(AIRCRAFT).find(
    (k) => AIRCRAFT[k].reg?.toUpperCase() === String(codigo).toUpperCase()
  );
  return key || null;
}

// Construye los overrides iniciales del contexto a partir de los datos del backend.
function buildInitial(idVuelo, data, acKey) {
  const v = data.vuelo || {};
  const wb = data.wb || null;
  const ls = data.savedLoadsheet || null;
  const wps = data.savedWaypoints || [];

  const initial = {
    idVuelo,
    currentAC: acKey,
    flightData: {
      date: v.fecha_vuelo ? String(v.fecha_vuelo).slice(0, 10) : new Date().toISOString().split("T")[0],
      time: v.hora_inicio ? String(v.hora_inicio).slice(0, 5) : "",
      student: [v.alumno_nombre, v.alumno_apellido].filter(Boolean).join(" "),
      license: v.licencia_nombre || "",
      instructor: [v.instructor_nombre, v.instructor_apellido].filter(Boolean).join(" "),
      instructorLicense: v.instructor_licencia || "",
    },
  };

  // Restaurar peso & balance guardado
  if (wb) {
    if (wb.pesos_ingresados) initial.wbInputs = wb.pesos_ingresados;
    if (wb.fuel_burn != null) initial.fuelBurn = String(wb.fuel_burn);
  }

  // Restaurar resto del loadsheet guardado (memoria)
  if (ls) {
    initial.fuelData = {
      power: ls.power_setting ?? "",
      flowGal: ls.fuel_flow ?? "",
      flowKg: "",
      taxiMin: ls.taxi_fuel ?? "",
      tripMin: ls.trip_fuel ?? "",
      rarMin: ls.reserve_rr ?? "",
      alt1Min: ls.alt1_fuel ?? "",
      alt2Min: ls.alt2_fuel ?? "",
      reserveMin: ls.final_reserve ?? "",
      minReqMin: ls.min_req ?? "",
    };
    if (ls.ops_data) initial.opsData = ls.ops_data;
    if (ls.identification_data) initial.identification = ls.identification_data;
    if (ls.notas != null) initial.notes = ls.notas;
    if (ls.dep_atis != null) initial.depAtis = ls.dep_atis;
    if (ls.arr_atis != null) initial.arrAtis = ls.arr_atis;
  }
  if (wps.length > 0) {
    initial.navRows = wps.map((w) => w.data || {});
  }

  return initial;
}

export default function LoadsheetPage({ readOnly = false, apiBase = "alumno" }) {
  const { id_vuelo } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [initial, setInitial] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const data = await getWBData(id_vuelo, apiBase);
        const acKey = findAircraftKey(data.aeronave_codigo);
        if (!acKey) {
          if (!cancel) setError(
            `La aeronave "${data.aeronave_codigo || "—"}" no tiene plantilla de peso y balance (¿es un simulador?). El loadsheet no aplica para este vuelo.`
          );
          return;
        }
        if (!cancel) setInitial({ ...buildInitial(id_vuelo, data, acKey), readOnly });
      } catch (e) {
        if (!cancel) setError(e?.response?.data?.message || "No se pudo cargar el vuelo.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [id_vuelo]);

  if (loading) {
    return <div className="ls-screen"><div className="ls-box">Cargando loadsheet…</div></div>;
  }
  if (error) {
    return (
      <div className="ls-screen">
        <div className="ls-box">
          <p style={{ marginBottom: 16 }}>{error}</p>
          <button className="ls-back-btn" onClick={() => navigate(-1)}>← Volver</button>
        </div>
      </div>
    );
  }

  return (
    <LoadSheetProvider initial={initial}>
      <LoadsheetWizard onExit={() => navigate(-1)} readOnly={readOnly} />
    </LoadSheetProvider>
  );
}
