import axios from "axios";

import { API_URL } from "../api/axiosConfig";

export const getAeronavesPermitidas = async () => {
  const res = await axios.get(`${API_URL}/agendar/aeronaves-permitidas`);
  return res.data;
};

export const getBloquesHorario = async () => {
  const res = await axios.get(`${API_URL}/agendar/bloques-horario`);
  return res.data;
};

export const getBloquesOcupados = async (week = "next") => {
  const res = await axios.get(`${API_URL}/agendar/bloques-ocupados`, { params: { week } });
  return res.data;
};

export const getMisSolicitudes = async (week = "next") => {
  const res = await axios.get(`${API_URL}/agendar/mis-solicitudes`, { params: { week } });
  return res.data;
};

export const guardarSolicitud = async (vuelos) => {
  const res = await axios.post(
    `${API_URL}/agendar/solicitar-vuelos`,
    { vuelos },
    { params: { week: "next" } }
  );
  return res.data;
};

export const getBloquesBloqueados = async () => {
  const res = await axios.get(`${API_URL}/agendar/bloques-bloqueados`);
  return res.data;
};
