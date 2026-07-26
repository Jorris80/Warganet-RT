/**
 * WargaNet RT/RW — Konfigurasi PWA (GitHub Pages)
 * ------------------------------------------------
 * Isi GAS_API_URL dengan URL Web App Apps Script Anda yang berakhiran /exec.
 *
 * Cara memperolehnya:
 *   Google Sheets ▸ Extensions ▸ Apps Script ▸ Deploy ▸ New deployment
 *   ▸ Type: Web app ▸ Execute as: Me ▸ Who has access: Anyone ▸ Deploy
 *   ▸ salin "Web app URL".
 *
 * Bila dibiarkan kosong, aplikasi akan meminta URL lewat ⚙️ Pengaturan
 * dan menyimpannya di perangkat masing-masing pengguna.
 */
window.GAS_API_URL = 'https://script.google.com/macros/s/AKfycbx0SDLCGBiRuZusEVgKf84Pl8dSiReN8qeXaNzf20vCQi0oTe8stMoUZV_SbImueN-ggQ/exec';

/* Nama aplikasi yang tampil sebelum data server termuat (opsional). */
window.APP_DEFAULT_TITLE = 'WargaNet RT 05';
window.APP_DEFAULT_SUBTITLE = 'Villa Harmony';
