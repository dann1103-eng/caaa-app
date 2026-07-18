import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getVoucherasAeronaves, getVoucherasDia } from "../../services/administracionApi";
import ReporteVueloModal from "../../components/ReporteVueloModal/ReporteVueloModal";
import { generarPdfVoucherasDia, mensajeErrorPdf } from "../../components/ReporteVueloModal/reporteVueloPdf";

// Fecha de "hoy" en El Salvador (la del turno operativo, no la del navegador).
const hoySV = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

// Fila del listado → parámetros del generador de PDF (mismo shape que usa el
// visor individual). El backend ya manda todo, incluidas las firmas.
function rowToPdfParams(row) {
  return {
    vueloInfo: {
      id_vuelo: row.id_vuelo,
      fecha_hora_vuelo: `${row.fecha_vuelo}T${row.hora_inicio || "00:00:00"}`,
      aeronave_modelo: row.aeronave_modelo,
      aeronave_codigo: row.aeronave_codigo,
      aeronave_tipo: row.aeronave_tipo,
      alumno_nombre: row.alumno_nombre,
      alumno_licencia: row.alumno_licencia,
      instructor_nombre: row.instructor_nombre,
      instructor_licencia: row.instructor_licencia,
    },
    datos: {
      tipo_vuelo: row.tipo_vuelo,
      tacometro_salida: row.tacometro_salida,
      tacometro_llegada: row.tacometro_llegada,
      hobbs_salida: row.hobbs_salida,
      hobbs_llegada: row.hobbs_llegada,
      combustible_salida: row.combustible_salida,
      combustible_llegada: row.combustible_llegada,
      cantidad_combustible: row.cantidad_combustible,
      horas_cobradas: row.horas_cobradas,
    },
    firmaAlumno: row.firma_alumno,
    firmaInstructor: row.firma_instructor,
    esInasistencia: !!row.es_inasistencia,
    motivoInasistencia: row.motivo_inasistencia || "",
  };
}

export default function Voucheras() {
  const [aeronaves, setAeronaves] = useState([]);
  const [fecha, setFecha] = useState(hoySV());
  const [voucheras, setVoucheras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seleccion, setSeleccion] = useState(null); // id_aeronave elegida
  const [verVuelo, setVerVuelo] = useState(null);   // id_vuelo del visor abierto
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    getVoucherasAeronaves()
      .then((r) => setAeronaves(r.data || []))
      .catch(() => toast.error("No se pudieron cargar las aeronaves."));
  }, []);

  useEffect(() => {
    setLoading(true);
    getVoucherasDia(fecha)
      .then((r) => setVoucheras(r.data || []))
      .catch(() => toast.error("No se pudieron cargar las voucheras del día."))
      .finally(() => setLoading(false));
  }, [fecha]);

  const porAeronave = (id) => voucheras.filter((v) => v.id_aeronave === id);
  const lista = seleccion != null ? porAeronave(seleccion) : [];
  const aeronaveSel = aeronaves.find((a) => a.id_aeronave === seleccion);

  async function descargar(rows, sufijo) {
    if (!rows.length) {
      toast.info("No hay voucheras para descargar.");
      return;
    }
    setGenerando(true);
    try {
      await generarPdfVoucherasDia({
        voucheras: rows.map(rowToPdfParams),
        filename: `voucheras-${sufijo}-${fecha}.pdf`,
      });
    } catch (e) {
      toast.error(mensajeErrorPdf(e));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div>
      <div className="adf-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}><i className="bi bi-file-earmark-text me-2"></i>Voucheras del día</h3>
          <input
            type="date"
            className="adf-input"
            style={{ width: 170 }}
            value={fecha}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
          />
          <button
            className="adf-btn"
            disabled={generando || loading || voucheras.length === 0}
            onClick={() => descargar(voucheras, "dia")}
            title="Todas las voucheras del día (todas las aeronaves) en un solo PDF, una por página"
          >
            <i className="bi bi-printer"></i>
            {generando ? "Generando…" : `Imprimir día completo (${voucheras.length})`}
          </button>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--c-ink-3)", margin: "8px 0 0" }}>
          Reportes post-vuelo firmados (voucheras) de los vuelos completados en la fecha seleccionada.
          Elegí una aeronave para ver su detalle, o imprimí el día completo para el cierre del turno.
        </p>
      </div>

      {/* Tarjetas por aeronave */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        {aeronaves.map((a) => {
          const n = porAeronave(a.id_aeronave).length;
          const activa = seleccion === a.id_aeronave;
          return (
            <button
              key={a.id_aeronave}
              className="adf-card"
              onClick={() => setSeleccion(activa ? null : a.id_aeronave)}
              style={{
                cursor: "pointer",
                textAlign: "left",
                border: activa ? "2px solid var(--c-brand-700)" : "1px solid var(--c-line-2)",
                opacity: n === 0 ? 0.55 : 1,
                padding: "14px 16px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>
                <i className={`bi ${a.tipo === "SIMULADOR" ? "bi-display" : "bi-airplane"} me-2`} style={{ color: "var(--c-brand-700)" }}></i>
                {a.codigo}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--c-ink-3)" }}>{a.modelo}</div>
              <div style={{ fontSize: "0.8rem", marginTop: 6, color: n ? "var(--c-accent-700)" : "var(--c-ink-4)", fontWeight: 700 }}>
                {loading ? "…" : `${n} vouchera${n === 1 ? "" : "s"}`}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalle de la aeronave elegida */}
      {seleccion != null && (
        <div className="adf-card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>
              {aeronaveSel?.codigo} · {String(fecha).split("-").reverse().join("/")}
            </h3>
            <button
              className="adf-btn secondary"
              disabled={generando || lista.length === 0}
              onClick={() => descargar(lista, aeronaveSel?.codigo || "aeronave")}
            >
              <i className="bi bi-printer"></i>
              {generando ? "Generando…" : `Imprimir estas (${lista.length})`}
            </button>
          </div>
          <table className="adf-table">
            <thead>
              <tr>
                <th>Hora</th><th>Vuelo #</th><th>Alumno</th><th>Instructor</th>
                <th style={{ textAlign: "right" }}>Horas cobradas</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr key={v.id_vuelo}>
                  <td>{String(v.hora_inicio || "").slice(0, 5)}</td>
                  <td>{v.id_vuelo}</td>
                  <td>{v.alumno_nombre}</td>
                  <td style={{ color: "var(--c-ink-3)" }}>{v.instructor_nombre || "—"}</td>
                  <td className="amount" style={{ textAlign: "right" }}>
                    {v.horas_cobradas != null ? Number(v.horas_cobradas).toFixed(2) : "—"}
                  </td>
                  <td>
                    {v.es_inasistencia
                      ? <span className="adf-tag amber">inasistencia</span>
                      : <span className="adf-tag">{v.reporte_estado || "—"}</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="adf-icon-btn" title="Ver vouchera" onClick={() => setVerVuelo(v.id_vuelo)}>
                      <i className="bi bi-eye"></i>
                    </button>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 14 }}>
                  Sin voucheras para esta aeronave en la fecha seleccionada.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {verVuelo != null && (
        <ReporteVueloModal id_vuelo={verVuelo} mode="admin" onClose={() => setVerVuelo(null)} />
      )}
    </div>
  );
}
