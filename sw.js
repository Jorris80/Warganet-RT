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

var CACHE_VERSION = 'warganet-v2';

/** Cache terpisah untuk ubin peta & foto agar tidak ikut terhapus saat shell naik versi. */
var CACHE_PETA  = 'warganet-peta-v1';
var CACHE_FOTO  = 'warganet-foto-v1';
var BATAS_PETA  = 900;   // maksimum ubin peta yang disimpan
var BATAS_FOTO  = 300;   // maksimum foto profil yang disimpan

var SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icon.svg'
];

/** Pustaka pihak ketiga: dicoba di-cache saat instal, tapi kegagalannya diabaikan. */
var VENDOR = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

/** Host penyedia ubin peta — di-cache agar area yang pernah dibuka tetap terlihat offline. */
function hostPeta(h) {
  return h.indexOf('tile.openstreetmap.org') >= 0 ||
         h.indexOf('tile.opentopomap.org') >= 0 ||
         h.indexOf('server.arcgisonline.com') >= 0 ||
         h.indexOf('basemaps.arcgis.com') >= 0;
}

/** Host penyimpan foto profil. */
function hostFoto(h) {
  return h.indexOf('drive.google.com') >= 0 ||
         h.indexOf('lh3.googleusercontent.com') >= 0;
}

/** Buang entri terlama bila cache melebihi batas. */
function pangkasCache(nama, batas) {
  return caches.open(nama).then(function (c) {
    return c.keys().then(function (keys) {
      if (keys.length <= batas) return;
      return Promise.all(keys.slice(0, keys.length - batas).map(function (k) {
        return c.delete(k);
      }));
    });
  });
}

/** Ambil dari cache dulu; bila belum ada, ambil dari jaringan lalu simpan. */
function cacheDuluLalauJaringan(req, nama, batas) {
  return caches.open(nama).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          c.put(req, res.clone()).then(function () { pangkasCache(nama, batas); });
        }
        return res;
      });
    });
  });
}

/* ---------- instal: simpan app shell ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL).catch(function (err) {
        console.warn('[SW] Sebagian berkas shell gagal di-cache:', err);
      }).then(function () {
        // Pustaka peta bersifat opsional: kegagalannya tidak boleh membatalkan instalasi.
        return Promise.all(VENDOR.map(function (u) {
          return cache.add(u).catch(function () {});
        }));
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
        if (k !== CACHE_VERSION && k !== CACHE_PETA && k !== CACHE_FOTO) return caches.delete(k);
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

  // 2. Panggilan ke Apps Script selalu lewat jaringan — jangan pernah di-cache.
  if (url.hostname.indexOf('script.google.com') >= 0) return;

  // 3. Ubin peta: simpan agar area yang pernah dibuka tetap tampil tanpa sinyal.
  if (hostPeta(url.hostname)) {
    event.respondWith(
      cacheDuluLalauJaringan(req, CACHE_PETA, BATAS_PETA).catch(function () {
        return new Response('', { status: 504, statusText: 'Ubin peta tidak tersedia offline.' });
      })
    );
    return;
  }

  // 4. Foto profil dari Drive: sama, cache-first dengan batas jumlah.
  if (hostFoto(url.hostname)) {
    event.respondWith(
      cacheDuluLalauJaringan(req, CACHE_FOTO, BATAS_FOTO).catch(function () {
        return new Response('', { status: 504, statusText: 'Foto tidak tersedia offline.' });
      })
    );
    return;
  }

  // 5. Pustaka peta & pemutar video dari CDN: cache-first agar peta tetap terbuka offline.
  if (url.hostname.indexOf('unpkg.com') >= 0 || url.hostname.indexOf('cdn.jsdelivr.net') >= 0) {
    event.respondWith(
      cacheDuluLalauJaringan(req, CACHE_VERSION, 9999).catch(function () {
        return new Response('', { status: 504 });
      })
    );
    return;
  }

  // 6. Layanan lain (QR, siaran CCTV) diteruskan apa adanya.
  if (url.hostname.indexOf('api.qrserver.com') >= 0 ||
      url.hostname.indexOf('youtube.com') >= 0 ||
      url.hostname.indexOf('youtube-nocookie.com') >= 0 ||
      url.hostname.indexOf('ytimg.com') >= 0) {
    return;
  }

  // 7. Navigasi halaman: jaringan dulu, cache sebagai cadangan.
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

  // 8. Aset lain (dalam origin yang sama): cache dulu, lalu perbarui di latar.
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
