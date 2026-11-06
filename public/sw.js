/* Akno service worker — push + badge. No offline cache (keeps deploys fresh). */
self.addEventListener("install", event => {
  self.skipWaiting()
})

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {
    try { data = { body: event.data && event.data.text() } } catch { data = {} }
  }
  const title = data.title || "Akno"
  const url = data.url || "/reception"
  const tag = data.tag || "akno"
  const badge = Number(data.badge)
  const opts = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badgeIcon || "/icons/icon-192.png",
    tag,
    renotify: true,
    data: { url, tag },
  }
  event.waitUntil((async () => {
    // iOS exige un showNotification dans le handler push, même si l'app est au premier plan.
    const tasks = [self.registration.showNotification(title, opts)]
    try {
      if (Number.isFinite(badge) && badge >= 0 && self.navigator && self.navigator.setAppBadge) {
        tasks.push(badge > 0 ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge())
      }
    } catch { /* badge API optionnelle */ }
    try {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of windows) {
        try { client.postMessage({ type: "akno-push", title, body: opts.body, url, tag }) } catch { /* ignore */ }
      }
    } catch { /* clients optionnels */ }
    await Promise.all(tasks)
  })())
})

self.addEventListener("notificationclick", event => {
  event.notification.close()
  const raw = (event.notification.data && event.notification.data.url) || "/reception"
  const target = raw.startsWith("http") ? raw : new URL(raw, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus()
        try { client.postMessage({ type: "akno-nav", url: raw }) } catch { /* ignore */ }
        if (typeof client.navigate === "function") {
          try { await client.navigate(target) } catch { /* ignore */ }
        }
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
