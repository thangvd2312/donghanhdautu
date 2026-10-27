// Service worker: thông báo đẩy (Web Push) + cache vỏ app để mở app không phải chờ máy chủ.
// - API (/api, /socket.io) KHÔNG bao giờ cache: số liệu luôn lấy mới.
// - Vỏ app (index.html): dùng bản đã lưu ngay, đồng thời tải bản mới; trang hỏi lại thì báo nếu đã có bản khác.
// - /assets/*: tên file có hash, không bao giờ đổi nội dung → lấy từ cache nếu có.
const SHELL = 'shell-v1'
const ASSETS = 'assets-v1'
const MAX_ASSETS = 200

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== ASSETS) await caches.delete(key)
      await self.clients.claim()
    })(),
  ),
)

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return
  // Mở thẳng một file (ảnh, icon…) thì để máy chủ trả file đó, không trả vỏ app
  if (req.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(url.pathname)) event.respondWith(shell(event))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(req))
})

/** Lượt tải vỏ mới đang chạy (dùng chung cho các yêu cầu cùng lúc) */
let inflight = null

/** Tải index.html mới nhất từ máy chủ và lưu làm vỏ */
function revalidate() {
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch('/', { cache: 'no-store' })
      if (res.ok) await (await caches.open(SHELL)).put('/', res.clone())
      return res
    })()
    inflight.finally(() => (inflight = null)).catch(() => {})
  }
  return inflight
}

/** Mọi trang của app dùng chung một index.html (SPA): có vỏ đã lưu thì trả ngay, đồng thời tải bản mới */
async function shell(event) {
  const cached = await (await caches.open(SHELL)).match('/')
  if (cached) {
    event.waitUntil(revalidate().catch(() => {}))
    return cached
  }
  // Lần đầu (chưa có vỏ): chờ mạng
  return (await revalidate()).clone()
}

/**
 * Trang hỏi "vỏ mình đang chạy còn mới không?" (gửi tên file index-*.js của nó): vỏ mới nhất đã lưu không còn
 * nhắc tới file đó nghĩa là đã deploy bản khác → trả lời để trang mời tải lại.
 * `revalidate` = tải lại vỏ trước khi so (app mở lại từ nền, không có lượt điều hướng nào kích hoạt việc tải).
 */
self.addEventListener('message', (event) => {
  const d = event.data || {}
  if (d.type !== 'check-shell' || !d.script) return
  event.waitUntil(
    (async () => {
      if (d.revalidate) await revalidate().catch(() => {})
      else if (inflight) await inflight.catch(() => {})
      const cached = await (await caches.open(SHELL)).match('/')
      if (cached && !(await cached.text()).includes(d.script)) event.source.postMessage({ type: 'shell-updated' })
    })(),
  )
})

async function asset(req) {
  const cache = await caches.open(ASSETS)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) {
    await cache.put(req, res.clone())
    const keys = await cache.keys()
    // Giữ cache gọn: bỏ các file cũ nhất (các bản deploy trước)
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(k)
  }
  return res
}

self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { title: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Đồng Hành Đầu Tư', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin)) {
          await w.focus()
          return w.navigate(url)
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})
