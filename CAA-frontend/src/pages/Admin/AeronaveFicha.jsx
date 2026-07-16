import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  getAeronaveFicha, actualizarAeronave, getVuelosAeronave, setFotoAeronave,
} from "../../services/adminApi";

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
      {tab === "wb" && <TabWB a={a} />}
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

      <div className="adf-card" style={{ marginBottom: "var(--sp-5)" }}>
        <h3><i className="bi bi-key me-2"></i>Licencias habilitadas</h3>
        {a.licencias?.length ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {a.licencias.map((l) => <span key={l.id_licencia} className="adf-tag blue">{l.nombre}</span>)}
          </div>
        ) : (
          <p className="adf-note" style={{ marginTop: 8 }}>
            <i className="bi bi-exclamation-triangle"></i>
            <span>
              Ninguna licencia tiene habilitada esta aeronave, así que <strong>nadie la puede
              agendar</strong>. Se define en la tabla <code>licencia_aeronave</code>.
            </span>
          </p>
        )}
      </div>

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

// ── Peso y balance ───────────────────────────────────────────────────────────
function TabWB({ a }) {
  if (a.tipo === "SIMULADOR") {
    return (
      <div className="adf-card">
        <h3><i className="bi bi-speedometer2 me-2"></i>Peso y balance</h3>
        <p className="adf-note" style={{ marginTop: 8 }}>Los simuladores no llevan peso y balance.</p>
      </div>
    );
  }
  return (
    <div className="adf-card">
      <h3><i className="bi bi-speedometer2 me-2"></i>Peso y balance</h3>
      {a.id_wb_plantilla ? (
        <p className="adf-note" style={{ marginTop: 8 }}>
          <i className="bi bi-check-circle"></i>
          <span>Esta aeronave tiene plantilla de peso y balance cargada (#{a.id_wb_plantilla}), así que su loadsheet digital funciona.</span>
        </p>
      ) : (
        <p className="adf-note" style={{ marginTop: 8 }}>
          <i className="bi bi-exclamation-triangle"></i>
          <span>
            <strong>Sin plantilla de peso y balance.</strong> El avión se agenda y vuela con
            normalidad, pero su loadsheet digital no está disponible y por ahora se completa a mano.
            Para activarlo hace falta el <strong>peso vacío</strong> y el <strong>CG vacío</strong> de
            su última pesada, más los brazos y la envolvente de su hoja de P&B.
          </span>
        </p>
      )}
      <p className="adf-note" style={{ marginTop: 12 }}>
        El editor de plantillas (estaciones, brazos, límites y envolvente) todavía no está construido
        — es el siguiente paso de este módulo. Mientras tanto las plantillas se cargan por código.
      </p>
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
