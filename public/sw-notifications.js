/**
 * Service Worker mínimo — só para notificação de venda com ícone Dark Pay.
 * Safari/macOS costuma ignorar `icon` em `new Notification()` (mostra bússola).
 * `registration.showNotification({ icon })` tem mais chance de exibir a arte.
 */
/* eslint-disable no-restricted-globals */

const ICON = "/Fiveicon-notif.png?v=v3";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "SALE_NOTIFY") return;

  const title = String(data.title || "Dark Pay");
  const body = String(data.body || "");
  const tag = String(data.tag || `sale-${Date.now()}`);
  const icon = String(data.icon || ICON);

  const opts = {
    body,
    tag,
    icon,
    badge: icon,
    silent: true,
    requireInteraction: false,
    lang: "pt-BR",
    dir: "ltr",
    data: { url: data.url || "/transacoes" },
  };

  // image só onde o browser aceita (não quebra se ignorar)
  try {
    opts.image = icon;
  } catch {
    /* ignore */
  }

  event.waitUntil(
    self.registration.showNotification(title, opts).catch(() => {
      /* fallback fica no client */
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/transacoes";
  const url = new URL(target, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    })
  );
});
