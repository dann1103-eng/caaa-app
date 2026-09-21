import axios from "axios";
import { API_URL } from "../api/axiosConfig";

// Manuales del taller (spec 2026-09-20). Biblioteca, paquetes por inspección y
// páginas de una orden de trabajo.
const T = () => `${API_URL}/taller`;

export const getManuales = async (params = {}) => (await axios.get(`${T()}/manuales`, { params })).data;
export const getManual = async (id) => (await axios.get(`${T()}/manuales/${id}`)).data;
export const getManualUrl = async (id) => (await axios.get(`${T()}/manuales/${id}/url`)).data;
export const reservarSubidaManual = async () => (await axios.post(`${T()}/manuales/subida`)).data;
export const registrarManual = async (datos) => (await axios.post(`${T()}/manuales`, datos)).data;
export const subirRevisionManual = async (id, datos) =>
  (await axios.post(`${T()}/manuales/${id}/revision`, datos)).data;
export const editarManual = async (id, datos) => (await axios.patch(`${T()}/manuales/${id}`, datos)).data;
export const borrarManual = async (id) => (await axios.delete(`${T()}/manuales/${id}`)).data;
export const pdfDeManual = async (extractos) => (await axios.post(`${T()}/manuales/pdf`, { extractos })).data;

export const getTablaPaquetes = async () => (await axios.get(`${T()}/paquetes-manuales`)).data;
export const getPaquete = async (idAeronave, tipo) =>
  (await axios.get(`${T()}/paquetes-manuales/${idAeronave}/${tipo}`)).data;
export const guardarPaquete = async (idAeronave, tipo, datos) =>
  (await axios.put(`${T()}/paquetes-manuales/${idAeronave}/${tipo}`, datos)).data;

export const getManualesOrden = async (idOrden) => (await axios.get(`${T()}/ordenes/${idOrden}/manuales`)).data;
export const agregarManualOrden = async (idOrden, datos) =>
  (await axios.post(`${T()}/ordenes/${idOrden}/manuales`, datos)).data;
export const traerPaqueteOrden = async (idOrden, tipo) =>
  (await axios.post(`${T()}/ordenes/${idOrden}/manuales/paquete`, { tipo })).data;
export const quitarManualOrden = async (idOrden, idExtracto) =>
  (await axios.delete(`${T()}/ordenes/${idOrden}/manuales/${idExtracto}`)).data;
export const pdfDeOrden = async (idOrden) => (await axios.post(`${T()}/ordenes/${idOrden}/manuales/pdf`)).data;

/**
 * Abre en otra pestaña el PDF que devuelve `obtener()` ({url}).
 *
 * La pestaña se abre YA, dentro del clic, y recién después se le pone la
 * dirección: si se abre después del `await`, Safari y Chrome en el celular la
 * bloquean como popup. La URL es firmada: se abre sin token.
 *
 * Si el navegador bloqueó la ventana NO se navega la app hacia el PDF (se
 * perdería lo que el usuario tenía abierto): se lanza un error para el toast,
 * y ni se pide el PDF.
 */
export async function abrirPdfCuandoEste(obtener) {
  const pestana = window.open("", "_blank");
  if (!pestana) {
    throw new Error("El navegador bloqueó la ventana del PDF. Permití las ventanas emergentes para este sitio y volvé a intentar.");
  }
  try {
    const { url } = await obtener();
    pestana.opener = null; // la pestaña del PDF no puede tocar la app
    pestana.location.href = url;
  } catch (e) {
    pestana.close();
    throw e;
  }
}
