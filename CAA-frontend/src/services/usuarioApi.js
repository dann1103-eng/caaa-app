import axios from "axios";
import { API_URL } from "../api/axiosConfig";

export const getPerfil = async () => {
  const res = await axios.get(`${API_URL}/usuario/perfil`);
  return res.data;
};

export const cambiarPassword = async (nuevaPassword) => {
  const res = await axios.put(`${API_URL}/usuario/cambiar-password`, { nuevaPassword });
  return res.data;
};

export const cambiarCorreo = async (nuevoCorreo) => {
  const res = await axios.put(`${API_URL}/usuario/cambiar-correo`, { nuevoCorreo });
  return res.data;
};

export const updatePerfilInfo = async (username) => {
  const res = await axios.put(`${API_URL}/usuario/update-info`, { username });
  return res.data;
};

export const updatePerfilAlumno = async ({ telefono, numero_licencia, certificado_medico, certificado_medico_numero, seguro_vida_vencimiento, seguro_vida_numero }) => {
  const res = await axios.put(`${API_URL}/usuario/update-perfil-alumno`, { 
    telefono, 
    numero_licencia, 
    certificado_medico, 
    certificado_medico_numero, 
    seguro_vida_vencimiento, 
    seguro_vida_numero 
  });
  return res.data;
};
export const refreshToken = async () => {
  const res = await axios.get(`${API_URL}/auth/refresh`);
  return res.data;
};
