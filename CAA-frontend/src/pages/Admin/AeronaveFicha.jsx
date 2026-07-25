import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  getAeronaveFicha, actualizarAeronave, getVuelosAeronave, setFotoAeronave,
  setLicenciasAeronave, listLicencias, getWbPlantilla, guardarWbPlantilla,
} from "../../services/adminApi";
import EnvelopeCanvas from "../../loadsheet/components/wb/EnvelopeCanvas";

const TABS = [
  { key: "datos", label: "Datos", icon: "bi-airplane" },
  { key: "wb", label: "Peso y balance", icon: "bi-speedometer2" },
  { key: "documentos", label: "Documentos", icon: "bi-folder2-open" },
  { key: "vuelos", label: "Loadsheets y vuelos", icon: "bi-calendar-check" },
];

const num = (v) => (v == null || v === "" ? "—" : Number(v).toFixed(1));
const fecha = (d) => (d ? String(d).slice(0, 10) : "—");
const hora = (h) => (h ? String(h).slice(0, 5) : "—");

function LoadsheetTag({ estado }) {
  if (!estado) return <span className="adf-tag gray">Sin loadsheet</span>;
  const map = { BORRADOR: ["amber", "Borrador"], ENVIADO: ["green", "Enviado"] };
  const [cls, txt] = map[estado] || ["blue", estado];
  return <span className={`adf-tag ${cls}`}>{txt}</span>;
}

export default function AeronaveFicha() {
  const { id_aeronave } = useParams();
  const [tab, setTab] = useState("datos");
  const [a, setA] = useState(null);
  const [vuelos, setVuelos] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    try {
      setA(await getAeronaveFicha(id_aeronave));
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo cargar la aeronave");
    } finally {
      setLoading(false);
    }
  }, [id_aeronave]);

  useEffect(() => { cargar(); }, [cargar]);

  // Los vuelos solo se piden cuando se abre esa pestaña (puede traer 50 filas).
  useEffect(() => {
    if (tab !== "vuelos" || !id_aeronave) return;
    (async () => {
      try {
        setVuelos(await getVuelosAeronave(id_aeronave));
      } catch {
        toast.error("Error al cargar los vuelos de la aeronave");
      }
    })();
  }, [tab, id_aeronave]);

  if (loading) return <p style={{ color: "var(--c-ink-3)" }}>Cargando aeronave…</p>;
  if (!a) return (
    <>
      <Link to="/admin/aeronaves" className="adf-btn ghost small"><i className="bi bi-arrow-left"></i> Volver</Link>
      <p style={{ marginTop: 16 }}>Aeronave no encontrada.</p>
    </>
  );

  return (
    <>
      <Link to="/admin/aeronaves" className="adf-btn ghost small" style={{ marginBottom: 12 }}>
        <i className="bi bi-arrow-left"></i> Volver a aeronaves
      </Link>

      <header style={{ marginBottom: 20 }}>
        <div className="u-label">Ficha de aeronave</div>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--c-ink-1)" }}>
          {a.codigo}
          {/* Un avión en mantenimiento también tiene activa=false, así que se
              pregunta por estado primero (ver EstadoTag en Aeronaves.jsx). */}
          {a.estado === "MANTENIMIENTO" ? (
            <span className="adf-tag amber" style={{ marginLeft: 10 }}>En mantenimiento</span>
          ) : a.activa === false ? (
            <span className="adf-tag gray" style={{ marginLeft: 10 }}>De baja</span>
          ) : null}
        </h1>
        <p style={{ color: "var(--c-ink-3)", fontSize: "var(--text-sm)", marginTop: 4 }}>
          {a.modelo} · {a.tipo} · {num(a.horas_acumuladas)}h acumuladas · {a.total_vuelos} vuelo(s)
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key}
            className={`adf-btn ${tab === t.key ? "" : "secondary"}`}
            onClick={() => setTab(t.key)}>
            <i className={`bi ${t.icon}`}></i> {t.label}
          </button>
        ))}
      </div>

      {tab === "datos" && <TabDatos a={a} onSaved={cargar} />}
      {tab === "wb" && <TabWB a={a} onSaved={cargar} />}
      {tab === "documentos" && <TabDocumentos />}
      {tab === "vuelos" && <TabVuelos vuelos={vuelos} />}
    </>
  );
}

// ── Datos ────────────────────────────────────────────────────────────────────
function TabDatos({ a, onSaved }) {
  const [f, setF] = useState({ codigo: a.codigo, modelo: a.modelo, tipo: a.tipo, color: a.color || "" });
  const set = (k, v) => setF({ ...f, [k]: v });
  const [saving, setSaving] = useState(false);
  const [foto, setFoto] = useState(a.foto_url || "");
  const [savingFoto, setSavingFoto] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    if (!f.codigo.trim()) return toast.error("La matrícula no puede quedar vacía");
    setSaving(true);
    try {
      await actualizarAeronave(a.id_aeronave, { ...f, color: f.color || null });
      toast.success("Datos actualizados");
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const guardarFoto = async () => {
    setSavingFoto(true);
    try {
      await setFotoAeronave(a.id_aeronave, foto.trim() || null);
      toast.success("Foto actualizada");
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar la foto");
    } finally {
      setSavingFoto(false);
    }
  };

  return (
    <>
      <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><i className="bi bi-airplane me-2"></i>Datos de la aeronave</h3>
          <button type="submit" form="fichaAeronaveForm" className="adf-btn small" disabled={saving}>
            <i className="bi bi-check"></i>{saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <form id="fichaAeronaveForm" onSubmit={guardar}>
          <div className="adf-form-grid">
            <div className="adf-form-field">
              <label>Matrícula</label>
              <input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>Modelo</label>
              <input value={f.modelo} onChange={(e) => set("modelo", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>Tipo</label>
              <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
                <option value="AVION">Avión</option>
                <option value="SIMULADOR">Simulador</option>
              </select>
            </div>
            <div className="adf-form-field">
              <label>Color (código de color en Proyección)</label>
              <input value={f.color} onChange={(e) => set("color", e.target.value)} placeholder="Blanco y rojo" />
            </div>
          </div>
        </form>
      </div>

      <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
        <h3><i className="bi bi-gear me-2"></i>Operación</h3>
        <p className="adf-note">
          <i className="bi bi-info-circle"></i>
          <span>
            Estos valores no se editan acá porque los maneja otro módulo y se pisarían: las
            <strong> horas</strong> las mueve el cierre de vuelo (o "horas manuales" en Mantenimiento),
            el <strong>estado</strong> lo deriva el mantenimiento vigente del día, y la
            <strong> próxima revisión</strong> la sincroniza el Taller.
          </span>
        </p>
        <div className="adf-form-grid" style={{ marginTop: 12 }}>
          <div className="adf-form-field">
            <label>Horas acumuladas</label>
            <input value={`${num(a.horas_acumuladas)} h`} disabled />
          </div>
          <div className="adf-form-field">
            <label>Próxima revisión</label>
            <input value={a.horas_proxima_revision ? `${num(a.horas_proxima_revision)} h (${a.tipo_proxima_revision || "—"})` : "—"} disabled />
          </div>
          <div className="adf-form-field">
            <label>Estado</label>
            <input value={a.activa === false ? "De baja" : a.estado} disabled />
          </div>
        </div>
      </div>

      <LicenciasCard a={a} onSaved={onSaved} />

      <div className="adf-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><i className="bi bi-image me-2"></i>Foto</h3>
          <button className="adf-btn small" onClick={guardarFoto} disabled={savingFoto}>
            <i className="bi bi-check"></i>{savingFoto ? "Guardando…" : "Guardar foto"}
          </button>
        </div>
        <div className="adf-form-field">
          <label>URL de la foto</label>
          <input value={foto} onChange={(e) => setFoto(e.target.value)} placeholder="https://…" />
        </div>
        {foto ? (
          <img src={foto} alt={a.codigo}
            style={{ marginTop: 12, maxWidth: 340, width: "100%", borderRadius: "var(--radius-md)", display: "block" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <p className="adf-note" style={{ marginTop: 12 }}>Sin foto cargada.</p>
        )}
      </div>
    </>
  );
}

// ── Licencias habilitadas ────────────────────────────────────────────────────
// Esta tabla (licencia_aeronave) es la ÚNICA fuente de verdad de quién puede pedir
// este avión: la consultan con el mismo JOIN el alumno al pedir horas y el staff al
// agendar. Hasta ahora solo se tocaba por SQL.
function LicenciasCard({ a, onSaved }) {
  const [todas, setTodas] = useState([]);
  const [sel, setSel] = useState(() => new Set((a.licencias || []).map((l) => l.id_licencia)));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setTodas(await listLicencias());
      } catch {
        toast.error("Error al cargar las licencias");
      }
    })();
  }, []);

  const toggle = (id) => {
    const s = new Set(sel);
    s.has(id) ? s.delete(id) : s.add(id);
    setSel(s);
  };

  const guardar = async () => {
    setSaving(true);
    try {
      await setLicenciasAeronave(a.id_aeronave, [...sel]);
      toast.success("Licencias actualizadas");
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar las licencias");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}><i className="bi bi-key me-2"></i>Licencias habilitadas</h3>
        <button className="adf-btn small" onClick={guardar} disabled={saving}>
          <i className="bi bi-check"></i>{saving ? "Guardando…" : "Guardar licencias"}
        </button>
      </div>

      <p className="adf-note">
        <i className="bi bi-info-circle"></i>
        <span>
          Esto es <strong>lo que decide quién puede pedir este avión</strong>: es la misma tabla que
          consulta el alumno al pedir horas y el staff al agendar. Si a un alumno no le aparece una
          aeronave, se arregla acá — no cambiándole la licencia, porque eso también le mueve las
          horas y el avance hacia su licencia.
        </span>
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {todas.map((l) => {
          const on = sel.has(l.id_licencia);
          return (
            <button key={l.id_licencia} type="button"
              className={`adf-btn ${on ? "" : "secondary"} small`}
              onClick={() => toggle(l.id_licencia)}
              title={on ? "Quitar" : "Habilitar"}>
              <i className={`bi ${on ? "bi-check-square" : "bi-square"}`}></i> {l.nombre}
            </button>
          );
        })}
      </div>

      {sel.size === 0 && (
        <p className="adf-note" style={{ marginTop: 12 }}>
          <i className="bi bi-exclamation-triangle"></i>
          <span>Sin ninguna licencia marcada, <strong>nadie va a poder agendar este avión</strong>.</span>
        </p>
      )}
      {a.activa === false && sel.size > 0 && (
        <p className="adf-note" style={{ marginTop: 12 }}>
          <i className="bi bi-exclamation-triangle"></i>
          <span>
            Ojo: aunque marques licencias, este avión <strong>no aparece al pedir horas</strong>
            porque hoy está fuera de servicio ({a.estado === "MANTENIMIENTO" ? "en mantenimiento" : "dado de baja"}).
          </span>
        </p>
      )}
    </div>
  );
}

// ── Peso y balance ───────────────────────────────────────────────────────────
// Helpers de conversión entre el estado del form (todo string, para poder tipear
// parcial) y la forma AIRCRAFT que espera/devuelve el backend.

// String de input -> número para el PAYLOAD. Vacío/nulo -> null (el backend lo
// convierte a NaN y responde 400 con el mensaje del campo). NUNCA usar Number("")
// que da 0 y colaría un valor falso (p.ej. fwd=0 en un límite a medio llenar).
const toPayloadNum = (s) => (s === "" || s == null ? null : Number(s));

// Filtra filas de límites/estaciones totalmente vacías (aún no agregadas) para
// que una fila en blanco al final no bloquee el guardado.
const limitVacio = (r) => r.w === "" && r.fwd === "" && r.aft === "";
const estacionVacia = (s) =>
  (s.label ?? "").toString().trim() === "" && s.arm === "" && s.max === "" && s.max_gal === "" && !s.is_fuel;

// Fila de límite AIRCRAFT -> fila del form (strings).
const limitToRow = (l) => ({ w: l?.w ?? "", fwd: l?.fwd ?? "", aft: l?.aft ?? "" });
// Estación AIRCRAFT -> fila del form (todas las columnas presentes).
const stationToRow = (s) => ({
  id: s?.id ?? "",
  label: s?.label ?? "",
  arm: s?.arm ?? "",
  max: s?.max ?? "",
  max_gal: s?.max_gal ?? "",
  is_fuel: !!s?.is_fuel,
});

// Objeto AIRCRAFT (del GET) -> estado del form.
function plantillaToForm(p) {
  return {
    nombre: p.nombre ?? p.sheet ?? p.model ?? "",
    model: p.model ?? "",
    sheet: p.sheet ?? "",
    empty_weight: p.empty_weight ?? "",
    empty_arm: p.empty_arm ?? "",
    max_gross: p.max_gross ?? "",
    max_landing: p.max_landing ?? "",
    max_useful_load: p.max_useful_load ?? "",
    fuel_cap_gal: p.fuel_cap_gal ?? "",
    fuel_usable_gal: p.fuel_usable_gal ?? "",
    default_flow_gal: p.default_flow_gal ?? "",
    fuel_lb_gal: p.fuel_lb_gal ?? 6,
    default_power: p.default_power ?? "",
    fuel_burn_note: p.fuel_burn_note ?? "",
    moment_div1000: !!p.moment_div1000,
    oil: p.oil
      ? { label: p.oil.label ?? "", arm: p.oil.arm ?? "", weight: p.oil.weight ?? "" }
      : null,
    stations: (p.stations || []).map(stationToRow),
    limits_normal: (p.limits_normal || []).map(limitToRow),
    limits_utility: (p.limits_utility || []).map(limitToRow),
  };
}

// Plantilla vacía editable para empezar de cero (defaults sensatos).
function emptyForm(a) {
  return {
    nombre: a.modelo || "",
    model: a.modelo || "",
    sheet: "",
    empty_weight: "",
    empty_arm: "",
    max_gross: "",
    max_landing: "",
    max_useful_load: "",
    fuel_cap_gal: "",
    fuel_usable_gal: "",
    default_flow_gal: "",
    fuel_lb_gal: 6,
    default_power: "",
    fuel_burn_note: "",
    moment_div1000: false,
    oil: null,
    stations: [{ id: "fuel", label: "Fuel", arm: "", max: "", max_gal: "", is_fuel: true }],
    limits_normal: [{ w: "", fwd: "", aft: "" }],
    limits_utility: [],
  };
}

// Estado del form -> payload AIRCRAFT para el PUT. No incluye empty_moment (el
// backend lo deriva de empty_weight * empty_arm).
function formToPayload(f) {
  const stations = f.stations.filter((s) => !estacionVacia(s)).map((s) => {
    const st = { id: (s.id || "").trim(), label: s.label, arm: toPayloadNum(s.arm) };
    if (s.is_fuel) {
      st.is_fuel = true;
      if (s.max_gal !== "" && s.max_gal != null) st.max_gal = toPayloadNum(s.max_gal);
    } else if (s.max !== "" && s.max != null) {
      st.max = toPayloadNum(s.max);
    }
    return st;
  });
  const parseLimits = (rows) =>
    rows.filter((r) => !limitVacio(r)).map((r) => ({
      w: toPayloadNum(r.w),
      fwd: toPayloadNum(r.fwd),
      aft: toPayloadNum(r.aft),
    }));
  return {
    nombre: f.nombre,
    model: f.model || undefined,
    sheet: f.sheet || undefined,
    empty_weight: toPayloadNum(f.empty_weight),
    empty_arm: toPayloadNum(f.empty_arm),
    max_gross: toPayloadNum(f.max_gross),
    max_landing: toPayloadNum(f.max_landing),
    max_useful_load: toPayloadNum(f.max_useful_load),
    fuel_cap_gal: toPayloadNum(f.fuel_cap_gal),
    fuel_usable_gal: toPayloadNum(f.fuel_usable_gal),
    default_flow_gal: toPayloadNum(f.default_flow_gal),
    fuel_lb_gal: toPayloadNum(f.fuel_lb_gal),
    default_power: toPayloadNum(f.default_power),
    fuel_burn_note: f.fuel_burn_note || undefined,
    moment_div1000: !!f.moment_div1000,
    oil: f.oil
      ? { label: f.oil.label, arm: toPayloadNum(f.oil.arm), weight: toPayloadNum(f.oil.weight) }
      : null,
    stations,
    limits_normal: parseLimits(f.limits_normal),
    limits_utility: parseLimits(f.limits_utility),
  };
}

// Parsea filas de límites del form a números para la vista previa, descartando
// las incompletas para que drawEnvelope no dibuje un punto fantasma en 0.
const limitsParaPreview = (rows) =>
  rows
    .filter((r) => r.w !== "" && r.w != null && r.fwd !== "" && r.fwd != null && r.aft !== "" && r.aft != null)
    .map((r) => ({ w: Number(r.w), fwd: Number(r.fwd), aft: Number(r.aft) }))
    .filter((r) => Number.isFinite(r.w) && Number.isFinite(r.fwd) && Number.isFinite(r.aft));

// slug simple para autocompletar el id de una estación desde su label.
const slugify = (s) =>
  (s || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function TabWB({ a, onSaved }) {
  if (a.tipo === "SIMULADOR") {
    return (
      <div className="adf-card">
        <h3><i className="bi bi-speedometer2 me-2"></i>Peso y balance</h3>
        <p className="adf-note" style={{ marginTop: 8 }}>Los simuladores no llevan peso y balance.</p>
      </div>
    );
  }
  return <WBEditor a={a} onSaved={onSaved} />;
}

function WBEditor({ a, onSaved }) {
  const [f, setF] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matricula, setMatricula] = useState(a.codigo);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getWbPlantilla(a.id_aeronave)
      .then((res) => {
        if (!alive) return;
        setMatricula(res.matricula || a.codigo);
        setF(res.plantilla ? plantillaToForm(res.plantilla) : emptyForm(a));
      })
      .catch((e) => {
        if (!alive) return;
        toast.error(e?.response?.data?.message || "No se pudo cargar el peso y balance");
        setF(emptyForm(a));
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id_aeronave]);

  // Setters ----------------------------------------------------------------
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const setStation = (i, k, v) =>
    setF((p) => ({ ...p, stations: p.stations.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const addStation = () =>
    setF((p) => ({ ...p, stations: [...p.stations, { id: "", label: "", arm: "", max: "", max_gal: "", is_fuel: false }] }));
  const removeStation = (i) =>
    setF((p) => ({ ...p, stations: p.stations.filter((_, j) => j !== i) }));

  const setLimit = (key, i, k, v) =>
    setF((p) => ({ ...p, [key]: p[key].map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));
  const addLimit = (key) =>
    setF((p) => ({ ...p, [key]: [...p[key], { w: "", fwd: "", aft: "" }] }));
  const removeLimit = (key, i) =>
    setF((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }));

  // Momento vacío derivado (solo lectura).
  const emptyMoment = useMemo(() => {
    if (!f) return null;
    const w = Number(f.empty_weight), arm = Number(f.empty_arm);
    if (!Number.isFinite(w) || !Number.isFinite(arm) || f.empty_weight === "" || f.empty_arm === "") return null;
    return w * arm;
  }, [f]);

  const previewNormal = useMemo(() => (f ? limitsParaPreview(f.limits_normal) : []), [f]);
  const previewUtility = useMemo(() => (f ? limitsParaPreview(f.limits_utility) : []), [f]);

  const guardar = async () => {
    // Campos obligatorios (los mismos que exige validarWbPlantilla en el backend):
    // así el usuario ve qué falta sin depender del 400 del server.
    const vacio = (v) => v === "" || v == null || String(v).trim() === "";
    const requeridos = [
      f.nombre, f.empty_weight, f.empty_arm, f.max_gross, f.max_landing,
      f.fuel_cap_gal, f.fuel_usable_gal, f.default_flow_gal,
    ];
    if (requeridos.some(vacio)) return toast.error("Completá los campos obligatorios (*)");

    // Aceite: si está activo, su brazo y su peso deben venir (si no, NaN en el CG).
    if (f.oil && (vacio(f.oil.arm) || vacio(f.oil.weight))) {
      return toast.error("Si el avión tiene aceite, completá su brazo y su peso (o desmarcá 'Tiene aceite').");
    }

    // Guarda de ids de estación (el wizard del loadsheet los usa como key).
    const ids = f.stations.filter((s) => !estacionVacia(s)).map((s) => (s.id || "").trim());
    if (ids.some((id) => id === "")) return toast.error("Cada estación necesita un 'id' (podés usar el sugerido).");
    if (new Set(ids).size !== ids.length) return toast.error("Los 'id' de estación no pueden repetirse.");

    setSaving(true);
    try {
      const res = await guardarWbPlantilla(a.id_aeronave, formToPayload(f));
      toast.success("Peso y balance guardado");
      if (res?.plantilla) setF(plantillaToForm(res.plantilla));
      onSaved?.(); // refresca la ficha (id_wb_plantilla pudo pasar de null a un id)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !f) return <p style={{ color: "var(--c-ink-3)" }}>Cargando peso y balance…</p>;

  const oilOn = !!f.oil;

  return (
    <>
      {/* Cabecera + acción */}
      <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><i className="bi bi-speedometer2 me-2"></i>Plantilla de peso y balance</h3>
          <button className="adf-btn small" onClick={guardar} disabled={saving}>
            <i className="bi bi-check"></i>{saving ? "Guardando…" : "Guardar plantilla"}
          </button>
        </div>
        <p className="adf-note">
          <i className="bi bi-info-circle"></i>
          <span>
            Estos son los datos de la hoja de pesada del avión ({matricula}). Con la plantilla
            cargada, el <strong>loadsheet digital</strong> del alumno queda disponible. Los valores
            vacíos u obligatorios se avisan al guardar.
          </span>
        </p>

        <div className="adf-form-grid" style={{ marginTop: 12 }}>
          <div className="adf-form-field">
            <label>Nombre de la plantilla *</label>
            <input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="PA-28-140 Cherokee" />
          </div>
          <div className="adf-form-field">
            <label>Modelo</label>
            <input value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="PA-28-140" />
          </div>
          <div className="adf-form-field">
            <label>Hoja (sheet)</label>
            <input value={f.sheet} onChange={(e) => set("sheet", e.target.value)} placeholder="PA-28R-180 & PA-28" />
          </div>
          <div className="adf-form-field">
            <label>Peso vacío (lb) *</label>
            <input type="number" step="any" value={f.empty_weight} onChange={(e) => set("empty_weight", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Brazo vacío (in) *</label>
            <input type="number" step="any" value={f.empty_arm} onChange={(e) => set("empty_arm", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Momento vacío (derivado)</label>
            <input value={emptyMoment == null ? "—" : emptyMoment.toLocaleString("en-US", { maximumFractionDigits: 1 })} disabled />
          </div>
          <div className="adf-form-field">
            <label>Peso máx. despegue (lb) *</label>
            <input type="number" step="any" value={f.max_gross} onChange={(e) => set("max_gross", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Peso máx. aterrizaje (lb) *</label>
            <input type="number" step="any" value={f.max_landing} onChange={(e) => set("max_landing", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Carga útil máx. (lb, opcional)</label>
            <input type="number" step="any" value={f.max_useful_load} onChange={(e) => set("max_useful_load", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Capacidad combustible (gal) *</label>
            <input type="number" step="any" value={f.fuel_cap_gal} onChange={(e) => set("fuel_cap_gal", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Combustible usable (gal) *</label>
            <input type="number" step="any" value={f.fuel_usable_gal} onChange={(e) => set("fuel_usable_gal", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Consumo estándar (gal/h) *</label>
            <input type="number" step="any" value={f.default_flow_gal} onChange={(e) => set("default_flow_gal", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Libras por galón</label>
            <input type="number" step="any" value={f.fuel_lb_gal} onChange={(e) => set("fuel_lb_gal", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Potencia estándar (%)</label>
            <input type="number" step="any" value={f.default_power} onChange={(e) => set("default_power", e.target.value)} />
          </div>
          <div className="adf-form-field">
            <label>Nota de consumo</label>
            <input value={f.fuel_burn_note} onChange={(e) => set("fuel_burn_note", e.target.value)} placeholder="Aprox. 8 gal/Hr @ 75% Power" />
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: "var(--text-sm)", color: "var(--c-ink-2)" }}>
          <input type="checkbox" checked={f.moment_div1000} onChange={(e) => set("moment_div1000", e.target.checked)} />
          Los momentos de la hoja están divididos entre 1000 (moment/1000)
        </label>
      </div>

      {/* Aceite */}
      <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
        <h3><i className="bi bi-droplet me-2"></i>Aceite</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: "var(--text-sm)", color: "var(--c-ink-2)" }}>
          <input
            type="checkbox"
            checked={oilOn}
            onChange={(e) => set("oil", e.target.checked ? { label: "Oil", arm: "", weight: "" } : null)}
          />
          Este avión incluye aceite como estación fija
        </label>
        {oilOn && (
          <div className="adf-form-grid" style={{ marginTop: 12 }}>
            <div className="adf-form-field">
              <label>Etiqueta</label>
              <input value={f.oil.label} onChange={(e) => set("oil", { ...f.oil, label: e.target.value })} placeholder="Oil (8qt max, 7lb/gal)" />
            </div>
            <div className="adf-form-field">
              <label>Brazo (in)</label>
              <input type="number" step="any" value={f.oil.arm} onChange={(e) => set("oil", { ...f.oil, arm: e.target.value })} />
            </div>
            <div className="adf-form-field">
              <label>Peso (lb)</label>
              <input type="number" step="any" value={f.oil.weight} onChange={(e) => set("oil", { ...f.oil, weight: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      {/* Estaciones */}
      <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><i className="bi bi-grid-3x3 me-2"></i>Estaciones</h3>
          <button className="adf-btn secondary small" type="button" onClick={addStation}>
            <i className="bi bi-plus-lg"></i> Agregar estación
          </button>
        </div>
        <p className="adf-note">
          <i className="bi bi-info-circle"></i>
          <span>
            Debe haber al menos una estación de <strong>combustible</strong> (marcá "Comb." y su
            capacidad en galones). El resto son asientos/equipaje con su peso máximo en libras. El
            <strong> id</strong> debe ser único (se autocompleta desde la etiqueta).
          </span>
        </p>
        <div className="adf-table-wrap">
          <table className="adf-table">
            <thead>
              <tr>
                <th>id</th>
                <th>Etiqueta</th>
                <th>Brazo (in)</th>
                <th>Máx (lb)</th>
                <th>Comb.</th>
                <th>Máx (gal)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {f.stations.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input style={{ width: 90 }} value={s.id}
                      onChange={(e) => setStation(i, "id", e.target.value)}
                      onBlur={(e) => { if (!e.target.value.trim() && s.label) setStation(i, "id", slugify(s.label)); }}
                      placeholder="slug" />
                  </td>
                  <td><input style={{ width: 200 }} value={s.label} onChange={(e) => setStation(i, "label", e.target.value)} placeholder="Front Seat L & R" /></td>
                  <td><input style={{ width: 80 }} type="number" step="any" value={s.arm} onChange={(e) => setStation(i, "arm", e.target.value)} /></td>
                  <td><input style={{ width: 80 }} type="number" step="any" value={s.max} onChange={(e) => setStation(i, "max", e.target.value)} disabled={s.is_fuel} /></td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={s.is_fuel} onChange={(e) => setStation(i, "is_fuel", e.target.checked)} />
                  </td>
                  <td><input style={{ width: 80 }} type="number" step="any" value={s.max_gal} onChange={(e) => setStation(i, "max_gal", e.target.value)} disabled={!s.is_fuel} /></td>
                  <td>
                    <button className="adf-icon-btn danger" type="button" title="Quitar estación" onClick={() => removeStation(i)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sobres de CG + vista previa */}
      <div className="adf-card">
        <h3><i className="bi bi-bounding-box me-2"></i>Envolvente de centro de gravedad</h3>
        <p className="adf-note">
          <i className="bi bi-info-circle"></i>
          <span>
            Cada fila es un punto (peso, límite adelante, límite atrás). El <strong>peso debe crecer</strong>
            fila a fila y <strong>fwd &lt; aft</strong> en cada una. Se necesitan al menos 2 puntos para
            dibujar el sobre.
          </span>
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "var(--sp-4)", alignItems: "start", marginTop: 12 }}>
          <div>
            <LimitTable
              titulo="Sobre normal *"
              rows={f.limits_normal}
              onChange={(i, k, v) => setLimit("limits_normal", i, k, v)}
              onAdd={() => addLimit("limits_normal")}
              onRemove={(i) => removeLimit("limits_normal", i)}
            />
            <div style={{ marginTop: "var(--sp-4)" }}>
              <LimitTable
                titulo="Sobre utility (opcional)"
                rows={f.limits_utility}
                onChange={(i, k, v) => setLimit("limits_utility", i, k, v)}
                onAdd={() => addLimit("limits_utility")}
                onRemove={(i) => removeLimit("limits_utility", i)}
              />
            </div>
          </div>
          <div>
            <EnvelopeCanvas
              limitsNormal={previewNormal}
              limitsUtility={previewUtility}
              title="Vista previa del sobre"
              showPoint={false}
            />
            {previewNormal.length < 2 && (
              <p className="adf-note" style={{ marginTop: 8 }}>
                <i className="bi bi-exclamation-triangle"></i>
                <span>Cargá al menos 2 puntos completos del sobre normal para ver la vista previa.</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Tabla editable de un sobre de CG (w/fwd/aft) con agregar/quitar fila.
function LimitTable({ titulo, rows, onChange, onAdd, onRemove }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="u-label">{titulo}</div>
        <button className="adf-btn secondary small" type="button" onClick={onAdd}>
          <i className="bi bi-plus-lg"></i> Punto
        </button>
      </div>
      <div className="adf-table-wrap">
        <table className="adf-table">
          <thead>
            <tr>
              <th>Peso (lb)</th>
              <th>Fwd (in)</th>
              <th>Aft (in)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>Sin puntos.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i}>
                  <td><input style={{ width: 90 }} type="number" step="any" value={r.w} onChange={(e) => onChange(i, "w", e.target.value)} /></td>
                  <td><input style={{ width: 90 }} type="number" step="any" value={r.fwd} onChange={(e) => onChange(i, "fwd", e.target.value)} /></td>
                  <td><input style={{ width: 90 }} type="number" step="any" value={r.aft} onChange={(e) => onChange(i, "aft", e.target.value)} /></td>
                  <td>
                    <button className="adf-icon-btn danger" type="button" title="Quitar punto" onClick={() => onRemove(i)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Documentos ───────────────────────────────────────────────────────────────
function TabDocumentos() {
  return (
    <div className="adf-card">
      <h3><i className="bi bi-folder2-open me-2"></i>Documentos</h3>
      <p className="adf-note" style={{ marginTop: 8 }}>
        Pendiente de construir: certificado de aeronavegabilidad, matrícula, seguro, hoja de pesada,
        etc. Va a reusar el mismo Storage y el patrón de URL firmada que ya usan los documentos de
        alumno.
      </p>
    </div>
  );
}

// ── Loadsheets y vuelos ──────────────────────────────────────────────────────
function TabVuelos({ vuelos }) {
  return (
    <div className="adf-card">
      <h3><i className="bi bi-calendar-check me-2"></i>Últimos vuelos</h3>
      {vuelos.length === 0 ? (
        <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem", marginTop: 8 }}>
          Esta aeronave todavía no tiene vuelos registrados.
        </p>
      ) : (
        <div className="adf-table-wrap">
          <table className="adf-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Alumno</th>
                <th>Instructor</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Loadsheet</th>
              </tr>
            </thead>
            <tbody>
              {vuelos.map((v) => (
                <tr key={v.id_vuelo}>
                  <td>{fecha(v.fecha_vuelo)}</td>
                  <td>{hora(v.hora_inicio)}</td>
                  <td>{[v.alumno_nombre, v.alumno_apellido].filter(Boolean).join(" ") || "—"}</td>
                  <td>{[v.instructor_nombre, v.instructor_apellido].filter(Boolean).join(" ") || "—"}</td>
                  <td>{v.tipo_vuelo || "—"}</td>
                  <td><span className="adf-tag">{v.estado}</span></td>
                  <td><LoadsheetTag estado={v.loadsheet_estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
