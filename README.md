# MAXIMUM THE ULTIMATE — Laporan Event EO & Analytics

Aplikasi web untuk (1) mencatat laporan event secara terstruktur dan (2)
membaca data event tersebut sebagai visual essay interaktif — bukan
dashboard korporat biasa.

> **Revisi terbaru** (fitur Edit Laporan, status pembayaran Lunas/DP yang
> benar-benar tersimpan, perbaikan bug login, dan percepatan loading):
> lihat **`SETUP_FIX.md`** bagian "REVISI: Fitur Edit Laporan + Perbaikan
> Login/Performa" untuk langkah setup yang WAJIB dilakukan (kolom baru di
> sheet `ITEMS` + deploy ulang Apps Script).

## Struktur folder

```
eo-datastory/
├── index.html          # Landing page
├── input.html          # Form input laporan event (dynamic item blocks)
├── analytics.html      # Halaman analytics / data story (scrollytelling)
├── css/
│   ├── style.css        # Token desain, nav, komponen bersama
│   ├── input.css         # Styling khusus form
│   └── analytics.css     # Styling khusus halaman analytics
├── js/
│   ├── data.js           # Konfigurasi, dataset contoh, normalisasi, statistik
│   ├── charts.js          # Semua chart D3 (dipakai analytics.js)
│   ├── input.js           # Logika form: dynamic items, validasi, submit
│   └── analytics.js        # Orkestrasi scrollytelling & progress rail
├── Code.gs               # Backend Google Apps Script (opsional, lihat di bawah)
└── README.md
```

## Menjalankan secara lokal (tanpa backend)

Aplikasi ini bisa langsung dijalankan di browser tanpa server maupun
backend apa pun:

1. Buka `index.html` langsung di browser (double-click, atau `open
   index.html` / `start index.html`).
2. Isi laporan lewat **Input Report** — data tersimpan di `localStorage`
   browser Anda, digabung dengan dataset contoh (`SAMPLE_EVENTS` di
   `js/data.js`) saat menghitung analytics.
3. Buka **Analytics** untuk melihat data story-nya.

Mode ini disebut *demo mode* dan aktif secara default karena
`CONFIG.API_URL` di `js/data.js` dikosongkan. Cocok untuk mencoba tampilan
dan alur tanpa setup apa pun. Data yang tersimpan di localStorage bersifat
per-browser dan tidak dibagikan ke orang lain.

Jika Anda lebih suka menjalankan lewat server statis lokal (opsional, agar
lebih mirip environment production):

```bash
cd eo-datastory
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

## Menghubungkan ke backend nyata (Google Apps Script + Sheets)

Untuk penyimpanan data yang benar-benar terpusat dan bisa diakses banyak
orang, gunakan `Code.gs` sebagai backend:

1. Buat Google Spreadsheet baru, salin ID-nya dari URL
   (`.../spreadsheets/d/{ID}/edit`).
2. Di spreadsheet: **Extensions → Apps Script**, hapus isi default, lalu
   tempel seluruh isi `Code.gs`.
3. Ganti nilai `SPREADSHEET_ID` di baris pertama `Code.gs` dengan ID yang
   Anda salin di langkah 1.
4. Jalankan fungsi `setup` sekali dari editor Apps Script (dropdown fungsi
   di toolbar → pilih `setup` → tombol ▶). Ini membuat sheet `EVENTS` dan
   `ITEMS` beserta header kolomnya. Anda akan diminta memberi izin akses ke
   Spreadsheet — setujui.
5. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Salin URL `/exec` yang dihasilkan, lalu tempel ke `CONFIG.API_URL` di
   `js/data.js`:
   ```js
   const CONFIG = {
     API_URL: "https://script.google.com/macros/s/AKfycb.../exec",
     ...
   };
   ```
7. Upload folder `eo-datastory/` ke hosting statis pilihan Anda (lihat
   bagian Deployment di bawah). Setelah `API_URL` terisi, form input akan
   mengirim data lewat `POST` ke Apps Script, dan halaman analytics akan
   membaca data lewat `GET ?action=getAnalytics` — bukan lagi dari
   `localStorage`/dataset contoh.

Validasi tetap dijalankan di dua sisi: frontend (`input.js`) untuk umpan
balik instan, dan backend (`Code.gs` fungsi `validateReport_`) sebagai
lapisan keamanan terakhir sebelum data ditulis ke Sheets — kredensial
Spreadsheet tidak pernah ada di kode frontend.

## Deployment (hosting file statis)

Karena aplikasi ini murni HTML/CSS/JS (tanpa build step), semua hosting
statis cocok, misalnya:

- **GitHub Pages**: push folder `eo-datastory/` ke sebuah repo, aktifkan
  Pages dari branch tersebut.
- **Netlify / Vercel**: drag-and-drop folder `eo-datastory/`, atau hubungkan
  ke repo Git.
- **Google Sites / Apps Script HtmlService**: bisa juga di-host langsung
  dari Apps Script bila diinginkan, tapi drag-and-drop ke Netlify/Vercel
  jauh lebih sederhana untuk kasus ini.

Tidak ada langkah build (tidak ada `npm install`) — folder ini langsung
bisa di-deploy apa adanya.

## Catatan implementasi

- **Statistik**: mean, median, Q1, Q3 dihitung dari data aktual
  (`js/data.js`, fungsi `computePriceStats` + `percentile`), menggunakan
  metode interpolasi linear pada persentil inklusif (setara
  `PERCENTILE.INC` di Excel/Sheets). Tidak ada angka yang di-hardcode.
- **Distinct metrics**: jumlah event, jumlah kemunculan item (occurrences),
  dan jumlah pcs (quantity) dihitung terpisah di `aggregateItems` — sesuai
  spesifikasi, ketiganya tidak pernah dicampur.
- **Normalisasi vendor/item**: `canonicalKey()` menyamakan
  `"Vendor A"`/`"vendor a"`/`" VENDOR A "` untuk keperluan agregasi, tapi
  data asli yang tersimpan di Sheets/localStorage tidak pernah diubah.
- **Empty state**: jika belum ada data sama sekali, halaman analytics
  menampilkan pesan "NOT ENOUGH DATA YET." dan tidak merender chart palsu.
- **Aksesibilitas & motion**: seluruh animasi menghormati
  `prefers-reduced-motion`; form memakai `<label>` semantik dan pesan error
  dengan `role="alert"`.
- **Lazy rendering**: setiap chart di halaman analytics baru dirender saat
  section-nya pertama kali terlihat (Intersection Observer), agar halaman
  tetap ringan di perangkat mobile.

## Roadmap (belum diimplementasikan, arsitektur sudah disiapkan untuk ini)

Struktur data dan fungsi agregasi di `js/data.js` sengaja dipisah per
fungsi kecil sehingga mudah ditambahkan nanti: filter berdasarkan
tanggal/vendor/kategori/client, perbandingan antar-event, export laporan,
deteksi anomali, vendor performance scoring, serta halaman detail per
vendor/item.


## Update Rev2 — MAXIMUM THE ULTIMATE
- Branding seluruh antarmuka menjadi **MAXIMUM THE ULTIMATE** dengan basis hitam.
- Tersedia mode **terang (putih)** dan **gelap**; pilihan disimpan di browser.
- Analytics seluruhnya memakai bahasa Indonesia.
- Form item sekarang bisa mencari pada kolom **Item ID** maupun **Nama Barang**. Mengetik Item ID di kolom Nama Barang juga akan memilih produk yang tepat.
- Ditambahkan **Keterangan** opsional per item.
- Backend memakai sheet tujuan **`EVENTS`** dan **`ITEMS`**.
- Event ID dibuat backend secara otomatis dengan pola `MM-ke-NN-ke-YYYY` (contoh: `09-ke-01-ke-2026`).
- Struktur tetap HTML/CSS/JS + Apps Script sehingga file dapat diedit langsung tanpa build step.
