/**
 * WargaNet RT/RW — Service Worker
 *
 * Strategi:
 *   • App shell (HTML/CSS/JS/ikon) → cache-first, agar aplikasi terbuka penuh
 *     saat tidak ada sinyal sama sekali.
 *   • Permintaan POST ke Apps Script → selalu lewat jaringan, tidak pernah
 *     di-cache. Bila gagal, frontend yang mengantrikannya di outbox localStorage.
 *   • Navigasi (buka/segarkan halaman) → jaringan dulu, jatuh ke cache bila gagal.
 *
 * Naikkan CACHE_VERSION setiap kali index.html diperbarui agar pengguna
 * mendapat versi terbaru, bukan versi lama dari cache.
 */

var CACHE_VERSION = 'warganet-v1';
var SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icon.svg'
];

/* ---------- instal: simpan app shell ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL).catch(function (err) {
        console.warn('[SW] Sebagian berkas shell gagal di-cache:', err);
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ---------- aktivasi: bersihkan cache versi lama ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- pengambilan ---------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;

  // 1. Hanya tangani GET. POST (API Apps Script) diteruskan apa adanya.
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // 2. Jangan pernah cache panggilan ke Apps Script atau layanan pihak ketiga.
  if (url.hostname.indexOf('script.google.com') >= 0 ||
      url.hostname.indexOf('googleusercontent.com') >= 0 ||
      url.hostname.indexOf('api.qrserver.com') >= 0) {
    return;
  }

  // 3. Navigasi halaman: jaringan dulu, cache sebagai cadangan.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  // 4. Aset lain (dalam origin yang sama): cache dulu, lalu perbarui di latar.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
});

/* ---------- pesan dari halaman ---------- */
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) { caches.delete(k); });
    });
  }
});
