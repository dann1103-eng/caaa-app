import axios from "axios";

import { API_URL } from "../api/axiosConfig";

// Visto bueno del dueño sobre un vuelo del día (checkbox de su dashboard).
export const aprobarVueloDueno = async (id_vuelo, aprobado = true) => {
  const res = await axios.patch(`${API_URL}/dueno/vuelos/${id_vuelo}/aprobar`, { aprobado });
  return res.data;
};
