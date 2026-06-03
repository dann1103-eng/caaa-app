import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy DEV-ONLY hacia el backend de Railway: el navegador ve mismo-origen
// (localhost) y Vite reenvía /api y /socket.io, evitando CORS. No afecta a
// producción (Vercel sirve estáticos, no usa el dev server). Andamiaje de
// capturas: revertir antes del merge si se quiere dejar el config limpio.
const BACKEND = "https://caaa-backend-production.up.railway.app";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    port: 3000,
    host: true,
    strictPort: false,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true, secure: true },
      "/socket.io": { target: BACKEND, changeOrigin: true, secure: true, ws: true },
      "/uploads": { target: BACKEND, changeOrigin: true, secure: true },
    },
  },
});
