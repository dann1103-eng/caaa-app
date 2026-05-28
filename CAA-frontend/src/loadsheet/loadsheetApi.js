import axios from "axios";
import { API_URL } from "../api/axiosConfig";

// Carga datos del vuelo + plantilla W&B + loadsheet guardado (si existe).
export const getWBData = async (idVuelo) => {
  const res = await axios.get(`${API_URL}/alumno/vuelos/${idVuelo}/weight-balance`);
  return res.data;
};

export const getLoadsheetData = async (idVuelo) => {
  const res = await axios.get(`${API_URL}/alumno/vuelos/${idVuelo}/loadsheet`);
  return res.data;
};

// Guarda el peso & balance (borrador).
export const guardarWB = async (idVuelo, payload) => {
  const res = await axios.put(`${API_URL}/alumno/vuelos/${idVuelo}/weight-balance`, payload);
  return res.data;
};

// Guarda el resto del loadsheet (combustible, navegacion, ops, etc.).
export const guardarLoadsheet = async (idVuelo, payload) => {
  const res = await axios.put(`${API_URL}/alumno/vuelos/${idVuelo}/loadsheet`, payload);
  return res.data;
};

// Envia el loadsheet (PDF) al instructor por correo y marca como ENVIADO.
export const enviarLoadsheet = async (idVuelo, payload) => {
  const res = await axios.post(`${API_URL}/alumno/vuelos/${idVuelo}/send-loadsheet`, payload);
  return res.data;
};
