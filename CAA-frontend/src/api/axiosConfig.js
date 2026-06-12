import axios from "axios";

const getRawBaseUrl = () => window.__APP_CONFIG__?.API_URL || "http://localhost:5000";

export const BASE_URL = getRawBaseUrl().replace(/\/api$/, "");

export const API_URL = BASE_URL + "/api";

export const SOCKET_URL = BASE_URL;

export const LOADSHEET_URL = window.__APP_CONFIG__?.LOADSHEET_URL || import.meta.env.VITE_LOADSHEET_URL || "http://localhost:5174";

const getApiUrl = () => API_URL;

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
  async (err) => {
    // Un 401 del propio login/refresh NO es sesión vencida: si se trata como tal,
    // el redirect duro a /login recarga la página y se traga el toast de
    // "Credenciales incorrectas" (el usuario no veía ningún error al fallar el login).
    const esEndpointAuth = /\/auth\/(login|refresh)/.test(err.config?.url || "");
    if (err.response?.status === 401 && !err.config._retry && !esEndpointAuth) {
      if (err.response.data?.session_conflict) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login?reason=conflict";
        return Promise.reject(err);
      }

      err.config._retry = true;
      try {
        const { data } = await axios.post(
          `${getApiUrl()}/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
        localStorage.setItem("token", data.token);
        err.config.headers.Authorization = `Bearer ${data.token}`;
        return axios(err.config);
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);
