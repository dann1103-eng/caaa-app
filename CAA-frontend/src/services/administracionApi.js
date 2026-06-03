import axios from "axios";
import { API_URL } from "../api/axiosConfig";

const BASE = `${API_URL}/administracion`;

// ── Tarifas ─────────────────────────────────────────────────────────
export const getAeronaveTarifas    = async () => (await axios.get(`${BASE}/tarifas/aeronaves`)).data;
export const getAeronavesParaTarifa = async () => (await axios.get(`${BASE}/tarifas/aeronaves/lista`)).data;
export const getHistorialAeronave  = async ({ id_aeronave, modelo } = {}) => (await axios.get(`${BASE}/tarifas/aeronaves/historial`, { params: { id_aeronave, modelo } })).data;
export const upsertAeronaveTarifa  = async (payload) => (await axios.put(`${BASE}/tarifas/aeronaves`, payload)).data;
export const getInstructorTarifas       = async () => (await axios.get(`${BASE}/tarifas/instructores`)).data;
export const getInstructoresDisponibles = async () => (await axios.get(`${BASE}/tarifas/instructores/disponibles`)).data;
export const upsertInstructorTarifa     = async (payload) => (await axios.put(`${BASE}/tarifas/instructores`, payload)).data;

// ── Cursos ──────────────────────────────────────────────────────────
export const getCursos        = async () => (await axios.get(`${BASE}/cursos`)).data;
export const crearCurso       = async (payload) => (await axios.post(`${BASE}/cursos`, payload)).data;
export const actualizarCurso  = async (id, payload) => (await axios.patch(`${BASE}/cursos/${id}`, payload)).data;
export const getInscripciones = async (params) => (await axios.get(`${BASE}/inscripciones`, { params })).data;
export const crearInscripcion = async (payload) => (await axios.post(`${BASE}/inscripciones`, payload)).data;

// ── Cuenta corriente ────────────────────────────────────────────────
export const getAlumnosConSaldo = async () => (await axios.get(`${BASE}/cuentas`)).data;
export const getCuentaAlumno    = async (id) => (await axios.get(`${BASE}/cuenta/${id}`)).data;
export const getExtractoAlumno  = async (id, params) => (await axios.get(`${BASE}/cuenta/${id}/extracto`, { params })).data;
export const ajustarCuenta      = async (id, payload) => (await axios.post(`${BASE}/cuenta/${id}/ajuste`, payload)).data;
export const cargoManualCuenta  = async (id, payload) => (await axios.post(`${BASE}/cuenta/${id}/cargo-manual`, payload)).data;
export const editarMovimiento   = async (idMov, payload) => (await axios.patch(`${BASE}/movimientos/${idMov}`, payload)).data;
export const anularMovimiento   = async (idMov, motivo) => (await axios.patch(`${BASE}/movimientos/${idMov}/anular`, { motivo })).data;

// ── Recibos ─────────────────────────────────────────────────────────
export const getRecibos    = async (params) => (await axios.get(`${BASE}/recibos`, { params })).data;
export const crearRecibo   = async (payload) => (await axios.post(`${BASE}/recibos`, payload)).data;
export const anularRecibo  = async (id, motivo) => (await axios.patch(`${BASE}/recibos/${id}/anular`, { motivo })).data;

// ── Facturas ────────────────────────────────────────────────────────
export const getFacturas    = async (params) => (await axios.get(`${BASE}/facturas`, { params })).data;
export const emitirFactura  = async (payload) => (await axios.post(`${BASE}/facturas`, payload)).data;
export const anularFactura  = async (id, motivo) => (await axios.patch(`${BASE}/facturas/${id}/anular`, { motivo })).data;
export const facturaPdfUrl  = (id) => `${BASE}/facturas/${id}/pdf`;
export const reciboPdfUrl   = (id) => `${BASE}/recibos/${id}/pdf`;

/**
 * Descarga un PDF protegido por JWT (no se puede usar <a download> directo
 * porque axios inyecta el header Authorization).
 */
export const descargarPdfFactura = async (id, filename) => {
  const res = await axios.get(`${BASE}/facturas/${id}/pdf`, { responseType: "blob" });
  const blob = new Blob([res.data], { type: "application/pdf" });
  const url  = window.URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 5000);
};

export const descargarPdfRecibo = async (id, filename) => {
  const res = await axios.get(`${BASE}/recibos/${id}/pdf`, { responseType: "blob" });
  const blob = new Blob([res.data], { type: "application/pdf" });
  const url  = window.URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 5000);
};

// ── Egresos ─────────────────────────────────────────────────────────
export const getEgresos       = async (params) => (await axios.get(`${BASE}/egresos`, { params })).data;
export const crearEgreso      = async (payload) => (await axios.post(`${BASE}/egresos`, payload)).data;
export const actualizarEgreso = async (id, payload) => (await axios.patch(`${BASE}/egresos/${id}`, payload)).data;

// ── Nómina ──────────────────────────────────────────────────────────
export const getNominaPeriodos = async () => (await axios.get(`${BASE}/nomina/periodos`)).data;
export const getNominaDetalles = async (id) => (await axios.get(`${BASE}/nomina/periodos/${id}/detalles`)).data;
export const calcularNomina    = async (payload) => (await axios.post(`${BASE}/nomina/calcular`, payload)).data;
export const aprobarNomina     = async (id) => (await axios.patch(`${BASE}/nomina/${id}/aprobar`)).data;
export const pagarNomina       = async (id) => (await axios.patch(`${BASE}/nomina/${id}/pagar`)).data;
export const editarNominaDetalle = async (idDet, payload) =>
  (await axios.patch(`${BASE}/nomina/detalles/${idDet}`, payload)).data;

// ── Empleados de planta (personal administrativo) ───────────────────
export const getEmpleados       = async () => (await axios.get(`${BASE}/empleados`)).data;
export const crearEmpleado      = async (payload) => (await axios.post(`${BASE}/empleados`, payload)).data;
export const actualizarEmpleado = async (id, payload) => (await axios.patch(`${BASE}/empleados/${id}`, payload)).data;

// ── Usuarios (alumnos + personal con login) ─────────────────────────
export const getUsuariosAlumnos   = async () => (await axios.get(`${BASE}/usuarios/alumnos`)).data;
export const crearUsuarioAlumno   = async (payload) => (await axios.post(`${BASE}/usuarios/alumnos`, payload)).data;
export const reasignarAlumnoInstructor = async (idAlumno, id_instructor) =>
  (await axios.patch(`${BASE}/usuarios/alumnos/${idAlumno}/instructor`, { id_instructor })).data;
export const getUsuariosPersonal  = async () => (await axios.get(`${BASE}/usuarios/personal`)).data;
export const crearUsuarioPersonal = async (payload) => (await axios.post(`${BASE}/usuarios/personal`, payload)).data;
export const editarUsuarioPersonal = async (id, payload) => (await axios.patch(`${BASE}/usuarios/personal/${id}`, payload)).data;
export const resetPasswordPersonal = async (id, password) =>
  (await axios.post(`${BASE}/usuarios/personal/${id}/reset-password`, { password })).data;
export const getInstructorCursos  = async (idInstructor) => (await axios.get(`${BASE}/usuarios/instructores/${idInstructor}/cursos`)).data;
export const setInstructorCursos  = async (idInstructor, ids) =>
  (await axios.put(`${BASE}/usuarios/instructores/${idInstructor}/cursos`, { ids })).data;
export const getHistorialInstructor = async (idInstructor) => (await axios.get(`${BASE}/usuarios/instructores/${idInstructor}/historial`)).data;
export const getHistorialAlumno   = async (idAlumno) => (await axios.get(`${BASE}/usuarios/alumnos/${idAlumno}/historial`)).data;

// ── Documentación ───────────────────────────────────────────────────
export const getCatalogoDocs       = async () => (await axios.get(`${BASE}/documentos/catalogo`)).data;
export const getDocumentosAlumno   = async (id) => (await axios.get(`${BASE}/documentos/alumno/${id}`)).data;
export const getAlertasVencimiento = async () => (await axios.get(`${BASE}/documentos/alertas`)).data;
export const revisarDocumento      = async (id, payload) => (await axios.patch(`${BASE}/documentos/${id}`, payload)).data;
export const subirDocumentoAlumno  = async (idAlumno, formData) => (await axios.post(`${BASE}/documentos/alumno/${idAlumno}`, formData, { headers: { "Content-Type": "multipart/form-data" } })).data;
export const getArchivoUrlDoc      = async (id) => (await axios.get(`${BASE}/documentos/${id}/archivo-url`)).data;

// ── Ficha de alumno (consolidada) ───────────────────────────────────
export const getAlumnoFicha        = async (id) => (await axios.get(`${BASE}/alumnos/${id}/ficha`)).data;
export const actualizarAlumnoFicha = async (id, payload) => (await axios.put(`${BASE}/alumnos/${id}`, payload)).data;
export const getLicencias          = async () => (await axios.get(`${BASE}/licencias`)).data;

// ── Médicos ─────────────────────────────────────────────────────────
export const getMedicos       = async () => (await axios.get(`${BASE}/medicos`)).data;
export const crearMedico      = async (payload) => (await axios.post(`${BASE}/medicos`, payload)).data;
export const actualizarMedico = async (id, payload) => (await axios.patch(`${BASE}/medicos/${id}`, payload)).data;

// ── Aula Virtual (gestión Admin/Instructor) ─────────────────────────
export const getAulaUnidades       = async (params) => (await axios.get(`${BASE}/aula/unidades`, { params })).data;
export const crearAulaUnidad       = async (payload) => (await axios.post(`${BASE}/aula/unidades`, payload)).data;
export const actualizarAulaUnidad  = async (id, payload) => (await axios.patch(`${BASE}/aula/unidades/${id}`, payload)).data;
export const eliminarAulaUnidad    = async (id) => (await axios.delete(`${BASE}/aula/unidades/${id}`)).data;
export const getProgresoAlumno     = async (idAlumno) => (await axios.get(`${BASE}/aula/alumnos/${idAlumno}/progreso`)).data;
export const setProgresoAlumno     = async (payload) => (await axios.post(`${BASE}/aula/progreso`, payload)).data;
export const getEvaluaciones       = async (params) => (await axios.get(`${BASE}/aula/evaluaciones`, { params })).data;
export const crearEvaluacion       = async (payload) => (await axios.post(`${BASE}/aula/evaluaciones`, payload)).data;
export const getAlumnosEvaluacion  = async (id) => (await axios.get(`${BASE}/aula/evaluaciones/${id}/alumnos`)).data;
export const registrarNota         = async (id, payload) => (await axios.patch(`${BASE}/aula/evaluacion-alumno/${id}`, payload)).data;
// Cursos / asistencia (aula)
export const getAulaCursos         = async () => (await axios.get(`${BASE}/aula/cursos`)).data;
export const getSesiones           = async (params) => (await axios.get(`${BASE}/aula/sesiones`, { params })).data;
export const crearSesion           = async (payload) => (await axios.post(`${BASE}/aula/sesiones`, payload)).data;
export const getAsistencia         = async (idSesion) => (await axios.get(`${BASE}/aula/sesiones/${idSesion}/asistencia`)).data;
export const registrarAsistencia   = async (idSesion, payload) => (await axios.post(`${BASE}/aula/sesiones/${idSesion}/asistencia`, payload)).data;
// Material por unidad
export const getMaterialUnidad     = async (idUnidad) => (await axios.get(`${BASE}/aula/unidades/${idUnidad}/material`)).data;
export const subirMaterialUnidad   = async (idUnidad, formData) => (await axios.post(`${BASE}/aula/unidades/${idUnidad}/material`, formData, { headers: { "Content-Type": "multipart/form-data" } })).data;
export const getMaterialUrl        = async (id) => (await axios.get(`${BASE}/aula/material/${id}/url`)).data;
export const eliminarMaterial      = async (id) => (await axios.delete(`${BASE}/aula/material/${id}`)).data;

// ── Reportes ────────────────────────────────────────────────────────
export const getKpisDashboard = async () => (await axios.get(`${BASE}/reportes/kpis-dashboard`)).data;
export const getIngresos      = async (params) => (await axios.get(`${BASE}/reportes/ingresos`, { params })).data;
export const getEgresosReport = async (params) => (await axios.get(`${BASE}/reportes/egresos`, { params })).data;
export const getPyL           = async (params) => (await axios.get(`${BASE}/reportes/pyl`, { params })).data;
export const getMorosos       = async () => (await axios.get(`${BASE}/reportes/morosos`)).data;
