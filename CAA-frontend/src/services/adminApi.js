import axios from "axios";

import { API_URL } from "../api/axiosConfig";

// ── Calendario / semana ───────────────────────────────────────────────────────
export const getCalendarioAdmin = async (week = "next") => {
  const res = await axios.get(`${API_URL}/admin/calendario`, { params: { week } });
  return res.data;
};

export const getBloquesHorario = async () => {
  const res = await axios.get(`${API_URL}/admin/bloques-horario`);
  return res.data;
};

export const guardarCambiosAdmin = async (moves) => {
  const res = await axios.put(`${API_URL}/admin/guardar-cambios`, { moves });
  return res.data;
};

export const getBloquesBloqueadosAdmin = async () => {
  const res = await axios.get(`${API_URL}/admin/bloques-bloqueados`);
  return res.data;
};

export const publicarSemana = async (id_semana) => {
  const res = await axios.post(`${API_URL}/admin/publicar-semana`, { id_semana });
  return res.data;
};

export const precheckPublicarSemana = async (id_semana) => {
  const res = await axios.get(`${API_URL}/admin/publicar-semana/precheck`, { params: { id_semana } });
  return res.data; // { total, sin_revision, enviadas }
};

// ── Lista de espera (stand-by) — la ordena Turno ──
export const getStandbyCandidatos = async (id_semana, dia_semana, id_bloque) =>
  (await axios.get(`${API_URL}/admin/standby/candidatos`, { params: { id_semana, dia_semana, id_bloque } })).data;
export const getStandbyLista = async (id_semana, dia_semana, id_bloque) =>
  (await axios.get(`${API_URL}/admin/standby`, { params: { id_semana, dia_semana, id_bloque } })).data;
export const setStandbyLista = async (payload) =>
  (await axios.put(`${API_URL}/admin/standby`, payload)).data;

// ── Aeronaves ─────────────────────────────────────────────────────────────────
export const getAeronavesActivasAdmin = async () => {
  const res = await axios.get(`${API_URL}/admin/aeronaves`);
  return res.data;
};

// ── Registro de aeronaves (módulo "Aeronaves") ────────────────────────────────
// Van bajo /admin/aeronaves/registro para no chocar con /admin/aeronaves/:id/...
// que ya existe (mantenimiento, foto, etc.).
export const listarAeronaves = async () =>
  (await axios.get(`${API_URL}/admin/aeronaves/registro`)).data;

export const getAeronaveFicha = async (id) =>
  (await axios.get(`${API_URL}/admin/aeronaves/registro/${id}`)).data;

export const crearAeronave = async (datos) =>
  (await axios.post(`${API_URL}/admin/aeronaves/registro`, datos)).data;

export const actualizarAeronave = async (id, datos) =>
  (await axios.put(`${API_URL}/admin/aeronaves/registro/${id}`, datos)).data;

// forzar=true da de baja aunque el avión tenga vuelos agendados a futuro
// (sin el flag, el backend responde 409 con la cantidad para poder confirmar).
export const darDeBajaAeronave = async (id, forzar = false) =>
  (await axios.delete(`${API_URL}/admin/aeronaves/registro/${id}`, { params: forzar ? { forzar: true } : {} })).data;

export const reactivarAeronave = async (id) =>
  (await axios.post(`${API_URL}/admin/aeronaves/registro/${id}/reactivar`)).data;

export const getVuelosAeronave = async (id, limite) =>
  (await axios.get(`${API_URL}/admin/aeronaves/registro/${id}/vuelos`, { params: { limite } })).data;

export const setFotoAeronave = async (id, foto_url) =>
  (await axios.put(`${API_URL}/admin/aeronaves/${id}/foto`, { foto_url })).data;

// licencias = arreglo de id_licencia. Reemplaza el set completo.
export const setLicenciasAeronave = async (id, licencias) =>
  (await axios.put(`${API_URL}/admin/aeronaves/registro/${id}/licencias`, { licencias })).data;

export const listLicencias = async () =>
  (await axios.get(`${API_URL}/admin/licencias`)).data;

export const iniciarMantenimiento = async (id, datos) => {
  const res = await axios.post(`${API_URL}/admin/aeronaves/${id}/iniciar-mantenimiento`, datos);
  return res.data;
};

export const previewMantenimiento = async (id, datos) => {
  const res = await axios.post(`${API_URL}/admin/aeronaves/${id}/preview-mantenimiento`, datos);
  return res.data;
};

export const getVuelosFuturosAeronave = async (id) => {
  const res = await axios.get(`${API_URL}/admin/aeronaves/${id}/vuelos-futuros-count`);
  return res.data;
};

// ── Vuelos ────────────────────────────────────────────────────────────────────
export const getSolicitudesCancelacion = async (estado = 'PENDIENTE') => {
  const res = await axios.get(`${API_URL}/admin/solicitudes-cancelacion`, { params: { estado } });
  return res.data;
};

export const resolverSolicitudCancelacion = async (id, decision) => {
  const res = await axios.post(`${API_URL}/admin/solicitudes-cancelacion/${id}/resolver`, { decision });
  return res.data;
};

export const cambiarInstructorVuelo = async (id_detalle, id_instructor_nuevo) => {
  const res = await axios.patch(`${API_URL}/admin/solicitudes/${id_detalle}/cambiar-instructor`, { id_instructor_nuevo });
  return res.data;
};

export const rechazarSolicitudSemana = async (id_solicitud) => {
  const res = await axios.patch(`${API_URL}/admin/solicitudes-semana/${id_solicitud}/rechazar`);
  return res.data;
};

export const rechazarSolicitudIndividual = async (id_detalle) => {
  const res = await axios.patch(`${API_URL}/admin/solicitudes/${id_detalle}/rechazar`);
  return res.data;
};

export const cancelarSolicitudSemana = async (id_solicitud) => {
  const res = await axios.patch(`${API_URL}/admin/solicitudes-semana/${id_solicitud}/cancelar`);
  return res.data;
};

// ── Instructores ──────────────────────────────────────────────────────────────
export const getInstructoresActivos = async () => {
  const res = await axios.get(`${API_URL}/admin/instructores-activos`);
  return res.data;
};

// ── Alumnos ───────────────────────────────────────────────────────────────────
export const getAlumnosConLimite = async () => {
  const res = await axios.get(`${API_URL}/admin/alumnos-limite`);
  return res.data;
};

export const habilitarVueloExtra = async (id_alumno, id_semana, limite_vuelos_avion, limite_vuelos_simulador) => {
  const res = await axios.patch(
    `${API_URL}/admin/alumnos/${id_alumno}/habilitar-vuelo-extra`,
    { id_semana, limite_vuelos_avion, limite_vuelos_simulador }
  );
  return res.data;
};

export const getAlumnosListAdmin = async () => {
  const res = await axios.get(`${API_URL}/admin/alumnos`);
  return res.data;
};

export const getAlumnoPerfilAdmin = async (id_alumno) => {
  const res = await axios.get(`${API_URL}/admin/alumnos/${id_alumno}/perfil`);
  return res.data;
};

export const getAeronavesPermitidasAlumno = async (id_alumno) => {
  const res = await axios.get(`${API_URL}/admin/alumnos/${id_alumno}/aeronaves-permitidas`);
  return res.data;
};

export const getLicencias = async () => {
  const res = await axios.get(`${API_URL}/admin/licencias`);
  return res.data;
};

export const getAeronavesPorLicencia = async (id_licencia) => {
  const res = await axios.get(`${API_URL}/admin/licencias/${id_licencia}/aeronaves`);
  return res.data;
};

export const setSoleado = async (id_alumno, soleado) => {
  const res = await axios.patch(`${API_URL}/admin/alumnos/${id_alumno}/soleado`, { soleado });
  return res.data;
};

// ── Auditoría ─────────────────────────────────────────────────────────────────
export const getAuditoria = async (params) => {
  const res = await axios.get(`${API_URL}/admin/auditoria`, { params });
  return res.data;
};

export const getAccionesAuditoria = async () => {
  const res = await axios.get(`${API_URL}/admin/auditoria/acciones`);
  return res.data;
};

// ── Mantenimiento ─────────────────────────────────────────────────────────────
export const getMantenimientoAeronaves = async () => {
  const res = await axios.get(`${API_URL}/admin/mantenimiento`);
  return res.data;
};

export const completarMantenimiento = async (id_aeronave) => {
  const res = await axios.post(`${API_URL}/admin/aeronaves/${id_aeronave}/completar-mantenimiento`);
  return res.data;
};

export const cancelarMantenimiento = async (id_mantenimiento) => {
  const res = await axios.delete(`${API_URL}/admin/mantenimiento/${id_mantenimiento}`);
  return res.data;
};

// ── Reservas de aeronave (uso especial sin alumno) ──────────────────────────
export const getReservasAeronave = async (id_semana) => {
  const res = await axios.get(`${API_URL}/admin/reservas`, { params: { id_semana } });
  return res.data;
};

export const crearReservaAeronave = async (payload) => {
  const res = await axios.post(`${API_URL}/admin/reservas`, payload);
  return res.data;
};

export const eliminarReservaAeronave = async (id) => {
  const res = await axios.delete(`${API_URL}/admin/reservas/${id}`);
  return res.data;
};

export const registrarHorasManuales = async (datos) => {
  const res = await axios.post(`${API_URL}/admin/mantenimiento/horas-manuales`, datos);
  return res.data;
};

export const getMantenimientoDetalle = async (id_mantenimiento) => {
  const res = await axios.get(`${API_URL}/admin/mantenimiento/${id_mantenimiento}/detalle`);
  return res.data;
};

export const agregarBloquesMantenimientoAeronave = async (id_aeronave, id_mantenimiento, bloques) => {
  const res = await axios.post(`${API_URL}/admin/aeronaves/${id_aeronave}/agregar-bloques-mantenimiento`, { id_mantenimiento, bloques });
  return res.data;
};


