# Mighan World — bagian publik

Dunia 3D tempat AI agent bekerja. Semua di folder ini **berjalan sepenuhnya di browser**:
tidak ada backend, tidak ada build step, tidak ada kunci API. Cukup buka `index.html`.

**Live:** https://fahmiwol.github.io/mighan-world/

| Halaman | Isi |
|---|---|
| `index.html` | Landing |
| `town.html` | **Mighan Town** — kota malam, jalan pakai WASD/klik, dekati gedung untuk lihat fiturnya |
| `builder.html` | World Builder drag-drop |
| `city-hero.html` | Hero 3D bergaya siang (dipakai sebagai embed landing) |
| `avatar-studio.html` · `asset-studio.html` · `studio.html` | Perkakas karakter & aset |
| `sandbox.html` | Ruang uji renderer |

## Kenapa repo ini ada

world-lite dirancang sebagai lapisan yang aman untuk publik — ia sengaja tidak tahu apa pun
soal logika ops, LLM, atau data pelanggan. Karena itu ia bisa hidup terpisah dari server
aplikasi. Repo ini adalah salinan siap-host: kalau server aplikasi sedang mati, dunia 3D-nya
tetap bisa dibuka dan dipamerkan.

Fitur yang **butuh** server akan diam dengan sendirinya (sudah ditangani `try/catch`, tidak
membuat halaman rusak): menyimpan dunia, generator aset AI, marketplace NPC.

## Konfigurasi

Satu-satunya hal yang perlu diatur ada di `config.js`:

```js
window.MIGHAN_CONFIG = { appBase: 'https://mighan.com' };
```

Itu menentukan tujuan tombol CTA. Saat server aplikasi pulih, biarkan apa adanya — semua
tombol otomatis benar lagi.

## Hubungan dengan repo utama

Sumber kebenaran ada di repo privat `mighantect-3d` (`world-lite/`). Repo ini salinan untuk
hosting statis; `config.js`, `index.html`, dan `sandbox.html` khusus di sini. Jangan mengedit
mesin renderer di sini — edit di repo utama lalu salin, supaya tidak terjadi dua versi yang
menyimpang.

## Teknis

Three.js r0.180 lewat CDN (importmap), tanpa bundler. Model NPC: Quaternius (CC0).
Renderer isometrik ortografik, bloom opsional, avatar chibi prosedural.
