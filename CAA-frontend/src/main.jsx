import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./styles/tokens.css";
import "./tailwind.css";
import "./index.css";
import "./api/axiosConfig";

import { aplicarMarca } from "./marca";

// El index.html es estático y no puede leer marca.json, así que el título, el
// favicon y el color de acento se fijan acá al arrancar.
//
// Va en aplicarMarca() y no suelto porque la marca depende de QUIÉN entró: la
// cuenta de demostraciones ve "TU ESCUELA" y CAAA ve CAAA, en el mismo
// despliegue. Por eso también se vuelve a llamar al entrar y al salir (Login),
// que es cuando cambia la sesión sin recargar la página.
aplicarMarca();

import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Registrar el service worker desde el arranque (no solo al activar push) para
// que Android ofrezca la instalación completa de la PWA (modo standalone),
// no solo un acceso directo del navegador.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}