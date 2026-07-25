// Konfigurasi deployment world-lite yang berdiri sendiri (hosting statis).
//
// Berkas ini TIDAK ada di deployment mighan.com — di sana world-lite memakai nilai
// bawaan (mighan.com). Di hosting statis, berkas ini yang menentukan ke mana tombol
// CTA mengarah, sehingga world-lite bisa hidup terpisah dari server aplikasi.
window.MIGHAN_CONFIG = {
  // Basis aplikasi SaaS. Saat server dipulihkan, biarkan seperti ini dan semua
  // tombol langsung benar kembali. Kalau ingin mematikan CTA sementara,
  // arahkan ke './status.html'.
  appBase: 'https://mighan.com',
};
