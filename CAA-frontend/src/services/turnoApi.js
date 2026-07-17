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

// Editar tripulación (alumno/instructor/aeronave) + almas a bordo, para cuando
// no hay nadie de programación disponible para resolver un cambio en el momento.
export const editarTripulacionVuelo = async (id_vuelo, payload) => {
  const res = await axios.patch(`${API_URL}/turno/vuelos/${id_vuelo}/tripulacion`, payload);
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

// ── Mantenimiento imprevisto de aeronave (falla detectada en pre-vuelo) ──────
export const getFlotaMantenimiento = async () => {
  const res = await axios.get(`${API_URL}/turno/mantenimiento/flota`);
  return res.data;
};

export const previewMantenimientoAeronave = async (id_aeronave, { bloques = [], fecha_fin = null } = {}) => {
  const res = await axios.post(`${API_URL}/turno/aeronaves/${id_aeronave}/preview-mantenimiento`, { bloques, fecha_fin });
  return res.data;
};

export const iniciarMantenimientoAeronave = async (id_aeronave, { descripcion, bloques = [], fecha_fin = null }) => {
  const res = await axios.post(`${API_URL}/turno/aeronaves/${id_aeronave}/mantenimiento`, { descripcion, bloques, fecha_fin });
  return res.data;
};

export const completarMantenimientoAeronave = async (id_aeronave) => {
  const res = await axios.post(`${API_URL}/turno/aeronaves/${id_aeronave}/completar-mantenimiento`);
  return res.data;
};

// ── Ciclo del turno del día (apertura/pausa/cambio/cierre + asistencia) ─────
export const getTurnoDia = async () => {
  const res = await axios.get(`${API_URL}/turno/dia`);
  return res.data;
};

export const getInstructoresTurno = async () => {
  const res = await axios.get(`${API_URL}/turno/instructores`);
  return res.data;
};

export const abrirTurnoDia = async (instructores) => {
  const res = await axios.post(`${API_URL}/turno/dia/abrir`, { instructores });
  return res.data;
};

export const pausarTurnoDia = async () => {
  const res = await axios.post(`${API_URL}/turno/dia/pausa`);
  return res.data;
};

export const reanudarTurnoDia = async () => {
  const res = await axios.post(`${API_URL}/turno/dia/reanudar`);
  return res.data;
};

export const cambioTurnoDia = async (instructores) => {
  const res = await axios.post(`${API_URL}/turno/dia/cambio`, { instructores });
  return res.data;
};

export const cerrarTurnoDia = async () => {
  const res = await axios.post(`${API_URL}/turno/dia/cerrar`);
  return res.data;
};

export const agregarInstructorTurnoDia = async (instructores) => {
  const res = await axios.post(`${API_URL}/turno/dia/asistencia`, { instructores });
  return res.data;
};

export const marcarSalidaInstructorTurno = async (id_asistencia) => {
  const res = await axios.post(`${API_URL}/turno/dia/asistencia/${id_asistencia}/salida`);
  return res.data;
};
