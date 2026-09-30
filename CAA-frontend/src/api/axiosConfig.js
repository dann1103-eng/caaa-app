import axios from "axios";

const getRawBaseUrl = () => window.__APP_CONFIG__?.API_URL || "http://localhost:5000";

export const BASE_URL = getRawBaseUrl().replace(/\/api$/, "");

export const API_URL = BASE_URL + "/api";

export const SOCKET_URL = BASE_URL;

export const LOADSHEET_URL = window.__APP_CONFIG__?.LOADSHEET_URL || import.meta.env.VITE_LOADSHEET_URL || "http://localhost:5174";

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const params = new URLSearchParams(window.location.search);
  const key = params.get("key");
  if (key) {
    config.headers["x-proyeccion-key"] = key;
  }

  return config;
});

axios.interceptors.response.use(
  (res) => res,
  (err) => {
    // Un 401 del propio login/refresh NO es sesión vencida: si se trata como tal,
    // el redirect duro a /login recarga la página y se traga el toast de
    // "Credenciales incorrectas" (el usuario no veía ningún error al fallar el login).
    const esEndpointAuth = /\/auth\/(login|refresh)/.test(err.config?.url || "");
    if (err.response?.status === 401 && !esEndpointAuth) {
      // Acá no se intenta renovar el token: un 401 significa que el JWT venció, es
      // inválido o falta, y en ninguno de esos casos un refresh lo puede arreglar
      // (el backend lo verifica con la misma firma y vencimiento). El intento que
      // había acá hacía POST a /auth/refresh, que solo existe por GET: daba 404 en
      // cada expulsión y no renovó nunca una sola sesión.
      // Un fallo de la BD ya NO llega como 401 (el backend responde 503), así que
      // un 401 acá es siempre una sesión que de verdad hay que rehacer.
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // Se distingue el motivo para que el login le diga al usuario qué pasó en vez
      // de dejarlo frente a un formulario vacío sin explicación.
      window.location.href = err.response.data?.session_conflict
        ? "/login?reason=conflict"
        : "/login?reason=expired";
    }
    return Promise.reject(err);
  }
);
