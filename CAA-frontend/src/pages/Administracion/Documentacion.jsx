import React, { useEffect, useState } from "react";
import { getCatalogoDocs, getAlertasVencimiento } from "../../services/administracionApi";

const MOCK_CATALOGO = [
  { id: 1,  codigo: "CAAA_INSCRIPCION", nombre: "Hoja de inscripción CAAA",                  autoridad: "CAAA", frecuencia_renovacion_meses: null },
  { id: 2,  codigo: "CAAA_FOTO",        nombre: "Fotografía en digital",                     autoridad: "CAAA", frecuencia_renovacion_meses: null },
  { id: 3,  codigo: "CAAA_DUI",         nombre: "DUI / Pasaporte / Carnet residente",        autoridad: "CAAA", frecuencia_renovacion_meses: null },
  { id: 4,  codigo: "CAAA_NIT",         nombre: "NIT (extranjeros)",                         autoridad: "CAAA", aplica_a_extranjeros: true, frecuencia_renovacion_meses: null },
  { id: 5,  codigo: "CAAA_BITACORA",    nombre: "Bitácora de vuelo",                         autoridad: "CAAA", frecuencia_renovacion_meses: null },
  { id: 6,  codigo: "CAAA_ANTECEDENTES",nombre: "Antecedentes policiales y penales",         autoridad: "CAAA", frecuencia_renovacion_meses: 12 },
  { id: 7,  codigo: "CAAA_ANTIDOPAJE",  nombre: "Prueba antidopaje (CME)",                   autoridad: "CAAA", frecuencia_renovacion_meses: 12 },
  { id: 8,  codigo: "AAC_PARTIDA",      nombre: "Partida de nacimiento (<18)",               autoridad: "AAC",  aplica_a_menores: true, frecuencia_renovacion_meses: null },
  { id: 9,  codigo: "AAC_BACHILLER",    nombre: "Título de bachiller completado",            autoridad: "AAC",  frecuencia_renovacion_meses: null },
  { id: 10, codigo: "AAC_EXAMENES",     nombre: "Exámenes especialista y laboratorio",       autoridad: "AAC",  frecuencia_renovacion_meses: 24 },
  { id: 11, codigo: "AAC_SEGURO",       nombre: "Seguro de vida (carrera de piloto)",        autoridad: "AAC",  frecuencia_renovacion_meses: 12 },
  { id: 12, codigo: "AAC_FORMULARIO",   nombre: "Formulario de aplicación AAC",              autoridad: "AAC",  frecuencia_renovacion_meses: null },
  { id: 13, codigo: "AAC_PERMISO",      nombre: "Permiso ambos padres notariado (<18)",      autoridad: "AAC",  aplica_a_menores: true, frecuencia_renovacion_meses: null },
  { id: 14, codigo: "AAC_MEDICO_II",    nombre: "Certificado médico clase II",               autoridad: "AAC",  frecuencia_renovacion_meses: 24 }
];

const MOCK_ALERTAS = [
  { id: 1, alumno_username: "juan.oporto", documento_nombre: "Certificado médico clase II", autoridad: "AAC", fecha_vencimiento: "2026-06-10", dias_restantes: 22 },
  { id: 2, alumno_username: "maria.lopez", documento_nombre: "Seguro de vida",              autoridad: "AAC", fecha_vencimiento: "2026-05-28", dias_restantes: 9  },
  { id: 3, alumno_username: "carlos.solano", documento_nombre: "Prueba antidopaje",         autoridad: "CAAA", fecha_vencimiento: "2026-05-22", dias_restantes: 3  }
];

export default function Documentacion() {
  const [catalogo, setCatalogo] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, a] = await Promise.all([getCatalogoDocs(), getAlertasVencimiento()]);
        if (c?.ok && a?.ok) { setCatalogo(c.data); setAlertas(a.data || []); setUsingMock(false); }
        else throw new Error();
      } catch {
        setCatalogo(MOCK_CATALOGO); setAlertas(MOCK_ALERTAS); setUsingMock(true);
      }
    })();
  }, []);

  const caaaDocs = catalogo.filter(d => d.autoridad === 'CAAA');
  const aacDocs  = catalogo.filter(d => d.autoridad === 'AAC');

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-folder-check"></i>Documentación CAAA / AAC</h1>
      <p className="adf-section-subtitle">
        Catálogo oficial de documentos exigidos por la Autoridad de Aviación Civil y por CAAA.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      {alertas.length > 0 && (
        <div className="adf-card" style={{ background: "var(--c-warn-50)", borderColor: "oklch(85% 0.080 75)" }}>
          <h3><i className="bi bi-exclamation-triangle-fill me-2" style={{ color: "var(--c-warn-500)" }}></i>Alertas de vencimiento próximas (60 días)</h3>
          <table className="adf-table">
            <thead>
              <tr><th>Alumno</th><th>Documento</th><th>Autoridad</th><th>Vence</th><th>Días</th></tr>
            </thead>
            <tbody>
              {alertas.map(a => (
                <tr key={a.id}>
                  <td><i className="bi bi-person me-1"></i>{a.alumno_username}</td>
                  <td>{a.documento_nombre}</td>
                  <td><span className="adf-tag blue">{a.autoridad}</span></td>
                  <td>{a.fecha_vencimiento}</td>
                  <td>
                    <span className={`adf-tag ${a.dias_restantes <= 7 ? 'red' : a.dias_restantes <= 30 ? 'amber' : 'gray'}`}>
                      {a.dias_restantes} días
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <div className="adf-card">
          <h3><i className="bi bi-shield-check me-2"></i>Requisitos CAAA</h3>
          <table className="adf-table">
            <thead><tr><th>Documento</th><th>Renovación</th></tr></thead>
            <tbody>
              {caaaDocs.map(d => (
                <tr key={d.id}>
                  <td>
                    {d.nombre}
                    {d.aplica_a_menores && <span className="adf-tag amber" style={{ marginLeft: 6 }}>&lt;18</span>}
                    {d.aplica_a_extranjeros && <span className="adf-tag blue" style={{ marginLeft: 6 }}>extranjero</span>}
                  </td>
                  <td style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>
                    {d.frecuencia_renovacion_meses ? `Cada ${d.frecuencia_renovacion_meses} meses` : "Única vez"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="adf-card">
          <h3><i className="bi bi-bank me-2"></i>Requisitos AAC</h3>
          <table className="adf-table">
            <thead><tr><th>Documento</th><th>Renovación</th></tr></thead>
            <tbody>
              {aacDocs.map(d => (
                <tr key={d.id}>
                  <td>
                    {d.nombre}
                    {d.aplica_a_menores && <span className="adf-tag amber" style={{ marginLeft: 6 }}>&lt;18</span>}
                    {d.aplica_a_extranjeros && <span className="adf-tag blue" style={{ marginLeft: 6 }}>extranjero</span>}
                  </td>
                  <td style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>
                    {d.frecuencia_renovacion_meses ? `Cada ${d.frecuencia_renovacion_meses} meses` : "Única vez"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
