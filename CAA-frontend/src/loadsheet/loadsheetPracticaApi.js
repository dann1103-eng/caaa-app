import axios from "axios";
import { API_URL } from "../api/axiosConfig";

// Soporte del modo PRÁCTICA del loadsheet (sandbox sin vuelo real): lista de
// aeronaves disponibles y su plantilla de peso & balance. Accesible a
// cualquier usuario autenticado (alumno/instructor) — sin restricción de rol.

// Lista las aeronaves (excluye simuladores y dadas de baja) con el flag
// tiene_plantilla.
export const getAeronavesPractica = async () => {
  const res = await axios.get(`${API_URL}/loadsheet/aeronaves`);
  return res.data;
};

// Resuelve la plantilla de peso & balance de una aeronave por id.
export const getPlantillaPractica = async (idAeronave) => {
  const res = await axios.get(`${API_URL}/loadsheet/plantilla`, {
    params: { id_aeronave: idAeronave },
  });
  return res.data;
};
