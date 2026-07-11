import axios from "axios";

import { API_URL } from "../api/axiosConfig";

export const getMiHorario = async (week) => {
  if (!localStorage.getItem("token")) return [];
  const res = await axios.get(`${API_URL}/alumno/mi-horario`, { params: { week } });
  return res.data;
};

export const getMiLicencia = async () => {
  const res = await axios.get(`${API_URL}/alumno/licencia`);
  return res.data;
};

export const getMiInfo = async () => {
  const res = await axios.get(`${API_URL}/alumno/mi-info`);
  return res.data;
};

export const getMiProximoMantenimiento = async () => {
  const res = await axios.get(`${API_URL}/alumno/mi-proximo-mantenimiento`);
  return res.data;
};

export const solicitarCancelacion = async (id_vuelo, motivo) => {
  const res = await axios.post(`${API_URL}/alumno/vuelos/${id_vuelo}/solicitar-cancelacion`, { motivo });
  return res.data;
};

export const quitarSolicitudCancelacion = async (id_solicitud) => {
  const res = await axios.delete(`${API_URL}/alumno/solicitudes-cancelacion/${id_solicitud}`);
  return res.data;
};

export const getMisSolicitudesCancelacion = async () => {
  const res = await axios.get(`${API_URL}/alumno/mis-solicitudes-cancelacion`);
  return res.data;
};

export const getCondicionesCancelacion = async (id_vuelo = null) => {
  const res = await axios.get(`${API_URL}/alumno/condiciones-cancelacion`, {
    params: id_vuelo ? { id_vuelo } : {},
  });
  return res.data;
};

export const getMisClases = async () => {
  const res = await axios.get(`${API_URL}/alumno/mis-clases`);
  return res.data;
};

export const getBloquesBloqueadosAlumno = async () => {
  const res = await axios.get(`${API_URL}/alumno/bloques-bloqueados`);
  return res.data;
};

export const getPlanVuelo = async (id_vuelo) => {
  const res = await axios.get(`${API_URL}/alumno/vuelos/${id_vuelo}/plan-vuelo`);
  return res.data;
};

export const guardarPlanVuelo = async (id_vuelo, datos) => {
  const res = await axios.put(`${API_URL}/alumno/vuelos/${id_vuelo}/plan-vuelo`, datos);
  return res.data;
};

export const completarPlanVuelo = async (id_vuelo, pdfBlob) => {
  const formData = new FormData();
  formData.append("pdf", pdfBlob, "plan-vuelo.pdf");
  const res = await axios.patch(`${API_URL}/alumno/vuelos/${id_vuelo}/plan-vuelo/completar`, formData);
  return res.data;
};

export const getWB = async (id_vuelo) => {
  const res = await axios.get(`${API_URL}/alumno/vuelos/${id_vuelo}/weight-balance`);
  return res.data;
};

export const guardarWB = async (id_vuelo, datos) => {
  const res = await axios.put(`${API_URL}/alumno/vuelos/${id_vuelo}/weight-balance`, datos);
  return res.data;
};

export const completarWB = async (id_vuelo) => {
  const res = await axios.patch(`${API_URL}/alumno/vuelos/${id_vuelo}/weight-balance/completar`, {});
  return res.data;
};

export const getLoadsheet = async (id_vuelo) => {
  const res = await axios.get(`${API_URL}/alumno/vuelos/${id_vuelo}/loadsheet`);
  return res.data;
};

export const guardarLoadsheet = async (id_vuelo, datos) => {
  const res = await axios.put(`${API_URL}/alumno/vuelos/${id_vuelo}/loadsheet`, datos);
  return res.data;
};

export const completarLoadsheet = async (id_vuelo, pdfBlob) => {
  const formData = new FormData();
  formData.append("pdf", pdfBlob, "loadsheet.pdf");
  const res = await axios.patch(`${API_URL}/alumno/vuelos/${id_vuelo}/loadsheet/completar`, formData);
  return res.data;
};

export const getReporteVuelo = async (id_vuelo) => {
  const res = await axios.get(`${API_URL}/alumno/vuelos/${id_vuelo}/reporte-vuelo`);
  return res.data;
};

export const guardarReporteVuelo = async (id_vuelo, datos) => {
  const res = await axios.put(`${API_URL}/alumno/vuelos/${id_vuelo}/reporte-vuelo`, datos);
  return res.data;
};

export const enviarReporteVuelo = async (id_vuelo, datos) => {
  const res = await axios.patch(`${API_URL}/alumno/vuelos/${id_vuelo}/reporte-vuelo/enviar`, datos);
  return res.data;
};

export const getReportesPendientesAlumno = async () => {
  const res = await axios.get(`${API_URL}/alumno/reportes-pendientes`);
  return res.data;
};

export const getReportesCompletadosAlumno = async () => {
  const res = await axios.get(`${API_URL}/alumno/reportes-completados`);
  return res.data;
};

export const firmarReporteVueloAlumno = async (id_vuelo, firma_alumno) => {
  const res = await axios.patch(
    `${API_URL}/alumno/vuelos/${id_vuelo}/reporte-vuelo/firmar`,
    { firma_alumno }
  );
  return res.data;
};

// ── Cuenta corriente del alumno (Módulo Administración) ──────────────
export const getMiCuenta = async () => {
  const res = await axios.get(`${API_URL}/alumno/mi-cuenta`);
  return res.data;
};

export const getMiExtracto = async () => {
  const res = await axios.get(`${API_URL}/alumno/mi-cuenta/extracto`);
  return res.data;
};

export const getMiAvanceCurso = async () => {
  const res = await axios.get(`${API_URL}/alumno/mi-avance-curso`);
  return res.data;
};

export const getMisDocumentos = async () => {
  const res = await axios.get(`${API_URL}/alumno/mis-documentos`);
  return res.data;
};

export const getMiDocumentoArchivoUrl = async (id) => {
  const res = await axios.get(`${API_URL}/alumno/mis-documentos/${id}/archivo-url`);
  return res.data;
};

export const getMiHistorial = async () => {
  const res = await axios.get(`${API_URL}/alumno/mi-historial`);
  return res.data;
};

export const getMiAulaVirtual = async () => {
  const res = await axios.get(`${API_URL}/alumno/mi-aula-virtual`);
  return res.data;
};

export const getMaterialUrlAlumno = async (id) => {
  const res = await axios.get(`${API_URL}/administracion/aula/material/${id}/url`);
  return res.data;
};
