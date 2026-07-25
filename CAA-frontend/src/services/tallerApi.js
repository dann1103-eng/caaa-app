import axios from "axios";
import { API_URL } from "../api/axiosConfig";

// ── Dashboard ──────────────────────────────────────────────────────────────
export const getDashboardTaller = async () => {
  const res = await axios.get(`${API_URL}/taller/dashboard`);
  return res.data;
};

// ── Componentes (célula / motor / hélice) ─────────────────────────────────
export const getComponentes = async (id_aeronave) => {
  const res = await axios.get(`${API_URL}/taller/componentes`, { params: { id_aeronave } });
  return res.data;
};
export const crearComponente = async (datos) => {
  const res = await axios.post(`${API_URL}/taller/componentes`, datos);
  return res.data;
};
export const actualizarComponente = async (id, datos) => {
  const res = await axios.patch(`${API_URL}/taller/componentes/${id}`, datos);
  return res.data;
};

// Fija el TAC actual del avión a un valor absoluto (para corregir/sembrar en
// limpio junto con una inspección periódica).
export const fijarHorasAeronave = async (id_aeronave, horas, descripcion) => {
  const res = await axios.post(`${API_URL}/taller/horas-manuales`, { id_aeronave, horas, modo: "fijar", descripcion });
  return res.data;
};

// ── Seguimiento programado (inspecciones, AD, SB, vida límite) ────────────
export const getTareas = async (params = {}) => {
  const res = await axios.get(`${API_URL}/taller/tareas`, { params });
  return res.data;
};
export const crearTarea = async (datos) => {
  const res = await axios.post(`${API_URL}/taller/tareas`, datos);
  return res.data;
};
export const actualizarTarea = async (id, datos) => {
  const res = await axios.patch(`${API_URL}/taller/tareas/${id}`, datos);
  return res.data;
};
export const registrarCumplimiento = async (id, datos) => {
  const res = await axios.post(`${API_URL}/taller/tareas/${id}/cumplimiento`, datos);
  return res.data;
};
export const getHistorialTarea = async (id) => {
  const res = await axios.get(`${API_URL}/taller/tareas/${id}/historial`);
  return res.data;
};
export const getHistorialAeronave = async (id) => {
  const res = await axios.get(`${API_URL}/taller/aeronaves/${id}/historial`);
  return res.data;
};

// ── Inventario de repuestos ────────────────────────────────────────────────
export const getRepuestos = async (params = {}) => {
  const res = await axios.get(`${API_URL}/taller/repuestos`, { params });
  return res.data;
};
export const crearRepuesto = async (datos) => {
  const res = await axios.post(`${API_URL}/taller/repuestos`, datos);
  return res.data;
};
export const actualizarRepuesto = async (id, datos) => {
  const res = await axios.patch(`${API_URL}/taller/repuestos/${id}`, datos);
  return res.data;
};
export const registrarMovimiento = async (id, datos) => {
  const res = await axios.post(`${API_URL}/taller/repuestos/${id}/movimiento`, datos);
  return res.data;
};
export const getMovimientos = async (id) => {
  const res = await axios.get(`${API_URL}/taller/repuestos/${id}/movimientos`);
  return res.data;
};
