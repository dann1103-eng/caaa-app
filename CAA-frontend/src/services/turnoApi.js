import axios from "axios";

import { API_URL } from "../api/axiosConfig";

export const getVuelosHoy = async () => {
  const res = await axios.get(`${API_URL}/turno/vuelos-hoy`);
  return res.data;
};

export const getEstadoOperaciones = async () => {
  const res = await axios.get(`${API_URL}/turno/estado-operaciones`);
  return res.data;
};

export const setEstadoOperaciones = async (estado_general, motivo_inactivo = null, bloques = [], temperatura = null, explicacion_detallada = null) => {
  const res = await axios.put(`${API_URL}/turno/estado-operaciones`, { 
    estado_general, 
    motivo_inactivo, 
    bloques, 
    temperatura, 
    explicacion_detallada 
  });
  return res.data;
};

export const publicarTicker = async (mensaje) => {
  const res = await axios.post(`${API_URL}/turno/ticker`, { mensaje });
  return res.data;
};

export const limpiarTicker = async () => {
  const res = await axios.delete(`${API_URL}/turno/ticker`);
  return res.data;
};

export const limpiarUnicoTicker = async (id) => {
  const res = await axios.delete(`${API_URL}/turno/ticker/${id}`);
  return res.data;
};

export const getTicker = async () => {
  const res = await axios.get(`${API_URL}/turno/ticker`);
  return res.data;
};

export const agregarBloquesSuspension = async (bloques) => {
  const res = await axios.post(`${API_URL}/turno/agregar-bloques-suspension`, { bloques });
  return res.data;
};

export const avanzarEstadoVuelo = async (id_vuelo, body = {}) => {
  const res = await axios.patch(`${API_URL}/turno/vuelos/${id_vuelo}/estado`, body);
  return res.data;
};

// Reporte de cierre del día (vuelos por avión). Descarga el PDF con el token
// (mismo patrón blob que facturas/recibos) y lo abre en otra pestaña.
export const abrirReporteVuelosDia = async (fecha) => {
  const res = await axios.get(`${API_URL}/turno/reporte-vuelos-dia`, {
    params: fecha ? { fecha } : {},
    responseType: "blob",
  });
  const blob = new Blob([res.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
};
