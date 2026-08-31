import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./styles/tokens.css";
import "./tailwind.css";
import "./index.css";
import "./api/axiosConfig";

import { MARCA, IMG } from "./marca";

// El index.html es estatico y no puede leer marca.json, asi que el titulo y el
// favicon se fijan aca al arrancar. Es la unica parte de la marca que se
// resuelve en runtime; todo lo demas se genera en el prebuild.
document.title = `${MARCA.nombre} - ${MARCA.nombre_completo}`;
{
  const icono = document.querySelector('link[rel="icon"]');
  if (icono) icono.href = IMG.favicon;
  const ios = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (ios) ios.setAttribute("content", MARCA.nombre);

  // El acento de la marca. tokens.css define toda la rampa --c-primary-* a
  // partir de estas dos variables, así que cambiarlas recolorea la app entera.
  const raiz = document.documentElement.style;
  raiz.setProperty("--academy-accent-h", String(MARCA.acento_h));
  raiz.setProperty("--academy-accent-c", String(MARCA.acento_c));
}

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