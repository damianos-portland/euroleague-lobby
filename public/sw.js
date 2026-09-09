/* EuroLeague Lobby — push service worker. Shows notifications and focuses/opens
   the app on click. Kept dependency-free so it can run in the SW scope. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "EuroLeague Lobby", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "EuroLeague Lobby";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: data.tag || "euroleague-lobby",
    renotify: true,
    vibrate: [90, 40, 90],
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab already on the target path if we can.
        for (const client of clientList) {
          if (client.url.includes(target) && "focus" in client) return client.focus();
        }
        // Otherwise focus any open tab and navigate it, else open a new one.
        if (clientList.length > 0 && "navigate" in clientList[0]) {
          return clientList[0].focus().then((c) => c.navigate(target));
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      })
  );
});
