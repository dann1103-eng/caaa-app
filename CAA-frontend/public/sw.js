/* Service worker de CAAA — recibe Web Push y muestra notificaciones del sistema
   incluso con la pestaña cerrada / en segundo plano. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: "CAAA", body: event.data ? event.data.text() : "" }; }

  const title = data.title || "CAAA";
  const options = {
    body: data.body || "",
    icon: "/favicon-caaa.png",
    badge: "/favicon-caaa.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.focus();
          if ("navigate" in w) { try { w.navigate(url); } catch { /* noop */ } }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
