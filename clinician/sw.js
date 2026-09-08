// 医療者用PWAのService Worker。
// cache-first、全アセットをプリキャッシュ(仕様 9章)。
// skipWaiting は明示的なメッセージを受けたときだけ呼ぶ(仕様 11.5.2)。

const CACHE_PREFIX = 'gvhd-clinician-';
const CACHE_NAME = `${CACHE_PREFIX}${self.registration.scope}-v1`;

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await cache.add(new Request('./', { cache: 'reload' })).catch(() => undefined);
  try {
    const response = await fetch('./precache-manifest.json', { cache: 'reload' });
    if (!response.ok) return;
    const files = await response.json();
    if (!Array.isArray(files)) return;
    await Promise.all(
      files.map((file) => cache.add(new Request(file, { cache: 'reload' })).catch(() => undefined)),
    );
  } catch {
    // ビルド前(開発時)はマニフェストが無い。実行時キャッシュで動作する。
  }
}

self.addEventListener('install', (event) => {
  // ここでは skipWaiting しない。適用は利用者の明示的な操作を経て次回起動時に行う。
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 画面遷移はハッシュベースなので、ナビゲーションは常にアプリのシェルを返す。
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('./');
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch {
          return new Response('オフラインです。ネットワークに接続してから開き直してください。', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })(),
  );
});
