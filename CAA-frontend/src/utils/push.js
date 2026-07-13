import axios from "axios";
import { API_URL } from "../api/axiosConfig";

// Utilidades de Web Push (notificaciones del navegador). El backend guarda la
// suscripción y envía push cuando Turno hace acciones (abrir/cerrar ops, avisos,
// salidas/entradas al hangar).

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSoportado() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function estadoPermisoPush() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Pide permiso, registra el service worker, se suscribe y manda la suscripción
// al backend. Devuelve true si quedó activo.
export async function activarPush() {
  if (!pushSoportado()) throw new Error("Tu navegador no soporta notificaciones push.");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permiso de notificaciones denegado.");

  const { data } = await axios.get(`${API_URL}/push/vapid-public-key`);
  if (!data?.key) throw new Error("Las notificaciones no están configuradas en el servidor.");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.key),
    });
  }
  await axios.post(`${API_URL}/push/subscribe`, { subscription: sub });
  return true;
}

export async function desactivarPush() {
  if (!pushSoportado()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await axios.post(`${API_URL}/push/unsubscribe`, { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

// ¿Ya está suscrito este dispositivo?
export async function yaSuscrito() {
  if (!pushSoportado() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  return !!(await reg.pushManager.getSubscription());
}
