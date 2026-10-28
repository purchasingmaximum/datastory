# Catatan revisi kecepatan (tidak ada fitur/tampilan yang diubah)

Semua perubahan di paket ini murni soal kecepatan. Tidak ada teks, layout,
alur, atau data yang diubah — hasil akhir yang dilihat user sama persis.

## Kenapa login/loading terasa lama (penyebab sebenarnya)

Login & data di situs ini jalan lewat **Google Apps Script Web App**
(`script.google.com/.../exec`). Model hosting ini punya **cold start**
bawaan dari Google sendiri: kalau URL /exec belum dipanggil beberapa menit,
permintaan pertama bisa makan waktu beberapa detik sebelum Google
"menyalakan" instance script-nya — ini di luar kendali kode di repo ini,
dan tidak ada trik front-end yang menghilangkannya 100%. Yang bisa
dikerjakan di sisi kode adalah memangkas semua overhead TAMBAHAN di luar
cold-start itu sendiri. Itu yang dilakukan di paket ini:

1. **`Code.gs` — action baru `?action=getStats`.**
   Sebelumnya halaman utama (`index.html`) memanggil `getAnalytics` — yang
   mengirim SELURUH event beserta SELURUH item-nya — hanya untuk menghitung
   3 angka (jumlah event, vendor unik, jenis barang unik). Sekarang ada
   action baru yang menghitung 3 angka itu di server (pakai cache yang
   sama) dan hanya mengirim 3 angka tsb ke browser. Hasil yang tampil di
   layar identik, hanya jauh lebih sedikit data yang harus diunduh & di-
   parse browser.
   → **Wajib "New deployment" ulang untuk Code.gs** (deployment yang sama,
   versi baru) supaya URL /exec yang sudah dipakai di `js/data.js`
   (`CONFIG.API_URL`) ikut memakai action baru ini — persis seperti catatan
   redeploy yang sudah ada di `SETUP_FIX.md` untuk revisi-revisi
   sebelumnya.

2. **`js/data.js` — fungsi `loadStats()`.**
   Pemanggil `getStats` di atas, dengan fallback mode lokal/demo (tanpa
   backend) yang menghitung angka yang sama dari data contoh, supaya mode
   demo tetap jalan seperti biasa.

3. **`index.html`** memanggil `loadStats()` alih-alih menarik semua event.

4. **`login.html`, `index.html`, `input.html`, `events.html`,
   `analytics.html`** — ditambah `<link rel="preconnect">` /
   `dns-prefetch` ke `script.google.com` & `script.googleusercontent.com`.
   Ini membuat browser mulai proses DNS + handshake TLS ke server Apps
   Script begitu halaman mulai dimuat, SEBELUM tombol Login ditekan atau
   fetch data dimulai — jadi saat request sungguhan dikirim, koneksinya
   sudah "siap pakai" (menghemat 1 round-trip koneksi).

5. **`vendor.html`** — preconnect yang sama ke `sheets.googleapis.com`
   (backend halaman Database & Harga).

6. **`js/login.js`** — delay tetap 400 md setelah login sukses (sekadar
   supaya label "Harap Tunggu" sempat kelihatan) diganti jadi menunggu 2
   frame render (`requestAnimationFrame` dua kali, ~30 md di kebanyakan
   layar) sebelum pindah ke `index.html`. Efek visualnya sama (label sempat
   tampil), tapi tidak lagi menunggu angka milidetik tetap yang lebih lama
   dari yang sebenarnya dibutuhkan.

## Yang TIDAK diubah
- Tidak ada action/endpoint lama yang diubah perilakunya (`getAnalytics`,
  `getEventsList`, `getEventById`, `getDictionaries`, login `doGet`/`doPost`
  semuanya persis sama).
- Tidak ada perubahan tampilan, teks, warna, atau alur kerja.
- Cache TTL (120 detik di Code.gs, 5 menit di Login.gs) sengaja TIDAK
  diubah, supaya kesegaran data tetap sama seperti sebelumnya.

## Langkah yang perlu dilakukan setelah upload
1. Buka project Apps Script untuk **Code.gs** (spreadsheet Data Input) →
   tempel ulang isi `Code.gs` yang baru → **Deploy → Manage deployments →
   Edit (pensil) → New version → Deploy**, supaya URL /exec yang sama
   memakai kode baru (action `getStats` baru bisa dipanggil).
   `Login.gs` tidak diubah sama sekali di revisi ini, jadi tidak perlu
   redeploy ulang untuk file itu.
2. Upload ulang semua file HTML/JS statis (login.html, index.html,
   input.html, events.html, analytics.html, vendor.html, js/data.js,
   js/login.js) ke hosting yang dipakai sekarang.
