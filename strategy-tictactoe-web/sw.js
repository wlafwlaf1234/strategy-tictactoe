// 게임 파일을 기기에 저장해 두고, 인터넷이 없어도 실행되게 합니다.
// 게임을 수정해서 다시 올릴 때는 아래 버전 숫자를 올려 주세요 (예: v2 → v3).
const CACHE = 'strategy-ttt-v2';
const FILES = ['./', 'index.html', 'styles.css', 'engine.js', 'core.js', 'app.js', 'pwa.js',
  'icon.svg', 'manifest.webmanifest', 'fonts/px-latin.woff', 'fonts/px-hangul.woff',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 네트워크 우선: 인터넷이 되면 항상 최신 버전, 안 되면 저장본으로 실행
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('index.html'))));
});
