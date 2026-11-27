/* 投稿：オフラインで動かすための仕組み（サービスワーカー）
   ・アプリの画面（index.html）は、ネットにつながっていれば毎回いちばん新しいものを取りに行く
     （つながらないときや遅いときは、スマホの中に保存したものを出す）
   ・画像などは保存したものをすぐに出し、裏で新しいものに入れ替える
   ・アプリを直したら、下の VERSION の数字を1つ上げる */
const VERSION = 'v102';
const CACHE = 'toukou-' + VERSION;
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  /* cache:'reload' … ブラウザに一時的に残っている古いファイルを使わず、必ず取り直す */
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('toukou-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isPage = req => req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);

/* 3Dの画面で使う three.js（jsdelivr）。一度読んだら端末にしまい、次からはネットなしで使う */
const THREE_LIB = 'lib-three-0.160.0';
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'GET' && req.url.startsWith('https://cdn.jsdelivr.net/npm/three@0.160.0/')) {
    e.respondWith(caches.open(THREE_LIB).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (isPage(req)) {
    /* 画面：まずネット（4秒まで待つ）→ だめなら保存したもの */
    e.respondWith(caches.open(CACHE).then(async c => {
      const net = fetch(req, { cache: 'no-cache' }).then(res => { if (res && res.ok) c.put('./index.html', res.clone()); return res; }).catch(() => null);
      const late = new Promise(r => setTimeout(() => r(null), 4000));
      const res = await Promise.race([net, late]);
      if (res && res.ok) return res;
      const hit = await c.match('./index.html') || await c.match('./');
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
