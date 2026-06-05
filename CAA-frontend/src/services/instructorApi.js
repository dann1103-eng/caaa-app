import axios from "axios";

import { API_URL } from "../api/axiosConfig";

export const getVuelosHoy = async () => {
  const res = await axios.get(`${API_URL}/instructor/vuelos-hoy`);
  return res.data;
};

export const getVuelosSemana = async (week = "current") => {
  const res = await axios.get(`${API_URL}/instructor/vuelos-semana?week=${week}`);
  return res.data;
};

export const getMisAlumnos = async () => {
  const res = await axios.get(`${API_URL}/instructor/mis-alumnos`);
  return res.data;
};

export const getMiFichaInstructor = async () => {
  const res = await axios.get(`${API_URL}/instructor/mi-ficha`);
  return res.data;
};

export const getMiHistorialInstructor = async () => {
  const res = await axios.get(`${API_URL}/instructor/mi-historial`);
  return res.data;
};

export const avanzarEstadoVuelo = async (id_vuelo, body = {}) => {
  const res = await axios.post(`${API_URL}/instructor/vuelos/${id_vuelo}/avanzar`, body);
  return res.data;
};

export const actualizarLimitesAlumno = async (id_alumno, limite_vuelos_avion, limite_vuelos_simulador) => {
  const res = await axios.patch(
    `${API_URL}/instructor/alumnos/${id_alumno}/limites`,
    { limite_vuelos_avion, limite_vuelos_simulador }
  );
  return res.data;
};

export const habilitarVueloExtra = async (id_alumno, id_semana, limite_vuelos_avion, limite_vuelos_simulador) => {
  const res = await axios.patch(
    `${API_URL}/instructor/alumnos/${id_alumno}/habilitar-vuelo-extra`,
    { id_semana, limite_vuelos_avion, limite_vuelos_simulador }
  );
  return res.data;
};

export const getReportesPendientes = async () => {
  const res = await axios.get(`${API_URL}/instructor/reportes-pendientes`);
  return res.data;
};

export const getReporteVueloInstructor = async (id_vuelo) => {
  const res = await axios.get(`${API_URL}/instructor/vuelos/${id_vuelo}/reporte-vuelo`);
  return res.data;
};

export const guardarReporteVueloInstructor = async (id_vuelo, datos) => {
  const res = await axios.put(`${API_URL}/instructor/vuelos/${id_vuelo}/reporte-vuelo`, datos);
  return res.data;
};

export const firmarReporteVuelo = async (id_vuelo, datos) => {
  const res = await axios.patch(`${API_URL}/instructor/vuelos/${id_vuelo}/reporte-vuelo/firmar`, datos);
  return res.data;
};

export const getChecklistPostvuelo = async (id_vuelo) => {
  const res = await axios.get(`${API_URL}/instructor/vuelos/${id_vuelo}/checklist-postvuelo`);
  return res.data;
};

export const guardarChecklistPostvuelo = async (id_vuelo, datos) => {
  const res = await axios.post(`${API_URL}/instructor/vuelos/${id_vuelo}/checklist-postvuelo`, datos);
  return res.data;
};

export const eliminarChecklistPostvuelo = async (id_vuelo) => {
  const res = await axios.delete(`${API_URL}/instructor/vuelos/${id_vuelo}/checklist-postvuelo`);
  return res.data;
};

export const registrarInasistencia = async (id_vuelo) => {
  const res = await axios.post(`${API_URL}/instructor/vuelos/${id_vuelo}/inasistencia`);
  return res.data;
};
