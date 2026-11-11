/* NexKido service worker: shows lock-screen notifications for pushes, even when the app is closed. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // If the app is open and in front, it already shows the alert itself: don't buzz twice.
    if (wins.some((w) => w.visibilityState === "visible")) { wins.forEach((w) => w.postMessage({ type: "push", data: d })); return; }
    await self.registration.showNotification(d.title || "NexKido", {
      body: d.body || "", tag: d.tag, renotify: !!d.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
      vibrate: [120, 60, 120], data: { url: d.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if ("focus" in w) { try { await w.focus(); if ("navigate" in w && !w.url.endsWith(url)) await w.navigate(url); } catch { /* focus is enough */ } return; }
    }
    await self.clients.openWindow(url);
  })());
});
