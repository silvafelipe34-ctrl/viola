// Primeiros Passos na Viola: funciona sem internet depois da primeira abertura.
const VERSION = 'viola-v2';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon-32.png'
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@500;600;700;800&display=swap';

async function cacheFonts(cache) {
  try {
    const res = await fetch(FONT_CSS, { mode: 'cors' });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    let urls = [];
    for (const chunk of css.split('/*').slice(1)) {
      const name = chunk.slice(0, chunk.indexOf('*/')).trim();
      if (name !== 'latin' && name !== 'latin-ext') continue;
      const m = chunk.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
      if (m) urls.push(m[1]);
    }
    if (!urls.length) urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
    await Promise.all([...new Set(urls)].map(u =>
      fetch(u, { mode: 'cors' }).then(r => (r.ok ? cache.put(u, r) : null)).catch(() => null)
    ));
  } catch (e) {
    // Sem internet na instalação: as fontes ficam para a próxima abertura.
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await cacheFonts(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const hit = await cache.match(key);
    const fromNet = fetch(req)
      .then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);
    if (hit) {
      event.waitUntil(fromNet);
      return hit;
    }
    const res = await fromNet;
    if (res) return res;
    if (req.mode === 'navigate') {
      const page = await cache.match('index.html');
      if (page) return page;
    }
    return Response.error();
  })());
});
