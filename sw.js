/* オフライン用：はじめに全部をキャッシュし、その後は「キャッシュ→裏で更新」 */
const VERSION = 'asobibako-v28';
importScripts('common/games.js', 'tools/items.js');
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'common/kit.css', 'common/kit.js', 'common/net.js', 'common/vendor/peerjs.min.js', 'common/games.js', 'common/vendor/three.module.min.js',
  ...self.ASOBI_GAMES.map(g => `games/${g.id}/index.html`),
  // 道具と遊び（背景削除のAIは大きいので、初めて使った時にだけ保存する）
  'tools/', 'tools/index.html', 'tools/style.css', 'tools/items.js', 'tools/manifest.webmanifest', 'tools/icon.svg', 'tools/icon-192.png', 'tools/icon-512.png',
  'tools/vendor/qrcode.js',
  ...self.OTONA_ITEMS.map(g => `tools/games/${g.id}/index.html`)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
