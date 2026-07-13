import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./styles/tokens.css";
import "./tailwind.css";
import "./index.css";
import "./api/axiosConfig";

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