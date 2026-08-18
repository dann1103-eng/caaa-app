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

// ── Inventario de bodega (OMA) ─────────────────────────────────────────────
//
// El stock NO se mueve por el ítem: se mueve con documentos (entrada FA,
// salida REQ, ajuste AJ), igual que la bodega en el Excel.

const INV = () => `${API_URL}/taller/inventario`;

// Catálogo
export const getItems = async (params = {}) => (await axios.get(`${INV()}/items`, { params })).data;
export const crearItem = async (datos) => (await axios.post(`${INV()}/items`, datos)).data;
export const actualizarItem = async (id, datos) => (await axios.patch(`${INV()}/items/${id}`, datos)).data;
export const getKardex = async (id, params = {}) => (await axios.get(`${INV()}/items/${id}/kardex`, { params })).data;
export const getCatalogosInventario = async () => (await axios.get(`${INV()}/catalogos`)).data;

// Documentos
export const getDocumentos = async (params = {}) => (await axios.get(`${INV()}/documentos`, { params })).data;
export const getDocumento = async (id) => (await axios.get(`${INV()}/documentos/${id}`)).data;
export const anularDocumento = async (id, motivo_anulacion) =>
  (await axios.post(`${INV()}/documentos/${id}/anular`, { motivo_anulacion })).data;

/**
 * Crea un documento de bodega.
 *
 * Una salida sin existencia devuelve 409 con { faltantes, forzable }. Si el
 * usuario tiene la capacidad de jefe de taller, se reintenta con
 * { forzar: true, motivo_forzado }. El 409 se deja propagar a propósito: es la
 * pantalla la que decide si ofrece forzar o solo informa.
 */
export const crearDocumento = async (datos) => (await axios.post(`${INV()}/documentos`, datos)).data;

// La requisición es el único documento editable: es un borrador que no mueve
// existencia. Al despacharse se congela (el backend responde 409).
export const editarRequisicion = async (id, datos) =>
  (await axios.patch(`${INV()}/requisiciones/${id}`, datos)).data;

/** Cuánto queda por devolver de cada renglón de una solicitud. */
export const getRetornables = async (id) => (await axios.get(`${INV()}/documentos/${id}/retornables`)).data;

// Reportes que salen del kardex
export const getEntregaAceites = async (params = {}) =>
  (await axios.get(`${INV()}/entrega-aceites`, { params })).data;
export const getDuplicadosParte = async () => (await axios.get(`${INV()}/duplicados-parte`)).data;

/**
 * Abre un PDF del Taller en una pestaña nueva.
 *
 * Va por blob y no por <a href>: la ruta necesita el header Authorization, que
 * una navegación directa del navegador no manda. Mismo patrón que los PDFs de
 * Administración (`abrirPyLPDF`).
 */
async function abrirPdf(ruta, params = {}) {
  const r = await axios.get(`${INV()}${ruta}`, { params, responseType: "blob" });
  const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
  window.open(url, "_blank");
  // Se revoca tarde: si se revoca de inmediato, la pestaña recién abierta no
  // llega a leer el blob y muestra una página en blanco.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const abrirDocumentoPDF = (id) => abrirPdf(`/documentos/${id}/pdf`);
export const abrirEntregaAceitesPDF = (params) => abrirPdf("/entrega-aceites.pdf", params);

// ── Órdenes de trabajo (Fase 2) ────────────────────────────────────────────
//
// La orden de trabajo es el trabajo del taller: se abre al recibir el avión y
// se cierra al firmarla. De ella cuelga todo el papeleo.

const TAL = () => `${API_URL}/taller`;

export const getOrdenes = async (params = {}) => (await axios.get(`${TAL()}/ordenes`, { params })).data;
export const getOrden = async (id) => (await axios.get(`${TAL()}/ordenes/${id}`)).data;
export const crearOrden = async (datos) => (await axios.post(`${TAL()}/ordenes`, datos)).data;
export const editarOrden = async (id, datos) => (await axios.patch(`${TAL()}/ordenes/${id}`, datos)).data;
export const firmarOrden = async (id, datos) => (await axios.post(`${TAL()}/ordenes/${id}/firmar`, datos)).data;
export const anularOrden = async (id, motivo_anulacion) =>
  (await axios.post(`${TAL()}/ordenes/${id}/anular`, { motivo_anulacion })).data;

export const getReportesInspeccion = async (params = {}) =>
  (await axios.get(`${TAL()}/reportes-inspeccion`, { params })).data;
export const crearReporteInspeccion = async (datos) =>
  (await axios.post(`${TAL()}/reportes-inspeccion`, datos)).data;

/** Lo que el sistema ya sabe del avión, para pre-llenar el reporte. */
export const getSugerenciaInspeccion = async (idAeronave) =>
  (await axios.get(`${TAL()}/aeronaves/${idAeronave}/sugerencia-inspeccion`)).data;

/** El folder del avión: todas sus órdenes, reportes, documentos y consumo. */
export const getFichaAeronaveTaller = async (idAeronave) =>
  (await axios.get(`${TAL()}/aeronaves/${idAeronave}/ficha`)).data;

// Costos pendientes (cola conjunta de Taller y Contabilidad)
export const getPendientesCosto = async () => (await axios.get(`${INV()}/pendientes-costo`)).data;
export const completarCostos = async (id, costos, actualizar_catalogo = true) =>
  (await axios.patch(`${INV()}/documentos/${id}/costos`, { costos, actualizar_catalogo })).data;

// Apoyo y reportes
export const getAeronavesBodega = async () => (await axios.get(`${INV()}/aeronaves`)).data;
export const getMantenimientosAeronave = async (idAeronave) =>
  (await axios.get(`${INV()}/aeronaves/${idAeronave}/mantenimientos`)).data;
export const getConsumoAeronave = async (params = {}) =>
  (await axios.get(`${INV()}/consumo-aeronave`, { params })).data;

/** Los dos formatos que audita la AAC, en PDF. */
export const abrirOrdenPDF = (id) => abrirPdf2(`/ordenes/${id}/pdf`);
export const abrirReporteInspeccionPDF = (id) => abrirPdf2(`/reportes-inspeccion/${id}/pdf`);

/**
 * Igual que `abrirPdf` pero sobre /taller en vez de /taller/inventario.
 * Va por blob porque la ruta necesita el header Authorization, que una
 * navegación directa del navegador no manda.
 */
async function abrirPdf2(ruta, params = {}) {
  const r = await axios.get(`${TAL()}${ruta}`, { params, responseType: "blob" });
  const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── Préstamo de partes (Fase 3) ────────────────────────────────────────────
//
// Bidireccional: RECIBIDO es lo que pedimos prestado, ENTREGADO lo que
// Los movimientos (item + cantidad), que es lo que la bodega mira de un vistazo.
export const getMovimientos = async (params = {}) =>
  (await axios.get(`${INV()}/movimientos`, { params })).data;

// Firmar la entrega: ACA ocurre la descarga, no al armar la solicitud.
export const firmarSolicitud = async (id, datos = {}) =>
  (await axios.post(`${INV()}/documentos/${id}/firmar`, datos)).data;

// La cola de trabajo: los aviones que Operaciones mando a mantenimiento.
export const getColaTrabajo = async () => (await axios.get(`${TAL()}/cola`)).data;

// Asignar el trabajo a un mecanico (el jefe desde la cola, o el propio mecanico).
export const asignarOrden = async (id, id_mecanico_asignado) =>
  (await axios.patch(`${TAL()}/ordenes/${id}/asignar`, { id_mecanico_asignado })).data;

// Revision del jefe: aprobar con su firma, o devolver al mecanico con la nota.
export const aprobarOrden = async (id, datos = {}) =>
  (await axios.post(`${TAL()}/ordenes/${id}/aprobar`, datos)).data;
export const devolverOrden = async (id, nota_revision) =>
  (await axios.post(`${TAL()}/ordenes/${id}/devolver`, { nota_revision })).data;

// Estimado de finalizacion: la fecha del Taller manda sobre la de Operaciones.
export const previewEstimado = async (id, fecha_fin) =>
  (await axios.get(`${TAL()}/mantenimientos/${id}/preview-estimado`, { params: { fecha_fin } })).data;
export const guardarEstimado = async (id, datos) =>
  (await axios.post(`${TAL()}/mantenimientos/${id}/estimado`, datos)).data;

// Personal del taller con sus credenciales (para el selector de aprendiz).
export const getPersonalTaller = async () => (await axios.get(`${TAL()}/personal`)).data;

// prestamos. Su estado es independiente del de la orden de trabajo.
export const getPrestamos = async (params = {}) => (await axios.get(`${TAL()}/prestamos`, { params })).data;
export const getPrestamo = async (id) => (await axios.get(`${TAL()}/prestamos/${id}`)).data;
export const crearPrestamo = async (datos) => (await axios.post(`${TAL()}/prestamos`, datos)).data;
export const devolverPrestamo = async (id, datos) => (await axios.post(`${TAL()}/prestamos/${id}/devolver`, datos)).data;
export const anularPrestamo = async (id, motivo_anulacion) =>
  (await axios.post(`${TAL()}/prestamos/${id}/anular`, { motivo_anulacion })).data;
