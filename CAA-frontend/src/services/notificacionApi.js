import axios from "axios";
import { API_URL } from "../api/axiosConfig";

export const getNotificaciones = async () => (await axios.get(`${API_URL}/notificaciones`)).data;
export const marcarLeida       = async (id) => (await axios.patch(`${API_URL}/notificaciones/${id}/leer`)).data;
export const marcarTodasLeidas = async () => (await axios.patch(`${API_URL}/notificaciones/leer-todas`)).data;
