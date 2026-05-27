import axios from "axios";

import { API_URL } from "../api/axiosConfig";

export const getBloquesHorario = async () => {
  const res = await axios.get(`${API_URL}/agendar/bloques-horario`);
  return res.data;
};

export const getAeronavesActivas = async () => {
  const res = await axios.get(`${API_URL}/programacion/aeronaves`);
  return res.data;
};

export const getCalendarioProgramacion = async (week = "next") => {
  const res = await axios.get(`${API_URL}/programacion/calendario`, { params: { week } });
  return res.data;
};

export const pasarSolicitudEnRevision = async (id_solicitud) => {
  const res = await axios.post(`${API_URL}/programacion/solicitudes/${id_solicitud}/en-revision`, {});
  return res.data;
};

export const guardarCambiosProgramacion = async (movimientos) => {
  const res = await axios.post(`${API_URL}/programacion/guardar-cambios`, { movimientos });
  return res.data;
};

export const getBloquesBloqueados = async () => {
  const res = await axios.get(`${API_URL}/programacion/bloques-bloqueados`);
  return res.data;
};



export const getVuelosActivos = async () => {
  const res = await axios.get(`${API_URL}/turno/vuelos-hoy`);
  const ACTIVOS = ["EN_VUELO", "SALIDA_HANGAR", "REGRESO_HANGAR"];
  return res.data.filter((v) => ACTIVOS.includes(v.estado));
};

export const getEstadoFlota = async () => {
  const res = await axios.get(`${API_URL}/programacion/estado-flota`);
  return res.data;
};

export const getMantenimientoResumen = async () => {
  const res = await axios.get(`${API_URL}/programacion/mantenimiento-resumen`);
  return res.data;
};

export const getCalendarioPublico = async () => {
  const res = await axios.get(`${API_URL}/calendario/publico`);
  return res.data;
};

export const reasignarAeronave = async (id_vuelo, id_aeronave) => {
  const res = await axios.post(
    `${API_URL}/programacion/vuelos/${id_vuelo}/reasignar-aeronave`,
    { id_aeronave }
  );
  return res.data;
};

export const getAeronavesDisponibles = async (id_semana, id_bloque, dia_semana) => {
  const res = await axios.get(`${API_URL}/programacion/aeronaves-disponibles`, {
    params: { id_semana, id_bloque, dia_semana },
  });
  return res.data;
};

export const getAeronavesPublicas = async () => {
  const res = await axios.get(`${API_URL}/calendario/aeronaves`);
  return res.data;
};

export const getBloquesPublicos = async () => {
  const res = await axios.get(`${API_URL}/calendario/bloques`);
  return res.data;
};

export const guardarSolicitudProgramacion = async (id_alumno, id_instructor, vuelos) => {
  const res = await axios.post(`${API_URL}/programacion/solicitar-vuelos`, {
    id_alumno,
    id_instructor,
    vuelos,
  });
  return res.data;
};
