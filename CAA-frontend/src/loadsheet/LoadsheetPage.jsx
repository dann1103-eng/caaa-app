import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LoadSheetProvider, getDefaultFuelData } from "./context/LoadSheetContext";
import { AIRCRAFT } from "./data/aircraft";
import { getWBData } from "./loadsheetApi";
import { getAeronavesPractica, getPlantillaPractica } from "./loadsheetPracticaApi";
import { getSession } from "../utils/auth";
import LoadsheetWizard from "./LoadsheetWizard";
import "./loadsheet.css";

// Mapea la matricula de la aeronave (codigo en BD) a la plantilla estatica de fallback
// (aircraft.js), usada solo cuando la BD todavia no tiene plantilla propia para esa aeronave.
function findAircraftKey(codigo) {
  if (!codigo) return null;
  const key = Object.keys(AIRCRAFT).find(
    (k) => AIRCRAFT[k].reg?.toUpperCase() === String(codigo).toUpperCase()
  );
  return key || null;
}

// Construye el catalogo { matricula: plantilla } para este vuelo. DB-first: si el backend
// ya resolvio una plantilla (data.plantilla, mapeada al shape de AIRCRAFT), se usa tal cual.
// Fallback: si la aeronave no tiene plantilla en BD, se busca en el catalogo estatico por
// matricula y se clona con "reg" forzado a la matricula real (el key interno puede diferir,
// p.ej. historicamente "YS-270-P" vs la matricula real "YS-270-PE"). Si ninguna de las dos
// resuelve, devuelve null: la aeronave de verdad no tiene loadsheet digital disponible.
function buildAircraftCatalog(data) {
  const codigo = data.aeronave_codigo;
  if (data.plantilla) {
    return { [codigo]: data.plantilla };
  }
  const key = findAircraftKey(codigo);
  if (!key) return null;
  return { [codigo]: { ...AIRCRAFT[key], reg: codigo } };
}

// Construye los overrides iniciales del contexto a partir de los datos del backend.
function buildInitial(idVuelo, data, aircraftCatalog) {
  const v = data.vuelo || {};
  const wb = data.wb || null;
  const ls = data.savedLoadsheet || null;
  const wps = data.savedWaypoints || [];

  const initial = {
    idVuelo,
    currentAC: data.aeronave_codigo,
    aircraftCatalog,
    flightData: {
      date: v.fecha_vuelo ? String(v.fecha_vuelo).slice(0, 10) : new Date().toISOString().split("T")[0],
      time: v.hora_inicio ? String(v.hora_inicio).slice(0, 5) : "",
      student: [v.alumno_nombre, v.alumno_apellido].filter(Boolean).join(" "),
      license: v.licencia_nombre || "",
      instructor: [v.instructor_nombre, v.instructor_apellido].filter(Boolean).join(" "),
      instructorLicense: v.instructor_licencia || "",
    },
    // Consumo por defecto del avión REAL de este vuelo (no el hardcodeado '10 gal/hr'
    // del Arrow que traía el estado inicial del wizard). Se sobreescribe abajo si ya
    // hay un loadsheet guardado con su propio power/flow.
    fuelData: getDefaultFuelData(data.aeronave_codigo, aircraftCatalog),
  };

  // Restaurar peso & balance guardado
  if (wb) {
    if (wb.pesos_ingresados) initial.wbInputs = wb.pesos_ingresados;
    if (wb.fuel_burn != null) initial.fuelBurn = String(wb.fuel_burn);
  }

  // Restaurar resto del loadsheet guardado (memoria)
  if (ls) {
    initial.fuelData = {
      power: ls.power_setting ?? initial.fuelData.power,
      flowGal: ls.fuel_flow ?? initial.fuelData.flowGal,
      flowKg: initial.fuelData.flowKg,
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

// Construye el catalogo { matricula: plantilla } del modo PRACTICA (sandbox sin
// vuelo real): trae TODAS las aeronaves con plantilla de peso y balance cargada
// (excluye simuladores y dadas de baja, ya filtrado por el backend), para que el
// alumno/instructor pueda practicar con cualquiera desde el selector del Paso 1.
async function buildPracticeCatalog() {
  const aeronaves = await getAeronavesPractica();
  const conPlantilla = aeronaves.filter((a) => a.tiene_plantilla);
  const entries = await Promise.all(
    conPlantilla.map(async (a) => {
      try {
        const { plantilla } = await getPlantillaPractica(a.id_aeronave);
        return plantilla ? [a.matricula, plantilla] : null;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
}

// Construye los overrides iniciales del contexto para el modo PRACTICA: sin
// vuelo real (idVuelo null), sin restaurar nada guardado, con el nombre del
// usuario logueado precargado como alumno (la licencia queda en blanco).
function buildPracticeInitial(aircraftCatalog) {
  const currentAC = Object.keys(aircraftCatalog)[0];
  const session = getSession();
  const student = session
    ? [session.nombre, session.apellido].filter(Boolean).join(" ").trim()
    : "";

  return {
    idVuelo: null,
    currentAC,
    aircraftCatalog,
    flightData: {
      date: new Date().toISOString().split("T")[0],
      time: "",
      student,
      license: "",
      instructor: "",
      instructorLicense: "",
    },
    fuelData: getDefaultFuelData(currentAC, aircraftCatalog),
    readOnly: false,
    practice: true,
  };
}

export default function LoadsheetPage({ readOnly = false, apiBase = "alumno", practice = false }) {
  const { id_vuelo } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [initial, setInitial] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (practice) {
          const aircraftCatalog = await buildPracticeCatalog();
          if (Object.keys(aircraftCatalog).length === 0) {
            if (!cancel) setError(
              "No hay aviones con plantilla de peso y balance disponibles para practicar."
            );
            return;
          }
          if (!cancel) setInitial(buildPracticeInitial(aircraftCatalog));
          return;
        }

        const data = await getWBData(id_vuelo, apiBase);
        const aircraftCatalog = buildAircraftCatalog(data);
        if (!aircraftCatalog) {
          if (!cancel) setError(
            `La aeronave "${data.aeronave_codigo || "—"}" todavía no tiene cargada su plantilla de peso y balance, así que el loadsheet digital no está disponible para este vuelo. Por ahora se completa a mano. (Los simuladores no requieren loadsheet.)`
          );
          return;
        }
        if (!cancel) setInitial({ ...buildInitial(id_vuelo, data, aircraftCatalog), readOnly });
      } catch (e) {
        if (!cancel) setError(e?.response?.data?.message || "No se pudo cargar el vuelo.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [id_vuelo, practice]);

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
      <LoadsheetWizard onExit={() => navigate(-1)} readOnly={readOnly} practice={practice} />
    </LoadSheetProvider>
  );
}
